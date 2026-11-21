"""Regenera las capturas y las demos animadas del README contra una instancia en modo demo (datos de ejemplo).

    # API en modo demo con base vacía (siembra sola los casos, el trabajo y el historial):
    $env:DEMO_MODE="true"; $env:DATABASE_URL="sqlite:///./capturas.db"; uvicorn app.main:app --port 8000
    BASE_URL=http://127.0.0.1:8000 python scripts/capturas.py   # con playwright y pillow instalados

Usa el navegador instalado (Edge por defecto; BROWSER_CHANNEL=chrome para Chrome). Capturas a 1440×900 con
deviceScaleFactor 2, recortadas a lo relevante. Las demos se graban a ritmo real: cada fotograma guarda cuánto
tardó de verdad, y el GIF usa una paleta común sin tramado para que el kraft no haga bandas ni parpadee.
"""
import io
import os
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import Page, sync_playwright

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8000")
OUT = Path(__file__).resolve().parents[1] / "docs" / "img"
MAX_PNG = 400_000


def save_png(data: bytes, name: str) -> None:
    img = Image.open(io.BytesIO(data))
    img.save(OUT / name, optimize=True)
    size = (OUT / name).stat().st_size
    print(f"{name}: {img.width}×{img.height}, {size // 1024} KB" + ("  ← supera 400 KB" if size > MAX_PNG else ""))


def shot(page: Page, name: str, selector: str | None = None, clip: dict | None = None) -> None:
    page.wait_for_timeout(500)
    if selector:
        data = page.locator(selector).screenshot(animations="disabled")
    else:  # clip en coordenadas de la página
        data = page.screenshot(clip=clip, full_page=True, animations="disabled")
    save_png(data, name)


