import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, useLoad } from "../api";
import { ConfidenceMeter, ErrorNote, PriorityBadge, Timeline } from "../components";
import { CATEGORY_LABEL, PRIORITY_LABEL, clfLabel, dueText, formatDate, label, ticketNo, why } from "../labels";
import type { AppConfig } from "../types";

export default function Review({ config, onChange }: { config: AppConfig; onChange: () => void }) {
  const queue = useLoad(() => api.listRequests("needs_review"), []);
  const [params, setParams] = useSearchParams();
  const onlyFailed = params.has("respaldo");
  const onlyLate = params.has("vencidas");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState<string | null>(null);

  // La cola se atiende por urgencia: primero lo vencido, luego lo que vence antes.
  const all = [...(queue.data ?? [])].sort((a, b) => a.due_at.localeCompare(b.due_at));
  const failedCount = all.filter((r) => r.classifier_failed).length;
  const lateCount = all.filter((r) => r.overdue).length;
  const items = all.filter((r) => (!onlyFailed || r.classifier_failed) && (!onlyLate || r.overdue));
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
      // El sello cae sobre el tique antes de que salga de la cola (sin animación con reduced-motion).
      setStamp(changed ? "Corregida" : "Revisada");
      await new Promise((ok) => setTimeout(ok, matchMedia("(prefers-reduced-motion: reduce)").matches ? 400 : 900));
      setStamp(null);
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
        <button className="chip" aria-pressed={!onlyFailed && !onlyLate} onClick={() => setParams({})}>
          Todas ({all.length})
        </button>
        <button className="chip" aria-pressed={onlyFailed} onClick={() => setParams({ respaldo: "1" })}>
          Cayeron a respaldo ({failedCount})
        </button>
        <button className="chip" aria-pressed={onlyLate} onClick={() => setParams({ vencidas: "1" })}>
          Vencidas ({lateCount})
        </button>
        <span className="muted small">Ordenada por vencimiento · plazos: {Object.entries(config.sla_hours).map(([p, h]) => `${p} ${h} h`).join(", ")}</span>
      </div>
      <ErrorNote message={queue.error} />
      {!queue.loading && items.length === 0 && (
        <p className="panel muted">
          {onlyFailed || onlyLate ? "Ninguna solicitud pendiente con este filtro." : "No hay solicitudes pendientes. Vuelve más tarde."}
        </p>
      )}

      {selected && (
        <div className="split review">
          <ul className="rows queue" aria-label="Cola de revisión">
            {items.map((r) => (
              <li key={r.id}>
                <button
                  className={`row-btn ticket prio-band-${r.pred_priority} ${r.id === selected.id ? "active" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <span className="stub">N.º {ticketNo(r.id)}</span>
                  <strong>{r.subject}</strong>
                  <span className={`due ${r.overdue ? "late" : ""}`}>{dueText(r)}</span>
                  <span className="muted">
                    {formatDate(r.created_at)}
                    {r.classifier_failed && " · el modelo no respondió"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="panel ticket-sheet" aria-labelledby="detalle">
            {/* Cabecera con zona propia para los sellos: no se superponen al texto de la solicitud. */}
            <div className="sheet-head">
              <div>
                <p className="sheet-no">
                  Solicitud N.º {ticketNo(selected.id)} · <span className={`due ${selected.overdue ? "late" : ""}`}>{dueText(selected)}</span>
                </p>
                <h3 id="detalle">{selected.subject}</h3>
                <p className="muted">
                  {selected.requester} · {formatDate(selected.created_at)}
                </p>
              </div>
              <div className="sheet-stamps">
                {selected.overdue && !stamp && <span className="stamp stamp-late">Vencida</span>}
                {stamp && (
                  <span className="stamp stamp-drop" role="status">
                    {stamp}
                  </span>
                )}
              </div>
            </div>
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
