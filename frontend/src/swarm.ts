/**
 * Enjambre del lienzo: cada solicitud cargada es una partícula que recorre el camino que tomó
 * (Solicitud → Clasificador → Política → su rama) y se queda orbitando alrededor de su nodo.
 * Si el umbral simulado la cambia de rama, cruza de verdad hasta la otra. Las chispas de las
 * aristas salen de los conteos reales (más solicitudes, más chispas).
 *
 * Canvas 2D sin dependencias. Trabaja en coordenadas del viewBox del SVG (1100 × 360), así que
 * las aristas se muestrean de los mismos <path> que dibuja React. Se pausa fuera de pantalla y
 * con la pestaña oculta. Quien lo monta decide no hacerlo con prefers-reduced-motion.
 */

export type EdgeId = "in_clf" | "clf_pol" | "pol_auto" | "pol_rev" | "rev_hum";
export type Dest = "auto" | "rev" | "hum";
export type Real = "auto_approved" | "needs_review" | "reviewed";

export interface SwarmItem {
  id: number;
  dest: Dest;
  real: Real;
  priority: string;
  confidence: number;
  /** El umbral simulado la mueve de rama: se tiñe de violeta. */
  shifted: boolean;
}

const W = 1100;
const H = 360;

const EDGE_COLOR: Record<EdgeId, string> = {
  in_clf: "#56d4ff",
  clf_pol: "#74a8ff",
  pol_auto: "#4ade9a",
  pol_rev: "#ffb454",
  rev_hum: "#7aa8ff",
};
const PRIORITY_COLOR: Record<string, string> = { alta: "#ff8278", media: "#ffb454", baja: "#4ade9a" };
const SHIFT_COLOR = "#a594ff";
const FALLBACK_COLOR = "#56d4ff";

/** Camino desde la política hasta cada destino. */
const FROM_POLICY: Record<Dest, EdgeId[]> = { auto: ["pol_auto"], rev: ["pol_rev"], hum: ["pol_rev", "rev_hum"] };
const HOT_DEST: Partial<Record<EdgeId, Dest>> = { pol_auto: "auto", pol_rev: "rev", rev_hum: "hum" };
const REAL_DEST: Record<Real, Dest> = { auto_approved: "auto", needs_review: "rev", reviewed: "hum" };

