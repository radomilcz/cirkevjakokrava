// Volba barev – stejné palety a stejný terč jako v Otázkách na tělo.
// Barvy drží :root[data-paleta]; skript jen přepíná ten atribut a pamatuje si volbu
// v localStorage. Běží v hlavičce (ne jako modul), aby se uložená paleta nasadila ještě
// před vykreslením a stránka neproblikla. Bez volby rozhoduje zařízení (světlý/tmavý režim).
(function () {
  var KLIC = 'rozpis-paleta';
  var koren = document.documentElement;

  function uloz(jmeno) {
    try {
      if (jmeno) localStorage.setItem(KLIC, jmeno);
      else localStorage.removeItem(KLIC);
    } catch (chyba) { /* bez paměti to taky jde, jen se volba nezapamatuje */ }
  }

  function prohlizec() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var barva = getComputedStyle(koren).getPropertyValue('--ground').trim();
    if (meta && barva) meta.setAttribute('content', barva);
  }

  try {
    var ulozena = localStorage.getItem(KLIC);
    if (ulozena) koren.dataset.paleta = ulozena;
  } catch (chyba) { /* viz výše */ }

  document.addEventListener('DOMContentLoaded', function () {
    prohlizec();
    if (window.matchMedia) {
      var rezim = window.matchMedia('(prefers-color-scheme: dark)');
      if (rezim.addEventListener) rezim.addEventListener('change', prohlizec);
    }
    var obal = document.querySelector('.paleta');
    if (!obal) return;
    var prepinac = obal.querySelector('.prepinac');
    var menu = obal.querySelector('.paleta-menu');
    var volby = Array.prototype.slice.call(menu.querySelectorAll('button'));

    function oznac() {
      var ted = koren.dataset.paleta || '';
      volby.forEach(function (volba) {
        volba.setAttribute('aria-checked', String(volba.dataset.paleta === ted));
      });
    }

    function zavri() {
      menu.hidden = true;
      prepinac.setAttribute('aria-expanded', 'false');
    }

    function otevri() {
      oznac();
      menu.hidden = false;
      prepinac.setAttribute('aria-expanded', 'true');
    }

    prepinac.addEventListener('click', function (udalost) {
      udalost.stopPropagation();
      if (menu.hidden) otevri(); else zavri();
    });

    volby.forEach(function (volba) {
      volba.addEventListener('click', function () {
        if (volba.dataset.paleta) koren.dataset.paleta = volba.dataset.paleta;
        else delete koren.dataset.paleta;
        uloz(volba.dataset.paleta);
        prohlizec();
        oznac();
        zavri();
        prepinac.focus();
      });
    });

    document.addEventListener('click', function (udalost) {
      if (!menu.hidden && !obal.contains(udalost.target)) zavri();
    });
    document.addEventListener('keydown', function (udalost) {
      if (udalost.key === 'Escape' && !menu.hidden) { zavri(); prepinac.focus(); }
    });
  });
})();
