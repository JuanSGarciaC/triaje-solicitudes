# Rediseño: lienzo de decisión y evaluación a la vista

Fecha: 2026-11-11. Rama: `rediseno-lienzo`.

## Problema

La API guarda más de lo que la interfaz enseña: la decisión humana (revisor, nota, corrección), el
razonamiento y la versión del clasificador, el reparto por estado y la evaluación (solo en un `.md`).
La interfaz son tres pantallas planas que no explican la idea del proyecto: el modelo no decide solo.

## Alcance

1. **Lienzo de decisión** en la Bandeja: Solicitud → Clasificador → Política → Aprobada sola |
   Revisión humana → Decisión humana. El grosor y el flujo de cada arista salen de los conteos reales
   (la lista de solicitudes ya cargada); una arista sin datos no se mueve. Al enviar una solicitud, un punto
   recorre el camino que tomó y el nodo de política dice por qué.
2. **Umbral movible**: control en el nodo de política que recalcula en el navegador cuántas de las
   solicitudes cargadas cambiarían de rama. No guarda nada ni toca el backend.
3. **Detalle de solicitud**: predicción frente a decisión humana, razonamiento, versión, revisor, nota.
4. **Evaluación**: `GET /api/eval` sirve los reportes JSON guardados en `backend/eval/`. Pantalla con
   matriz de confusión y errores, reglas frente a Gemini sobre los mismos 10 casos.
   `run_eval.py` escribe el JSON junto al `.md`.
5. **Tema oscuro** único, sin dependencias nuevas (SVG y CSS a mano), con `prefers-reduced-motion`.
6. **Infraestructura**: un contenedor (la API sirve el panel compilado), `docker-compose.yml`, E2E con
   Playwright contra ese contenedor, `ruff` en el CI, script de capturas.

## Fuera de alcance

- Entrada desde `integrador-webhooks` (`Idempotency-Key`): se define en la fase del integrador.
- Demo pública: revisar no exige autenticación. (Hecha después en la rama `demo-publica`: modo demo sin texto libre, ver README.)
- SSE o websockets: la clasificación responde en la misma petición.
- Volver a ejecutar Gemini: `report_final.json` se transcribe de `report_final.md` (2026-10-21).

## Límites conocidos

- El recorrido animado es una repetición en el navegador del resultado ya devuelto.
- El umbral movible usa las solicitudes cargadas (máximo 200, el límite de la API).
- El reporte de Gemini no trae la confianza de cada caso acertado, así que no hay curva
  precisión/cobertura; solo la matriz y los errores.

## Pruebas

- Unitarias: `evaluate()` con el clasificador de reglas; `GET /api/eval`; servir el panel y sus rutas.
- E2E: enviar solicitud → aparece en la rama correcta; revisar → pasa a decisión humana; evaluación carga.