type Pt = { x: number; y: number };
interface Route {
  pts: Pt[];
  cum: number[];
  len: number;
}
interface Particle {
  id: number;
  real: Real;
  dest: Dest;
  /** Nodo donde está (o hacia el que va su ruta actual). */
  at: Dest | null;
  route: Route | null;
  s: number;
  idx: number;
  v: number;
  delay: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Desfase al empezar una ruta desde el anillo, se disuelve en ~0,3 s. */
  ox: number;
  oy: number;
  r: number;
  alpha: number;
  shown: number;
  sprite: HTMLCanvasElement;
  /** Ángulo actual en el anillo y su sitio propio, para repartirse alrededor del nodo. */
  ang: number;
  phase: number;
  spin: number;
  off: number;
  flash: number;
  leaving: boolean;
}
interface Spark {
  edge: EdgeId;
  s: number;
  v: number;
  idx: number;
}
interface Box {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export interface SwarmOptions {
  /** Móvil o puntero táctil: sin estelas, menos chispas y 30 fps. */
  lite: boolean;
  /** Primer fotograma pintado: el lienzo puede retirar su animación CSS de respaldo. */
  onStart?: () => void;
}

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(color: string): HTMLCanvasElement {
  let c = sprites.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.14, "#ffffff");
  grad.addColorStop(0.24, color);
  grad.addColorStop(0.5, hexA(color, 0.28));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(color, c);
  return c;
}
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export class Swarm {
  private ctx: CanvasRenderingContext2D;
  private edges = {} as Record<EdgeId, Pt[]>;
  private boxes = {} as Record<Dest, Box>;
  private particles = new Map<number, Particle>();
  private sparks: Spark[] = [];
  private spawnAcc = {} as Record<EdgeId, number>;
  private flow = {} as Record<EdgeId, number>;
  private total = 0;
  private filter: Real | null = null;
  private hot: Dest | null = null;
  private seeded = false;
  private raf = 0;
  private last = 0;
  private lastPaint = 0;
  private time = 0;
  private visible = true;
  private onScreen = true;
  private started = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
    paths: Record<EdgeId, SVGPathElement>,
    private nodes: Record<Dest, HTMLElement>,
    private opts: SwarmOptions,
  ) {
    this.ctx = canvas.getContext("2d")!;
    for (const id of Object.keys(paths) as EdgeId[]) {
      const p = paths[id];
      const len = p.getTotalLength();
      const n = Math.max(2, Math.ceil(len / 4));
      this.edges[id] = Array.from({ length: n + 1 }, (_, i) => {
        const q = p.getPointAtLength((len * i) / n);
        return { x: q.x, y: q.y };
      });
      this.spawnAcc[id] = Math.random();
      this.flow[id] = 0;
    }
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(stage);
    for (const el of Object.values(nodes)) this.ro.observe(el);
    this.io = new IntersectionObserver(([e]) => {
      this.onScreen = e.isIntersecting;
      this.wake();
    });
    this.io.observe(stage);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.measure();
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  setFlow(flow: Record<EdgeId, number>, total: number) {
    this.flow = flow;
    this.total = total;
  }

  setFocus(filter: Real | null, hotEdge: EdgeId | null) {
    this.filter = filter;
    this.hot = hotEdge ? (HOT_DEST[hotEdge] ?? null) : null;
  }

  /** Sincroniza las partículas con la lista. `arrivedId`: la recién enviada aparece al final de su rama. */
  setItems(items: SwarmItem[], arrivedId?: number) {
    const keep = new Set<number>();
    const fresh: SwarmItem[] = [];
    for (const it of items) {
      keep.add(it.id);
      const p = this.particles.get(it.id);
      if (!p) {
        fresh.push(it);
        continue;
      }
      p.leaving = false;
      p.real = it.real;
      p.sprite = sprite(it.shifted ? SHIFT_COLOR : (PRIORITY_COLOR[it.priority] ?? FALLBACK_COLOR));
      if (p.dest !== it.dest) {
        p.dest = it.dest;
        if (!p.route) this.reroute(p, it.id % 7);
      }
    }
    for (const p of this.particles.values()) if (!keep.has(p.id)) p.leaving = true;

    // La primera carga entra escalonada; las siguientes, casi a la vez.
    const gap = this.seeded ? 40 : Math.min(14, 1600 / Math.max(1, fresh.length));
    fresh.forEach((it, i) => this.spawn(it, it.id === arrivedId ? -1 : i * gap));
    if (items.length) this.seeded = true;
    this.wake();
  }

  // ---------- internos ----------

  private onVisibility = () => {
    this.visible = document.visibilityState === "visible";
    this.wake();
  };

  private wake() {
    if (this.raf || !this.visible || !this.onScreen) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private measure() {
    const r = this.stage.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform((r.width * dpr) / W, 0, 0, (r.height * dpr) / H, 0, 0);
    const kx = W / r.width;
    const ky = H / r.height;
    for (const d of Object.keys(this.nodes) as Dest[]) {
      const b = this.nodes[d].getBoundingClientRect();
      this.boxes[d] = {
        cx: (b.left - r.left + b.width / 2) * kx,
        cy: (b.top - r.top + b.height / 2) * ky,
        hw: (b.width / 2) * kx,
        hh: (b.height / 2) * ky,
      };
    }
  }

  private buildRoute(legs: { edge: EdgeId; back: boolean }[]): Route {
    const pts: Pt[] = [];
    for (const leg of legs) {
      const e = this.edges[leg.edge];
      // Entre una arista y la siguiente el tramo recto queda tapado por el nodo.
      pts.push(...(leg.back ? [...e].reverse() : e));
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, cum, len: cum[cum.length - 1] };
  }

  private spawn(it: SwarmItem, delay: number) {
    const conf = Math.max(0, Math.min(1, it.confidence));
    const p: Particle = {
      id: it.id,
      real: it.real,
      dest: it.dest,
      at: null,
      route: null,
      s: 0,
      idx: 0,
      v: 250 + Math.random() * 110,
      delay: Math.max(0, delay),
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      ox: 0,
      oy: 0,
      r: 1.5 + 1.7 * conf,
      alpha: 0.45 + 0.55 * conf,
      shown: 0,
      sprite: sprite(it.shifted ? SHIFT_COLOR : (PRIORITY_COLOR[it.priority] ?? FALLBACK_COLOR)),
      ang: 0,
      phase: Math.random() * Math.PI * 2,
      spin: (0.06 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1),
      off: Math.random(),
      flash: 0,
      leaving: false,
    };
    if (delay < 0) {
      // Recién enviada: el punto del lienzo ya hizo el recorrido; nace al final de su rama.
      const legs = FROM_POLICY[it.dest];
      const end = this.edges[legs[legs.length - 1]];
      const q = end[end.length - 1];
      Object.assign(p, { x: q.x, y: q.y, px: q.x, py: q.y, at: it.dest, flash: 1 });
      const b = this.boxes[it.dest];
      if (b) p.ang = this.ringParam(q.x, q.y, b);
    } else {
      const legs = ["in_clf", "clf_pol", ...FROM_POLICY[it.dest]].map((edge) => ({ edge: edge as EdgeId, back: false }));
      p.route = this.buildRoute(legs);
      p.at = it.dest;
      const q = p.route.pts[0];
      Object.assign(p, { x: q.x, y: q.y, px: q.x, py: q.y });
    }
    this.particles.set(it.id, p);
  }

  /** Lleva una partícula de su nodo a su destino: retrocede lo necesario y sigue por la otra rama. */
  private reroute(p: Particle, stagger = 0) {
    if (!p.at || p.at === p.dest) return;
    const a = FROM_POLICY[p.at];
    const b = FROM_POLICY[p.dest];
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    const legs = [
      ...a.slice(k).reverse().map((edge) => ({ edge, back: true })),
      ...b.slice(k).map((edge) => ({ edge, back: false })),
    ];
    p.route = this.buildRoute(legs);
    p.s = 0;
    p.idx = 0;
    p.v = 260 + Math.random() * 90;
    p.delay = stagger * 25;
    p.ox = p.x - p.route.pts[0].x;
    p.oy = p.y - p.route.pts[0].y;
    p.at = p.dest;
  }

  /** Inversa aproximada de ring(): en qué parte del perímetro cae un punto. */
  private ringParam(x: number, y: number, b: Box) {
    const rx = b.hw * 1.1 + 10;
    const ry = b.hh * 1.1 + 8;
    const per = 4 * (rx + ry);
    const dx = Math.max(-rx, Math.min(rx, x - b.cx));
    const dy = Math.max(-ry, Math.min(ry, y - b.cy));
    let d: number;
    if (Math.abs(dy) / ry >= Math.abs(dx) / rx) d = dy < 0 ? rx + dx : 2 * rx + 2 * ry + (rx - dx);
    else d = dx > 0 ? 2 * rx + (ry + dy) : 4 * rx + 2 * ry + (ry - dy);
    return (d / per) * Math.PI * 2;
  }

  private along(pts: Pt[], cum: number[], s: number, hint: number): [number, number, number] {
    let i = hint;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const f = Math.min(1, Math.max(0, (s - cum[i]) / seg));
    return [pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f, i];
  }

  /** Punto del anillo (rodea la caja del nodo). */
  private ring(p: Particle, dest: Dest, out: Pt) {
    const b = this.boxes[dest];
    if (!b) return;
    // Rectángulo alrededor de la caja recorrido a velocidad uniforme: sin grumos en las esquinas.
    const crowd = 4 + Math.min(8, this.particles.size * 0.05);
    const m = 5 + p.off * crowd;
    const rx = b.hw * 1.1 + m;
    const ry = b.hh * 1.1 + m * 0.8;
    const per = 4 * (rx + ry);
    let d = (((p.ang / (Math.PI * 2)) % 1) + 1) % 1 * per;
    // Desde la esquina superior izquierda, en sentido horario.
    if (d < 2 * rx) return void ((out.x = b.cx - rx + d), (out.y = b.cy - ry));
    d -= 2 * rx;
    if (d < 2 * ry) return void ((out.x = b.cx + rx), (out.y = b.cy - ry + d));
    d -= 2 * ry;
    if (d < 2 * rx) return void ((out.x = b.cx + rx - d), (out.y = b.cy + ry));
    d -= 2 * rx;
    out.x = b.cx - rx;
    out.y = b.cy + ry - d;
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.visible || !this.onScreen) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    let busy = false;
    for (const p of this.particles.values()) if (p.route || p.flash > 0.01 || p.leaving) busy = true;
    // En reposo (o en móvil) basta con 30 fps: el anillo y las chispas son lentos.
    const minGap = this.opts.lite || !busy ? 30 : 0;
    if (now - this.lastPaint >= minGap) {
      const step = Math.min(0.05, (now - (this.lastPaint || now)) / 1000) || dt;
      this.lastPaint = now;
      this.update(step);
      this.draw();
      if (!this.started) {
        this.started = true;
        this.opts.onStart?.();
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.time += dt;
    const target: Pt = { x: 0, y: 0 };
    const settle = 1 - Math.exp(-dt * 5);
    for (const p of this.particles.values()) {
      p.px = p.x;
      p.py = p.y;
      const focus = this.filter && p.real !== this.filter ? 0.12 : this.hot && p.at === this.hot && !p.route ? 1.4 : 1;
      const goal = p.leaving ? 0 : focus;
      p.shown += (goal - p.shown) * (1 - Math.exp(-dt * 6));
      if (p.leaving && p.shown < 0.02) {
        this.particles.delete(p.id);
        continue;
      }
      p.flash *= Math.exp(-dt * 2.2);
      if (p.route) {
        if (p.delay > 0) {
          p.delay -= dt * 1000;
          continue;
        }
        p.s += p.v * dt;
        const [x, y, i] = this.along(p.route.pts, p.route.cum, p.s, p.idx);
        p.idx = i;
        const k = Math.exp(-(p.s / p.v) * 8);
        p.x = x + p.ox * k;
        p.y = y + p.oy * k;
        if (p.s >= p.route.len) {
          p.route = null;
          p.ox = p.oy = 0;
          // El anillo empieza donde llegó, sin saltos.
          const b = this.boxes[p.at!];
          if (b) p.ang = this.ringParam(p.x, p.y, b);
          if (p.at !== p.dest) this.reroute(p);
        }
      } else if (p.at) {
        // Llega por un punto y se desliza por el anillo hasta su sitio, que gira despacio.
        p.phase += p.spin * dt * (this.hot === p.at ? 2.5 : 1);
        let d = (p.phase - p.ang) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        p.ang += d * (1 - Math.exp(-dt * 1.6));
        this.ring(p, p.at, target);
        p.x += (target.x - p.x) * settle;
        p.y += (target.y - p.y) * settle;
      }
    }

    const total = this.total || 1;
    for (const id of Object.keys(this.edges) as EdgeId[]) {
      const n = this.flow[id] ?? 0;
      if (n <= 0) continue;
      const rate = (0.7 + 3.2 * (n / total)) * (this.opts.lite ? 0.5 : 1);
      this.spawnAcc[id] += rate * dt;
      while (this.spawnAcc[id] >= 1) {
        this.spawnAcc[id] -= 1;
        this.sparks.push({ edge: id, s: 0, v: 120 + Math.random() * 60, idx: 0 });
      }
    }
    this.sparks = this.sparks.filter((sp) => {
      sp.s += sp.v * dt;
      return sp.s < this.edgeLen(sp.edge);
    });
  }

  private lens = {} as Record<EdgeId, number[]>;
  private edgeCum(id: EdgeId) {
    let c = this.lens[id];
    if (!c) {
      const e = this.edges[id];
      c = [0];
      for (let i = 1; i < e.length; i++) c.push(c[i - 1] + Math.hypot(e[i].x - e[i - 1].x, e[i].y - e[i - 1].y));
      this.lens[id] = c;
    }
    return c;
  }
  private edgeLen(id: EdgeId) {
    const c = this.edgeCum(id);
    return c[c.length - 1];
  }

  private draw() {
    const g = this.ctx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.restore();
    g.globalCompositeOperation = "lighter";

    for (const sp of this.sparks) {
      const cum = this.edgeCum(sp.edge);
      const len = cum[cum.length - 1];
      const [x, y, i] = this.along(this.edges[sp.edge], cum, sp.s, sp.idx);
      sp.idx = i;
      const f = sp.s / len;
      g.globalAlpha = 0.65 * Math.min(1, f * 6, (1 - f) * 6);
      g.drawImage(sprite(EDGE_COLOR[sp.edge]), x - 6, y - 6, 12, 12);
    }

    g.lineCap = "round";
    for (const p of this.particles.values()) {
      if (p.delay > 0 && p.route) continue;
      const a = Math.min(1, p.alpha * p.shown);
      if (a < 0.01) continue;
      const r = p.r * (p.shown > 1 ? 1.2 : 1);
      if (!this.opts.lite && p.route) {
        const dx = p.x - p.px;
        const dy = p.y - p.py;
        if (dx * dx + dy * dy > 0.4) {
          g.globalAlpha = a * 0.35;
          g.strokeStyle = "#9fb8ff";
          g.lineWidth = r * 1.2;
          g.beginPath();
          g.moveTo(p.x - dx * 3, p.y - dy * 3);
          g.lineTo(p.x, p.y);
          g.stroke();
        }
      }
      g.globalAlpha = a;
      const R = r * 2.6;
      g.drawImage(p.sprite, p.x - R, p.y - R, R * 2, R * 2);
      if (p.flash > 0.02) {
        g.globalAlpha = p.flash * 0.8;
        g.strokeStyle = "#ffffff";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(p.x, p.y, 4 + (1 - p.flash) * 26, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}

export const destOf = (real: Real): Dest => REAL_DEST[real];
