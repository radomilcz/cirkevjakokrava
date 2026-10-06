// Appearance: the mode – light, dark, or the device decides.
// <html data-theme="light|dark"> (absent = follow the device), remembered in localStorage (zvonec-theme);
// a link may set it too: ?rezim=svetly|tmavy|zarizeni (for sharing a link – the choice is kept).
// A classic script in <head> (not a module): it applies the choice before the first paint, so the page
// does not flash, and then wires the header menu „Vzhled“ (static markup in index.html: one radio group
// per setting). Other code (Můj účet) uses window.zvonecAppearance: { theme(), setTheme(v), current() }
// and listens for the 'zvonec:appearance' event on document.
// Another setting (e.g. a palette) = a key in storage, an apply function, a getter and setter on the api,
// an entry in CHOICES and a radio group in index.html whose buttons carry data-<name>-choice.
(function () {
  var THEME_KEY = 'zvonec-theme';
  var THEMES = ['light', 'dark'];
  var root = document.documentElement;

  function read(key) { try { return localStorage.getItem(key); } catch (error) { return null; } }
  function write(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (error) { /* works without storage, just not remembered */ }
  }

  // the old colour palettes (before the redesign) become a theme once; the old second look is gone
  var old = read('zvonec-palette');
  if (old) {
    var dark = { 'clay-pink': 1, 'blue-cream': 1, 'green-cream': 1, 'green-pink': 1 };
    if (!read(THEME_KEY)) write(THEME_KEY, dark[old] ? 'dark' : 'light');
    write('zvonec-palette', null);
  }
  write('zvonec-look', null);

  function applyTheme(value) {
    if (THEMES.indexOf(value) >= 0) root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
  }

  // a link may carry the choice: ?rezim=tmavy
  var query = {};
  try { query = Object.fromEntries(new URLSearchParams(location.search)); } catch (error) { /* old browser: no link choice */ }
  var fromLink = { svetly: 'light', tmavy: 'dark', zarizeni: '' }[query.rezim];
  if (fromLink !== undefined) write(THEME_KEY, fromLink);

  applyTheme(read(THEME_KEY));

  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var color = getComputedStyle(root).getPropertyValue('--surface-chrome').trim();
    if (meta && color) meta.setAttribute('content', color);
  }

  function announce() {
    syncThemeColor();
    try { document.dispatchEvent(new CustomEvent('zvonec:appearance', { detail: api.current() })); } catch (error) { /* no listeners then */ }
  }

  var api = {
    theme: function () { return root.getAttribute('data-theme') || ''; },
    current: function () { return { theme: api.theme() }; },
    /** '' = the device decides, 'light', 'dark' */
    setTheme: function (value) { applyTheme(value); write(THEME_KEY, THEMES.indexOf(value) >= 0 ? value : ''); announce(); },
  };
  window.zvonecAppearance = api;

  // the settings of the menu: the attribute its buttons carry → the current value and how to set it
  var CHOICES = {
    'data-theme-choice': { get: api.theme, set: api.setTheme },
  };

  document.addEventListener('DOMContentLoaded', function () {
    syncThemeColor();
    if (window.matchMedia) {
      var scheme = window.matchMedia('(prefers-color-scheme: dark)');
      if (scheme.addEventListener) scheme.addEventListener('change', syncThemeColor);
    }
    var wrap = document.querySelector('.look');
    if (!wrap) return;
    var toggle = wrap.querySelector('.look-toggle');
    var menu = wrap.querySelector('.look-menu');
    var attrs = Object.keys(CHOICES);
    var options = Array.prototype.slice.call(menu.querySelectorAll(attrs.map(function (a) { return '[' + a + ']'; }).join(', ')));
    function choiceOf(option) {
      for (var i = 0; i < attrs.length; i++) if (option.hasAttribute(attrs[i])) return { setting: CHOICES[attrs[i]], value: option.getAttribute(attrs[i]) };
      return null;
    }

    function mark() {
      options.forEach(function (option) {
        var choice = choiceOf(option);
        var on = choice.value === choice.setting.get();
        option.setAttribute('aria-checked', String(on));
        option.tabIndex = on ? 0 : -1;
      });
    }
    function close(focus) {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (focus) toggle.focus();
    }
    function open() {
      mark();
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      var checked = menu.querySelector('[aria-checked="true"]');
      if (checked) checked.focus();
    }
    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      if (menu.hidden) open(); else close(false);
    });
    options.forEach(function (option) {
      option.addEventListener('click', function () {
        var choice = choiceOf(option);
        choice.setting.set(choice.value);
        mark();
        option.focus();
      });
    });
    // arrow keys move inside each radio group (the usual radio behaviour)
    menu.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) < 0) return;
      var group = event.target.closest('[role="radiogroup"]');
      if (!group) return;
      event.preventDefault();
      var items = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
      var i = items.indexOf(event.target);
      var step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      var next = items[(i + step + items.length) % items.length];
      next.click();
    });
    document.addEventListener('click', function (event) {
      if (!menu.hidden && !wrap.contains(event.target)) close(false);
    });
    document.addEventListener('zvonec:appearance', mark);
    document.addEventListener('zvonec:navigate', function () { close(false); });
  });
})();
