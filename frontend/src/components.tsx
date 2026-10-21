import { PRIORITY_LABEL, STATUS_LABEL, label } from "./labels";
import type { Status } from "./types";

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
