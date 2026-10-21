"""Carga solicitudes de ejemplo en la API en ejecución (http://localhost:8000)."""
import csv
from pathlib import Path

import httpx

CSV_PATH = Path(__file__).resolve().parents[1] / "eval" / "eval_set.csv"

with open(CSV_PATH, newline="", encoding="utf-8") as f, httpx.Client(base_url="http://localhost:8000", timeout=60) as client:
    for row in csv.DictReader(f):
        r = client.post("/api/requests", json={"subject": row["subject"], "body": row["body"], "requester": "Demo Usuario"})
        r.raise_for_status()
        print(r.json()["id"], r.json()["status"], r.json()["pred_category"])
