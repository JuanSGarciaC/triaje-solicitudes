"""Regenera las capturas y el GIF del README contra una instancia en ejecución.

    docker compose up -d --build
    uv run --with playwright --with pillow --with httpx scripts/capturas.py

Usa el navegador instalado (Edge por defecto; BROWSER_CHANNEL=chrome para Chrome). Siembra los casos de
eval_set.csv, así que conviene una base vacía.
"""
import csv
import io
import os
from pathlib import Path

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8080")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "img"


def seed() -> None:
    with open(ROOT / "backend" / "eval" / "eval_set.csv", newline="", encoding="utf-8") as f, httpx.Client(base_url=BASE, timeout=60) as c:
        for row in csv.DictReader(f):
            c.post("/api/requests", json={"subject": row["subject"], "body": row["body"], "requester": "Laura Ríos"}).raise_for_status()
        queue = c.get("/api/requests", params={"status": "needs_review"}).json()
        for i, r in enumerate(queue[: len(queue) // 2]):  # la mitad de la cola revisada; una de cada dos, corregida
            review = {"category": "software" if i % 2 else r["pred_category"], "priority": "media", "reviewer": "Camila Torres",
                      "note": "Era una duda sobre licencias." if i % 2 else None}
            c.post(f"/api/requests/{r['id']}/review", json=review).raise_for_status()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    seed()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("BROWSER_CHANNEL", "msedge"))
        page = browser.new_page(viewport={"width": 1360, "height": 900}, device_scale_factor=1)
        page.goto(BASE)
        flow = page.get_by_label("Lienzo de decisión")
        flow.wait_for()
        page.wait_for_timeout(800)
        page.screenshot(path=OUT / "01-bandeja.png")

        # GIF: una solicitud urgente recorre el lienzo hasta la revisión humana. El reloj de la página se
        # detiene y avanza 60 ms por fotograma, así el recorrido sale completo aunque capturar sea lento.
        page.clock.install()
        page.get_by_label("Tu nombre").fill("Andrés Mejía")
        page.get_by_label("Asunto").fill("Urgente: VPN caída")
        page.get_by_label("¿Qué está pasando?").fill("La VPN está caída y todos en el equipo comercial perdieron la conexión.")
        page.clock.pause_at(page.evaluate("Date.now()") / 1000 + 1)
        with page.expect_response("**/api/requests"):
            page.get_by_role("button", name="Enviar solicitud").click()
        page.evaluate("scrollTo(0, 0)")  # el clic baja la página; el lienzo debe verse entero
        clip = flow.bounding_box()
        frames = []
        for _ in range(56):
            shot = Image.open(io.BytesIO(page.screenshot(clip=clip))).convert("RGB")
            frames.append(shot.resize((800, round(800 * shot.height / shot.width)), Image.LANCZOS))
            page.clock.run_for(60)
        page.clock.resume()
        # Paleta común tomada del inicio, la mitad y el final: sin parpadeo y con los colores de cada rama.
        w, h = frames[0].size
        sample = Image.new("RGB", (w, h * 3))
        for i, f in enumerate((frames[0], frames[28], frames[-1])):
            sample.paste(f, (0, i * h))
        palette = sample.quantize(colors=200)
        gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        durations = [60] * (len(gif) - 1) + [1800]  # pausa en el último fotograma antes de repetir
        gif[0].save(OUT / "demo-lienzo.gif", save_all=True, append_images=gif[1:], duration=durations, loop=0, optimize=True)

        slider = page.get_by_label("Umbral de confianza")
        slider.focus()
        for _ in range(3):  # 75 % -> 90 %
            slider.press("ArrowRight")
        page.evaluate("scrollTo(0, 0)")
        page.wait_for_timeout(700)
        page.screenshot(path=OUT / "02-umbral-simulado.png", clip=clip)
        page.get_by_role("button", name="Volver al umbral real").click()

        page.get_by_role("button", name="Decisión humana").click()
        page.locator(".row-btn").first.click()
        page.wait_for_timeout(500)
        page.screenshot(path=OUT / "03-detalle.png")
        page.keyboard.press("Escape")

        for path, name in (("/revision", "04-revision"), ("/metricas", "05-metricas"), ("/evaluacion", "06-evaluacion")):
            page.goto(BASE + path)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(700)
            page.screenshot(path=OUT / f"{name}.png", full_page=True)
        browser.close()


if __name__ == "__main__":
    main()