class Recorder:
    """Graba fotogramas del viewport a ritmo real mientras el guion avanza."""

    def __init__(self, page: Page, width: int):
        self.page, self.width, self.frames, self.times = page, width, [], []

    def grab(self) -> None:
        self.times.append(time.perf_counter())
        img = Image.open(io.BytesIO(self.page.screenshot())).convert("RGB")
        self.frames.append(img.resize((self.width, round(self.width * img.height / img.width)), Image.LANCZOS))

    def hold(self, seconds: float) -> None:
        end = time.perf_counter() + seconds
        while time.perf_counter() < end:
            self.grab()

    def save(self, name: str, fps: int = 13) -> None:
        # Remuestrea a fps fijos según el tiempo real de cada captura (sin acelerar ni frenar la escena).
        t0, step = self.times[0], 1 / fps
        picked, k = [], 0
        t = t0
        while t <= self.times[-1]:
            while k + 1 < len(self.times) and self.times[k + 1] <= t:
                k += 1
            picked.append(self.frames[k])
            t += step
        sample = Image.new("RGB", (picked[0].width, picked[0].height * 6))
        for i, f in enumerate(picked[:: max(1, len(picked) // 6)][:6]):
            sample.paste(f, (0, i * f.height))
        palette = sample.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in picked]
        durations = [round(1000 / fps)] * (len(gif) - 1) + [1800]
        gif[0].save(OUT / name, save_all=True, append_images=gif[1:], duration=durations, loop=0, optimize=True, disposal=1)
        size = (OUT / name).stat().st_size
        print(f"{name}: {len(gif)} fotogramas, {len(gif) / fps:.1f} s a {fps} fps, {gif[0].width}×{gif[0].height}, {size // 1024} KB")


def type_slowly(rec: Recorder, page: Page, selector: str, text: str) -> None:
    box = page.locator(selector)
    for i in range(0, len(text) + 1, 3):  # ~3 letras por fotograma: tecleo a ritmo de persona
        box.fill(text[:i])
        rec.grab()
    box.fill(text)


def demo_panel(browser) -> None:
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    try:
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        rec = Recorder(page, 960)
        rec.hold(1.0)
        type_slowly(rec, page, ".tryit textarea", "Urgente: la VPN no conecta y tengo reunión con un cliente en 10 minutos.")
        page.get_by_role("button", name="Clasificar y sellar").click()
        rec.hold(2.6)  # el tique se imprime y cae el sello
        page.get_by_role("link", name="Por revisar").click()
        page.wait_for_load_state("networkidle")
        rec.hold(2.2)  # la cola por urgencia, con el motivo y las vencidas
        page.locator(".queue .row-btn", has_text="URGENTE").click()
        rec.hold(1.4)
        page.get_by_label("Prioridad").select_option("media")
        rec.hold(0.8)
        page.get_by_role("button", name="Guardar corrección").click()
        rec.hold(2.4)  # cae el sello CORREGIDA y la solicitud sale de la cola
        rec.save("demo-panel.gif")
    finally:
        page.close()


def demo_landing(browser) -> None:
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    try:
        page.goto(BASE + "/como-funciona")
        page.wait_for_timeout(800)
        page.get_by_role("button", name="Pasa por una persona").click()
        top = page.evaluate("document.querySelector('.case[data-case=\"human\"]').getBoundingClientRect().top + scrollY - 70")
        page.evaluate(f"scrollTo(0, {top})")
        page.wait_for_timeout(900)
        page.mouse.move(400, 400)
        rec = Recorder(page, 960)
        rec.hold(1.2)
        for _ in range(34):  # scroll de rueda a ritmo de lectura: el tique fijo recibe los sellos
            page.mouse.wheel(0, 70)
            rec.hold(0.17)
        rec.hold(1.6)
        rec.save("demo-landing.gif")
    finally:
        page.close()


def stills(browser) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    try:
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Urgente", exact=True).click()
        page.locator(".print-ticket .stamp").wait_for()
        page.wait_for_timeout(1400)
        shot(page, "08-prueba-tu-solicitud.png", ".tryit")
        shot(page, "01-bandeja.png", ".flow")
        box = page.locator(".split.inbox section:last-child").bounding_box()  # la lista: solo los primeros tiques
        y = box["y"] + page.evaluate("scrollY")  # bounding_box es relativo al viewport
        shot(page, "09-tiques-con-motivo.png", clip={"x": box["x"], "y": y, "width": box["width"], "height": 620})

        slider = page.get_by_label("Umbral de confianza")
        slider.focus()
        for _ in range(3):  # 75 % -> 90 %
            slider.press("ArrowRight")
        shot(page, "02-umbral-simulado.png", ".flow")
        page.get_by_role("button", name="Volver al umbral real").click()

        page.locator(".rows .row-btn", has_text="URGENTE").first.click()
        page.wait_for_timeout(400)
        d, r = page.locator("dialog").bounding_box(), page.locator("dialog .reply").bounding_box()
        shot(page, "03-detalle.png", clip={"x": d["x"], "y": d["y"] + page.evaluate("scrollY"), "width": d["width"], "height": r["y"] + r["height"] + 20 - d["y"]})
        page.keyboard.press("Escape")

        page.goto(BASE + "/revision")
        page.wait_for_load_state("networkidle")
        shot(page, "04-revision.png", clip={"x": 80, "y": 146, "width": 1280, "height": 734})
        page.goto(BASE + "/tablero")
        page.wait_for_load_state("networkidle")
        shot(page, "07-tablero.png", clip={"x": 80, "y": 230, "width": 1280, "height": 670})
        page.goto(BASE + "/metricas")
        page.wait_for_load_state("networkidle")
        shot(page, "05-metricas.png", clip={"x": 80, "y": 238, "width": 1280, "height": 662})
        page.goto(BASE + "/evaluacion")
        page.wait_for_load_state("networkidle")
        shot(page, "06-evaluacion.png", "section.panel:has(.versus)")
        page.goto(BASE + "/como-funciona")
        page.wait_for_timeout(2600)
        shot(page, "10-landing.png", clip={"x": 0, "y": 0, "width": 1440, "height": 760})
    finally:
        page.close()
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    try:
        mobile.goto(BASE + "/revision")
        mobile.wait_for_load_state("networkidle")
        shot(mobile, "11-movil-revision.png", clip={"x": 0, "y": 0, "width": 390, "height": 844})
    finally:
        mobile.close()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("BROWSER_CHANNEL", "msedge"))
        try:
            which = os.environ.get("SOLO", "todo")
            if which in ("todo", "fotos"):
                stills(browser)
            if which in ("todo", "panel"):
                demo_panel(browser)
            if which in ("todo", "landing"):
                demo_landing(browser)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
