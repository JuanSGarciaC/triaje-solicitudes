import { api, useLoad } from "../api";
import { ErrorNote } from "../components";
import { CATEGORY_LABEL, STATUS_LABEL, label } from "../labels";
import type { Status } from "../types";
import type { AppConfig } from "../types";

const STATUSES: Status[] = ["auto_approved", "needs_review", "reviewed"];

const pct = (v: number | null) => (v === null ? "Sin datos" : `${Math.round(v * 100)}%`);

const hrs = (h: number | null) => (h === null ? "Sin datos" : h < 48 ? `${h} h` : `${Math.round(h / 24)} días`);
const rate = (s: { reviewed: number; corrected: number }) => (s.reviewed ? s.corrected / s.reviewed : 0);
const week = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

/** Tablero de la mesa: carga por equipo, vencidas, tiempos y cuánto corrigen las personas al clasificador. */
function DeskBoard({ demo }: { demo: boolean }) {
  const { data, error } = useLoad(api.desk, []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  const maxLoad = Math.max(1, ...data.teams.map((t) => t.open + t.in_progress));
  return (
    <>
      <section className="tiles" aria-label="La mesa hoy">
        <div className="tile">
          <span className={`tile-value ${data.overdue ? "late-text" : ""}`}>{data.overdue}</span>
          <span className="muted">Vencidas sin resolver</span>
        </div>
        <div className="tile">
          <span className="tile-value">{hrs(data.avg_hours_to_review)}</span>
          <span className="muted">Tiempo medio hasta la revisión humana</span>
        </div>
        <div className="tile">
          <span className="tile-value">{hrs(data.avg_hours_to_resolve)}</span>
          <span className="muted">Tiempo medio hasta resolver</span>
        </div>
        <div className="tile">
          <span className="tile-value">{pct(data.resolved_on_time)}</span>
          <span className="muted">Resueltas dentro del plazo</span>
        </div>
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="carga">
          <h3 id="carga">Carga por equipo</h3>
          <table className="load">
            <thead>
              <tr>
                <th scope="col">Equipo</th>
                <th scope="col">Abiertas</th>
                <th scope="col">En curso</th>
                <th scope="col">Vencidas</th>
                <td />
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.team}>
                  <th scope="row">{t.team}</th>
                  <td>{t.open}</td>
                  <td>{t.in_progress}</td>
                  <td className={t.overdue ? "late-text" : ""}>{t.overdue ? `${t.overdue} vencida${t.overdue > 1 ? "s" : ""}` : "0"}</td>
                  <td className="load-bar" title={`${t.team}: ${t.open + t.in_progress} sin resolver`}>
                    <span style={{ width: `${((t.open + t.in_progress) / maxLoad) * 100}%` }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel" aria-labelledby="semanas">
          <div className="panel-head">
            <h3 id="semanas">Corrección humana por semana</h3>
            <a href="/api/reviews.csv" download>
              Descargar revisiones como casos (CSV)
            </a>
          </div>
          <p className="muted small">
            Parte de las revisiones en que la persona cambió categoría o prioridad.{" "}
            {demo && "Datos de ejemplo: las semanas anteriores se siembran con la etiqueta esperada del conjunto de desarrollo."}
          </p>
          <ol className="weeks" aria-label="Tasa de corrección por semana">
            {data.weeks.map((w) => (
              <li key={w.label} title={`Semana del ${week(w.label)}: ${w.corrected} de ${w.reviewed} revisadas se corrigieron`}>
                <span className="week-val">{w.reviewed ? pct(rate(w)) : "—"}</span>
                <span className="week-track">
                  <span className="week-bar" style={{ height: `${rate(w) * 100}%` }} />
                </span>
                <span className="week-label">{week(w.label)}</span>
                <span className="muted small">
                  {w.corrected}/{w.reviewed}
                </span>
              </li>
            ))}
          </ol>
          <table className="load">
            <thead>
              <tr>
                <th scope="col">Categoría que predijo</th>
                <th scope="col">Revisadas</th>
                <th scope="col">Corregidas</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{label(CATEGORY_LABEL, c.label)}</th>
                  <td>{c.reviewed}</td>
                  <td>
                    {c.corrected} ({pct(rate(c))})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <h3 className="section-title">Clasificador y personas</h3>
    </>
  );
}

export default function Metrics({ config }: { config: AppConfig }) {
  const { data, error } = useLoad(api.metrics, []);
  const max = data ? Math.max(1, ...Object.values(data.by_category)) : 1;

  return (
    <>
      <header className="page-head">
        <h2>Métricas</h2>
        <p className="muted">Cómo va la mesa y cómo se reparte el trabajo entre el clasificador y las personas.</p>
      </header>
      <DeskBoard demo={config.demo} />
      <ErrorNote message={error} />
      {data && (
        <>
          <section className="tiles" aria-label="Resumen">
            <div className="tile">
              <span className="tile-value">{data.total}</span>
              <span className="muted">Solicitudes recibidas</span>
            </div>
            <div className="tile">
              <span className="tile-value">{pct(data.auto_approved_share)}</span>
              <span className="muted">Aprobadas automáticamente</span>
            </div>
            <div className="tile">
              <span className="tile-value">{pct(data.human_correction_rate)}</span>
              <span className="muted">
                Corregidas por personas ({data.reviewed_count} revisadas)
              </span>
            </div>
            <div className="tile">
              <span className="tile-value">{Math.round(data.avg_confidence * 100)}%</span>
              <span className="muted">Confianza promedio (umbral {Math.round(config.confidence_threshold * 100)}%)</span>
            </div>
          </section>

          <section className="panel" aria-labelledby="estados">
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

          <section className="panel" aria-labelledby="cats" style={{ marginTop: "1.25rem" }}>
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
