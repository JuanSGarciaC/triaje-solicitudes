import type { Status } from "./types";

export const CATEGORY_LABEL: Record<string, string> = {
  acceso_cuentas: "Acceso y cuentas",
  hardware: "Equipos",
  software: "Software",
  red_conectividad: "Red y conectividad",
  nuevo_servicio: "Nuevo servicio",
  otro: "Otro",
};

export const PRIORITY_LABEL: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta" };

export const STATUS_LABEL: Record<Status, string> = {
  auto_approved: "Aprobada automáticamente",
  needs_review: "Pendiente de revisión",
  reviewed: "Revisada por una persona",
};

export const label = (map: Record<string, string>, key: string) => map[key] ?? key;

export const formatDate = (iso: string) =>
  new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
