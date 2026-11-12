import { useState } from "react";
import { api, useLoad } from "../api";
import { ErrorNote } from "../components";
import { CATEGORY_LABEL, CATEGORY_SHORT, PRIORITY_LABEL, clfLabel, label } from "../labels";
import type { EvalError, EvalReport } from "../types";

const ROWS: { name: string; of: (r: EvalReport) => [number, number] }[] = [
  { name: "Exactitud de categoría", of: (r) => [r.category_ok, r.n] },
  { name: "Exactitud de prioridad", of: (r) => [r.priority_ok, r.n] },
  { name: "Aprobadas solas", of: (r) => [r.auto, r.n] },
  { name: "Categoría correcta entre las aprobadas solas", of: (r) => [r.auto_ok, r.auto] },
];

function Matrix({ report }: { report: EvalReport }) {
  const cats = Object.keys(report.confusion);
  const max = Math.max(1, ...cats.flatMap((e) => Object.values(report.confusion[e])));
  const [cell, setCell] = useState<string | null>(null);
  return (
    <>
      <div className="matrix" style={{ gridTemplateColumns: `7em repeat(${cats.length}, 1fr)` }} onPointerLeave={() => setCell(null)}>
        <span className="matrix-corner">esperada \ predicha</span>
        {cats.map((c) => (
          <span key={c} className="matrix-head">
            {label(CATEGORY_SHORT, c)}
          </span>
        ))}
        {cats.map((exp) => [
          <span key={exp} className="matrix-side">
            {label(CATEGORY_SHORT, exp)}
          </span>,
          ...cats.map((pred) => {
            const n = report.confusion[exp][pred];
            const text = `Esperada «${label(CATEGORY_LABEL, exp)}», predicha «${label(CATEGORY_LABEL, pred)}»: ${n} ${n === 1 ? "caso" : "casos"}`;
            return (
              <span
                key={exp + pred}
                className={`cell ${n === 0 ? "" : exp === pred ? "hit" : "miss"}`}
                style={{ "--v": n / max } as React.CSSProperties}
                role="img"
                aria-label={text}
                onPointerEnter={() => setCell(text)}
              >
                {n || ""}
              </span>
            );
          }),
        ])}
      </div>
      <p className="muted matrix-note">{cell ?? "Pasa el puntero por una celda. La diagonal son aciertos."}</p>
    </>
  );
}

const Errors = ({ title, items, map }: { title: string; items: EvalError[]; map: Record<string, string> }) => (
  <>
    <h4>
      {title} ({items.length})
    </h4>
    {items.length === 0 && <p className="muted">Ninguno en este conjunto.</p>}
    <ul className="errors">
      {items.map((e) => (
        <li key={e.subject}>
          «{e.subject}»: esperada <b>{label(map, e.expected)}</b>, predicha <b>{label(map, e.predicted)}</b>{" "}
          <span className="muted">con confianza {Math.round(e.confidence * 100)} %</span>
        </li>
      ))}
    </ul>
  </>
);

export default function Evaluation() {
  const { data, error } = useLoad(api.evalReports, []);

  return (
    <>
      <header className="page-head">
        <h2>Evaluación</h2>
        <p className="muted">
          Los mismos casos etiquetados a mano, clasificados por cada motor. Son pocos casos: cada uno mueve el resultado
          varios puntos.
        </p>
      </header>
      <ErrorNote message={error} />
      {data && data.length === 0 && <p className="panel muted">No hay reportes guardados. Ejecuta eval/run_eval.py.</p>}
      {data && data.length > 0 && (
        <>
          <section className="panel glow" aria-labelledby="comparacion">
            <h3 id="comparacion">Comparación</h3>
            <table className="versus">
              <thead>
                <tr>
                  <td />
                  {data.map((r) => (
                    <th key={r.classifier} scope="col">
                      {clfLabel(r.classifier)}
                      <span className="muted">
                        {r.n} casos · {r.date.slice(0, 10)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    {data.map((r) => {
                      const [a, b] = row.of(r);
                      return (
                        <td key={r.classifier}>
                          <span className="versus-value">
                            {b ? `${Math.round((a / b) * 100)} %` : "Sin datos"} <span className="muted">{a}/{b}</span>
                          </span>
                          <span className="bar-track">
                            <span className="bar-fill" style={{ width: `${b ? (a / b) * 100 : 0}%` }} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Aprobar más solas no es mejor: lo que importa es cuántas de esas quedaron bien clasificadas sin que nadie
              las mirara.
            </p>
          </section>

          <div className="split">
            {data.map((r) => (
              <section key={r.classifier} className="panel glow" aria-label={`Detalle de ${clfLabel(r.classifier)}`}>
                <h3>{clfLabel(r.classifier)}</h3>
                <Matrix report={r} />
                <Errors title="Errores de categoría" items={r.category_errors} map={CATEGORY_LABEL} />
                <Errors title="Errores de prioridad" items={r.priority_errors} map={PRIORITY_LABEL} />
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
