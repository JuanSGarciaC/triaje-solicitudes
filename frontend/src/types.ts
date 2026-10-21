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
  final_category: string | null;
  final_priority: string | null;
  reviewer: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

export interface AppConfig {
  confidence_threshold: number;
  categories: string[];
  priorities: string[];
  always_review_priorities: string[];
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
