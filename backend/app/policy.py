from .classifier import Classification
from .config import settings

# Motivos por los que una solicitud pasa a revisión humana; sin motivos se aprueba sola ("auto").
MODEL_FAILED, SENSITIVE_PRIORITY, LOW_CONFIDENCE = "model_failed", "sensitive_priority", "low_confidence"


def policy_reasons(c: Classification) -> list[str]:
    """Reglas que dispararon, en orden de importancia."""
    always = {p.strip() for p in settings.always_review_priorities.split(",") if p.strip()}
    reasons = [MODEL_FAILED] if c.failed else []
    if c.priority in always:
        reasons.append(SENSITIVE_PRIORITY)
    if not c.failed and c.confidence < settings.confidence_threshold:
        reasons.append(LOW_CONFIDENCE)
    return reasons


def decide_status(c: Classification) -> str:
    """Regla de aprobación: fallo del modelo, baja confianza o prioridad sensible => revisión humana."""
    return "needs_review" if policy_reasons(c) else "auto_approved"
