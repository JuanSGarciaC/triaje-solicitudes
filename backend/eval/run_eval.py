"""Evalúa el clasificador contra un conjunto etiquetado por ti.

Uso (desde la carpeta backend, con el entorno virtual activo):
    python eval/run_eval.py
    python eval/run_eval.py --csv eval/eval_set.csv --out eval/report.md
Escribe el reporte en Markdown y, a su lado, el mismo contenido en JSON (lo sirve GET /api/eval).
Las cifras del reporte salen de TU ejecución: no las inventes ni las redondees al alza.
"""
import argparse
import csv
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.classifier import CATEGORIES, get_classifier  # noqa: E402
from app.config import settings  # noqa: E402
from app.policy import decide_status  # noqa: E402


def evaluate(rows: list[dict], clf, dataset: str, pausa: float = 0.0) -> dict:
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
        if pausa:
            time.sleep(pausa)
        results.append((row, pred, decide_status(pred)))

    auto = [(r, p) for r, p, s in results if s == "auto_approved"]
    confusion = {exp: {c: 0 for c in CATEGORIES} for exp in CATEGORIES}
    for r, p, _ in results:
        confusion[r["expected_category"]][p.category] += 1

    def errors(field: str, expected: str) -> list[dict]:
        return [
            {"subject": r["subject"], "expected": r[expected], "predicted": getattr(p, field), "confidence": p.confidence}
            for r, p, _ in results
            if getattr(p, field) != r[expected]
        ]

    return {
        "date": f"{datetime.now():%Y-%m-%d %H:%M}",
        "classifier": clf.version,
        "threshold": settings.confidence_threshold,
        "dataset": dataset,
        "n": len(results),
        "api_failures": api_fail,
        "invalid": invalid,
        "category_ok": sum(p.category == r["expected_category"] for r, p, _ in results),
        "priority_ok": sum(p.priority == r["expected_priority"] for r, p, _ in results),
        "auto": len(auto),
        "auto_ok": sum(p.category == r["expected_category"] for r, p in auto),
        "confusion": confusion,
        "category_errors": errors("category", "expected_category"),
        "priority_errors": errors("priority", "expected_priority"),
    }


def to_markdown(d: dict) -> str:
    n, auto = d["n"], d["auto"]
    lines = [
        "# Reporte de evaluación",
        "",
        f"- Fecha: {d['date']}",
        f"- Clasificador: `{d['classifier']}`",
        f"- Umbral de confianza: {d['threshold']}",
        f"- Casos evaluados: {n}",
        f"- Fallas de API (repite la corrida si hay alguna): {d['api_failures']}/{n}",
        f"- Salidas inválidas del modelo (cuentan como error; pasan a revisión humana): {d['invalid']}/{n}",
        "",
        "## Resultados",
        "",
        f"- Exactitud de categoría: {d['category_ok']}/{n} ({d['category_ok'] / n:.0%})",
        f"- Exactitud de prioridad: {d['priority_ok']}/{n} ({d['priority_ok'] / n:.0%})",
        f"- Aprobadas automáticamente: {auto}/{n} ({auto / n:.0%})",
        "- Exactitud de categoría entre las aprobadas automáticamente: "
        + (f"{d['auto_ok']}/{auto} ({d['auto_ok'] / auto:.0%})" if auto else "sin casos"),
        "",
        "## Matriz de confusión (filas = esperada, columnas = predicha)",
        "",
        "| esperada \\ predicha | " + " | ".join(CATEGORIES) + " |",
        "|---|" + "---|" * len(CATEGORIES),
    ]
    for exp in CATEGORIES:
        lines.append(f"| {exp} | " + " | ".join(str(d["confusion"][exp][c]) for c in CATEGORIES) + " |")

    if d["api_failures"]:
        lines.insert(1, f"\n> ⚠️ {d['api_failures']} casos fallaron por la API: este reporte NO es válido.")
    for title, key in (("Errores de categoría", "category_errors"), ("Errores de prioridad", "priority_errors")):
        lines += ["", f"## {title}", ""]
        if not d[key]:
            lines.append("Ninguno en este conjunto.")
        for e in d[key]:
            lines.append(
                f"- «{e['subject']}»: esperada `{e['expected']}`, predicha `{e['predicted']}` ({e['confidence']:.2f})"
            )
    return "\n".join(lines)


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

    d = evaluate(rows, get_classifier(), dataset=Path(args.csv).name, pausa=args.pausa)
    report = to_markdown(d)
    Path(args.out).write_text(report, encoding="utf-8")
    Path(args.out).with_suffix(".json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
