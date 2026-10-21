"""Evalúa el clasificador contra un conjunto etiquetado por ti.

Uso (desde la carpeta backend, con el entorno virtual activo):
    python eval/run_eval.py
    python eval/run_eval.py --csv eval/eval_set.csv --out eval/report.md
Las cifras del reporte salen de TU ejecución: no las inventes ni las redondees al alza.
"""
import argparse
import csv
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.classifier import CATEGORIES, get_classifier  # noqa: E402
from app.config import settings  # noqa: E402
from app.policy import decide_status  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="eval/eval_set.csv")
    parser.add_argument("--out", default="eval/report.md")
    parser.add_argument("--pausa", type=float, default=0.0, help="segundos entre casos (p. ej. 4 para límites por minuto)")
    args = parser.parse_args()

    with open(args.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("El archivo de evaluación está vacío.")

    clf = get_classifier()
    results = []
    api_fail = invalid = 0
    for row in rows:
        pred = clf.classify(row["subject"], row["body"])
        err = getattr(clf, "last_error", None)
        api_fail += err == "api"
        invalid += err == "invalida"
        if getattr(clf, "quota_exhausted", False):
            sys.exit(f"\nCuota agotada tras {len(results)} de {len(rows)} casos. No se generó reporte. "
                     "Cambia de modelo, activa facturación o repite cuando se renueve la cuota.")
        if args.pausa:
            time.sleep(args.pausa)
        results.append((row, pred, decide_status(pred)))

    n = len(results)
    failed = api_fail
    cat_ok = sum(p.category == r["expected_category"] for r, p, _ in results)
    pri_ok = sum(p.priority == r["expected_priority"] for r, p, _ in results)
    auto = [(r, p) for r, p, s in results if s == "auto_approved"]
    auto_ok = sum(p.category == r["expected_category"] for r, p in auto)

    confusion: dict[str, Counter] = defaultdict(Counter)
    for r, p, _ in results:
        confusion[r["expected_category"]][p.category] += 1

    lines = [
        "# Reporte de evaluación",
        "",
        f"- Fecha: {datetime.now():%Y-%m-%d %H:%M}",
        f"- Clasificador: `{clf.version}`",
        f"- Umbral de confianza: {settings.confidence_threshold}",
        f"- Casos evaluados: {n}",
        f"- Fallas de API (repite la corrida si hay alguna): {failed}/{n}",
        f"- Salidas inválidas del modelo (cuentan como error; pasan a revisión humana): {invalid}/{n}",
        "",
        "## Resultados",
        "",
        f"- Exactitud de categoría: {cat_ok}/{n} ({cat_ok / n:.0%})",
        f"- Exactitud de prioridad: {pri_ok}/{n} ({pri_ok / n:.0%})",
        f"- Aprobadas automáticamente: {len(auto)}/{n} ({len(auto) / n:.0%})",
        f"- Exactitud de categoría entre las aprobadas automáticamente: "
        + (f"{auto_ok}/{len(auto)} ({auto_ok / len(auto):.0%})" if auto else "sin casos"),
        "",
        "## Matriz de confusión (filas = esperada, columnas = predicha)",
        "",
        "| esperada \\ predicha | " + " | ".join(CATEGORIES) + " |",
        "|---|" + "---|" * len(CATEGORIES),
    ]
    for exp in CATEGORIES:
        lines.append(f"| {exp} | " + " | ".join(str(confusion[exp][c]) for c in CATEGORIES) + " |")

    lines += ["", "## Errores de categoría", ""]
    errors = [(r, p) for r, p, _ in results if p.category != r["expected_category"]]
    if not errors:
        lines.append("Ninguno en este conjunto.")
    for r, p in errors:
        lines.append(f"- «{r['subject']}»: esperada `{r['expected_category']}`, predicha `{p.category}` ({p.confidence:.2f})")

    if failed:
        lines.insert(1, f"\n> ⚠️ {failed} casos fallaron por la API: este reporte NO es válido.")
    lines += ["", "## Errores de prioridad", ""]
    perr = [(r, p) for r, p, _ in results if p.priority != r["expected_priority"]]
    if not perr:
        lines.append("Ninguno en este conjunto.")
    for r, p in perr:
        lines.append(f"- «{r['subject']}»: esperada `{r['expected_priority']}`, predicha `{p.priority}` ({p.confidence:.2f})")
    report = "\n".join(lines)
    Path(args.out).write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
