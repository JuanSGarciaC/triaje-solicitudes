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

export const ticketNo = (id: number) => String(id).padStart(4, "0");

export const pct = (v: number) => `${Math.round(v * 100)} %`;

export const clfLabel = (version: string) =>
  version.startsWith("mock") ? "Reglas por palabras clave" : version.replace(/^(\w+):/, (_, p: string) => `${p[0].toUpperCase()}${p.slice(1)} · `);

/** Motivos de la política: los que guardó el backend (policy_reason) o, en filas anteriores, los
 *  recalculados con el umbral actual (misma regla que backend/app/policy.py). */
export function reasonCodes(r: RequestItem, config: AppConfig): string[] {
  if (r.policy_reason) return r.policy_reason === "auto" ? [] : r.policy_reason.split(",");
  const codes: string[] = [];
  if (r.classifier_failed) codes.push("model_failed");
  if (config.always_review_priorities.includes(r.pred_priority)) codes.push("sensitive_priority");
  if (!r.classifier_failed && r.pred_confidence < config.confidence_threshold) codes.push("low_confidence");
  return codes;
}

/** Por qué la política mandó la solicitud a su rama, en frases. */
export function why(r: RequestItem, config: AppConfig): string[] {
  const t = pct(r.policy_threshold ?? config.confidence_threshold);
  const text: Record<string, string> = {
    model_failed: "El modelo no respondió o respondió algo inválido: pasa a una persona con confianza 0",
    sensitive_priority: `Prioridad ${r.pred_priority}: siempre la revisa una persona`,
    low_confidence: `Confianza ${pct(r.pred_confidence)}, por debajo del umbral de ${t}`,
  };
  const codes = reasonCodes(r, config);
  const out = codes.length
    ? codes.map((c) => text[c] ?? c)
    : [`Confianza ${pct(r.pred_confidence)}, sobre el umbral de ${t}, y prioridad ${r.pred_priority}`];
  return r.policy_reason ? out : [...out, "Motivo recalculado con el umbral actual: esta solicitud es anterior al registro de motivos"];
}
