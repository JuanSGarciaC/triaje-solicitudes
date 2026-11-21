import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi import Request as HttpRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .classifier import CATEGORIES, PRIORITIES, Classification, MockClassifier, fallback, get_classifier
from .config import settings
from .database import SessionLocal, get_db, migrate
from .demo import ALLOWED, EXAMPLES, SEED, VISITOR, RateLimiter, client_ip, load_labeled
from .models import IdempotencyKey, Notification, Request, RequestEvent, sla_hours, team_routes
from .notify import notify
from .policy import policy_reasons
from .schemas import ClassifierStatus, ConfigOut, DeskOut, EventOut, NotificationOut, ReviewStat, TeamLoad, PreviewIn, PreviewOut, WorkIn, MetricsOut, RequestCreate, RequestOut, ReviewIn


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


def triage_message(item: Request) -> str:
    if item.status == "auto_approved":
        return f"N.º {item.id:04d} aprobada sola y enviada a {item.team}."
    why = {"model_failed": "el modelo no respondió", "sensitive_priority": "prioridad alta", "low_confidence": "baja confianza"}
    reasons = " y ".join(why.get(c, c) for c in (item.policy_reason or "").split(",") if c)
    return f"N.º {item.id:04d} espera revisión de una persona ({reasons})."


def store(
    db: Session, subject: str, body: str, requester: str, key: str | None = None, result: Classification | None = None,
    announce: bool = True,
) -> Request:
    classifier = get_classifier()
    item = Request(subject=subject, body=body, requester=requester)
    item.log("received", requester)
    apply(item, result or classifier.classify(subject, body), classifier.version)
    db.add(item)
    if announce:
        db.flush()
        notify(item, "triage", triage_message(item))
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
        store(db, e["subject"], e["body"], "Laura Ríos (ejemplo)", result=None if i else fallback(e["subject"]), announce=False)
        for i, e in enumerate(SEED)
    ]
    # Fechas escalonadas entre hace 5 h y hace ~48 h: la cola arranca con plazos vencidos (la urgente, la del
    # respaldo) y otros por vencer.
    now = datetime.now(timezone.utc)
    for i, r in enumerate(stored):
        r.created_at = now - timedelta(minutes=300 + 85 * (len(stored) - 1 - i))
        for ev in r.events:
            ev.at = r.created_at
    queue = [r for r in stored if r.status == "needs_review" and not r.classifier_failed]
    for i, r in enumerate(queue[: len(queue) // 2]):
        r.final_category, r.final_priority = r.pred_category, "media" if i % 2 else r.pred_priority
        r.reviewer, r.reviewed_at, r.status = "Camila Torres (ejemplo)", r.created_at + timedelta(hours=1), "reviewed"
        r.log("reviewed", r.reviewer, category=r.final_category, priority=r.final_priority,
              corrected=r.final_priority != r.pred_priority)
        r.events[-1].at = r.reviewed_at
    # Trabajo: lo antiguo resuelto dentro de plazo, algo en curso y lo reciente abierto. Una urgente en curso
    # se deja vencida para que el tablero muestre un retraso real.
    people = ("Camila Torres (ejemplo)", "Andrés Pérez (ejemplo)")
    done = [r for r in stored if r.status != "needs_review"]
    late = next((r for r in done if r.priority == "alta"), None)
    for j, r in enumerate(done):
        age_h = (now - r.created_at).total_seconds() / 3600
        start = (r.reviewed_at or r.created_at) + timedelta(minutes=20)
        if r is late or 8 <= age_h < 20 and j % 2:
            r.work_state, r.assignee = "en_curso", people[j % 2]
        elif age_h >= 20:
            r.work_state, r.assignee = "resuelta", people[j % 2]
            r.resolved_at = start + timedelta(hours=min(sla_hours().get(r.priority, 24) * 0.6, age_h - 2))
        if r.assignee:
            r.log("work", r.assignee, before="abierta", after="en_curso", team=r.team)
            r.events[-1].at = start
        if r.resolved_at:
            r.log("work", r.assignee, before="en_curso", after="resuelta", team=r.team)
            r.events[-1].at = r.resolved_at
    db.commit()
    seed_history(db, now, people)


def seed_history(db: Session, now: datetime, people: tuple[str, str]) -> None:
    """Cinco semanas anteriores, ya resueltas, para que Métricas tenga serie semanal. Quien revisa aplica la
    etiqueta esperada del conjunto de desarrollo: las correcciones son los errores reales del clasificador."""
    labeled = load_labeled("eval_set.csv")
    for week in range(5, 0, -1):
        for k in range(6):
            row = labeled[(week * 6 + k) % len(labeled)]
            r = store(db, row["subject"], row["body"], "Laura Ríos (ejemplo)", announce=False)
            r.created_at = now - timedelta(weeks=week, hours=k * 19)
            for ev in r.events:
                ev.at = r.created_at
            person = people[k % 2]
            if r.status == "needs_review":
                r.final_category, r.final_priority = row["expected_category"], row["expected_priority"]
                r.reviewer, r.reviewed_at, r.status = person, r.created_at + timedelta(hours=2), "reviewed"
                corrected = (r.final_category, r.final_priority) != (r.pred_category, r.pred_priority)
                r.log("reviewed", person, category=r.final_category, priority=r.final_priority, corrected=corrected)
                r.events[-1].at = r.reviewed_at
            start = (r.reviewed_at or r.created_at) + timedelta(minutes=30)
            r.work_state, r.assignee = "resuelta", person
            r.resolved_at = start + timedelta(hours=sla_hours().get(r.priority, 24) * (0.3 + 0.1 * k))
            r.log("work", person, before="abierta", after="en_curso", team=r.team)
            r.events[-1].at = start
            r.log("work", person, before="en_curso", after="resuelta", team=r.team)
            r.events[-1].at = r.resolved_at
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
            overdue=sum(r.overdue for r in db.scalars(select(Request).where(Request.work_state != "resuelta"))),
        ),
        confidence_threshold=settings.confidence_threshold,
        categories=list(CATEGORIES),
        priorities=list(PRIORITIES),
        always_review_priorities=[p.strip() for p in settings.always_review_priorities.split(",") if p.strip()],
        demo=settings.demo_mode,
        sla_hours=sla_hours(),
        teams=list(dict.fromkeys(team_routes().values())),
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
        db.execute(delete(Notification).where(Notification.request_id.in_(oldest)))
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
    change = "la corrigió" if corrected else "la confirmó"
    notify(item, "reviewed", f"N.º {item.id:04d}: {item.reviewer} {change} (prioridad {item.final_priority}); pasa a {item.team}.")
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/notifications", response_model=list[NotificationOut])
def notifications(limit: int = Query(default=30, ge=1, le=100), db: Session = Depends(get_db)):
    return db.scalars(select(Notification).order_by(Notification.id.desc()).limit(limit)).all()


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
    notify(item, "reclassified", "Reclasificada. " + triage_message(item))
    db.commit()
    db.refresh(item)
    return item


@app.post("/api/requests/{request_id}/work", response_model=RequestOut, dependencies=[Depends(demo_guard)])
def work_request(request_id: int, payload: WorkIn, db: Session = Depends(get_db)):
    """Tomar (abierta -> en curso) o resolver (en curso -> resuelta). Lo que espera revisión no se trabaja aún."""
    item = db.get(Request, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe.")
    if item.status == "needs_review":
        raise HTTPException(status_code=409, detail="Primero una persona tiene que revisar la clasificación.")
    actor = VISITOR if settings.demo_mode else payload.actor
    allowed = {"take": ("abierta", "en_curso"), "resolve": ("en_curso", "resuelta")}
    before, after = allowed[payload.action]
    if item.work_state != before:
        raise HTTPException(status_code=409, detail=f"Está «{item.work_state}», no se puede {'tomar' if payload.action == 'take' else 'resolver'}.")
    item.work_state = after
    if payload.action == "take":
        item.assignee = actor
    else:
        item.resolved_at = datetime.now(timezone.utc)
    item.log("work", actor, before=before, after=after, team=item.team)
    text = f"la atiende {actor} ({item.team})" if after == "en_curso" else f"resuelta por {actor}"
    notify(item, after, f"N.º {item.id:04d} {'en curso: ' + text if after == 'en_curso' else text}.")
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


def corrected(r: Request) -> bool:
    return (r.final_category, r.final_priority) != (r.pred_category, r.pred_priority)


@app.get("/api/metrics/desk", response_model=DeskOut)
def desk(db: Session = Depends(get_db)):
    """Tablero de la mesa: carga por equipo, vencidas, tiempos y corrección humana por semana y categoría."""
    rows = db.scalars(select(Request)).all()
    hours = lambda a, b: (a - b).total_seconds() / 3600  # noqa: E731
    avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None  # noqa: E731
    live = [r for r in rows if r.work_state != "resuelta"]
    teams = [
        TeamLoad(
            team=t,
            open=sum(r.team == t and r.work_state == "abierta" for r in live),
            in_progress=sum(r.team == t and r.work_state == "en_curso" for r in live),
            overdue=sum(r.team == t and r.overdue for r in live),
        )
        for t in dict.fromkeys(team_routes().values())
    ]
    reviewed = [r for r in rows if r.reviewed_at]
    resolved = [r for r in rows if r.resolved_at]
    now = datetime.now(timezone.utc)
    weeks: dict[str, list[Request]] = {}
    for k in range(5, -1, -1):  # las 6 últimas semanas, de lunes a domingo
        monday = (now - timedelta(weeks=k, days=now.weekday())).date().isoformat()
        weeks[monday] = []
    for r in reviewed:
        when = r.aware(r.reviewed_at)
        monday = (when - timedelta(days=when.weekday())).date().isoformat()
        if monday in weeks:
            weeks[monday].append(r)
    cats: dict[str, list[Request]] = {}
    for r in reviewed:
        cats.setdefault(r.pred_category, []).append(r)
    stat = lambda label, rs: ReviewStat(label=label, reviewed=len(rs), corrected=sum(map(corrected, rs)))  # noqa: E731
    return DeskOut(
        teams=teams,
        overdue=sum(r.overdue for r in live),
        avg_hours_to_review=avg([hours(r.aware(r.reviewed_at), r.aware(r.created_at)) for r in reviewed]),
        avg_hours_to_resolve=avg([hours(r.aware(r.resolved_at), r.aware(r.created_at)) for r in resolved]),
        resolved_on_time=round(sum(r.aware(r.resolved_at) <= r.due_at for r in resolved) / len(resolved), 3) if resolved else None,
        weeks=[stat(w, rs) for w, rs in weeks.items()],
        categories=sorted((stat(c, rs) for c, rs in cats.items()), key=lambda s: -s.reviewed),
    )


@app.get("/api/reviews.csv", response_class=PlainTextResponse)
def reviews_csv(db: Session = Depends(get_db)):
    """Las revisiones humanas como casos etiquetados, con las columnas de eval/eval_set.csv: sirven para
    medir el clasificador con run_eval.py (no lo reentrenan)."""
    import csv
    import io

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["subject", "body", "expected_category", "expected_priority", "predicted_category", "predicted_priority", "corrected"])
    for r in db.scalars(select(Request).where(Request.status == "reviewed").order_by(Request.id)):
        w.writerow([r.subject, r.body, r.final_category, r.final_priority, r.pred_category, r.pred_priority, int(corrected(r))])
    return PlainTextResponse(
        out.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="revisiones-como-casos.csv"'},
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
