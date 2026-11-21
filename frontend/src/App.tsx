import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, useLoad } from "./api";
import { ErrorNote, ModelNotice } from "./components";
import { pct } from "./labels";
import Evaluation from "./pages/Evaluation";
import Inbox from "./pages/Inbox";
import Metrics from "./pages/Metrics";
import Review from "./pages/Review";

export default function App() {
  const config = useLoad(api.config, []);
  const brand = config.data && `${config.data.brand_name} · ${config.data.brand_tagline}`;
  useEffect(() => {
    if (brand) document.title = brand;
  }, [brand]);

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="/como-funciona" aria-label={brand ? `${brand}: cómo funciona` : "Cómo funciona"}>
          <img src="/como-funciona/sello.svg" alt="" width="34" height="34" />
          <span>
            <span className="brand-name">{config.data?.brand_name ?? "\u00a0"}</span>
            <span className="brand-tag">{config.data?.brand_tagline}</span>
          </span>
        </a>
        <nav aria-label="Principal">
          <NavLink to="/" end>
            Bandeja
          </NavLink>
          <NavLink to="/revision">
            Por revisar{" "}
            {config.data && (
              <span className="nav-count" aria-label={`${config.data.classifier.pending} pendientes`}>
                {config.data.classifier.pending}
                {config.data.classifier.failed_pending > 0 && ` · ${config.data.classifier.failed_pending} en respaldo`}
              </span>
            )}
          </NavLink>
          <NavLink to="/metricas">Métricas</NavLink>
          <NavLink to="/evaluacion">Evaluación</NavLink>
          {/* Página estática que sirve la API, fuera del router */}
          <a href="/como-funciona">Cómo funciona</a>
        </nav>
        {config.data?.demo && <span className="chip demo">Demo pública</span>}
        {config.data && <span className="chip">Umbral {pct(config.data.confidence_threshold)}</span>}
      </header>
      <main className="main">
        {config.loading && !config.data && <p className="muted">Conectando con el servidor…</p>}
        {config.data && <ModelNotice config={config.data} />}
        <ErrorNote
          message={config.error && "No se pudo conectar con el servidor. Inicia el backend en el puerto 8000 y recarga."}
        />
        {config.data && (
          <Routes>
            <Route path="/" element={<Inbox config={config.data} onChange={config.reload} />} />
            <Route path="/revision" element={<Review config={config.data} onChange={config.reload} />} />
            <Route path="/metricas" element={<Metrics config={config.data} />} />
            <Route path="/evaluacion" element={<Evaluation />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
