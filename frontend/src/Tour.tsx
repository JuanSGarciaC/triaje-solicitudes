import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type Step = { path: string; target: string; title: string; text: string };
const STEPS: Step[] = [
  { path: "/", target: ".tryit", title: "1 · Prueba tu solicitud", text: "Escribe un problema o pulsa «Urgente»: el tique sale sellado con su motivo. No se guarda nada." },
  { path: "/", target: ".flow", title: "2 · El camino", text: "Cada solicitud pasa por el clasificador y la política. Las ramas muestran los conteos reales; el umbral se puede simular." },
  { path: "/", target: ".rows > li", title: "3 · Cada tique explica su sello", text: "En una línea: por qué fue a una persona o se aprobó sola, y los sellos que ya tiene." },
  { path: "/revision", target: ".queue", title: "4 · La cola, por urgencia", text: "Primero lo vencido. Confirma o corrige y cae el sello de la persona." },
  { path: "/revision?respaldo=1", target: ".result .secondary", title: "5 · Cuando el modelo falla", text: "Lo que cayó a respaldo se reclasifica en un clic; la política decide de nuevo y queda en el historial." },
  { path: "/tablero", target: ".board", title: "6 · Después del triaje", text: "Cada equipo toma y resuelve su trabajo. El plazo corre hasta resolver." },
];
export const TOUR_SEEN = "sello-recorrido-visto";

/** Recorrido guiado sobre la interfaz real. No bloquea los clics: se puede probar lo que señala. */
export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const bubble = useRef<HTMLDivElement>(null);
  const step = STEPS[i];

  const close = () => {
    localStorage.setItem(TOUR_SEEN, "1");
    onClose();
  };

  useEffect(() => {
    if (`${location.pathname}${location.search}` !== step.path) navigate(step.path);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Espera a que el elemento exista (la página carga datos) y lo sigue al hacer scroll o cambiar el tamaño.
  useLayoutEffect(() => {
    let el: Element | null = null, tries = 0, raf = 0;
    const place = () => el && setRect(el.getBoundingClientRect());
    const find = () => {
      el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        setTimeout(place, 350);
        place();
      } else if (tries++ < 120) raf = requestAnimationFrame(find);
      else setRect(null);
    };
    setRect(null);
    find();
    addEventListener("scroll", place, true);
    addEventListener("resize", place);
    return () => (cancelAnimationFrame(raf), removeEventListener("scroll", place, true), removeEventListener("resize", place));
  }, [i, location.pathname, location.search, step.target]);

  useEffect(() => bubble.current?.focus(), [i]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const pad = 8;
  const below = rect ? rect.bottom + 16 + 190 < innerHeight : true;
  const top = rect ? (below ? rect.bottom + 16 : Math.max(12, rect.top - 16 - 190)) : innerHeight / 2 - 95;
  const left = rect ? Math.min(Math.max(12, rect.left), innerWidth - 372) : innerWidth / 2 - 180;

  return (
    <div className="tour" aria-live="polite">
      {rect && (
        <div
          className="tour-spot"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: Math.min(rect.height + pad * 2, innerHeight) }}
        />
      )}
      <div ref={bubble} className="tour-bubble" role="dialog" aria-labelledby="tour-title" tabIndex={-1} style={{ top, left }}>
        <p className="tour-count">
          Recorrido · {i + 1} de {STEPS.length}
        </p>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="link" onClick={close}>
            Saltar
          </button>
          {i > 0 && (
            <button className="secondary" onClick={() => setI(i - 1)}>
              Anterior
            </button>
          )}
          {i < STEPS.length - 1 ? (
            <button className="primary" onClick={() => setI(i + 1)}>
              Siguiente
            </button>
          ) : (
            <button className="primary" onClick={close}>
              Listo, a probar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
