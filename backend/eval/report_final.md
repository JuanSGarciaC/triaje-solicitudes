# Reporte de evaluación

- Fecha: 2026-10-21 17:32
- Clasificador: `gemini:gemini-3.5-flash-lite`
- Umbral de confianza: 0.75
- Casos evaluados: 10
- Fallas de API (repite la corrida si hay alguna): 0/10
- Salidas inválidas del modelo (cuentan como error; pasan a revisión humana): 0/10

## Resultados

- Exactitud de categoría: 9/10 (90%)
- Exactitud de prioridad: 6/10 (60%)
- Aprobadas automáticamente: 5/10 (50%)
- Exactitud de categoría entre las aprobadas automáticamente: 4/5 (80%)

## Matriz de confusión (filas = esperada, columnas = predicha)

| esperada \ predicha | acceso_cuentas | hardware | software | red_conectividad | nuevo_servicio | otro |
|---|---|---|---|---|---|---|
| acceso_cuentas | 2 | 0 | 0 | 0 | 0 | 0 |
| hardware | 0 | 2 | 0 | 0 | 0 | 0 |
| software | 0 | 0 | 2 | 0 | 0 | 0 |
| red_conectividad | 0 | 0 | 0 | 2 | 0 | 0 |
| nuevo_servicio | 0 | 0 | 0 | 0 | 1 | 0 |
| otro | 0 | 0 | 0 | 1 | 0 | 0 |

## Errores de categoría

- «Consulta sobre el uso de celulares»: esperada `otro`, predicha `red_conectividad` (0.90)

## Errores de prioridad

- «No entra mi usuario al sistema»: esperada `media`, predicha `alta` (0.95)
- «Excel se congela»: esperada `media`, predicha `alta` (0.90)
- «Cable de red dañado»: esperada `media`, predicha `baja` (0.95)
- «Proyector no prende»: esperada `media`, predicha `alta` (0.95)