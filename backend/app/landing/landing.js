// Efectos de la presentación. Sin dependencias. Sin JS, todo el contenido ya está en el HTML.
(() => {
  window.landingReady = true;
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = matchMedia("(min-width: 768px)");
  const hasIO = "IntersectionObserver" in window;

  // B1: el titular entra palabra por palabra. El texto completo queda en aria-label.
  const title = document.querySelector(".split");
  if (title && !reduce) {
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute("aria-label", words.join(" "));
    title.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`).join(" ");
  }

  // A1 + A2: aparece al entrar en pantalla; los hermanos .reveal van en cascada.
  const reveals = [...document.querySelectorAll(".reveal")];
  if (reduce || !hasIO) {
    reveals.forEach((el) => el.classList.add("in"));
  } else {
    reveals.forEach((el) => {
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
      el.style.setProperty("--i", sibs.indexOf(el));
    });
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px" });
    reveals.forEach((el) => io.observe(el));
  }

  // A7: las cifras cuentan hasta su valor (el HTML ya trae el valor final).
  if (!reduce && hasIO) {
    const run = (el) => {
      const to = Number(el.dataset.to), suffix = el.dataset.suffix || "", t0 = performance.now(), ms = 900;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
    }, { threshold: 0.6 });
    document.querySelectorAll(".count").forEach((el) => { el.textContent = "0" + (el.dataset.suffix || ""); io.observe(el); });
  }

  // C13: el fondo pasa de tinta a papel según la sección que cruza el centro de la pantalla.
  if (!reduce && hasIO) {
    const toned = [...document.querySelectorAll("main > section[data-tone], footer[data-tone]")];
    root.classList.add("c13");
    document.body.dataset.tone = toned[0].dataset.tone;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) document.body.dataset.tone = e.target.dataset.tone;
    }, { rootMargin: "-50% 0px -50% 0px" });
    toned.forEach((s) => io.observe(s));
  }

  // H4: comparación cruda / clasificada con un divisor arrastrable, en cada tique.
  const cases = document.querySelector(".cases");
  const setCut = (compare, v) => {
    compare.style.setProperty("--cut", `${v}%`);
    compare.querySelector(".slider").value = v;
  };
  if (!reduce) {
    cases.classList.add("compare-on");
    cases.querySelectorAll(".compare").forEach((compare) => {
      const slider = compare.querySelector(".slider");
      compare.classList.add("on");
      slider.hidden = false;
      setCut(compare, 50);
      slider.addEventListener("input", () => setCut(compare, Number(slider.value)));
      slider.addEventListener("pointerdown", () => compare.classList.add("dragging"));
    });
    addEventListener("pointerup", () => cases.querySelectorAll(".dragging").forEach((c) => c.classList.remove("dragging")));
  }

  // Prueba tu solicitud: se clasifica en el servidor y se descarta. El texto del visitante solo se pinta con textContent.
  const tryForm = document.querySelector(".try-form");
  if (tryForm && window.fetch) {
    const area = tryForm.querySelector("textarea"), count = tryForm.querySelector(".try-count");
    const err = tryForm.querySelector(".try-error"), btn = tryForm.querySelector("button[type=submit]");
    const out = document.querySelector(".try-out");
    const CAT = { acceso_cuentas: "Acceso y cuentas", hardware: "Equipos", software: "Software", red_conectividad: "Red y conectividad", nuevo_servicio: "Nuevo servicio", otro: "Otro" };
    const pct = (v) => `${Math.round(v * 100)} %`;
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const reasonText = (r, o) => ({
      model_failed: "El modelo no respondió: pasa a una persona con confianza 0",
      sensitive_priority: `Prioridad ${o.priority}: siempre la revisa una persona`,
      low_confidence: `Confianza ${pct(o.confidence)}, por debajo del umbral de ${pct(o.threshold)}`,
    })[r] || r;
    const render = (o) => {
      const t = el("div", `ticket band-${o.priority === "alta" ? "alta" : "media"}`);
      const head = el("p", "t-head"); head.append(el("span", null, "Prueba · no guardada"), el("span", null, o.classifier.startsWith("mock") ? "Reglas" : o.classifier.split(":")[0]));
      const dl = el("dl", "fields");
      for (const [k, v] of [["Categoría", CAT[o.category] || o.category], ["Prioridad", o.priority], ["Confianza", pct(o.confidence)]]) {
        const d = el("div"); d.append(el("dt", null, k));
        const dd = el("dd"); dd.append(k === "Prioridad" ? el("span", `prio ${o.priority}`, v) : document.createTextNode(v)); d.append(dd); dl.append(d);
      }
      const ul = el("ul", "reasons");
      (o.reasons.length ? o.reasons.map((r) => reasonText(r, o)) : [`Confianza ${pct(o.confidence)} sobre el umbral de ${pct(o.threshold)} y prioridad ${o.priority}`]).forEach((r) => ul.append(el("li", null, r)));
      const stamps = el("div", "stamps"); stamps.append(el("span", `stamp ${o.status === "auto_approved" ? "st-auto" : "st-review"}`, o.status === "auto_approved" ? "Aprobada sola" : "Revisión humana"));
      t.append(head, dl, ul, stamps);
      if (o.rules_fallback) t.append(el("p", "note", "El modelo de lenguaje no está disponible: respondió el clasificador de reglas."));
      if (o.classifier.startsWith("mock")) t.append(el("p", "note", "Demo con reglas por palabras clave: aciertan la categoría 6 de 10 veces; Gemini, 9 de 10. Por eso existe el sello humano."));
      out.replaceChildren(t);
    };
    const run = async (body) => {
      err.textContent = ""; btn.disabled = true;
      try {
        const r = await fetch("/api/classify/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(typeof data?.detail === "string" ? data.detail : r.status === 422 ? "Escribe entre 10 y 1000 caracteres." : `Error ${r.status}`);
        render(data);
      } catch (e) { err.textContent = e.message === "Failed to fetch" ? "No se pudo conectar con el servidor." : e.message; }
      finally { btn.disabled = false; }
    };
    tryForm.hidden = false;
    area.addEventListener("input", () => (count.textContent = `${area.value.length}/1000`));
    tryForm.addEventListener("submit", (e) => { e.preventDefault(); run(area.value); });
    tryForm.querySelectorAll(".try-samples button").forEach((b) => b.addEventListener("click", () => {
      area.value = b.dataset.text; count.textContent = `${area.value.length}/1000`; run(area.value);
    }));
  }

  // C4 (estrella): en escritorio se ve un caso a la vez; su tique queda fijo y recibe los sellos paso a paso.
  const caseEls = [...cases.querySelectorAll(".case")];
  const tabs = cases.querySelector(".tabs");
  const cutFor = { 1: 100, 2: 50, 3: 0, 4: 0 };
  const setStep = (c, n) => {
    if (c.dataset.step === n) return;
    c.dataset.step = n;
    c.querySelectorAll(".step").forEach((s) => s.classList.toggle("active", s.dataset.step === n));
    if (!reduce) setCut(c.querySelector(".compare"), cutFor[n]);
  };
  const show = (name) => {
    caseEls.forEach((c) => (c.hidden = c.dataset.case !== name));
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.show === name)));
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    show(b.dataset.show);
    cases.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
  let stepIO = null;
  const enable = () => {
    if (reduce || !desktop.matches || stepIO || !hasIO) return;
    cases.classList.add("on");
    tabs.hidden = false;
    show("auto");
    caseEls.forEach((c) => setStep(c, "1"));
    // El paso activo es el que cruza la línea central de la pantalla.
    stepIO = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setStep(e.target.closest(".case"), e.target.dataset.step);
    }, { rootMargin: "-50% 0px -50% 0px" });
    cases.querySelectorAll(".step").forEach((s) => stepIO.observe(s));
  };
  const disable = () => {
    if (!stepIO) return;
    stepIO.disconnect();
    stepIO = null;
    cases.classList.remove("on");
    tabs.hidden = true;
    caseEls.forEach((c) => {
      c.hidden = false;
      delete c.dataset.step;
      c.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
      if (!reduce) setCut(c.querySelector(".compare"), 50);
    });
  };
  enable();
  desktop.addEventListener("change", () => (desktop.matches ? enable() : disable()));
})();
