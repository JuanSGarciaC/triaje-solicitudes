import type { AppConfig, RequestItem, Status } from "./types";

export const CATEGORY_LABEL: Record<string, string> = {
  acceso_cuentas: "Acceso y cuentas",
  hardware: "Equipos",
  software: "Software",
  red_conectividad: "Red y conectividad",
  nuevo_servicio: "Nuevo servicio",
  otro: "Otro",
};

export const CATEGORY_SHORT: Record<string, string> = {
  acceso_cuentas: "Acceso",
  hardware: "Equipos",
  software: "Software",
  red_conectividad: "Red",
  nuevo_servicio: "Nuevo",
  otro: "Otro",
};

export const PRIORITY_LABEL: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta" };

export const STATUS_LABEL: Record<Status, string> = {
  auto_approved: "Aprobada sola",
  needs_review: "Por revisar",
  reviewed: "Revisada por una persona",
};

export const label = (map: Record<string, string>, key: string) => map[key] ?? key;

export const formatDate = (iso: string) =>
  new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export const pct = (v: number) => `${Math.round(v * 100)} %`;

export const clfLabel = (version: string) =>
  version.startsWith("mock") ? "Reglas por palabras clave" : version.replace(/^(\w+):/, (_, p: string) => `${p[0].toUpperCase()}${p.slice(1)} · `);

/** Por qué la política mandó la solicitud a su rama (misma regla que backend/app/policy.py). */
export function why(r: RequestItem, config: AppConfig): string[] {
  const reasons: string[] = [];
  if (r.pred_confidence < config.confidence_threshold)
    reasons.push(`Confianza ${pct(r.pred_confidence)}, por debajo del umbral de ${pct(config.confidence_threshold)}`);
  if (config.always_review_priorities.includes(r.pred_priority))
    reasons.push(`Prioridad ${r.pred_priority}: siempre la revisa una persona`);
  return reasons.length
    ? reasons
    : [`Confianza ${pct(r.pred_confidence)}, sobre el umbral de ${pct(config.confidence_threshold)}, y prioridad ${r.pred_priority}`];
}
