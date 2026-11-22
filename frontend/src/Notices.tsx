import { useEffect, useRef, useState } from "react";
import { api, useLoad } from "./api";
import { formatDate } from "./labels";

const SEEN = "sello-avisos-vistos";

/** Campana de avisos: lo que recibiría quien pidió ayuda (o Slack/Teams) al cambiar el estado, con su firma. */
export default function Notices({ refresh, demo }: { refresh: unknown; demo: boolean }) {
  const list = useLoad(() => api.notifications(), [refresh]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => Number(localStorage.getItem(SEEN) ?? 0));
  const box = useRef<HTMLDivElement>(null);
  const items = list.data ?? [];
  const unread = items.filter((n) => n.id > seen).length;

  useEffect(() => {
    if (!open) return;
    const top = items[0]?.id ?? 0;
    localStorage.setItem(SEEN, String(top));
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) {
        setOpen(false);
        setSeen(top);
      }
    };
    addEventListener("keydown", close);
    addEventListener("pointerdown", close);
    return () => (removeEventListener("keydown", close), removeEventListener("pointerdown", close));
  }, [open, items]);

  return (
    <div className="notices" ref={box}>
      <button className="chip notices-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        Avisos{unread > 0 && <span className="nav-count">{unread} nuevos</span>}
      </button>
      {open && (
        <section className="notices-panel" aria-label="Avisos">
          <h3>Avisos</h3>
          <p className="muted small">
            Webhook saliente firmado (HMAC-SHA256) cada vez que una solicitud cambia de estado.
            {demo && " En la demo pública son simulados y se firman con un secreto de ejemplo público: no salen del servidor."}
          </p>
          {items.length === 0 && <p className="muted">Aún no hay avisos. Prueba a enviar, revisar, tomar o resolver una solicitud.</p>}
          <ol className="notice-list">
            {items.map((n) => (
              <li key={n.id} className={n.id > seen ? "new" : ""}>
                <p className="notice-msg">{n.message}</p>
                <p className="muted small">
                  {formatDate(n.at)} · <span className={`delivery d-${n.delivery}`}>{n.delivery}</span>
                </p>
                <details>
                  <summary>Ver payload y firma</summary>
                  <pre>{JSON.stringify(n.payload, null, 2)}</pre>
                  <p className="small">
                    X-Sello-Signature: <code>{n.signature ?? "sin firma (no hay secreto configurado)"}</code>
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
