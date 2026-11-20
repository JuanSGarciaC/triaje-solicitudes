import { useEffect, useRef, useState } from "react";
import { clfLabel, pct, why } from "./labels";
import { CountUp, Typed, reducedMotion } from "./motion";
import { Swarm, destOf, type Dest, type SwarmItem } from "./swarm";
import type { AppConfig, RequestItem, Status } from "./types";

const W = 1100;
const H = 360;

// Aristas en coordenadas del viewBox; los nodos HTML se colocan con las mismas coordenadas en %.
const EDGES = {
  in_clf: "M165,180 L225,180",
  clf_pol: "M375,180 L440,180",
  pol_auto: "M640,150 C720,150 700,80 775,80",
  pol_rev: "M640,215 C690,215 665,290 715,290",
  rev_hum: "M865,290 L925,290",
} as const;
type EdgeId = keyof typeof EDGES;
/** Móvil: el enjambre muestra una muestra representativa de la lista. */
const LITE_MAX = 60;

const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

interface Props {
  config: AppConfig;
  items: RequestItem[];
  /** Solicitud recién clasificada: un punto recorre el camino que tomó. */
  traveling: RequestItem | null;
  onArrive: () => void;
  filter: Status | null;
  onFilter: (s: Status | null) => void;
}

export default function Flow({ config, items, traveling, onArrive, filter, onFilter }: Props) {
  const real = config.confidence_threshold;
  const [threshold, setThreshold] = useState(real);
  // Paso del recorrido: 2*tramo + (1 si el punto ya entró al nodo destino). -1 = sin recorrido, 6 = llegó.
  const [step, setStep] = useState(-1);
  const [hot, setHot] = useState<EdgeId | null>(null);
  const paths = useRef<Partial<Record<EdgeId, SVGPathElement | null>>>({});
  const dot = useRef<SVGGElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const nodes = useRef<Partial<Record<Dest, HTMLElement | null>>>({});
  const swarm = useRef<Swarm | null>(null);
  const [lite] = useState(() => typeof matchMedia === "function" && matchMedia("(max-width: 600px), (pointer: coarse)").matches);
  // El enjambre sustituye a la animación CSS de las aristas solo cuando ya pintó su primer fotograma.
  const [swarmOn, setSwarmOn] = useState(false);
  const branch: EdgeId = traveling?.status === "auto_approved" ? "pol_auto" : "pol_rev";

  useEffect(() => {
    if (!traveling) return setStep(-1);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(6);
      return onArrive();
    }
    const route = (["in_clf", "clf_pol", branch] as EdgeId[]).map((id) => paths.current[id]!);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, now - t0) / 900; // la marca del primer frame puede ser anterior a t0
      const i = Math.floor(t);
      if (i >= route.length) {
        setStep(6);
        return onArrive();
      }
      const f = Math.min(1, (t - i) / 0.65); // 65 % del tramo viajando, el resto dentro del nodo
      setStep(i * 2 + (f === 1 ? 1 : 0));
      const p = route[i].getPointAtLength(route[i].getTotalLength() * ease(f));
      dot.current?.setAttribute("transform", `translate(${p.x} ${p.y})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traveling?.id]);

  // Con reduced-motion no hay enjambre: el lienzo queda estático, como antes.
  useEffect(() => {
    if (reducedMotion() || !canvas.current || !stage.current || typeof ResizeObserver === "undefined") return;
    const { auto, rev, hum } = nodes.current;
    if (!auto || !rev || !hum) return;
    let s: Swarm;
    try {
      s = new Swarm(canvas.current, stage.current, paths.current as Record<EdgeId, SVGPathElement>, { auto, rev, hum }, {
        lite,
        onStart: () => setSwarmOn(true),
      });
    } catch {
      return; // sin canvas 2D: queda el lienzo de siempre
    }
    swarm.current = s;
    return () => {
      s.destroy();
      swarm.current = null;
      setSwarmOn(false);
    };
  }, [lite]);

  const always = config.always_review_priorities;
  const wouldAuto = (t: number) =>
    items.filter((r) => r.pred_confidence >= t && !always.includes(r.pred_priority)).length;
  const total = items.length;
  const count = (s: Status) => items.filter((r) => r.status === s).length;
  const pending = count("needs_review");
  const reviewed = count("reviewed");
  const corrected = items.filter(
    (r) => r.status === "reviewed" && (r.final_category !== r.pred_category || r.final_priority !== r.pred_priority),
  ).length;
  const simulating = threshold !== real;
  const delta = wouldAuto(threshold) - wouldAuto(real);
  const autoN = simulating ? wouldAuto(threshold) : count("auto_approved");
  const revN = simulating ? total - autoN : pending;

  const flow: Record<EdgeId, number> = {
    in_clf: total,
    clf_pol: total,
    pol_auto: autoN,
    pol_rev: simulating ? revN : pending + reviewed,
    rev_hum: reviewed,
  };

  const state = (busyAt: number) => (step === busyAt ? "busy" : step > busyAt ? "lit" : "");
  const end = (edge: EdgeId) => (traveling && branch === edge ? state(5) : "");
  const dim = (s: Status) => (filter && filter !== s ? "dim" : "");
  const toggle = (s: Status) => onFilter(filter === s ? null : s);

  useEffect(() => {
    const s = swarm.current;
    if (!s) return;
    const autoAt = (r: RequestItem, t: number) => r.pred_confidence >= t && !always.includes(r.pred_priority);
    let list = items;
    if (lite && list.length > LITE_MAX) {
      const k = list.length / LITE_MAX;
      list = Array.from({ length: LITE_MAX }, (_, i) => list[Math.floor(i * k)]);
    }
    const sw: SwarmItem[] = list.map((r) => {
      const realDest = destOf(r.status);
      const dest: Dest = simulating ? (autoAt(r, threshold) ? "auto" : "rev") : realDest;
      return {
        id: r.id,
        real: r.status,
        dest,
        priority: r.final_priority ?? r.pred_priority,
        confidence: r.pred_confidence,
        shifted: simulating && (dest === "auto") !== (r.status === "auto_approved"),
      };
    });
    s.setItems(sw, traveling?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, threshold, simulating, swarmOn, lite]);

  useEffect(() => {
    swarm.current?.setFlow(flow, total);
    swarm.current?.setFocus(filter, hot);
  });

  let caption: string;
  if (simulating)
    caption =
      delta === 0
        ? `Con umbral ${pct(threshold)} ninguna de las ${total} solicitudes cambiaría de rama.`
        : delta > 0
          ? `Con umbral ${pct(threshold)}, ${delta} más se aprobarían solas, sin que nadie las mire.`
          : `Con umbral ${pct(threshold)}, ${-delta} más pasarían a revisión humana.`;
  else if (traveling && step >= 4)
    caption = `«${traveling.subject}» → ${traveling.status === "auto_approved" ? "aprobada sola" : "revisión humana"}. ${why(traveling, config).join(". ")}.`;
  else if (traveling && step >= 0) caption = `Clasificando «${traveling.subject}»…`;
  else if (total === 0) caption = "Aún no hay solicitudes. Envía la primera y mira qué camino toma.";
  else caption = "Elige una rama para filtrar la lista. Mueve el umbral para simular otra política.";

  return (
    <section className="flow glow" aria-label="Lienzo de decisión">
      <div className="flow-scroll">
        <div ref={stage} className={`flow-stage ${simulating ? "simulating" : ""} ${swarmOn ? "swarm-on" : ""}`}>
          <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <defs>
              <linearGradient id="g-main" x1="0" x2="1">
                <stop offset="0" stopColor="var(--cyan)" />
                <stop offset="1" stopColor="var(--violet)" />
              </linearGradient>
              <filter id="halo" x="-300%" y="-300%" width="700%" height="700%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>
            {(Object.keys(EDGES) as EdgeId[]).map((id) => {
              const share = total ? flow[id] / total : 0;
              return (
                <g key={id} className={`edge e-${id} ${hot === id ? "hot" : ""}`}>
                  <path
                    ref={(el) => void (paths.current[id] = el)}
                    d={EDGES[id]}
                    className="edge-track"
                    strokeWidth={2 + 12 * share}
                  />
                  {/* El flujo solo se mueve donde pasaron solicitudes, y más rápido cuantas más pasaron. */}
                  {flow[id] > 0 && (
                    <path d={EDGES[id]} className="edge-flow" style={{ animationDuration: `${2.6 - 1.6 * share}s` }} />
                  )}
                </g>
              );
            })}
            <g ref={dot} className={`dot ${step >= 0 && step < 6 && step % 2 === 0 ? "on" : ""}`}>
              <circle r="11" filter="url(#halo)" />
              <circle r="4.5" className="dot-core" />
            </g>
          </svg>
          <canvas ref={canvas} className="swarm" aria-hidden="true" />

          <div className={`node n-in ${step >= 0 ? "lit" : ""}`} style={at(90, 180)}>
            <span className="node-label">Solicitud</span>
            <strong className="node-count">
              <CountUp value={total} />
            </strong>
            <span className="node-sub">recibidas</span>
          </div>

          <div className={`node n-clf ${state(1)}`} style={at(300, 180)}>
            <span className="node-label">Clasificador</span>
            <strong className="node-title">{items[0] ? clfLabel(items[0].classifier_version) : "Sin datos"}</strong>
            <span className="node-sub">categoría, prioridad y confianza</span>
          </div>

          <div className={`node n-pol ${state(3)}`} style={at(540, 180)}>
            <span className="node-label">Política</span>
            <strong className="node-count">{pct(threshold)}</strong>
            <label className="node-sub">
              Umbral de confianza{simulating && " (simulado)"}
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                aria-valuetext={pct(threshold)}
              />
            </label>
            {simulating ? (
              <button className="link" onClick={() => setThreshold(real)}>
                Volver al umbral real ({pct(real)})
              </button>
            ) : (
              <span className="node-sub">Prioridad {always.join(", ") || "ninguna"}: siempre a una persona</span>
            )}
          </div>

          <button
            ref={(el) => void (nodes.current.auto = el)}
            className={`node n-auto ${end("pol_auto")} ${dim("auto_approved")}`}
            style={at(850, 80)}
            aria-pressed={filter === "auto_approved"}
            onClick={() => toggle("auto_approved")}
            onPointerEnter={() => setHot("pol_auto")}
            onPointerLeave={() => setHot(null)}
          >
            <span className="node-label">Aprobada sola</span>
            <strong className="node-count">
              <CountUp value={autoN} />
            </strong>
            <span className="node-sub">{simulating ? "se aprobarían sin revisión" : "sin intervención humana"}</span>
          </button>

          <button
            ref={(el) => void (nodes.current.rev = el)}
            className={`node n-rev ${end("pol_rev")} ${dim("needs_review")}`}
            style={at(790, 290)}
            aria-pressed={filter === "needs_review"}
            onClick={() => toggle("needs_review")}
            onPointerEnter={() => setHot("pol_rev")}
            onPointerLeave={() => setHot(null)}
          >
            <span className="node-label">Revisión humana</span>
            <strong className="node-count">
              <CountUp value={revN} />
            </strong>
            <span className="node-sub">{simulating ? "irían a una persona" : "en cola"}</span>
          </button>

          <button
            ref={(el) => void (nodes.current.hum = el)}
            className={`node n-hum ${dim("reviewed")}`}
            style={at(1000, 290)}
            aria-pressed={filter === "reviewed"}
            onClick={() => toggle("reviewed")}
            onPointerEnter={() => setHot("rev_hum")}
            onPointerLeave={() => setHot(null)}
          >
            <span className="node-label">Decisión humana</span>
            <strong className="node-count">
              <CountUp value={reviewed} />
            </strong>
            <span className="node-sub">{corrected} corregidas</span>
          </button>
        </div>
      </div>
      <p className={`flow-caption ${simulating ? "sim" : ""}`} aria-live="polite">
        <Typed text={caption} animate={!!traveling && step >= 4 && !simulating} />
      </p>
    </section>
  );
}
