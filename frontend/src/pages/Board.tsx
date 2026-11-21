import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useLoad } from "../api";
import { ErrorNote, PriorityBadge } from "../components";
import { CATEGORY_LABEL, dueText, formatDate, label, ticketNo } from "../labels";
import type { AppConfig, RequestItem } from "../types";

type Col = { key: string; title: string; hint: string; pick: (r: RequestItem) => boolean };
const COLS: Col[] = [
  { key: "revisar", title: "Por revisar", hint: "Espera el sello de una persona", pick: (r) => r.status === "needs_review" },
  { key: "abierta", title: "Abierta", hint: "Triada, sin nadie a cargo", pick: (r) => r.status !== "needs_review" && r.work_state === "abierta" },
  { key: "en_curso", title: "En curso", hint: "Alguien la está atendiendo", pick: (r) => r.work_state === "en_curso" },
  { key: "resuelta", title: "Resuelta", hint: "Las más recientes", pick: (r) => r.work_state === "resuelta" },
];
const RESOLVED_SHOWN = 6;

/** Tablero de trabajo: después del triaje, cada solicitud va a su equipo y se toma y se resuelve con un clic. */
export default function Board({ config, onChange }: { config: AppConfig; onChange: () => void }) {
  const list = useLoad(() => api.listRequests(), []);
  const [team, setTeam] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem("sello-nombre") ?? "");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actor = config.demo ? "Visitante" : name.trim();

  const items = (list.data ?? []).filter((r) => !team || r.team === team);
  const openByTeam = (t: string) => (list.data ?? []).filter((r) => r.team === t && r.work_state !== "resuelta").length;

  async function act(r: RequestItem, action: "take" | "resolve") {
    if (actor.length < 2) return setError("Escribe tu nombre para tomar o resolver solicitudes.");
    setBusy(r.id);
    setError(null);
    try {
      await api.work(r.id, action, actor);
      list.reload();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-head">
        <h2>Tablero</h2>
        <p className="muted">Después del triaje, cada solicitud va al equipo de su categoría. Tómala, resuélvela y queda en el historial.</p>
      </header>

      <div className="board-bar">
        <div className="chips" role="group" aria-label="Filtrar por equipo">
          <button className="chip" aria-pressed={team === null} onClick={() => setTeam(null)}>
            Todos los equipos
          </button>
          {config.teams.map((t) => (
            <button key={t} className="chip" aria-pressed={team === t} onClick={() => setTeam(t)}>
              {t} ({openByTeam(t)})
            </button>
          ))}
        </div>
        {config.demo ? (
          <p className="muted small">Demo pública: trabajas como «Visitante».</p>
        ) : (
          <label className="inline-select">
            Tu nombre
            <input
              value={name}
              onChange={(e) => (setName(e.target.value), localStorage.setItem("sello-nombre", e.target.value))}
              maxLength={120}
            />
          </label>
        )}
      </div>
      <ErrorNote message={error ?? list.error} />

      <div className="board">
        {COLS.map((c) => {
          let cards = items.filter(c.pick).sort((a, b) => a.due_at.localeCompare(b.due_at));
          const total = cards.length;
          if (c.key === "resuelta")
            cards = cards.sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "")).slice(0, RESOLVED_SHOWN);
          return (
            <section key={c.key} className={`board-col col-${c.key}`} aria-labelledby={`col-${c.key}`}>
              <h3 id={`col-${c.key}`}>
                {c.title} <span className="col-count">{total}</span>
              </h3>
              <p className="muted small">{c.hint}</p>
              <ul className="board-cards">
                {cards.map((r) => (
                  <li key={r.id} className={`board-card ticket prio-band-${r.final_priority ?? r.pred_priority} ${r.overdue ? "is-late" : ""}`}>
                    <p className="board-no">
                      N.º {ticketNo(r.id)} · {r.team}
                    </p>
                    <strong>{r.subject}</strong>
                    <span className="row-meta">
                      <span>{label(CATEGORY_LABEL, r.final_category ?? r.pred_category)}</span>
                      <PriorityBadge value={r.final_priority ?? r.pred_priority} />
                    </span>
                    {r.work_state === "resuelta" ? (
                      <span className="muted small">
                        Resuelta por {r.assignee} · {r.resolved_at && formatDate(r.resolved_at)}
                      </span>
                    ) : (
                      <span className={`due ${r.overdue ? "late" : ""}`}>{dueText(r)}</span>
                    )}
                    {r.work_state === "en_curso" && <span className="muted small">A cargo de {r.assignee}</span>}
                    {c.key === "revisar" && <Link to="/revision">Revisar primero</Link>}
                    {c.key === "abierta" && (
                      <button className="secondary" disabled={busy === r.id} onClick={() => act(r, "take")}>
                        Tomar
                      </button>
                    )}
                    {c.key === "en_curso" && (
                      <button className="primary" disabled={busy === r.id} onClick={() => act(r, "resolve")}>
                        Resolver
                      </button>
                    )}
                    {r.work_state === "resuelta" && <span className="stamp stamp-reviewed board-stamp">Resuelta</span>}
                    {r.overdue && <span className="stamp stamp-late board-stamp">Vencida</span>}
                  </li>
                ))}
              </ul>
              {c.key === "resuelta" && total > RESOLVED_SHOWN && <p className="muted small">y {total - RESOLVED_SHOWN} más</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
