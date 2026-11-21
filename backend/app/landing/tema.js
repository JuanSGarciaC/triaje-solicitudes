// Tema de color: ?tema=a|b|c|actual, recordado en localStorage. Se carga en <head> antes de pintar.
(function () {
  var temas = ["a", "b", "c", "actual"];
  var q = new URLSearchParams(location.search).get("tema");
  try {
    if (temas.indexOf(q) >= 0) localStorage.setItem("sello-tema", q);
    var t = localStorage.getItem("sello-tema");
  } catch (e) { t = q; }
  if (t && t !== "actual" && temas.indexOf(t) >= 0) document.documentElement.setAttribute("data-tema", t);
})();
