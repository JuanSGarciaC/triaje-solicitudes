from .classifier import Classification
from .config import settings


def decide_status(c: Classification) -> str:
    """Regla de aprobación: baja confianza o prioridad sensible => revisión humana."""
    always = {p.strip() for p in settings.always_review_priorities.split(",") if p.strip()}
    if c.confidence < settings.confidence_threshold or c.priority in always:
        return "needs_review"
    return "auto_approved"
