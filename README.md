# Triaje de solicitudes con IA y aprobación humana

Proyecto personal de portafolio. Clasifica solicitudes de soporte de TI (categoría, prioridad, resumen, confianza) con un LLM; si la confianza es baja o la prioridad es alta, pasa a una persona que confirma o corrige. Incluye panel de métricas y evaluador.

**Stack:** FastAPI · SQLite · React + Vite · proveedores: `mock`, `gemini` (Google AI Studio), `anthropic`.

## Usar la API key de Google AI Studio
1. Crea la clave en https://aistudio.google.com/apikey
2. `copy ..\.env.example .env` (dentro de `backend/`) y edita:
```
LLM_PROVIDER=gemini
GOOGLE_API_KEY=tu_clave
GEMINI_MODEL=gemini-2.5-flash
```
3. Reinicia uvicorn. Verifica el nombre vigente del modelo en la documentación de Google.
`.env` está en `.gitignore`: nunca subas la clave.

## Ejecutar (Windows, 2 terminales)
```powershell
# Terminal 1
cd backend; python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt; copy ..\.env.example .env
pytest; uvicorn app.main:app --reload --port 8000
# Terminal 2
cd frontend; npm install; npm run dev     # http://localhost:5173
# Datos de ejemplo (backend activo): python scripts/seed_demo.py
```

## Evaluación
- `eval/eval_set.csv`: 32 casos de **desarrollo** (úsalos para ajustar el prompt y el umbral).
- `eval/eval_final.csv`: 10 casos de **prueba final**. No los uses al ajustar; córrelos una sola vez al terminar.
```powershell
python eval/run_eval.py                                              # desarrollo
python eval/run_eval.py --csv eval/eval_final.csv --out eval/report_final.md
```
Con `mock` (referencia, no evidencia): 84% de categoría en desarrollo y 60% en final. Resultados con Gemini: _pendiente_.

## Estado
Probado: `pytest` (12 pruebas, incl. Gemini simulado) y `npm run build`. **No probado:** llamadas reales a Gemini.

## Cómo se construyó
Con asistentes de IA (Claude, Cursor); el autor revisó, probó y midió.
