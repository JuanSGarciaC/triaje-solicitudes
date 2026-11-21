def _create(client, subject, body, requester="Ana Pérez"):
    return client.post("/api/requests", json={"subject": subject, "body": body, "requester": requester})


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_confident_request_is_auto_approved(client):
    r = _create(client, "Contraseña bloqueada", "Mi cuenta está bloqueada desde ayer y no puedo entrar al sistema.")
    assert r.status_code == 201
    data = r.json()
    assert data["pred_category"] == "acceso_cuentas"
    assert data["status"] == "auto_approved"


def test_high_priority_always_needs_review(client):
    r = _create(client, "Urgente: VPN caída", "La VPN está caída y todos en el equipo comercial perdieron la conexión.")
    assert r.json()["pred_priority"] == "alta"
    assert r.json()["status"] == "needs_review"


def test_review_flow_and_metrics(client):
    created = _create(client, "Consulta general", "Quisiera saber algo sobre otro tema distinto.").json()
    assert created["status"] == "needs_review"
    review = {"category": "software", "priority": "baja", "reviewer": "Luis Gómez", "note": "Era sobre licencias"}
    done = client.post(f"/api/requests/{created['id']}/review", json=review)
    assert done.status_code == 200 and done.json()["status"] == "reviewed"
    again = client.post(f"/api/requests/{created['id']}/review", json=review)
    assert again.status_code == 409
    m = client.get("/api/metrics").json()
    assert m["reviewed_count"] >= 1 and m["human_correction_rate"] is not None


def test_validation_errors(client):
    assert _create(client, "", "texto suficientemente largo").status_code == 422
    assert client.get("/api/requests/999999").status_code == 404
    assert client.get("/api/requests?status=otro").status_code == 422


def test_config_endpoint(client):
    cfg = client.get("/api/config").json()
    assert "acceso_cuentas" in cfg["categories"] and cfg["confidence_threshold"] == 0.75
    assert cfg["brand_name"] == "Sello"  # la marca vive solo en settings.brand_name


def test_panel_routes_fall_back_to_index_but_api_does_not(client):
    assert "<title>panel</title>" in client.get("/revision").text
    assert client.get("/api/no-existe").status_code == 404
    assert client.get("/api").status_code == 404
    assert client.head("/").status_code == 200


def test_como_funciona_es_html_estatico_y_no_lo_tapa_el_panel(client):
    page = client.get("/como-funciona")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    # Legible sin JS: el texto de los pasos y las cifras ya vienen en el HTML.
    assert "Seguro, pero no basta" in page.text and ">9/10<" in page.text
    assert "{{MARCA}}" not in page.text and "<strong>Sello</strong>" in page.text  # marca de settings
    for asset in ("/como-funciona/landing.css", "/como-funciona/landing.js", "/como-funciona/sello.svg", "/como-funciona/fonts/archivo-latin-wdth-normal.woff2"):
        assert client.get(asset).status_code == 200, asset
    assert client.head("/como-funciona").status_code == 200


def test_idempotency_key_no_duplica(client):
    payload = {"subject": "Impresora sin tinta", "body": "La impresora del segundo piso no tiene tinta negra.", "requester": "octocat"}
    first = client.post("/api/requests", json=payload, headers={"Idempotency-Key": "evento-1"})
    again = client.post("/api/requests", json=payload, headers={"Idempotency-Key": "evento-1"})
    other = client.post("/api/requests", json=payload, headers={"Idempotency-Key": "evento-2"})
    assert (first.status_code, again.status_code, other.status_code) == (201, 200, 201)
    assert again.json()["id"] == first.json()["id"] != other.json()["id"]
    assert again.json()["created_at"] == first.json()["created_at"]


def test_guarda_el_motivo_y_reclasifica_un_respaldo(client, monkeypatch):
    from app import main
    from app.classifier import fallback

    ok = client.post("/api/requests", json={"subject": "Instalar Excel", "body": "Necesito instalar Excel en mi equipo.", "requester": "Ana"}).json()
    assert ok["policy_reason"] == "auto" and ok["policy_threshold"] == 0.75 and ok["classifier_failed"] is False

    real = main.get_classifier()

    class Caido:
        version = real.version

        def classify(self, subject, body):
            return fallback(subject)

    monkeypatch.setattr(main, "get_classifier", lambda: Caido())
    down = client.post("/api/requests", json={"subject": "VPN caída", "body": "No conecta la VPN desde casa.", "requester": "Ana"}).json()
    assert down["status"] == "needs_review" and down["classifier_failed"] and down["policy_reason"] == "model_failed"
    cfg = client.get("/api/config").json()["classifier"]
    assert cfg["healthy"] is False and cfg["failed_pending"] >= 1 and cfg["pending"] >= cfg["failed_pending"]
    assert down["id"] in [r["id"] for r in client.get("/api/requests?failed=true").json()]

    monkeypatch.setattr(main, "get_classifier", lambda: real)
    again = client.post(f"/api/requests/{down['id']}/reclassify").json()
    assert again["classifier_failed"] is False and again["policy_reason"] != "model_failed"
    assert client.post(f"/api/requests/{ok['id']}/reclassify").status_code == 409


def test_motivos_de_la_politica():
    from app.classifier import Classification, fallback
    from app.policy import policy_reasons

    assert policy_reasons(Classification("software", "alta", "", 0.5, "")) == ["sensitive_priority", "low_confidence"]
    assert policy_reasons(Classification("software", "baja", "", 0.9, "")) == []
    assert policy_reasons(fallback("x")) == ["model_failed"]


