// Colour choice – the same palettes and the same bullseye as Otázky na tělo.
// Colours live in :root[data-palette]; this script only switches that attribute and remembers the
// choice in localStorage. It runs in <head> (a classic script, not a module) so the saved palette
// applies before the first paint and the page does not flash. Without a choice the device decides
// (light or dark mode).
(function () {
  var KEY = 'zvonec-palette';
  var root = document.documentElement;

  function save(name) {
    try {
      if (name) localStorage.setItem(KEY, name);
      else localStorage.removeItem(KEY);
    } catch (error) { /* works without storage too, the choice is just not remembered */ }
  }

  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var color = getComputedStyle(root).getPropertyValue('--ground').trim();
    if (meta && color) meta.setAttribute('content', color);
  }

  try {
    var saved = localStorage.getItem(KEY);
    if (saved) root.dataset.palette = saved;
  } catch (error) { /* see above */ }

  document.addEventListener('DOMContentLoaded', function () {
    syncThemeColor();
    if (window.matchMedia) {
      var scheme = window.matchMedia('(prefers-color-scheme: dark)');
      if (scheme.addEventListener) scheme.addEventListener('change', syncThemeColor);
    }
    var wrap = document.querySelector('.palette');
    if (!wrap) return;
    var toggle = wrap.querySelector('.switcher');
    var menu = wrap.querySelector('.palette-menu');
    var options = Array.prototype.slice.call(menu.querySelectorAll('button'));

    function markChecked() {
      var current = root.dataset.palette || '';
      options.forEach(function (option) {
        option.setAttribute('aria-checked', String(option.dataset.palette === current));
      });
    }

    function close() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    function open() {
      markChecked();
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      if (menu.hidden) open(); else close();
    });

    options.forEach(function (option) {
      option.addEventListener('click', function () {
        if (option.dataset.palette) root.dataset.palette = option.dataset.palette;
        else delete root.dataset.palette;
        save(option.dataset.palette);
        syncThemeColor();
        markChecked();
        close();
        toggle.focus();
      });
    });

    document.addEventListener('click', function (event) {
      if (!menu.hidden && !wrap.contains(event.target)) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) { close(); toggle.focus(); }
    });
  });
})();
