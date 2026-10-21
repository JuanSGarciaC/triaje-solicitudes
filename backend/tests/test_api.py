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
