"""Demo pública: los visitantes solo envían ejemplos ya escritos (nada de texto libre que
otro visitante pueda ver), con límite por IP y tope de filas."""
import csv
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Request

EVAL_DIR = Path(__file__).resolve().parents[1] / "eval"
VISITOR = "Visitante"


def load_examples(name: str) -> list[dict[str, str]]:
    with open(EVAL_DIR / name, newline="", encoding="utf-8") as f:
        return [{"subject": r["subject"], "body": r["body"]} for r in csv.DictReader(f)]


SEED = load_examples("eval_set.csv")  # se cargan al arrancar la demo
EXAMPLES = load_examples("eval_final.csv") + SEED  # lo único que un visitante puede enviar
ALLOWED = {(e["subject"], e["body"]) for e in EXAMPLES}


def client_ip(request: Request, trusted_header: str = "") -> str:
    """IP del visitante. Solo se confía en una cabecera si se configuró explícitamente
    (en Render: True-Client-IP, que fija Cloudflare). X-Forwarded-For nunca: el cliente la puede falsear."""
    if trusted_header:
        value = request.headers.get(trusted_header, "").strip()
        if value:
            return value
    return request.client.host if request.client else "desconocida"


class RateLimiter:
    """Ventana fija por minuto y clave.
    shortcut: en memoria y por proceso, válido con un solo contenedor; usar Redis si hay réplicas."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._window: datetime | None = None
        self._counts: dict[str, int] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        window = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        with self._lock:
            if window != self._window:  # ventana nueva: se descartan los contadores viejos
                self._window, self._counts = window, {}
            if self._counts.get(key, 0) >= self.per_minute:
                return False
            self._counts[key] = self._counts.get(key, 0) + 1
            return True
