import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, clfLabel, formatDate, label, why } from "./labels";
import type { AppConfig, RequestItem, Status } from "./types";

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
            {item.requester} · {formatDate(item.created_at)} · solicitud n.º {item.id}
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
        </article>
      )}
    </dialog>
  );
}
