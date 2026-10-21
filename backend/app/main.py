from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .classifier import CATEGORIES, PRIORITIES, get_classifier
from .config import settings
from .database import Base, engine, get_db
from .models import Request
from .policy import decide_status
from .schemas import ConfigOut, MetricsOut, RequestCreate, RequestOut, ReviewIn


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


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
    )


@app.post("/api/requests", response_model=RequestOut, status_code=201)
def create_request(payload: RequestCreate, db: Session = Depends(get_db)):
    classifier = get_classifier()
    result = classifier.classify(payload.subject, payload.body)
    item = Request(
        subject=payload.subject,
        body=payload.body,
        requester=payload.requester,
        status=decide_status(result),
        pred_category=result.category,
        pred_priority=result.priority,
        pred_summary=result.summary,
        pred_confidence=result.confidence,
        pred_reasoning=result.reasoning,
        classifier_version=classifier.version,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
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


@app.post("/api/requests/{request_id}/review", response_model=RequestOut)
def review_request(request_id: int, payload: ReviewIn, db: Session = Depends(get_db)):
    item = db.get(Request, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe.")
    if item.status != "needs_review":
        raise HTTPException(status_code=409, detail="Esta solicitud no está pendiente de revisión.")
    item.final_category = payload.category
    item.final_priority = payload.priority
    item.reviewer = payload.reviewer
    item.review_note = payload.note
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
