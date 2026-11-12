import pytest
from sqlalchemy import delete

from app import main
from app.config import settings
from app.database import SessionLocal
from app.demo import EXAMPLES, RateLimiter
from app.models import Request

URGENT = {"subject": "Sistema de facturación caído", "requester": "Visitante"}


@pytest.fixture()
def demo(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(main, "limiter", RateLimiter(100))
    return client


def example(subject: str) -> dict:
    return {**next(e for e in EXAMPLES if e["subject"] == subject), "requester": "Nombre inventado"}


def test_demo_rejects_free_text_and_never_stores_visitor_names(demo):
    free = {"subject": "Texto libre", "body": "Cualquier cosa que escriba un visitante.", "requester": "X Y"}
    assert demo.post("/api/requests", json=free).status_code == 403
    r = demo.post("/api/requests", json=example(EXAMPLES[0]["subject"]))
    assert r.status_code == 201 and r.json()["requester"] == "Visitante"


def test_demo_review_drops_reviewer_and_note(demo):
    item = demo.post("/api/requests", json=example(URGENT["subject"])).json()
    assert item["status"] == "needs_review"
    review = {"category": "software", "priority": "baja", "reviewer": "Insulto", "note": "texto libre"}
    done = demo.post(f"/api/requests/{item['id']}/review", json=review).json()
    assert (done["reviewer"], done["review_note"]) == ("Visitante", None)


def test_demo_rate_limit(demo, monkeypatch):
    monkeypatch.setattr(main, "limiter", RateLimiter(2))
    codes = [demo.post("/api/requests", json=example(EXAMPLES[0]["subject"])).status_code for _ in range(3)]
    assert codes == [201, 201, 429]
    assert demo.get("/api/requests").status_code == 200  # leer no se limita


def test_demo_caps_rows_by_dropping_the_oldest(demo, monkeypatch):
    monkeypatch.setattr(settings, "demo_max_requests", 3)
    ids = [demo.post("/api/requests", json=example(EXAMPLES[i]["subject"])).json()["id"] for i in range(5)]
    kept = [r["id"] for r in demo.get("/api/requests").json()]
    assert len(kept) == 3 and set(kept) == set(ids[-3:])


def test_demo_seed_and_config(demo):
    with SessionLocal() as db:
        db.execute(delete(Request))
        db.commit()
        main.seed_demo(db)
        main.seed_demo(db)  # no duplica si ya hay datos
    m = demo.get("/api/metrics").json()
    assert m["total"] == 32 and m["reviewed_count"] >= 1 and m["by_status"].get("needs_review", 0) >= 1
    cfg = demo.get("/api/config").json()
    assert cfg["demo"] is True and len(cfg["examples"]) == 42


def test_config_hides_examples_outside_demo(client):
    cfg = client.get("/api/config").json()
    assert cfg["demo"] is False and cfg["examples"] == []
