import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api, useLoad } from "./api";
import SuggestedReply from "./Reply";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, clfLabel, formatDate, label, pct, ticketNo, why } from "./labels";
import type { AppConfig, RequestEvent, RequestItem, Status } from "./types";

export function ConfidenceMeter({ value, threshold }: { value: number; threshold: number }) {
  const pct = Math.round(value * 100);
  return (
    <div
      className="meter"
      role="img"
      aria-label={`Confianza ${pct}%. Umbral de aprobación automática ${Math.round(threshold * 100)}%.`}
    >
      <div className="meter-track">
        <div className={`meter-fill ${value >= threshold ? "ok" : "low"}`} style={{ width: `${pct}%` }} />
        <div className="meter-tick" style={{ left: `${threshold * 100}%` }} />
      </div>
      <span className="meter-value">{pct}%</span>
    </div>
  );
}

export const PriorityBadge = ({ value }: { value: string }) => (
  <span className={`badge prio-${value}`}>{label(PRIORITY_LABEL, value)}</span>
);

export const StatusBadge = ({ value }: { value: Status }) => (
  <span className={`badge status-${value}`}>{STATUS_LABEL[value]}</span>
);

export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;

/** Sellos que ya tiene la solicitud, en orden: lo que el visitante ve sin abrir el detalle. */
export function StampChain({ item }: { item: RequestItem }) {
  const corrected =
    item.status === "reviewed" && (item.final_category !== item.pred_category || item.final_priority !== item.pred_priority);
  const marks: [string, string][] = [
    ["Recibida", "done"],
    [item.classifier_failed ? "Respaldo" : "Clasificada", item.classifier_failed ? "fail" : "done"],
    [item.status === "auto_approved" ? "Sola" : "A persona", item.status === "auto_approved" ? "auto" : "wait"],
  ];
  if (item.status === "reviewed") marks.push([corrected ? "Corregida" : "Confirmada", "human"]);
  return (
    <span className="stamp-chain" aria-label={`Sellos: ${marks.map((m) => m[0]).join(", ")}`}>
      {marks.map(([t, k], i) => (
        <span key={i} className={`mini-stamp ms-${k}`} aria-hidden="true">
          {t}
        </span>
      ))}
    </span>
  );
}

/** Aviso cuando el modelo falla: lo que cae a respaldo va a revisión humana, pero conviene saberlo. */
export function ModelNotice({ config }: { config: AppConfig }) {
  const { healthy, failed_pending: n } = config.classifier;
  if (healthy && n === 0) return null;
  return (
    <div className="notice" role="status">
      <strong>{healthy ? "El modelo falló antes." : "El clasificador no está respondiendo."}</strong>{" "}
      {!healthy && "Las solicitudes nuevas pasan a revisión humana con confianza 0. "}
      {n > 0 && (
        <>
          {n === 1 ? "1 solicitud cayó" : `${n} solicitudes cayeron`} a respaldo y espera{n === 1 ? "" : "n"} revisión.{" "}
          <Link to="/revision?respaldo=1">Ver y reclasificar</Link>
        </>
      )}
    </div>
  );
}

const STAMP: Record<RequestEvent["kind"], string> = {
  received: "Recibida",
  classified: "Clasificada",
  decided: "Política",
  reviewed: "Revisada",
  work: "Trabajo",
};

const WORK: Record<string, string> = { en_curso: "en curso", resuelta: "resuelta", abierta: "abierta" };

function eventText(e: RequestEvent): string {
  const d = e.detail;
  if (e.kind === "received") return `Enviada por ${e.actor}`;
  if (e.kind === "classified")
    return d.failed
      ? "El modelo no respondió: respaldo con confianza 0"
      : `${label(CATEGORY_LABEL, String(d.category))} · prioridad ${d.priority} · confianza ${pct(Number(d.confidence))} · ${clfLabel(String(d.version))}`;
  if (e.kind === "decided")
    return `${STATUS_LABEL[d.status as Status] ?? d.status}${d.threshold != null ? ` · umbral ${pct(Number(d.threshold))}` : ""}`;
  if (e.kind === "work") return `${e.actor}: ${WORK[String(d.before)]} → ${WORK[String(d.after)]} · ${d.team}`;
  return `${e.actor} ${d.corrected ? "corrigió" : "confirmó"}: ${label(CATEGORY_LABEL, String(d.category))} · prioridad ${d.priority}`;
}

