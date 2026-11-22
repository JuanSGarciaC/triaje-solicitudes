export type Status = "auto_approved" | "needs_review" | "reviewed";

export interface RequestItem {
  id: number;
  subject: string;
  body: string;
  requester: string;
  created_at: string;
  status: Status;
  pred_category: string;
  pred_priority: string;
  pred_summary: string;
  pred_confidence: number;
  pred_reasoning: string;
  classifier_version: string;
  classifier_failed: boolean;
  policy_reason: string | null; // "auto" o motivos separados por coma; null en filas anteriores
  policy_threshold: number | null;
  final_category: string | null;
  final_priority: string | null;
  reviewer: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  due_at: string;
  overdue: boolean;
  work_state: "abierta" | "en_curso" | "resuelta";
  team: string;
  assignee: string | null;
  resolved_at: string | null;
}

export interface AppConfig {
  brand_name: string;
  brand_tagline: string;
  confidence_threshold: number;
  categories: string[];
  priorities: string[];
  always_review_priorities: string[];
  demo: boolean;
  classifier: { version: string; healthy: boolean; failed_pending: number; pending: number; overdue: number };
  sla_hours: Record<string, number>;
  teams: string[];
  examples: { subject: string; body: string }[];
}

export interface RequestEvent {
  at: string;
  kind: "received" | "classified" | "decided" | "reviewed" | "work";
  actor: string;
  detail: Record<string, string | number | boolean | null>;
}

export interface Preview {
  category: string;
  priority: string;
  confidence: number;
  reasons: string[];
  status: Status;
  threshold: number;
  classifier: string;
  rules_fallback: boolean;
}

export interface ReviewStat {
  label: string;
  reviewed: number;
  corrected: number;
}

export interface Desk {
  teams: { team: string; open: number; in_progress: number; overdue: number }[];
  overdue: number;
  avg_hours_to_review: number | null;
  avg_hours_to_resolve: number | null;
  resolved_on_time: number | null;
  weeks: ReviewStat[];
  categories: ReviewStat[];
}

export interface Notice {
  id: number;
  request_id: number;
  at: string;
  kind: string;
  message: string;
  payload: Record<string, unknown>;
  signature: string | null;
  delivery: "simulado" | "enviado" | "fallido";
}

export interface Metrics {
  total: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  avg_confidence: number;
  auto_approved_share: number;
  reviewed_count: number;
  human_correction_rate: number | null;
}

export interface NewRequest {
  subject: string;
  body: string;
  requester: string;
}

export interface ReviewPayload {
  category: string;
  priority: string;
  reviewer: string;
  note?: string;
}

export interface EvalError {
  subject: string;
  expected: string;
  predicted: string;
  confidence: number;
}

export interface EvalReport {
  date: string;
  classifier: string;
  threshold: number;
  dataset: string;
  n: number;
  api_failures: number;
  invalid: number;
  category_ok: number;
  priority_ok: number;
  auto: number;
  auto_ok: number;
  confusion: Record<string, Record<string, number>>;
  category_errors: EvalError[];
  priority_errors: EvalError[];
}
