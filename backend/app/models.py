from datetime import datetime, timedelta, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .config import settings
from .database import Base


def team_routes() -> dict[str, str]:
    return dict(p.split("=", 1) for p in settings.team_routes.split(",") if "=" in p)


def sla_hours() -> dict[str, float]:
    return {k.strip(): float(v) for k, v in (p.split("=") for p in settings.sla_hours.split(",") if "=" in p)}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    requester: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(String(20), index=True)  # auto_approved | needs_review | reviewed

    pred_category: Mapped[str] = mapped_column(String(40))
    pred_priority: Mapped[str] = mapped_column(String(10))
    pred_summary: Mapped[str] = mapped_column(Text)
    pred_confidence: Mapped[float] = mapped_column(Float)
    pred_reasoning: Mapped[str] = mapped_column(Text)
    classifier_version: Mapped[str] = mapped_column(String(80))
    classifier_failed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), index=True)
    # Por qué la política la aprobó o la mandó a revisión, y con qué umbral. None en filas anteriores a 0002.
    policy_reason: Mapped[str | None] = mapped_column(String(80), default=None)  # "auto" o motivos separados por coma
    policy_threshold: Mapped[float | None] = mapped_column(Float, default=None)

    final_category: Mapped[str | None] = mapped_column(String(40), default=None)
    final_priority: Mapped[str | None] = mapped_column(String(10), default=None)
    reviewer: Mapped[str | None] = mapped_column(String(120), default=None)
    review_note: Mapped[str | None] = mapped_column(Text, default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # Trabajo después del triaje: abierta -> en_curso -> resuelta.
    work_state: Mapped[str] = mapped_column(String(12), default="abierta", server_default="abierta", index=True)
    assignee: Mapped[str | None] = mapped_column(String(120), default=None)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    events: Mapped[list["RequestEvent"]] = relationship(
        order_by="RequestEvent.id", cascade="all, delete-orphan", back_populates="request"
    )

    def aware(self, dt: datetime | None) -> datetime | None:
        """SQLite devuelve fechas sin zona: son UTC."""
        return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt

    @property
    def priority(self) -> str:
        """Prioridad vigente: la de la persona si la corrigió; si no, la del modelo."""
        return self.final_priority or self.pred_priority

    @property
    def category(self) -> str:
        return self.final_category or self.pred_category

    @property
    def team(self) -> str:
        return team_routes().get(self.category, "Mesa general")

    @property
    def closed(self) -> bool:
        """Ya no corre el plazo: está resuelta."""
        return self.work_state == "resuelta"

    @property
    def due_at(self) -> datetime:
        return self.aware(self.created_at) + timedelta(hours=sla_hours().get(self.priority, 24))

    @property
    def overdue(self) -> bool:
        return not self.closed and utcnow() > self.due_at

    def log(self, kind: str, actor: str, **detail) -> None:
        self.events.append(RequestEvent(kind=kind, actor=actor, detail=detail))


class RequestEvent(Base):
    """Historial de una solicitud: received, classified, decided, reviewed. Solo se añaden filas."""
    __tablename__ = "request_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    kind: Mapped[str] = mapped_column(String(20))
    actor: Mapped[str] = mapped_column(String(120))  # persona o "sistema"
    detail: Mapped[dict] = mapped_column(JSON, default=dict)

    request: Mapped[Request] = relationship(back_populates="events")


class IdempotencyKey(Base):
    """Clave que manda quien reintenta (el integrador de webhooks) para no crear la solicitud dos veces.
    Tabla aparte: `create_all` la crea sin migrar la de solicitudes."""
    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    request_id: Mapped[int] = mapped_column()
