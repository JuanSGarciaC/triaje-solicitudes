import { FormEvent, useState } from "react";
import { api, useLoad } from "../api";
import { ConfidenceMeter, Detail, ErrorNote, PriorityBadge, StampChain, StatusBadge } from "../components";
import Flow from "../Flow";
import TryIt from "../TryIt";
import { CATEGORY_LABEL, STATUS_LABEL, dueText, formatDate, label, reasonCodes, reasonShort, ticketNo } from "../labels";
import type { AppConfig, RequestItem, Status } from "../types";

const FILTERS: (Status | null)[] = [null, "auto_approved", "needs_review", "reviewed"];
const MOTIVES: [string, string][] = [
  ["", "Cualquier motivo"],
  ["auto", "Se aprobó sola"],
  ["sensitive_priority", "Prioridad alta"],
  ["low_confidence", "Baja confianza"],
  ["model_failed", "El modelo no respondió"],
];

export default function Inbox({ config, onChange }: { config: AppConfig; onChange: () => void }) {
  const list = useLoad(() => api.listRequests(), []);
  const [form, setForm] = useState({ subject: "", requester: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<RequestItem | null>(null);
  const [filter, setFilter] = useState<Status | null>(null);
  const [open, setOpen] = useState<RequestItem | null>(null);
  const [motive, setMotive] = useState("");
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  async function reclassify(r: RequestItem) {
    setRowBusy(r.id);
    try {
      await api.reclassify(r.id);
      list.reload();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRowBusy(null);
    }
  }
  // Demo pública: se elige un ejemplo en vez de escribir (el servidor rechaza texto libre).
  const [ex, setEx] = useState(0);
  const data = config.demo ? { ...config.examples[ex], requester: "Visitante" } : form;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createRequest(data);
      setLast(created); // la lista se recarga cuando el punto llega a su rama
      if (created.classifier_failed !== !config.classifier.healthy) onChange(); // actualiza el aviso del modelo
      setForm({ subject: "", requester: form.requester, body: "" });
      setEx((ex + 1) % Math.max(1, config.examples.length));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = list.data ?? [];
  const codes = (r: RequestItem) => reasonCodes(r, config);
  const shown = items.filter(
    (r) =>
      (!filter || r.status === filter) &&
      (!motive || (motive === "auto" ? codes(r).length === 0 : codes(r).includes(motive))),
  );

  return (
    <>
      <header className="page-head">
        <h2>Bandeja</h2>
        <p className="muted">El modelo clasifica, la política decide y lo dudoso llega a una persona.</p>
      </header>

      <TryIt />

      <Flow config={config} items={items} traveling={last} onArrive={list.reload} filter={filter} onFilter={setFilter} />

      <div className="split inbox">
        <section className="panel" aria-labelledby="nueva">
          <h3 id="nueva">Nueva solicitud</h3>
          <form onSubmit={submit} className="form">
            {config.demo ? (
              <>
                <label>
                  Solicitud de ejemplo
                  <select value={ex} onChange={(e) => setEx(Number(e.target.value))}>
                    {config.examples.map((e, i) => (
                      <option key={i} value={i}>
                        {e.subject}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="body-text">{data.body}</p>
                <p className="muted">Demo pública: se envían ejemplos ya escritos, no texto libre.</p>
              </>
            ) : (
              <>
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
                  <textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required minLength={10} maxLength={4000} />
                </label>
              </>
            )}
            <ErrorNote message={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Clasificando…" : "Enviar solicitud"}
            </button>
          </form>

          {last && (
            <div className="result" aria-live="polite">
              <h4>Resultado de la clasificación</h4>
              <p>
                <strong>{label(CATEGORY_LABEL, last.pred_category)}</strong> <PriorityBadge value={last.pred_priority} />{" "}
                <StatusBadge value={last.status} />
              </p>
              <ConfidenceMeter value={last.pred_confidence} threshold={config.confidence_threshold} />
              <p className="muted">{last.pred_reasoning}</p>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="recientes">
          <div className="panel-head">
            <h3 id="recientes">Solicitudes</h3>
            <div className="chips" role="group" aria-label="Filtrar por estado">
              {FILTERS.map((f) => (
                <button key={f ?? "todas"} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f ? STATUS_LABEL[f] : "Todas"}
                </button>
              ))}
            </div>
            <label className="inline-select">
              Motivo
              <select value={motive} onChange={(e) => setMotive(e.target.value)}>
                {MOTIVES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ErrorNote message={list.error} />
          {list.data && shown.length === 0 && (
            <p className="muted">
              {filter || motive ? "Ninguna solicitud con este filtro." : "Aún no hay solicitudes. Envía la primera desde el formulario."}
            </p>
          )}
          <ul className="rows">
            {shown.map((r) => (
              <li key={r.id}>
                <button className={`row-btn ticket prio-band-${r.final_priority ?? r.pred_priority}`} onClick={() => setOpen(r)}>
                  <span className="stub">N.º {ticketNo(r.id)}</span>
                  <span className="row-main">
                    <strong>{r.subject}</strong>
                    <span className="muted">
                      {r.requester} · {formatDate(r.created_at)}
                    </span>
                  </span>
                  <span className="row-meta">
                    <span>{label(CATEGORY_LABEL, r.final_category ?? r.pred_category)}</span>
                    <PriorityBadge value={r.final_priority ?? r.pred_priority} />
                    <StatusBadge value={r.status} />
                    {dueText(r) && <span className={`due ${r.overdue ? "late" : ""}`}>{dueText(r)}</span>}
                  </span>
                  <span className={`reason-line ${codes(r).length ? "to-human" : "to-auto"}`}>
                    {reasonShort(codes(r), r.pred_confidence, r.policy_threshold ?? config.confidence_threshold)}
                  </span>
                  <StampChain item={r} />
                </button>
                {r.classifier_failed && r.status === "needs_review" && (
                  <button className="secondary row-action" onClick={() => reclassify(r)} disabled={rowBusy === r.id}>
                    {rowBusy === r.id ? "Reclasificando…" : "Reclasificar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Detail item={open} config={config} onClose={() => setOpen(null)} />
    </>
  );
}
