"""Avisos al cambiar de estado. Un webhook saliente firmado (HMAC-SHA256 del cuerpo exacto) que cualquier
receptor puede verificar; en la demo, o sin URL configurada, se guardan como «simulado» y no salen."""
import hashlib
import hmac
import json
import logging

import httpx

from .config import settings
from .models import Notification, Request, utcnow

log = logging.getLogger(__name__)


DEMO_SECRET = "secreto-de-ejemplo-de-la-demo"  # público a propósito: en la demo los avisos no salen del servidor


def sign(body: bytes) -> str | None:
    secret = settings.notify_secret or (DEMO_SECRET if settings.demo_mode else "")
    if not secret:
        return None
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def notify(item: Request, kind: str, message: str) -> Notification:
    """Registra el aviso y, fuera de la demo y con URL, lo envía.
    shortcut: envío síncrono, un intento, timeout 3 s; para reintentos pasar por una cola o por integrador-webhooks."""
    payload = {
        "event": kind,
        "ticket": f"{item.id:04d}",
        "request_id": item.id,
        "subject": item.subject,
        "status": item.status,
        "work_state": item.work_state,
        "team": item.team,
        "message": message,
        "at": utcnow().isoformat(),
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    signature = sign(body)
    delivery = "simulado"
    if settings.notify_url and not settings.demo_mode:
        headers = {"Content-Type": "application/json", "X-Sello-Event": kind}
        if signature:
            headers["X-Sello-Signature"] = signature
        try:
            r = httpx.post(settings.notify_url, content=body, headers=headers, timeout=3.0)
            delivery = "enviado" if r.is_success else "fallido"
        except httpx.HTTPError as e:
            log.warning("No se pudo entregar el aviso %s: %s", kind, e)
            delivery = "fallido"
    n = Notification(request_id=item.id, kind=kind, message=message, payload=payload, signature=signature, delivery=delivery)
    item.notifications.append(n)
    return n
