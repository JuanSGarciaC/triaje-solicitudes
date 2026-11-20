import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A7 count-up: el número viaja hasta su nuevo valor. `fromZero`: también al montar. */
export function useCountUp(value: number, { ms = 420, fromZero = false } = {}) {
  const initial = fromZero && !reducedMotion() ? 0 : value;
  const [shown, setShown] = useState(initial);
  const current = useRef(initial);

  useEffect(() => {
    const start = current.current;
    if (start === value || reducedMotion()) {
      current.current = value;
      return setShown(value);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, now - t0) / ms);
      const v = start + (value - start) * (1 - (1 - k) ** 3);
      current.current = k === 1 ? value : v;
      setShown(current.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return shown;
}

export function CountUp({ value, format = (v) => String(Math.round(v)), fromZero }: {
  value: number;
  format?: (v: number) => string;
  fromZero?: boolean;
}) {
  return <>{format(useCountUp(value, { fromZero }))}</>;
}

/**
 * B2 typewriter sin mover el layout: el texto pendiente ocupa su sitio, invisible.
 * Los lectores de pantalla (y las pruebas) leen siempre el texto completo.
 */
export function Typed({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(text.length);

  useLayoutEffect(() => {
    if (!animate || reducedMotion()) return setN(text.length);
    setN(0);
    const dur = Math.min(650, 220 + text.length * 4);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, now - t0) / dur);
      setN(Math.ceil(text.length * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, animate]);

  const typing = n < text.length;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, n)}
        {typing && <span className="typed-caret" />}
        <span className="typed-rest">{text.slice(n)}</span>
      </span>
    </>
  );
}
