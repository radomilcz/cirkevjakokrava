// Zvonec One offers two palettes only: Krém a hlína (cream-clay, light) and Hlína a růžová (clay-pink, dark), plus
// Podle zařízení (no data-palette: palettes.css picks one by the device). A palette chosen in Next or Simple that One
// does not offer is SHOWN here as its scheme's palette (light → Krém a hlína, dark → Hlína a růžová); the stored
// choice is not rewritten, so Next and Simple keep it. A classic script after ui/palette.js, before the first paint;
// it runs again on every 'zvonec:appearance' event (a palette chosen in the picker).
(function () {
  var OFFERED = { 'cream-clay': 'light', 'clay-pink': 'dark' };
  var root = document.documentElement;
  function limit() {
    var palette = root.getAttribute('data-palette');
    if (!palette || OFFERED[palette]) return;
    var dark = root.getAttribute('data-theme') === 'dark';
    root.setAttribute('data-palette', dark ? 'clay-pink' : 'cream-clay');
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  limit();
  document.addEventListener('zvonec:appearance', limit);
})();