def test_historial_de_una_solicitud(client):
    r = client.post("/api/requests", json={"subject": "Sistema caído", "body": "Producción caída para todos, urgente.", "requester": "Ana"}).json()
    client.post(f"/api/requests/{r['id']}/review", json={"category": r["pred_category"], "priority": "media", "reviewer": "Bea"})
    events = client.get(f"/api/requests/{r['id']}/events").json()
    assert [e["kind"] for e in events] == ["received", "classified", "decided", "reviewed"]
    assert events[0]["actor"] == "Ana" and "sensitive_priority" in events[2]["detail"]["reason"].split(",")
    assert events[3]["actor"] == "Bea" and events[3]["detail"]["corrected"] is True
    assert client.get("/api/requests/999999/events").status_code == 404


def test_prueba_tu_solicitud_no_guarda_nada_y_tiene_limite(client, monkeypatch):
    from app import main
    from app.demo import RateLimiter

    monkeypatch.setattr(main, "preview_limiter", RateLimiter(2))
    antes = client.get("/api/metrics").json()["total"]
    r = client.post("/api/classify/preview", json={"body": "La VPN está caída y todos perdieron la conexión, urgente."})
    assert r.status_code == 200
    out = r.json()
    assert out["priority"] == "alta" and "sensitive_priority" in out["reasons"] and out["status"] == "needs_review"
    assert client.get("/api/metrics").json()["total"] == antes  # no se guardó
    assert client.post("/api/classify/preview", json={"body": "corto"}).status_code == 422
    assert client.post("/api/classify/preview", json={"body": "x" * 1001}).status_code == 422
    client.post("/api/classify/preview", json={"body": "Necesito instalar Excel en mi equipo."})
    assert client.post("/api/classify/preview", json={"body": "Necesito instalar Excel en mi equipo."}).status_code == 429


def test_prueba_tu_solicitud_usa_reglas_si_falta_la_clave(client, monkeypatch):
    from app import main

    def sin_clave():
        raise RuntimeError("Falta GOOGLE_API_KEY")

    monkeypatch.setattr(main, "get_classifier", sin_clave)
    out = client.post("/api/classify/preview", json={"body": "Necesito instalar Excel en mi equipo."}).json()
    assert out["rules_fallback"] is True and out["classifier"].startswith("mock") and out["status"] == "auto_approved"


def test_vencimiento_por_prioridad(client):
    from datetime import timedelta

    from app.database import SessionLocal
    from app.models import Request

    r = client.post("/api/requests", json={"subject": "Producción caída", "body": "El sistema de producción está caído para todos.", "requester": "Ana"}).json()
    assert r["status"] == "needs_review" and r["overdue"] is False
    with SessionLocal() as db:
        item = db.get(Request, r["id"])
        item.created_at = item.created_at - timedelta(hours=5)  # alta: 4 h de plazo
        db.commit()
    assert client.get(f"/api/requests/{r['id']}").json()["overdue"] is True
    assert client.get("/api/config").json()["classifier"]["overdue"] >= 1
    client.post(f"/api/requests/{r['id']}/review", json={"category": r["pred_category"], "priority": "alta", "reviewer": "Bea"})
    assert client.get(f"/api/requests/{r['id']}").json()["overdue"] is True  # revisada no basta: el plazo es para resolver
    for action in ("take", "resolve"):
        client.post(f"/api/requests/{r['id']}/work", json={"action": action, "actor": "Bea"})
    assert client.get(f"/api/requests/{r['id']}").json()["overdue"] is False


def test_tomar_y_resolver(client):
    r = client.post("/api/requests", json={"subject": "Instalar Excel", "body": "Necesito instalar Excel en mi equipo.", "requester": "Ana"}).json()
    assert r["work_state"] == "abierta" and r["team"] == "Software"
    work = lambda action: client.post(f"/api/requests/{r['id']}/work", json={"action": action, "actor": "Bea"})  # noqa: E731
    assert work("resolve").status_code == 409  # hay que tomarla antes
    taken = work("take").json()
    assert taken["work_state"] == "en_curso" and taken["assignee"] == "Bea"
    done = work("resolve").json()
    assert done["work_state"] == "resuelta" and done["resolved_at"] and done["overdue"] is False
    assert [e["kind"] for e in client.get(f"/api/requests/{r['id']}/events").json()][-2:] == ["work", "work"]

    urgent = client.post("/api/requests", json={"subject": "Caído", "body": "Producción caída para todos, urgente.", "requester": "Ana"}).json()
    assert client.post(f"/api/requests/{urgent['id']}/work", json={"action": "take", "actor": "Bea"}).status_code == 409


def test_tablero_de_la_mesa_y_csv(client):
    r = client.post("/api/requests", json={"subject": "Caído", "body": "Producción caída para todos, urgente.", "requester": "Ana"}).json()
    client.post(f"/api/requests/{r['id']}/review", json={"category": "software", "priority": "media", "reviewer": "Bea"})
    d = client.get("/api/metrics/desk").json()
    assert {t["team"] for t in d["teams"]} >= {"Software", "Redes", "Mesa general"}
    assert len(d["weeks"]) == 6 and d["weeks"][-1]["reviewed"] >= 1 and d["weeks"][-1]["corrected"] >= 1
    assert d["avg_hours_to_review"] is not None
    csv_text = client.get("/api/reviews.csv")
    assert csv_text.headers["content-type"].startswith("text/csv")
    lines = csv_text.text.splitlines()
    assert lines[0].startswith("subject,body,expected_category,expected_priority") and any("Caído" in x for x in lines)
