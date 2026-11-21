from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


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

    events: Mapped[list["RequestEvent"]] = relationship(
        order_by="RequestEvent.id", cascade="all, delete-orphan", back_populates="request"
    )

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
