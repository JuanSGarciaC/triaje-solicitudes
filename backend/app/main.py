import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi import Request as HttpRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .classifier import CATEGORIES, PRIORITIES, get_classifier
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .demo import ALLOWED, EXAMPLES, SEED, VISITOR, RateLimiter, client_ip
from .models import IdempotencyKey, Request
from .policy import decide_status
from .schemas import ConfigOut, MetricsOut, RequestCreate, RequestOut, ReviewIn


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if settings.demo_mode:
        with SessionLocal() as db:
            seed_demo(db)
    yield


limiter = RateLimiter(settings.demo_rate_per_minute)


def store(db: Session, subject: str, body: str, requester: str, key: str | None = None) -> Request:
    classifier = get_classifier()
    result = classifier.classify(subject, body)
    item = Request(
        subject=subject,
        body=body,
        requester=requester,
        status=decide_status(result),
        pred_category=result.category,
        pred_priority=result.priority,
        pred_summary=result.summary,
        pred_confidence=result.confidence,
        pred_reasoning=result.reasoning,
        classifier_version=classifier.version,
    )
    db.add(item)
    if key:  # misma transacción: o quedan la solicitud y su clave, o ninguna
        db.flush()
        db.add(IdempotencyKey(key=key, request_id=item.id))
    db.commit()
    db.refresh(item)
    return item


def seed_demo(db: Session) -> None:
    """La demo arranca con datos (el disco del plan gratuito se borra al dormir): los casos de
    desarrollo, con la mitad de la cola ya revisada y una de cada dos corregida."""
    if db.scalar(select(func.count(Request.id))):
        return
    stored = [store(db, e["subject"], e["body"], "Laura Ríos (ejemplo)") for e in SEED]
    queue = [r for r in stored if r.status == "needs_review"]
    for i, r in enumerate(queue[: len(queue) // 2]):
        r.final_category, r.final_priority = r.pred_category, "media" if i % 2 else r.pred_priority
        r.reviewer, r.reviewed_at, r.status = "Camila Torres (ejemplo)", datetime.now(timezone.utc), "reviewed"
    db.commit()


def demo_guard(request: HttpRequest) -> None:
    if settings.demo_mode and not limiter.allow(client_ip(request, settings.client_ip_header)):
        raise HTTPException(status_code=429, detail="Demasiadas acciones seguidas en la demo. Espera un minuto.")


app = FastAPI(title="Triaje de solicitudes", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config", response_model=ConfigOut)
def get_config():
    return ConfigOut(
        confidence_threshold=settings.confidence_threshold,
        categories=list(CATEGORIES),
        priorities=list(PRIORITIES),
        always_review_priorities=[p.strip() for p in settings.always_review_priorities.split(",") if p.strip()],
        demo=settings.demo_mode,
        examples=EXAMPLES if settings.demo_mode else [],
    )


@app.post("/api/requests", response_model=RequestOut, status_code=201, dependencies=[Depends(demo_guard)])
def create_request(
    payload: RequestCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, max_length=200),
    db: Session = Depends(get_db),
):
    if not settings.demo_mode:
        # Un reintento con la misma clave devuelve la solicitud original (200) y no vuelve a clasificar.
        def original():
            known = db.get(IdempotencyKey, idempotency_key) if idempotency_key else None
            if known:
                response.status_code = 200
            return known and db.get(Request, known.request_id)

        try:
            return original() or store(db, payload.subject, payload.body, payload.requester, idempotency_key)
        except IntegrityError:  # dos envíos simultáneos con la misma clave: gana el primero
            db.rollback()
            return original()
    if (payload.subject, payload.body) not in ALLOWED:
        raise HTTPException(status_code=403, detail="En la demo pública solo se envían las solicitudes de ejemplo.")
    item = store(db, payload.subject, payload.body, VISITOR)
    # Tope de filas: se borran las más antiguas. shortcut: sin bloqueo, dos envíos a la vez pueden
    # pasarse del tope por una fila hasta el siguiente envío; poner un candado si eso importa.
    excess = (db.scalar(select(func.count(Request.id))) or 0) - settings.demo_max_requests
    if excess > 0:
        db.execute(delete(Request).where(Request.id.in_(select(Request.id).order_by(Request.id).limit(excess))))
        db.commit()
    return item


@app.get("/api/requests", response_model=list[RequestOut])
def list_requests(
    status: str | None = Query(default=None, pattern="^(auto_approved|needs_review|reviewed)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Request).order_by(Request.created_at.desc(), Request.id.desc()).limit(limit).offset(offset)
    if status:
        stmt = stmt.where(Request.status == status)
    return db.scalars(stmt).all()


@app.get("/api/requests/{request_id}", response_model=RequestOut)
def get_request(request_id: int, db: Session = Depends(get_db)):
    item = db.get(Request, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe.")
    return item


@app.post("/api/requests/{request_id}/review", response_model=RequestOut, dependencies=[Depends(demo_guard)])
def review_request(request_id: int, payload: ReviewIn, db: Session = Depends(get_db)):
    item = db.get(Request, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe.")
    if item.status != "needs_review":
        raise HTTPException(status_code=409, detail="Esta solicitud no está pendiente de revisión.")
    item.final_category = payload.category
    item.final_priority = payload.priority
    # En la demo no se guarda texto libre de visitantes.
    item.reviewer = VISITOR if settings.demo_mode else payload.reviewer
    item.review_note = None if settings.demo_mode else payload.note
    item.reviewed_at = datetime.now(timezone.utc)
    item.status = "reviewed"
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/metrics", response_model=MetricsOut)
def metrics(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(Request.id))) or 0
    by_status = dict(db.execute(select(Request.status, func.count()).group_by(Request.status)).all())
    by_category = dict(db.execute(select(Request.pred_category, func.count()).group_by(Request.pred_category)).all())
    avg_conf = db.scalar(select(func.avg(Request.pred_confidence))) or 0.0
    reviewed = db.scalars(select(Request).where(Request.status == "reviewed")).all()
    corrected = sum(
        1 for r in reviewed if r.final_category != r.pred_category or r.final_priority != r.pred_priority
    )
    return MetricsOut(
        total=total,
        by_status=by_status,
        by_category=by_category,
        avg_confidence=round(float(avg_conf), 3),
        auto_approved_share=round(by_status.get("auto_approved", 0) / total, 3) if total else 0.0,
        reviewed_count=len(reviewed),
        human_correction_rate=round(corrected / len(reviewed), 3) if reviewed else None,
    )


EVAL_DIR = Path(__file__).resolve().parents[1] / "eval"


@app.get("/api/eval")
def eval_reports() -> list[dict]:
    """Reportes guardados por eval/run_eval.py (uno por clasificador evaluado)."""
    reports = []
    for p in sorted(EVAL_DIR.glob("report_*.json")):
        try:  # un reporte a medio escribir o mal editado no debe tumbar los demás
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict):
            reports.append(data)
    return reports


# Panel compilado (solo si existe, p. ej. en el contenedor). En desarrollo lo sirve Vite.
STATIC = Path(settings.static_dir)
if (STATIC / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def panel(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="No existe.")
        return FileResponse(STATIC / "index.html")
