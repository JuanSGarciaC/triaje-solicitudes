from datetime import datetime

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
    final_category: str | None
    final_priority: str | None
    reviewer: str | None
    review_note: str | None
    reviewed_at: datetime | None


class ConfigOut(BaseModel):
    confidence_threshold: float
    categories: list[str]
    priorities: list[str]
    always_review_priorities: list[str]


class MetricsOut(BaseModel):
    total: int
    by_status: dict[str, int]
    by_category: dict[str, int]
    avg_confidence: float
    auto_approved_share: float
    reviewed_count: int
    human_correction_rate: float | None
