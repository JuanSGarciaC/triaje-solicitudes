import { useCallback, useEffect, useState } from "react";
import type { AppConfig, Metrics, NewRequest, RequestItem, ReviewPayload, Status } from "./types";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : res.status === 422 ? "Revisa los datos del formulario." : `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  config: () => http<AppConfig>("/config"),
  metrics: () => http<Metrics>("/metrics"),
  listRequests: (status?: Status) => http<RequestItem[]>(`/requests${status ? `?status=${status}` : ""}`),
  createRequest: (data: NewRequest) => http<RequestItem>("/requests", { method: "POST", body: JSON.stringify(data) }),
  review: (id: number, data: ReviewPayload) =>
    http<RequestItem>(`/requests/${id}/review`, { method: "POST", body: JSON.stringify(data) }),
};

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    setLoading(true);
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}
