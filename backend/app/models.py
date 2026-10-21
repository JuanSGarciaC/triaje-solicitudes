from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

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

    final_category: Mapped[str | None] = mapped_column(String(40), default=None)
    final_priority: Mapped[str | None] = mapped_column(String(10), default=None)
    reviewer: Mapped[str | None] = mapped_column(String(120), default=None)
    review_note: Mapped[str | None] = mapped_column(Text, default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
