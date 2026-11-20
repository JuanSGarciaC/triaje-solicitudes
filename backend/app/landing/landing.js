// Efectos de la página de presentación. Sin dependencias. Sin JS, todo el contenido ya está en el HTML.
(() => {
  window.landingReady = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = matchMedia("(min-width: 768px)");

  // B1: el titular entra palabra por palabra. El texto completo queda en aria-label.
  const title = document.querySelector(".split");
  if (title && !reduce) {
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute("aria-label", words.join(" "));
    title.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`).join(" ");
  }

  // A1 + A2: aparece al entrar en pantalla; los hermanos .reveal van en cascada.
  const reveals = [...document.querySelectorAll(".reveal")];
  if (reduce || !("IntersectionObserver" in window)) {
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
  const counts = document.querySelectorAll(".count");
  if (!reduce && "IntersectionObserver" in window) {
    const run = (el) => {
      const to = Number(el.dataset.to), suffix = el.dataset.suffix || "", t0 = performance.now(), ms = 1100;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / ms), eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
    }, { threshold: 0.6 });
    counts.forEach((el) => { el.textContent = "0" + (el.dataset.suffix || ""); io.observe(el); });
  }

  // H4: comparación cruda / clasificada con un divisor arrastrable.
  const story = document.querySelector(".story");
  const compare = story.querySelector(".compare");
  const slider = compare.querySelector(".slider");
  const setCut = (v) => { compare.style.setProperty("--cut", `${v}%`); slider.value = v; };
  if (!reduce) {
    compare.classList.add("on");
    slider.hidden = false;
    setCut(50);
    slider.addEventListener("input", () => setCut(Number(slider.value)));
    slider.addEventListener("pointerdown", () => compare.classList.add("dragging"));
    addEventListener("pointerup", () => compare.classList.remove("dragging"));
  }

  // C5: en escritorio la tarjeta queda fija y cada paso la completa.
  const steps = [...story.querySelectorAll(".step")];
  const cutFor = { 1: 100, 2: 50, 3: 0, 4: 0 };
  let stepIO = null;
  const setStep = (n) => {
    if (story.dataset.step === n) return;
    story.dataset.step = n;
    steps.forEach((s) => s.classList.toggle("active", s.dataset.step === n));
    setCut(cutFor[n]);
  };
  const enableScrolly = () => {
    if (reduce || !desktop.matches || stepIO || !("IntersectionObserver" in window)) return;
    story.classList.add("scrolly");
    setStep("1");
    // El paso activo es el que cruza la línea central de la pantalla.
    stepIO = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setStep(e.target.dataset.step);
    }, { rootMargin: "-50% 0px -50% 0px" });
    steps.forEach((s) => stepIO.observe(s));
  };
  const disableScrolly = () => {
    if (!stepIO) return;
    stepIO.disconnect();
    stepIO = null;
    story.classList.remove("scrolly");
    delete story.dataset.step;
    steps.forEach((s) => s.classList.remove("active"));
    if (!reduce) setCut(50);
  };
  enableScrolly();
  desktop.addEventListener("change", () => (desktop.matches ? enableScrolly() : disableScrolly()));
})();
