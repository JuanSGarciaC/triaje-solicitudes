import type { PointerEvent } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, useLoad } from "./api";
import { ErrorNote } from "./components";
import { pct } from "./labels";
import Evaluation from "./pages/Evaluation";
import Inbox from "./pages/Inbox";
import Metrics from "./pages/Metrics";
import Review from "./pages/Review";

// Un solo listener: cada panel .glow recibe la posición del puntero para iluminar su borde.
function trackPointer(e: PointerEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".glow");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export default function App() {
  const config = useLoad(api.config, []);

  return (
    <div className="shell" onPointerMove={trackPointer}>
      <header className="top">
        <div className="brand">
          <h1>Triaje</h1>
          <p>Solicitudes de soporte de TI</p>
        </div>
        <nav aria-label="Principal">
          <NavLink to="/" end>
            Bandeja
          </NavLink>
          <NavLink to="/revision">Por revisar</NavLink>
          <NavLink to="/metricas">Métricas</NavLink>
          <NavLink to="/evaluacion">Evaluación</NavLink>
        </nav>
        {config.data?.demo && <span className="chip demo">Demo pública</span>}
        {config.data && <span className="chip">Umbral {pct(config.data.confidence_threshold)}</span>}
      </header>
      <main className="main">
        {config.loading && <p className="muted">Conectando con el servidor…</p>}
        <ErrorNote
          message={config.error && "No se pudo conectar con el servidor. Inicia el backend en el puerto 8000 y recarga."}
        />
        {config.data && (
          <Routes>
            <Route path="/" element={<Inbox config={config.data} />} />
            <Route path="/revision" element={<Review config={config.data} />} />
            <Route path="/metricas" element={<Metrics config={config.data} />} />
            <Route path="/evaluacion" element={<Evaluation />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
