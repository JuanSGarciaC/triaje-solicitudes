import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi import Request as HttpRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .classifier import CATEGORIES, PRIORITIES, Classification, MockClassifier, fallback, get_classifier
from .config import settings
from .database import SessionLocal, get_db, migrate
from .demo import ALLOWED, EXAMPLES, SEED, VISITOR, RateLimiter, client_ip
from .models import IdempotencyKey, Request, RequestEvent
from .policy import policy_reasons
from .schemas import ClassifierStatus, ConfigOut, EventOut, PreviewIn, PreviewOut, MetricsOut, RequestCreate, RequestOut, ReviewIn


@asynccontextmanager
async def lifespan(_: FastAPI):
    migrate()
    if settings.demo_mode:
        with SessionLocal() as db:
            seed_demo(db)
    yield


limiter = RateLimiter(settings.demo_rate_per_minute)
preview_limiter = RateLimiter(settings.preview_rate_per_minute)


def apply(item: Request, result: Classification, version: str) -> None:
    """Guarda la predicción y la decisión de la política, con el motivo y el umbral vigente."""
    reasons = policy_reasons(result)
    item.pred_category, item.pred_priority = result.category, result.priority
    item.pred_summary, item.pred_confidence, item.pred_reasoning = result.summary, result.confidence, result.reasoning
    item.classifier_version, item.classifier_failed = version, result.failed
    item.policy_reason, item.policy_threshold = ",".join(reasons) or "auto", settings.confidence_threshold
    item.status = "needs_review" if reasons else "auto_approved"
    item.log("classified", "sistema", version=version, category=result.category, priority=result.priority,
             confidence=result.confidence, failed=result.failed)
    item.log("decided", "sistema", status=item.status, reason=item.policy_reason, threshold=item.policy_threshold)


def store(
    db: Session, subject: str, body: str, requester: str, key: str | None = None, result: Classification | None = None
) -> Request:
    classifier = get_classifier()
    item = Request(subject=subject, body=body, requester=requester)
    item.log("received", requester)
    apply(item, result or classifier.classify(subject, body), classifier.version)
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
    # La primera simula que el modelo no respondió, para que la demo enseñe el aviso y «Reclasificar».
    stored = [
        store(db, e["subject"], e["body"], "Laura Ríos (ejemplo)", result=None if i else fallback(e["subject"]))
        for i, e in enumerate(SEED)
    ]
    queue = [r for r in stored if r.status == "needs_review" and not r.classifier_failed]
    for i, r in enumerate(queue[: len(queue) // 2]):
        r.final_category, r.final_priority = r.pred_category, "media" if i % 2 else r.pred_priority
        r.reviewer, r.reviewed_at, r.status = "Camila Torres (ejemplo)", datetime.now(timezone.utc), "reviewed"
        r.log("reviewed", r.reviewer, category=r.final_category, priority=r.final_priority,
              corrected=r.final_priority != r.pred_priority)
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
def get_config(db: Session = Depends(get_db)):
    clf = get_classifier()
    last_failed = db.scalar(select(Request.classifier_failed).order_by(Request.id.desc()).limit(1))
    waiting = select(func.count(Request.id)).where(Request.status == "needs_review")
    return ConfigOut(
        brand_name=settings.brand_name,
        brand_tagline=settings.brand_tagline,
        classifier=ClassifierStatus(
            version=clf.version,
            healthy=not last_failed and not getattr(clf, "quota_exhausted", False),
            failed_pending=db.scalar(waiting.where(Request.classifier_failed)) or 0,
            pending=db.scalar(waiting) or 0,
        ),
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
        oldest = select(Request.id).order_by(Request.id).limit(excess).scalar_subquery()
        db.execute(delete(RequestEvent).where(RequestEvent.request_id.in_(oldest)))
        db.execute(delete(Request).where(Request.id.in_(oldest)))
        db.commit()
    return item


@app.post("/api/classify/preview", response_model=PreviewOut)
def classify_preview(payload: PreviewIn, request: HttpRequest):
    """«Prueba tu solicitud»: clasifica y aplica la política sin guardar nada (ni texto, ni registro).
    Si el LLM no está configurado o falla, responde el clasificador de reglas y lo avisa."""
    if not preview_limiter.allow(client_ip(request, settings.client_ip_header)):
        raise HTTPException(status_code=429, detail="Demasiadas pruebas seguidas. Espera un minuto.")
    subject = payload.subject.strip() or payload.body.strip()[:60]
    try:
        clf = get_classifier()
    except RuntimeError:  # falta la clave del proveedor: reglas
        clf = None
    result = clf.classify(subject, payload.body) if clf else None
    rules = clf is None or result.failed and not isinstance(clf, MockClassifier)
    if rules:
        clf = MockClassifier()
        result = clf.classify(subject, payload.body)
    reasons = policy_reasons(result)
    return PreviewOut(
        category=result.category,
        priority=result.priority,
        confidence=result.confidence,
        reasons=reasons,
        status="needs_review" if reasons else "auto_approved",
        threshold=settings.confidence_threshold,
        classifier=clf.version,
        rules_fallback=rules,
    )


@app.get("/api/requests", response_model=list[RequestOut])
def list_requests(
    status: str | None = Query(default=None, pattern="^(auto_approved|needs_review|reviewed)$"),
    failed: bool | None = Query(default=None, description="Solo las que cayeron a respaldo (true) o las que no"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Request).order_by(Request.created_at.desc(), Request.id.desc()).limit(limit).offset(offset)
    if status:
        stmt = stmt.where(Request.status == status)
    if failed is not None:
        stmt = stmt.where(Request.classifier_failed == failed)
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
    corrected = (item.final_category, item.final_priority) != (item.pred_category, item.pred_priority)
    item.log("reviewed", item.reviewer, category=item.final_category, priority=item.final_priority, corrected=corrected)
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/requests/{request_id}/events", response_model=list[EventOut])
def request_events(request_id: int, db: Session = Depends(get_db)):
    item = db.get(Request, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe.")
    return item.events


@app.post("/api/requests/{request_id}/reclassify", response_model=RequestOut, dependencies=[Depends(demo_guard)])
def reclassify_request(request_id: int, db: Session = Depends(get_db)):
    """Vuelve a clasificar una solicitud pendiente (p. ej. cuando el modelo falló). La política decide otra vez."""
    item = db.get(Request, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe.")
    if item.status != "needs_review":
        raise HTTPException(status_code=409, detail="Solo se reclasifican solicitudes pendientes de revisión.")
    classifier = get_classifier()
    apply(item, classifier.classify(item.subject, item.body), classifier.version)
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


# Página de presentación: HTML estático que se lee sin JS. Va antes del panel para que su ruta comodín no la tape.
LANDING = Path(__file__).parent / "landing"


@app.api_route("/como-funciona", methods=["GET", "HEAD"], include_in_schema=False)
def landing():
    # Sigue siendo HTML estático: solo se rellena la marca, sin plantillas ni JS.
    html = (LANDING / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("{{MARCA}}", settings.brand_name).replace("{{LEMA}}", settings.brand_tagline))


app.mount("/como-funciona", StaticFiles(directory=LANDING), name="landing")


# Panel compilado (solo si existe, p. ej. en el contenedor). En desarrollo lo sirve Vite.
STATIC = Path(settings.static_dir)
if (STATIC / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def panel(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="No existe.")
        return FileResponse(STATIC / "index.html")
