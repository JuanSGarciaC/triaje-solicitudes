import { FormEvent, useEffect, useState } from "react";
import { api, useLoad } from "../api";
import { ConfidenceMeter, ErrorNote, PriorityBadge } from "../components";
import { CATEGORY_LABEL, PRIORITY_LABEL, formatDate, label } from "../labels";
import type { AppConfig } from "../types";

export default function Review({ config }: { config: AppConfig }) {
  const queue = useLoad(() => api.listRequests("needs_review"), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = queue.data ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (selected) {
      setCategory(selected.pred_category);
      setPriority(selected.pred_priority);
      setNote("");
      setError(null);
    }
  }, [selected?.id]);

  const changed = selected && (category !== selected.pred_category || priority !== selected.pred_priority);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.review(selected.id, { category, priority, reviewer, note: note || undefined });
      setSelectedId(null);
      queue.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <h2>Por revisar</h2>
        <p className="muted">Solicitudes con baja confianza o prioridad alta. Confirma la clasificación o corrígela.</p>
      </header>
      <ErrorNote message={queue.error} />
      {!queue.loading && items.length === 0 && <p className="panel muted">No hay solicitudes pendientes. Vuelve más tarde.</p>}

      {selected && (
        <div className="split review">
          <ul className="rows queue" aria-label="Cola de revisión">
            {items.map((r) => (
              <li key={r.id}>
                <button className={`row-btn ${r.id === selected.id ? "active" : ""}`} onClick={() => setSelectedId(r.id)}>
                  <strong>{r.subject}</strong>
                  <span className="muted">{formatDate(r.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>

          <section className="panel" aria-labelledby="detalle">
            <h3 id="detalle">{selected.subject}</h3>
            <p className="muted">
              {selected.requester} · {formatDate(selected.created_at)}
            </p>
            <p className="body-text">{selected.body}</p>

            <div className="result">
              <h4>Lo que predijo el clasificador</h4>
              <p>
                <strong>{label(CATEGORY_LABEL, selected.pred_category)}</strong> <PriorityBadge value={selected.pred_priority} />
              </p>
              <ConfidenceMeter value={selected.pred_confidence} threshold={config.confidence_threshold} />
              <p className="muted">{selected.pred_reasoning}</p>
            </div>

            <form onSubmit={submit} className="form">
              <div className="two">
                <label>
                  Categoría
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {config.categories.map((c) => (
                      <option key={c} value={c}>
                        {label(CATEGORY_LABEL, c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridad
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {config.priorities.map((p) => (
                      <option key={p} value={p}>
                        {label(PRIORITY_LABEL, p)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Tu nombre
                <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} required minLength={2} />
              </label>
              <label>
                Nota (opcional)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </label>
              <ErrorNote message={error} />
              <button className="primary" disabled={busy}>
                {changed ? "Guardar corrección" : "Confirmar clasificación"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
