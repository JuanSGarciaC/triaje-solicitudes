# Reporte de evaluación

- Fecha: 2026-11-11 10:25
- Clasificador: `mock-keywords-v1`
- Umbral de confianza: 0.75
- Casos evaluados: 10
- Fallas de API (repite la corrida si hay alguna): 0/10
- Salidas inválidas del modelo (cuentan como error; pasan a revisión humana): 0/10

## Resultados

- Exactitud de categoría: 6/10 (60%)
- Exactitud de prioridad: 5/10 (50%)
- Aprobadas automáticamente: 8/10 (80%)
- Exactitud de categoría entre las aprobadas automáticamente: 6/8 (75%)

## Matriz de confusión (filas = esperada, columnas = predicha)

| esperada \ predicha | acceso_cuentas | hardware | software | red_conectividad | nuevo_servicio | otro |
|---|---|---|---|---|---|---|
| acceso_cuentas | 2 | 0 | 0 | 0 | 0 | 0 |
| hardware | 0 | 1 | 0 | 0 | 0 | 1 |
| software | 0 | 1 | 1 | 0 | 0 | 0 |
| red_conectividad | 0 | 0 | 0 | 2 | 0 | 0 |
| nuevo_servicio | 0 | 0 | 0 | 0 | 0 | 1 |
| otro | 0 | 0 | 0 | 1 | 0 | 0 |

## Errores de categoría

- «Instalación de Python»: esperada `software`, predicha `hardware` (0.80)
- «Proyector no prende»: esperada `hardware`, predicha `otro` (0.40)
- «Quiero una herramienta de encuestas»: esperada `nuevo_servicio`, predicha `otro` (0.40)
- «Consulta sobre el uso de celulares»: esperada `otro`, predicha `red_conectividad` (0.80)

## Errores de prioridad

- «Instalación de Python»: esperada `baja`, predicha `media` (0.80)
- «Se cayó el wifi del piso 3»: esperada `alta`, predicha `media` (0.80)
- «Quiero una herramienta de encuestas»: esperada `baja`, predicha `media` (0.40)
- «Acceso a carpeta de RRHH»: esperada `baja`, predicha `media` (0.80)
- «Laptop robada»: esperada `alta`, predicha `media` (0.80)