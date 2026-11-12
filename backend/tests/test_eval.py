from app.classifier import CATEGORIES, MockClassifier
from eval.run_eval import evaluate, to_markdown

ROWS = [
    # acierta categoría y prioridad, se aprueba sola
    {"subject": "Contraseña bloqueada", "body": "Mi cuenta está bloqueada desde ayer.",
     "expected_category": "acceso_cuentas", "expected_priority": "media"},
    # sin palabras clave: predice "otro" con confianza 0.4 y va a revisión
    {"subject": "Proyector", "body": "No enciende el de la sala B.",
     "expected_category": "hardware", "expected_priority": "baja"},
]


def test_evaluate_counts_and_errors():
    d = evaluate(ROWS, MockClassifier(), dataset="prueba.csv")
    assert (d["n"], d["category_ok"], d["priority_ok"], d["auto"], d["auto_ok"]) == (2, 1, 1, 1, 1)
    assert d["confusion"]["hardware"]["otro"] == 1 and d["confusion"]["acceso_cuentas"]["acceso_cuentas"] == 1
    assert set(d["confusion"]) == set(CATEGORIES)
    assert d["category_errors"] == [
        {"subject": "Proyector", "expected": "hardware", "predicted": "otro", "confidence": 0.4}
    ]
    assert d["priority_errors"][0]["predicted"] == "media"
    assert "Exactitud de categoría: 1/2 (50%)" in to_markdown(d)


def test_eval_endpoint_serves_saved_reports(client):
    reports = client.get("/api/eval").json()
    by_clf = {r["classifier"]: r for r in reports}
    gemini = by_clf["gemini:gemini-3.5-flash-lite"]
    assert (gemini["n"], gemini["category_ok"], gemini["priority_ok"]) == (10, 9, 6)
    assert "mock-keywords-v1" in by_clf
    for r in reports:  # la matriz debe cuadrar con el total de casos
        assert sum(sum(row.values()) for row in r["confusion"].values()) == r["n"]


def test_eval_endpoint_skips_broken_reports(client, monkeypatch, tmp_path):
    (tmp_path / "report_roto.json").write_text("{a medias", encoding="utf-8")
    (tmp_path / "report_lista.json").write_text("[1]", encoding="utf-8")
    (tmp_path / "report_ok.json").write_text('{"n": 1}', encoding="utf-8")
    monkeypatch.setattr("app.main.EVAL_DIR", tmp_path)
    assert client.get("/api/eval").json() == [{"n": 1}]
