import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, useLoad } from "../api";
import { ConfidenceMeter, ErrorNote, PriorityBadge, Timeline } from "../components";
import { CATEGORY_LABEL, PRIORITY_LABEL, clfLabel, formatDate, label, why } from "../labels";
import type { AppConfig } from "../types";

export default function Review({ config, onChange }: { config: AppConfig; onChange: () => void }) {
  const queue = useLoad(() => api.listRequests("needs_review"), []);
  const [params, setParams] = useSearchParams();
  const onlyFailed = params.has("respaldo");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const all = queue.data ?? [];
  const failedCount = all.filter((r) => r.classifier_failed).length;
  const items = onlyFailed ? all.filter((r) => r.classifier_failed) : all;
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
      await api.review(selected.id, { category, priority, reviewer: config.demo ? "Visitante" : reviewer, note: note || undefined });
      setSelectedId(null);
      queue.reload();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reclassify() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.reclassify(selected.id);
      if (r.status !== "needs_review") setSelectedId(null); // la política la aprobó: sale de la cola
      queue.reload();
      onChange();
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
      <div className="chips queue-filter" role="group" aria-label="Filtrar la cola">
        <button className="chip" aria-pressed={!onlyFailed} onClick={() => setParams({})}>
          Todas ({all.length})
        </button>
        <button className="chip" aria-pressed={onlyFailed} onClick={() => setParams({ respaldo: "1" })}>
          Cayeron a respaldo ({failedCount})
        </button>
      </div>
      <ErrorNote message={queue.error} />
      {!queue.loading && items.length === 0 && (
        <p className="panel muted">
          {onlyFailed ? "Ninguna solicitud pendiente cayó a respaldo." : "No hay solicitudes pendientes. Vuelve más tarde."}
        </p>
      )}

      {selected && (
        <div className="split review">
          <ul className="rows queue" aria-label="Cola de revisión">
            {items.map((r) => (
              <li key={r.id}>
                <button className={`row-btn ${r.id === selected.id ? "active" : ""}`} onClick={() => setSelectedId(r.id)}>
                  <strong>{r.subject}</strong>
                  <span className="muted">
                    {formatDate(r.created_at)}
                    {r.classifier_failed && " · el modelo no respondió"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="panel glow" aria-labelledby="detalle">
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
              <p className="muted">
                {clfLabel(selected.classifier_version)}: {selected.pred_reasoning}
              </p>
              <h4>Por qué llegó a revisión</h4>
              <ul className="reasons">
                {why(selected, config).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {selected.classifier_failed && (
                <p>
                  <button className="secondary" onClick={reclassify} disabled={busy}>
                    Reclasificar
                  </button>{" "}
                  <span className="muted">Pide otra clasificación al modelo; la política decide de nuevo.</span>
                </p>
              )}
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
              {config.demo ? (
                <p className="muted">Demo pública: la revisión se guarda como «Visitante», sin nota.</p>
              ) : (
                <>
                  <label>
                    Tu nombre
                    <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} required minLength={2} />
                  </label>
                  <label>
                    Nota (opcional)
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                  </label>
                </>
              )}
              <ErrorNote message={error} />
              <button className="primary" disabled={busy}>
                {changed ? "Guardar corrección" : "Confirmar clasificación"}
              </button>
            </form>

            <h4>Historial</h4>
            <Timeline id={selected.id} />
          </section>
        </div>
      )}
    </>
  );
}
