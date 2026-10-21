import { FormEvent, useState } from "react";
import { api, useLoad } from "../api";
import { ConfidenceMeter, ErrorNote, PriorityBadge, StatusBadge } from "../components";
import { CATEGORY_LABEL, formatDate, label } from "../labels";
import type { AppConfig, RequestItem } from "../types";

export default function Inbox({ config }: { config: AppConfig }) {
  const list = useLoad(() => api.listRequests(), []);
  const [form, setForm] = useState({ subject: "", requester: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<RequestItem | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createRequest(form);
      setLast(created);
      setForm({ subject: "", requester: form.requester, body: "" });
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <h2>Bandeja</h2>
        <p className="muted">Envía una solicitud y mira cómo se clasifica antes de que llegue a una persona.</p>
      </header>

      <div className="split">
        <section className="panel" aria-labelledby="nueva">
          <h3 id="nueva">Nueva solicitud</h3>
          <form onSubmit={submit} className="form">
            <label>
              Tu nombre
              <input value={form.requester} onChange={(e) => setForm({ ...form, requester: e.target.value })} required minLength={2} />
            </label>
            <label>
              Asunto
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required minLength={3} maxLength={200} />
            </label>
            <label>
              ¿Qué está pasando?
              <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required minLength={10} maxLength={4000} />
            </label>
            <ErrorNote message={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Clasificando…" : "Enviar solicitud"}
            </button>
          </form>

          {last && (
            <div className="result" aria-live="polite">
              <h4>Resultado de la clasificación</h4>
              <p>
                <strong>{label(CATEGORY_LABEL, last.pred_category)}</strong> <PriorityBadge value={last.pred_priority} />
              </p>
              <p className="muted">{last.pred_summary}</p>
              <ConfidenceMeter value={last.pred_confidence} threshold={config.confidence_threshold} />
              <p>
                <StatusBadge value={last.status} />
              </p>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="recientes">
          <h3 id="recientes">Solicitudes recientes</h3>
          <ErrorNote message={list.error} />
          {list.data && list.data.length === 0 && (
            <p className="muted">Aún no hay solicitudes. Envía la primera desde el formulario.</p>
          )}
          <ul className="rows">
            {list.data?.map((r) => (
              <li key={r.id}>
                <div className="row-main">
                  <strong>{r.subject}</strong>
                  <span className="muted">
                    {r.requester} · {formatDate(r.created_at)}
                  </span>
                </div>
                <div className="row-meta">
                  <span>{label(CATEGORY_LABEL, r.final_category ?? r.pred_category)}</span>
                  <PriorityBadge value={r.final_priority ?? r.pred_priority} />
                  <StatusBadge value={r.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
