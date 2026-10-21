import pytest

import httpx

from app.classifier import GeminiClassifier, MockClassifier, parse_classification


def test_parse_valid_json_and_clamps_confidence():
    raw = 'Aquí va: {"category":"hardware","priority":"alta","summary":"Monitor roto","confidence":1.7,"reasoning":"x"}'
    c = parse_classification(raw, "Monitor")
    assert c.category == "hardware" and c.priority == "alta"
    assert c.confidence == 1.0


def test_parse_rejects_unknown_category():
    with pytest.raises(ValueError):
        parse_classification('{"category":"magia","priority":"alta","confidence":0.9}', "x")


def test_parse_rejects_text_without_json():
    with pytest.raises(ValueError):
        parse_classification("no puedo ayudar", "x")


def test_mock_low_confidence_when_no_keywords():
    c = MockClassifier().classify("Consulta general", "Quisiera saber algo sobre otro tema distinto.")
    assert c.category == "otro" and c.confidence < 0.75


def _gemini(handler):
    return GeminiClassifier("k", "gemini-test", httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)


def test_gemini_parses_response_and_sends_key_header():
    seen = {}

    def handler(req: httpx.Request):
        seen["key"] = req.headers["x-goog-api-key"]
        txt = '{"category":"red_conectividad","priority":"media","summary":"VPN","confidence":0.9,"reasoning":"x"}'
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": txt}]}}]})

    c = _gemini(handler).classify("VPN", "No conecta")
    assert seen["key"] == "k" and c.category == "red_conectividad" and c.confidence == 0.9


def test_gemini_falls_back_safely_on_http_error():
    c = _gemini(lambda req: httpx.Response(500)).classify("Algo", "texto")
    assert c.confidence == 0.0


def test_gemini_retries_on_503_then_succeeds():
    calls = {"n": 0}

    def handler(req: httpx.Request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503)
        txt = '{"category":"hardware","priority":"baja","summary":"x","confidence":0.9,"reasoning":"x"}'
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": txt}]}}]})

    c = GeminiClassifier("k", "m", httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    assert c.classify("a", "b").category == "hardware" and calls["n"] == 3


def test_gemini_stops_when_quota_exhausted():
    calls = {"n": 0}

    def handler(req: httpx.Request):
        calls["n"] += 1
        return httpx.Response(429, json={"error": {"message": "Quota exceeded. Please retry in 8h46m38.3s."}})

    c = _gemini(handler)
    assert c.classify("a", "b").confidence == 0.0
    assert c.quota_exhausted and calls["n"] == 1
    c.classify("c", "d")
    assert calls["n"] == 1
