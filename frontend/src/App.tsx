import { NavLink, Route, Routes } from "react-router-dom";
import { api, useLoad } from "./api";
import { ErrorNote } from "./components";
import Inbox from "./pages/Inbox";
import Metrics from "./pages/Metrics";
import Review from "./pages/Review";

export default function App() {
  const config = useLoad(api.config, []);

  return (
    <div className="shell">
      <aside className="rail">
        <h1 className="brand">Triaje</h1>
        <p className="brand-sub">Solicitudes de soporte de TI</p>
        <nav aria-label="Principal">
          <NavLink to="/" end>
            Bandeja
          </NavLink>
          <NavLink to="/revision">Por revisar</NavLink>
          <NavLink to="/metricas">Métricas</NavLink>
        </nav>
      </aside>
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
          </Routes>
        )}
      </main>
    </div>
  );
}
