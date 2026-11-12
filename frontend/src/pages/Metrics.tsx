import { api, useLoad } from "../api";
import { ErrorNote } from "../components";
import { CATEGORY_LABEL, STATUS_LABEL, label } from "../labels";
import type { Status } from "../types";
import type { AppConfig } from "../types";

const STATUSES: Status[] = ["auto_approved", "needs_review", "reviewed"];

const pct = (v: number | null) => (v === null ? "Sin datos" : `${Math.round(v * 100)}%`);

export default function Metrics({ config }: { config: AppConfig }) {
  const { data, error } = useLoad(api.metrics, []);
  const max = data ? Math.max(1, ...Object.values(data.by_category)) : 1;

  return (
    <>
      <header className="page-head">
        <h2>Métricas</h2>
        <p className="muted">Cómo se reparte el trabajo entre el clasificador y las personas.</p>
      </header>
      <ErrorNote message={error} />
      {data && (
        <>
          <section className="tiles" aria-label="Resumen">
            <div className="tile glow">
              <span className="tile-value">{data.total}</span>
              <span className="muted">Solicitudes recibidas</span>
            </div>
            <div className="tile glow">
              <span className="tile-value">{pct(data.auto_approved_share)}</span>
              <span className="muted">Aprobadas automáticamente</span>
            </div>
            <div className="tile glow">
              <span className="tile-value">{pct(data.human_correction_rate)}</span>
              <span className="muted">
                Corregidas por personas ({data.reviewed_count} revisadas)
              </span>
            </div>
            <div className="tile glow">
              <span className="tile-value">{Math.round(data.avg_confidence * 100)}%</span>
              <span className="muted">Confianza promedio (umbral {Math.round(config.confidence_threshold * 100)}%)</span>
            </div>
          </section>

          <section className="panel glow" aria-labelledby="estados">
            <h3 id="estados">Quién decidió</h3>
            <div className="stack" role="img" aria-label={STATUSES.map((s) => `${STATUS_LABEL[s]}: ${data.by_status[s] ?? 0}`).join(". ")}>
              {STATUSES.map((s) => (
                <span key={s} className={`bg-${s}`} style={{ flexGrow: data.by_status[s] ?? 0 }} />
              ))}
            </div>
            <ul className="legend">
              {STATUSES.map((s) => (
                <li key={s}>
                  <i className={`bg-${s}`} />
                  {STATUS_LABEL[s]}: <strong>{data.by_status[s] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel glow" aria-labelledby="cats" style={{ marginTop: "1.25rem" }}>
            <h3 id="cats">Solicitudes por categoría</h3>
            {data.total === 0 && <p className="muted">Todavía no hay datos. Envía solicitudes desde la bandeja.</p>}
            <ul className="bars">
              {Object.entries(data.by_category).map(([cat, n]) => (
                <li key={cat}>
                  <span>{label(CATEGORY_LABEL, cat)}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
