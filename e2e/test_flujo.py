"""E2E contra la aplicación real en Docker.

    docker compose up -d --build --wait
    uv run --with pytest --with playwright pytest e2e

En local usa un navegador instalado con BROWSER_CHANNEL=msedge; en el CI, el Chromium de Playwright.
"""
import os
import re

import pytest
from playwright.sync_api import Page, expect, sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8080")


@pytest.fixture(scope="module")
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("BROWSER_CHANNEL") or None)
        yield browser.new_page(viewport={"width": 1360, "height": 1000})
        browser.close()


def send(page: Page, subject: str, body: str) -> None:
    page.goto(BASE)
    page.get_by_label("Tu nombre").fill("Ana Pérez")
    page.get_by_label("Asunto").fill(subject)
    page.get_by_label("¿Qué está pasando?").fill(body)
    page.get_by_role("button", name="Enviar solicitud").click()


def count(page: Page, node: str) -> int:
    return int(page.get_by_role("button", name=re.compile(node)).locator(".node-count").inner_text())


def test_solicitud_clara_se_aprueba_sola(page: Page):
    page.goto(BASE)
    expect(page.get_by_label("Lienzo de decisión")).to_be_visible()
    page.wait_for_load_state("networkidle")
    antes = count(page, "Aprobada sola")
    send(page, "Contraseña bloqueada E2E", "Mi cuenta está bloqueada desde ayer y no puedo entrar al sistema.")
    expect(page.locator(".flow-caption")).to_contain_text("aprobada sola")
    expect(page.locator(".flow-caption")).to_contain_text("sobre el umbral")
    # el contador sube cuando el punto llega a su rama
    expect(page.get_by_role("button", name=re.compile("Aprobada sola")).locator(".node-count")).to_have_text(str(antes + 1))


def test_umbral_simulado_no_cambia_nada_real(page: Page):
    slider = page.get_by_label("Umbral de confianza")
    slider.focus()
    slider.press("End")  # 100 %: ninguna confianza del clasificador de reglas llega
    expect(page.locator(".flow-caption")).to_contain_text("más pasarían a revisión humana")
    assert count(page, "Aprobada sola") == 0
    page.reload()  # la simulación vive en el navegador: al recargar vuelve la política real
    expect(page.locator(".n-pol .node-count")).to_have_text("75 %")
    assert count(page, "Aprobada sola") >= 1


def test_urgente_va_a_revision_y_una_persona_la_corrige(page: Page):
    send(page, "Urgente: VPN caída E2E", "La VPN está caída y todos en el equipo comercial perdieron la conexión.")
    expect(page.locator(".flow-caption")).to_contain_text("revisión humana")
    expect(page.locator(".flow-caption")).to_contain_text("Prioridad alta")

    page.goto(f"{BASE}/revision")
    page.get_by_role("button", name=re.compile("Urgente: VPN caída E2E")).first.click()
    page.get_by_label("Prioridad").select_option("media")
    page.get_by_label("Tu nombre").fill("Luis Gómez")
    page.get_by_role("button", name="Guardar corrección").click()
    expect(page.get_by_role("button", name=re.compile("Urgente: VPN caída E2E"))).to_have_count(0)

    page.goto(BASE)
    page.get_by_role("button", name=re.compile("Decisión humana")).click()
    page.get_by_role("button", name=re.compile("Urgente: VPN caída E2E")).first.click()
    detalle = page.get_by_role("dialog")
    expect(detalle).to_contain_text("Media (corregida)")
    expect(detalle).to_contain_text("Luis Gómez")


def test_evaluacion_compara_reglas_y_gemini(page: Page):
    page.goto(f"{BASE}/evaluacion")
    tabla = page.locator(".versus")
    expect(tabla).to_contain_text("Reglas por palabras clave")
    expect(tabla).to_contain_text("Gemini")
    expect(tabla).to_contain_text("9/10")
    expect(page.locator(".matrix")).to_have_count(2)
