# Triaje de solicitudes con IA y aprobación humana

Aplicación que recibe solicitudes de soporte de TI, las **clasifica con un LLM** (categoría, prioridad, resumen y confianza) y decide si pueden aprobarse solas o deben pasar por una **persona**. Incluye cola de revisión, panel de métricas y un evaluador con casos etiquetados.

<p align="center">
  <img src="docs/img/01-bandeja.png" alt="Bandeja" width="600">
</p>

## Qué resuelve

Un LLM puede equivocarse con total seguridad. Este proyecto no lo deja decidir solo: una solicitud se aprueba automáticamente **solo si** la confianza supera el umbral (0.75 por defecto) **y** su prioridad no es alta. Todo lo demás va a la cola de revisión, donde una persona confirma o corrige. Si el modelo falla o responde algo inválido, el caso también va a revisión (confianza 0).

## Capturas

| Por revisar | Métricas |
|---|---|
| ![Por revisar](docs/img/02-revision.png) | ![Métricas](docs/img/03-metricas.png) |

## Arquitectura

```
React + Vite  ──►  FastAPI  ──►  Clasificador (mock | gemini | anthropic)
 (Bandeja,          │
  Por revisar,      ├─ policy.py: decide auto_approved / needs_review
  Métricas)         └─ SQLite (solicitudes y decisiones humanas)
```

- **Proveedores:** `mock` (reglas simples, sin costo), `gemini` (Google AI Studio, vía REST con `httpx`) y `anthropic`. Se elige con `LLM_PROVIDER`.
- **Robustez:** reintentos con espera ante 429/500/503, parada limpia si se agota la cuota, validación estricta de la salida del modelo y degradación segura a revisión humana.
- **Seguridad:** el texto del usuario se trata como dato (instrucción anti-inyección en el prompt) y las claves viven en `.env`, que no se versiona.

## Resultados

Modelo `gemini-3.5-flash-lite`, umbral 0.75, corrida del 2026-10-21. Sin fallas de API ni salidas inválidas en ambas corridas.

| | Desarrollo (32 casos) | Prueba final (10 casos) |
|---|---|---|
| Exactitud de categoría | 94% (30/32) | 90% (9/10) |
| Exactitud de prioridad | 72% (23/32) | 60% (6/10) |
| Aprobadas automáticamente | 22/32 | 5/10 |
| Categoría correcta entre aprobadas | 22/22 | 4/5 |

**Limitaciones**
- Las muestras son pequeñas: un caso equivale a 3 puntos (desarrollo) o 10 (final).
- El prompt se ajustó con el set de desarrollo, por eso su cifra es optimista. La prueba final se ejecutó una sola vez, sin ajustes posteriores.
- Los errores de prioridad son sobre todo por exceso (el modelo sube la prioridad), lo que deriva el caso a revisión humana.
- La confianza que reporta el modelo está poco calibrada: responde 0.90 a 0.95 también cuando se equivoca. Un caso ambiguo de la prueba final se aprobó automáticamente por error; por eso se mantiene una persona en el circuito.
- Las etiquetas esperadas son criterio del autor y algunas son discutibles.

## Ejecutar (Windows, PowerShell)

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env
pytest
uvicorn app.main:app --reload --port 8000
```

Frontend (otra terminal, requiere Node.js):

```powershell
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173. La documentación interactiva de la API está en http://localhost:8000/docs. Para cargar datos de ejemplo, con el backend activo: `python scripts/seed_demo.py`.

### Usar Gemini (Google AI Studio)

Crea una clave en https://aistudio.google.com/apikey y edita `backend/.env`:

```
LLM_PROVIDER=gemini
GOOGLE_API_KEY=tu_clave
GEMINI_MODEL=gemini-3.5-flash-lite
```

Los nombres de modelo y las cuotas del plan gratuito cambian con frecuencia; verifica los vigentes en la documentación de Google. `.env` está en `.gitignore`: nunca subas la clave. Sin clave, `LLM_PROVIDER=mock` funciona sin costo.

## Evaluación

`backend/eval/` contiene 32 casos de desarrollo (`eval_set.csv`) y 10 de prueba final (`eval_final.csv`, que se corre una sola vez):

```powershell
python eval/run_eval.py --pausa 4
python eval/run_eval.py --csv eval/eval_final.csv --out eval/report_final.md --pausa 4
```

El reporte incluye exactitud de categoría y prioridad, matriz de confusión y lista de errores, y cuenta aparte las fallas de API y las salidas inválidas del modelo.

## Pruebas y CI

`pytest` (15 pruebas, incluida la integración con Gemini simulada) y `npm run build`. GitHub Actions ejecuta ambos en cada push.

## Estructura

```
backend/   app/ (main, classifier, policy, models)  eval/  scripts/  tests/
frontend/  src/ (pages: Inbox, Review, Metrics)
docs/      img/ (capturas)
```

## Cómo se construyó

Con asistentes de IA (Claude); el autor revisó el código, lo ejecutó, definió los casos de evaluación y midió los resultados.
