from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .classifier import Category, Priority


class RequestCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=10, max_length=4000)
    requester: str = Field(min_length=2, max_length=120)


class ReviewIn(BaseModel):
    category: Category
    priority: Priority
    reviewer: str = Field(min_length=2, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    body: str
    requester: str
    created_at: datetime
    status: str
    pred_category: str
    pred_priority: str
    pred_summary: str
    pred_confidence: float
    pred_reasoning: str
    classifier_version: str
    classifier_failed: bool
    policy_reason: str | None
    policy_threshold: float | None
    final_category: str | None
    final_priority: str | None
    reviewer: str | None
    review_note: str | None
    reviewed_at: datetime | None
    due_at: datetime
    overdue: bool
    work_state: str
    team: str
    assignee: str | None
    resolved_at: datetime | None


class WorkIn(BaseModel):
    action: Literal["take", "resolve"]
    actor: str = Field(min_length=2, max_length=120)


class PreviewIn(BaseModel):
    """Texto libre del visitante: se clasifica y se descarta, nunca se guarda."""

    subject: str = Field(default="", max_length=120)
    body: str = Field(min_length=10, max_length=1000)


class PreviewOut(BaseModel):
    category: str
    priority: str
    confidence: float
    reasons: list[str]  # vacío = se aprobaría sola
    status: str
    threshold: float
    classifier: str
    rules_fallback: bool  # True si se usó el clasificador de reglas porque el LLM no está disponible


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_id: int
    at: datetime
    kind: str
    message: str
    payload: dict
    signature: str | None
    delivery: str


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    at: datetime
    kind: str
    actor: str
    detail: dict


class ClassifierStatus(BaseModel):
    version: str
    healthy: bool  # False si la última clasificación falló o la cuota está agotada
    failed_pending: int  # solicitudes por revisar que cayeron a respaldo
    pending: int  # todas las que esperan a una persona
    overdue: int  # pendientes con el plazo vencido


class ConfigOut(BaseModel):
    brand_name: str
    brand_tagline: str
    confidence_threshold: float
    categories: list[str]
    priorities: list[str]
    always_review_priorities: list[str]
    demo: bool
    sla_hours: dict[str, float]
    teams: list[str]
    classifier: ClassifierStatus
    examples: list[dict[str, str]]


class TeamLoad(BaseModel):
    team: str
    open: int
    in_progress: int
    overdue: int


class ReviewStat(BaseModel):
    label: str  # semana (fecha del lunes) o categoría
    reviewed: int
    corrected: int


class DeskOut(BaseModel):
    teams: list[TeamLoad]
    overdue: int
    avg_hours_to_review: float | None
    avg_hours_to_resolve: float | None
    resolved_on_time: float | None
    weeks: list[ReviewStat]
    categories: list[ReviewStat]


class MetricsOut(BaseModel):
    total: int
    by_status: dict[str, int]
    by_category: dict[str, int]
    avg_confidence: float
    auto_approved_share: float
    reviewed_count: int
    human_correction_rate: float | None