/** Historial de la solicitud, del más antiguo al más reciente. */
export function Timeline({ id }: { id: number }) {
  const events = useLoad(() => api.events(id), [id]);
  if (events.error) return <ErrorNote message={events.error} />;
  if (!events.data) return <p className="muted">Cargando historial…</p>;
  return (
    <ol className="timeline">
      {events.data.map((e, i) => (
        <li key={i} className={`ev ev-${e.kind}${e.detail.failed ? " failed" : ""}`}>
          <span className="ev-stamp">{STAMP[e.kind] ?? e.kind}</span>
          <span>{eventText(e)}</span>
          <span className="muted">
            {formatDate(e.at)}
            {e.detail.backfill ? " · reconstruido a partir de los datos guardados" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Predicción frente a decisión humana; marca la fila que la persona corrigió. */
function Compare({ name, pred, final, map }: { name: string; pred: string; final: string | null; map: Record<string, string> }) {
  const fixed = final !== null && final !== pred;
  return (
    <tr className={fixed ? "fixed" : ""}>
      <th scope="row">{name}</th>
      <td>{label(map, pred)}</td>
      <td>{final === null ? "Sin revisar" : fixed ? `${label(map, final)} (corregida)` : "Confirmada"}</td>
    </tr>
  );
}

export function Detail({ item, config, onClose }: { item: RequestItem | null; config: AppConfig; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (item) ref.current?.showModal();
  }, [item]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="detalle-titulo"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {item && (
        <article>
          <header>
            <h3 id="detalle-titulo">{item.subject}</h3>
            <button className="link" onClick={() => ref.current?.close()}>
              Cerrar
            </button>
          </header>
          <p className="muted">
            {item.requester} · {formatDate(item.created_at)} · solicitud N.º {ticketNo(item.id)}
          </p>
          <p>
            <span className={`stamp stamp-${item.status}`}>{STATUS_LABEL[item.status]}</span>
          </p>
          <p className="body-text">{item.body}</p>

          <h4>Lo que predijo el clasificador</h4>
          <p className="muted">{clfLabel(item.classifier_version)}</p>
          <p>{item.pred_summary}</p>
          <ConfidenceMeter value={item.pred_confidence} threshold={config.confidence_threshold} />
          <p className="muted">{item.pred_reasoning}</p>

          <h4>Lo que decidió la política</h4>
          <p>
            <StatusBadge value={item.status === "reviewed" ? "needs_review" : item.status} />
          </p>
          <ul className="reasons">
            {why(item, config).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>

          <h4>Predicción frente a decisión humana</h4>
          <table className="compare">
            <thead>
              <tr>
                <td />
                <th scope="col">Clasificador</th>
                <th scope="col">Persona</th>
              </tr>
            </thead>
            <tbody>
              <Compare name="Categoría" pred={item.pred_category} final={item.final_category} map={CATEGORY_LABEL} />
              <Compare name="Prioridad" pred={item.pred_priority} final={item.final_priority} map={PRIORITY_LABEL} />
            </tbody>
          </table>
          {item.status === "reviewed" && (
            <p className="muted">
              Revisó {item.reviewer} · {item.reviewed_at && formatDate(item.reviewed_at)}
              {item.review_note && ` · Nota: «${item.review_note}»`}
            </p>
          )}
          {item.status === "needs_review" && (
            <p>
              <Link to="/revision">Ir a la cola de revisión</Link>
            </p>
          )}
          {item.status === "auto_approved" && <p className="muted">Se aprobó sola: ninguna persona la revisó.</p>}

          <SuggestedReply item={item} />

          <h4>Historial</h4>
          <Timeline id={item.id} />
        </article>
      )}
    </dialog>
  );
}
