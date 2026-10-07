#!/usr/bin/env node
// Zvonec – the brand palettes (the ground / ink pairs of the website and of Otázky na tělo) → the full
// colour token set of the app, verified for contrast. Writes docs/zvonec/css/palettes.css.
//
//   node zvonec/palettes.mjs                  regenerate docs/zvonec/css/palettes.css
//   node zvonec/palettes.mjs --report x.md    … and write every contrast check to x.md
//   node zvonec/palettes.mjs --check          exit 1 when a kept palette fails or palettes.css is stale
//
// Model (one recipe for every palette):
//   chrome (sidebar)  = the palette's GROUND in light palettes; a deeper ground in dark ones
//   stage (window)    = a lighter window in light palettes; the GROUND itself in dark ones
//   panel / overlay   = cards, dialogs (lighter = closer); hero = the band of every page head
//   text-1 = the INK (a shade deeper in light palettes) or the ink lifted to near white (dark ones);
//   primary = the INK as a solid. text-2 / text-3 / line-strong / line-field = the ink mixed back toward the
//   ground ("ink at x %", the website's own method), solved so every check passes with a margin.
//   gray / accent steps 1–8 = an ink shade over the stage at Radix-like alphas → exact alpha twins.
//   Status + categorical hues: Radix 12-step scales; text steps re-fitted until they read on this ground;
//   in dark palettes every solid is light enough to be a 3:1 icon and carries the dark ink.
// cream-clay and clay-pink ARE the scales of css/tokens.css (read from it, not re-derived); the generator
// adds the semantic layer and the fixes the verification asks for (reported as notes).
// Palettes that cannot pass (the two green pairs: no light ink reaches 4.5:1 on #498660) are reported and
// left out of the CSS.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------- OKLCH <-> sRGB, WCAG contrast, Radix alpha twins ----------
const hex2rgb = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255); };
const rgb2hex = c => '#' + c.map(v => Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('');
const toLin = v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4;
const fromLin = v => v <= 0.0031308 ? 12.92*v : 1.055*v**(1/2.4) - 0.055;
function rgb2oklch(rgb){
  const [r,g,b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  const L = 0.2104542553*l+0.7936177850*m-0.0040720468*s;
  const A = 1.9779984951*l-2.4285922050*m+0.4505937099*s;
  const B = 0.0259040371*l+0.7827717662*m-0.8086757660*s;
  return [L, Math.hypot(A,B), ((Math.atan2(B,A)*180/Math.PI)+360)%360];
}
function oklch2lin([L,C,H]){
  const a = C*Math.cos(H*Math.PI/180), b = C*Math.sin(H*Math.PI/180);
  const l = (L+0.3963377774*a+0.2158037573*b)**3, m = (L-0.1055613458*a-0.0638541728*b)**3, s = (L-0.0894841775*a-1.2914855480*b)**3;
  return [4.0767416621*l-3.3077115913*m+0.2309699292*s, -1.2684380046*l+2.6097574011*m-0.3413193965*s, -0.0041960863*l-0.7034186147*m+1.7076147010*s];
}
function oklch2rgb(lch){
  let [L,C,H] = lch;
  for (let i=0;i<60;i++){ const lin = oklch2lin([L,C,H]); if (lin.every(v=>v>=-1e-4&&v<=1+1e-4)) return lin.map(v=>fromLin(Math.min(1,Math.max(0,v)))); C*=0.95; }
  return oklch2lin([L,0,H]).map(v=>fromLin(Math.min(1,Math.max(0,v))));
}
const oklchHex = (L,C,H) => rgb2hex(oklch2rgb([L,C,H]));
const lum = hex => { const [r,g,b] = hex2rgb(hex).map(toLin); return 0.2126*r+0.7152*g+0.0722*b; };
const contrast = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
// Radix-style alpha colour: the most transparent colour that reproduces `target` over `bg`
function alphaOf(target, bg){
  const t = hex2rgb(target).map(v=>v*255), b = hex2rgb(bg).map(v=>v*255);
  // per channel: darkening needs C ≤ t, lightening needs C ≥ t; the smallest alpha that allows both
  let a = 0;
  for (let i=0;i<3;i++){ const ai = t[i] < b[i] ? (b[i]-t[i])/b[i] : t[i] > b[i] ? (t[i]-b[i])/(255-b[i]) : 0; a = Math.max(a, ai); }
  a = Math.min(1, Math.ceil(a*1000)/1000);
  const c = t.map((v,i)=> a===0?0:Math.round(Math.min(255,Math.max(0,(v-(1-a)*b[i])/a))));
  return { css: `rgb(${c.join(' ')} / ${(+a.toFixed(3))})`, a };
}


// the tuned scales of the two existing themes, read from the live app tokens (light block, dark block)
const TOKENS = fileURLToPath(new URL('../docs/zvonec/css/tokens.css', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/zvonec/css/palettes.css', import.meta.url));
const REF = (() => {
  const css = readFileSync(TOKENS, 'utf8');
  const lightAt = css.indexOf('[data-theme="light"]'), darkAt = css.indexOf('[data-theme="dark"]', lightAt + 1);
  const end = css.indexOf('@media (prefers-color-scheme: dark)', darkAt);
  const parse = (txt) => {
    const S = {}, contrastText = {};
    for (const m of txt.matchAll(/--(gray|rose|green|amber|red|blue|plum|teal)-(\d+):\s*(#[0-9a-f]{6})/g)) (S[m[1]] ||= [])[+m[2] - 1] = m[3];
    for (const m of txt.matchAll(/--(gray|rose|green|amber|red|blue|plum|teal)-contrast:\s*(#[0-9a-f]{6})/g)) contrastText[m[1]] = m[2];
    return { S, contrastText };
  };
  const L = parse(css.slice(lightAt, darkAt)), D = parse(css.slice(darkAt, end));
  for (const [k, v] of Object.entries({ ...L.S, ...D.S })) if (!v || v.length !== 12) throw new Error(`tokens.css: scale ${k} incomplete`);
  return { S: { light: L.S, dark: D.S }, contrastText: { light: L.contrastText, dark: D.contrastText } };
})();
const lch = (hex) => rgb2oklch(hex2rgb(hex));
const fromLch = ([L, C, H]) => oklchHex(Math.max(0, Math.min(1, L)), Math.max(0, C), H);

// ---------- colour plumbing: hex or {hex, a} (an alpha colour), compositing ----------
const rgba = (hex, a) => ({ hex, a });
const isA = (c) => typeof c === 'object';
/** paint c over the opaque background bg (hex) → hex */
function over(c, bg) {
  if (!isA(c)) return c;
  const f = hex2rgb(c.hex), b = hex2rgb(bg);
  return rgb2hex(f.map((v, i) => v * c.a + b[i] * (1 - c.a)));
}
/** mix in sRGB: t of a, (1-t) of b (what color-mix(in srgb, a t%, b) gives) */
const mix = (a, b, t) => over(rgba(a, t), b);
const cssOf = (c) => {
  if (!isA(c)) return c;
  const [r, g, b] = hex2rgb(c.hex).map((v) => Math.round(v * 255));
  return `rgb(${r} ${g} ${b} / ${+c.a.toFixed(3)})`;
};
/** the exact alpha twin of an opaque step over the ground (Radix -aN) */
const twin = (hex, bg) => { const t = alphaOf(hex, bg); const m = t.css.match(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/); return rgba(rgb2hex([m[1], m[2], m[3]].map((v) => v / 255)), +m[4]); };

/** Lighten / darken a colour in OKLCH (hue and chroma kept) until it reaches `target` contrast on every
 *  background in `bgs`. dir = -1 darkens, +1 lightens. Returns the first passing colour. */
function fit(hex, bgs, target, dir) {
  let [L, C, H] = lch(hex);
  for (let i = 0; i < 400; i++) {
    const c = fromLch([L, C, H]);
    if (bgs.every((bg) => contrast(c, bg) >= target)) return c;
    L += dir * 0.0025;
    if (L <= 0 || L >= 1) break;
  }
  return fromLch([L, C, H]);
}
/** The ink mixed back toward `toward` as far as possible while still reaching `target` on every bg:
 *  "the ink at x %" – the most muted colour that still passes. */
function inkAt(ink, toward, bgs, target) {
  let best = ink;
  for (let t = 1; t >= 0.2; t -= 0.005) {
    const c = mix(ink, toward, t);
    if (bgs.every((bg) => contrast(c, bg) >= target)) best = c; else break;
  }
  return best;
}
const minC = (fg, bgs) => Math.min(...bgs.map((bg) => contrast(fg, bg)));

// ---------- the palettes (order = the picker grid, the same order as Otázky na tělo) ----------
// Otázky has nine pairs; Zvonec takes the five that carry small app text, and tests the two green ones.
const PALETTES = [
  { id: 'clay-pink',  label: 'Hlína a růžová', ground: '#3b2f2f', ink: '#e6acac', scheme: 'dark',  ref: 'dark' },
  { id: 'pink-clay',  label: 'Růžová a hlína', ground: '#e6acac', ink: '#3b2f2f', scheme: 'light', accent: 'ink', pick: 'ground' },
  { id: 'green-cream', label: 'Zelená a krém', ground: '#498660', ink: '#f9e7dd', scheme: 'dark', candidate: true },
  { id: 'blue-cream', label: 'Modrá a krém',   ground: '#464994', ink: '#f9e7dd', scheme: 'dark', accent: 'ink' },
  { id: 'cream-blue', label: 'Krém a modrá',   ground: '#f9e7dd', ink: '#464994', scheme: 'light', accent: 'ink' },
  { id: 'green-pink', label: 'Zelená a růžová', ground: '#498660', ink: '#e6acac', scheme: 'dark', candidate: true },
  { id: 'cream-clay', label: 'Krém a hlína',   ground: '#f9e7dd', ink: '#3b2f2f', scheme: 'light', ref: 'light' },
];
// "Podle zařízení": no data-palette → cream-clay, or clay-pink when the device is dark.
const DEVICE = { light: 'cream-clay', dark: 'clay-pink' };

// Radix-like alpha ladders (steps 1–8) – measured from the tuned clay gray (light) and clay gray (dark)
const A_LIGHT = [0, 0.035, 0.07, 0.10, 0.136, 0.178, 0.236, 0.33];
const A_DARK = [0, 0.031, 0.077, 0.113, 0.154, 0.199, 0.276, 0.398];
// accent ladder: a touch stronger than gray (selection must beat hover)
const A_ACCENT_L = [0.02, 0.045, 0.075, 0.11, 0.15, 0.19, 0.25, 0.34];
const A_ACCENT_D = [0.03, 0.06, 0.11, 0.16, 0.21, 0.26, 0.34, 0.46];

// status + categorical hues (hue, solid L/C per mode) – the same family as scales.mjs
const HUES = {
  green: { hue: 152, peakL: 0.10, peakD: 0.09,  l9: [0.50, 0.095], d9: [0.62, 0.10] },
  amber: { hue: 72,  peakL: 0.12, peakD: 0.10,  l9: [0.80, 0.135], d9: [0.80, 0.135] },
  red:   { hue: 28,  peakL: 0.16, peakD: 0.13,  l9: [0.555, 0.165], d9: [0.57, 0.165] },
  blue:  { hue: 279, peakL: 0.13, peakD: 0.12,  l9: [0.443, 0.121], d9: [0.555, 0.13] },
  plum:  { hue: 338, peakL: 0.11, peakD: 0.10,  l9: [0.52, 0.13],  d9: [0.555, 0.12] },
  teal:  { hue: 196, peakL: 0.08, peakD: 0.075, l9: [0.53, 0.085], d9: [0.64, 0.085] },
};
const CATEGORICAL = ['rose', 'blue', 'green', 'plum', 'teal', 'amber'];
const STATUS = { confirmed: 'green', waiting: 'amber', declined: 'red' };

// per-palette surface recipe (OKLCH); reference palettes keep the milnik values exactly
const SURFACES = {
  'cream-clay': { chrome: '#f9e7dd', app: '#fffaf6', panel: '#fffdfb', overlay: '#fffdfb', hover: '#fbefe8', hero: '#fdf0ea', heroLine: '#f0d9d1' },
  'clay-pink':  { chrome: '#2a2020', app: '#3b2f2f', panel: '#3e3232', overlay: '#443636', hover: '#453838', hero: '#433434', heroLine: rgba('#ffd2cd', 0.12) },
};

function surfacesFor(p) {
  if (SURFACES[p.id]) return SURFACES[p.id];
  const [L, C, H] = lch(p.ground);
  const [iL, iC, iH] = lch(p.ink);
  if (p.scheme === 'light') {
    if (L > 0.9) {
      // a cream ground: the same window as cream-clay; the head band stays warm (halfway between the
      // cream and the window – a cool ink-tinted band fought the cream sidebar), its hairline takes the ink
      return { chrome: p.ground, app: '#fffaf6', panel: '#fffdfb', overlay: '#fffdfb', hover: '#fbefe8',
        hero: mix(p.ground, '#fffaf6', 0.5), heroLine: mix(p.ink, p.ground, 0.12) };
    }
    // a mid-light ground (the pink): the brand has one pink, so it appears only as itself – the sidebar and a
    // selected row (pick: 'ground'). The window is cream-clay's warm white and the head band a hint of the ink:
    // a lighter pink window, band or fill read as further pinks.
    return { chrome: p.ground, app: '#fffaf6', panel: '#fffdfb', overlay: '#fffdfb', hover: mix(p.ink, '#fffaf6', 0.04),
      hero: mix(p.ink, '#fffaf6', 0.045), heroLine: mix(p.ink, '#fffaf6', 0.12) };
  }
  // dark: the ground is the stage; the sidebar deeper, cards and dialogs a little lighter
  const dC = C > 0.05 ? 0.92 : 1;
  // (a mid-dark ground like the blue has little headroom for meta text: the lifts stay small)
  return { chrome: fromLch([L - 0.065, C * dC, H]), app: p.ground, panel: fromLch([L + 0.008, C * 0.98, H]),
    overlay: fromLch([L + 0.022, C * 0.95, H]), hover: fromLch([L + 0.02, C * 0.96, H]),
    hero: fromLch([L + 0.016, C * 0.97, H]), heroLine: rgba(p.ink, 0.16) };
}

// ---------- build one palette ----------
function build(p) {
  const light = p.scheme === 'light';
  const su = surfacesFor(p);
  const T = {}; // resolved tokens: name → hex or {hex,a}
  const S = {}; // scales: name → { steps:[12], alpha:[12], contrast }
  const notes = [];

  // the surfaces each role sits on (opaque composites) – the same sets the verification uses
  const A_ = (n, k) => S[n].alpha[k - 1];
  const words = () => [su.app, su.panel, su.overlay, su.hero, over(A_('gray', 2), su.panel), over(A_('gray', 3), su.panel)];
  const countBg = () => (!light && !p.ref ? rgba(fromLch([0.2, lch(p.ground)[1] * 0.8, lch(p.ground)[2]]), 0.28) : A_('gray', 4));
  const meta = () => [...words(), ...(p.pick === 'ground' ? [p.ground] : []), over(A_('gray', 3), su.app), over(A_('gray', 2), su.overlay), su.chrome, su.hover,
    over(countBg(), su.chrome), over(countBg(), su.hero)];

  if (p.ref) {
    // ---- the two existing themes: tuned scales, milnik semantics ----
    const R = REF.S[p.ref];
    for (const [name, steps] of Object.entries(R)) {
      S[name] = { steps: [...steps], alpha: steps.map((s) => twin(s, R.gray[0])), contrast: REF.contrastText[p.ref][name] };
    }
  } else {
    const [gL, gC, gH] = lch(p.ground);
    const [iL, iC, iH] = lch(p.ink);
    // alpha base = the stage (gray-1 = the stage, Radix "app background")
    const base = su.app;
    // ---- gray: the ink's shade over the stage ----
    const mixInk = light ? fromLch([Math.min(iL, 0.24), iC * 1.05, iH]) : fromLch([0.97, Math.min(iC, 0.03), iH]);
    const ladder = light ? A_LIGHT : A_DARK;
    const gray = ladder.map((a) => mix(mixInk, base, a));
    // text-1: the ink; a light ink that is a colour (blue) goes one shade deeper so text-2 can sit
    // between it and the ground; in a dark palette the ink lifted to near white
    // (a deeper ink gives text-2 room between the two; the primary solid stays the exact ink)
    const text1 = light ? fromLch([iL - (iC > 0.05 ? 0.085 : 0.05), iC * (iC > 0.05 ? 0.92 : 1), iH]) : fromLch([Math.max(iL, 0.975), iC * 0.6, iH]);
    S.gray = { steps: gray };
    S.gray.alpha = gray.map((s) => twin(s, base));          // provisional, for the composites below
    // text-2 / text-3 / gray-9: the INK at x % toward the ground ("rgba(ink, x)" of the website),
    // as muted as possible while it still reaches its threshold on every surface it sits on
    const toward = light ? su.app : p.ground;
    const t2 = inkAt(p.ink, toward, meta(), 4.75);
    const t3 = inkAt(p.ink, toward, [su.app, su.panel, su.overlay, over(A_('gray', 2), su.panel)], 4.6);
    const g9 = inkAt(p.ink, toward, [su.app, su.panel, su.overlay, su.hero, su.chrome], 3.2);
    // keep the ramp monotonic: the ring (9) never darker than the placeholder text (10)
    const t3m = (light ? lch(g9)[0] < lch(t3)[0] : lch(g9)[0] > lch(t3)[0]) ? g9 : t3;
    gray.push(g9, t3m, t2, text1);
    S.gray.steps = gray;
    S.gray.alpha = gray.map((s) => twin(s, base));
    S.gray.contrast = light ? su.app : p.ground;

    // ---- accent ("rose"): selection, links, progress – rose in every palette ----
    if (light) {
      const deep = fromLch([0.47, 0.15, 14]);               // raspberry: the shade the selection tints from
      const rose = A_ACCENT_L.map((a) => mix(deep, base, a));
      const nine = '#e6acac';
      const ten = fromLch([lch(nine)[0] - 0.035, lch(nine)[1] + 0.008, lch(nine)[2]]);
      const twelve = fromLch([0.33, 0.07, 18]);
      S.rose = { steps: [...rose, nine, ten, fromLch([0.5, 0.13, 16]), twelve], contrast: '#3b2f2f' };
    } else {
      // rose as a rail of its own hue (pink alpha over a coloured ground reads as mauve mud)
      const rose = [-0.01, 0.012, 0.042, 0.07, 0.098, 0.13, 0.175, 0.245].map((x, i) => fromLch([gL + x, 0.1 * [0.45, 0.55, 0.68, 0.78, 0.86, 0.92, 0.96, 1][i], 8]));
      const nine = '#e6acac';
      const ten = fromLch([lch(nine)[0] + 0.035, lch(nine)[1] - 0.004, lch(nine)[2]]);
      const twelve = fromLch([0.945, 0.03, 20]);
      S.rose = { steps: [...rose, nine, ten, fromLch([0.82, 0.075, 18]), twelve], contrast: fromLch([0.24, Math.min(gC, 0.07), gH]) };
    }
    S.rose.alpha = S.rose.steps.map((s) => twin(s, base));

    // ---- status + categorical (steps 1–10; the text steps are fitted after the solids below) ----
    for (const [name, d] of Object.entries(HUES)) {
      let hue = d.hue;
      // on a blue ground the categorical blue moves toward cornflower, so a blue chip is not a hole in the page
      const cool = Math.abs(((gH - 279 + 540) % 360) - 180) < 30 && gC > 0.06;
      if (name === 'blue' && cool) hue = 252;
      if (name === 'plum' && cool && !light) hue = 322;   // keeps plum apart from the berry rose on the blue
      if (light) {
        S[name] = { steps: [...REF.S.light[name]], contrast: REF.contrastText.light[name] };   // the tuned light scale
      } else {
        const peak = d.peakD;
        const rail = [-0.01, 0.012, 0.042, 0.07, 0.098, 0.13, 0.175, 0.245].map((x) => gL + x);
        const cm = [0.45, 0.55, 0.68, 0.78, 0.86, 0.92, 0.96, 1];
        const steps = rail.map((L, i) => fromLch([L, peak * 1.2 * cm[i], hue]));
        const nine = name === 'blue' && hue !== d.hue ? fromLch([0.6, 0.12, hue]) : fromLch([d.d9[0], d.d9[1], hue]);
        const ten = fromLch([lch(nine)[0] + 0.035, lch(nine)[1], hue]);
        steps.push(nine, ten, fromLch([0.8, peak * 0.75, hue]), fromLch([0.94, peak * 0.3, hue]));
        S[name] = { steps, hue, peak };
      }
      S[name].alpha = S[name].steps.map((s) => twin(s, base));
      if (!S[name].contrast) {
        const paper = '#fffaf6', dark = fromLch([0.22, Math.min(gC, 0.07), gH]);
        S[name].contrast = contrast(S[name].steps[8], paper) >= contrast(S[name].steps[8], dark) ? paper : dark;
      }
    }
  }
  // ---- solids: a status solid is also an icon colour (✓ / ✕ / bars) → ≥ 3.2 : 1 on the dark surfaces;
  // the hover step moves away from its text, so the text on a hovered solid button still reads
  const pickText = (s9) => {
    const paper = '#fffaf6', deep = light ? '#2a1f1f' : fromLch([0.22, Math.min(lch(p.ground)[1], 0.07), lch(p.ground)[2]]);
    return contrast(s9, paper) >= contrast(s9, deep) ? paper : deep;
  };
  if (!light) {
    const iconBgs = [su.panel, su.app, su.overlay, su.hero];
    for (const name of ['green', 'red', 'blue', 'plum', 'teal']) {
      const st = S[name].steps;
      if (minC(st[8], iconBgs) >= 3.2 || (p.ref && !['green', 'red'].includes(name))) continue;
      const was = st[8];
      st[8] = fit(st[8], iconBgs, 3.2, +1);
      S[name].contrast = pickText(st[8]);
      st[9] = fromLch([lch(st[8])[0] + (lch(S[name].contrast)[0] > lch(st[8])[0] ? -0.035 : 0.035), lch(st[8])[1], lch(st[8])[2]]);
      notes.push(`${name}-9 ${was} → ${st[8]} (≥ 3.2 as an icon / bar on the dark surfaces; text on it ${S[name].contrast})`);
    }
  }
  for (const name of Object.keys(S)) {
    if (name === 'gray') continue;
    const st = S[name].steps, txt = S[name].contrast;
    if (contrast(st[9], txt) < 4.6) {
      const was = st[9];
      const away = lch(txt)[0] > lch(st[9])[0] ? -1 : +1;
      st[9] = fit(fromLch([lch(st[8])[0] + away * 0.03, lch(st[8])[1], lch(st[8])[2]]), [txt], 4.6, away);
      notes.push(`${name}-10 (hover) ${was} → ${st[9]} (text ${txt} stays ≥ 4.6)`);
    }
    if (contrast(st[8], txt) < 4.6 && name !== 'gray') {
      const alt = pickText(st[8]);
      if (contrast(st[8], alt) > contrast(st[8], txt)) { S[name].contrast = alt; notes.push(`${name}-contrast → ${alt}`); }
    }
    S[name].alpha = st.map((s) => twin(s, p.ref ? REF.S[p.ref].gray[0] : su.app));
  }
  if (!p.ref) {
    // text steps: 11 (status words, badge text, accent links) reads on every content surface and on the
    // /15 tint of its own solid; 12 (chip and callout text) on steps 3–5 of its own scale
    const dir = light ? -1 : +1;
    for (const name of [...Object.keys(HUES), 'rose']) {
      const st = S[name].steps;
      // the badge tint: /15 of the solid; the light accent badge tints with rose-11 itself (two passes)
      const tintOf = (c) => [su.app, su.panel, su.overlay, su.hero].map((bg) => over(rgba(c, 0.16), bg));
      let tints = light ? tintOf(name === 'rose' ? st[10] : st[8]) : [su.app, su.panel, su.overlay, su.hero].map((bg) => over(A_(name, 3), bg));
      if (name === 'rose' && light) { tints = tintOf(fit(st[10], [...words(), ...tints], 4.75, dir)); }
      if (name === 'red') tints = [...tints, over(rgba(st[8], 0.2), su.panel), over(rgba(st[8], 0.2), su.overlay)];   // danger button hover
      const roseSel = name === 'rose' ? [over(A_('rose', 3), su.panel), over(A_('rose', 4), su.panel)] : [];
      st[10] = fit(st[10], [...words(), ...tints, ...roseSel], 4.75, dir);
      st[11] = fit(st[11], [st[2], st[3], st[4], ...tints], 6, dir);
      if (!light && name === 'rose') st[11] = fit(st[11], tintOf(st[8]), 4.75, dir);   // badge-accent: rose-12 on the /14 pink
      S[name].alpha = st.map((s) => twin(s, su.app));
    }
  }
  const gray = S.gray.steps, rose = S.rose.steps;
  const A = (name, step) => S[name].alpha[step - 1];

  // ---------- semantic tokens (the milnik look) ----------
  Object.assign(T, {
    'surface-chrome': su.chrome, 'surface-app': su.app, 'surface-panel': su.panel, 'surface-overlay': su.overlay,
    'surface-hover': su.hover, 'milnik-hero': su.hero, 'milnik-hero-line': su.heroLine,
    'surface-sunken': A('gray', 2),
    'text-1': gray[11], 'text-2': gray[10],
    'text-3': p.ref === 'dark' ? mix(gray[9], gray[10], 0.6) : gray[9],
    'line-1': A('gray', 4), 'line-2': A('gray', 5), 'line-card-hover': A('gray', 7), 'line-control': A('gray', 7),
    'line-hover': A('gray', 9), 'line-strong': gray[8],
    'hover': A('gray', 3), 'pressed': A('gray', 4), 'soft': A('gray', 3), 'soft-hover': A('gray', 4),
    'count-bg': A('gray', 4), 'avatar-bg': A('gray', 4),
    'selected-bg': A('rose', 3), 'selected-bg-hover': A('rose', 4), 'selected-fg': gray[11], 'selected-line': A('rose', 7),
    'today-bg': A('rose', 2), 'focus': gray[11], 'focus-halo': A('gray', 3),
  });
  if (light) {
    Object.assign(T, {
      'milnik-accent': rose[10], 'milnik-accent-solid': rose[10], 'milnik-accent-soft': rose[10], 'milnik-badge-fg': rose[10],
      'primary-bg': p.ref ? gray[11] : p.ink, 'primary-bg-hover': p.ref ? '#534343' : fromLch([lch(p.ink)[0] + (lch(p.ink)[1] > 0.05 ? -0.05 : 0.07), lch(p.ink)[1], lch(p.ink)[2]]),
      'primary-fg': p.ref ? '#fffaf6' : su.panel,
      'field-bg': su.panel,
    });
  } else {
    Object.assign(T, {
      'milnik-accent': rose[10], 'milnik-accent-solid': rose[8], 'milnik-accent-soft': rose[8], 'milnik-badge-fg': rose[11],
      'primary-bg': p.ref ? rose[8] : p.ink, 'primary-bg-hover': p.ref ? rose[9] : fromLch([lch(p.ink)[0] + 0.03, lch(p.ink)[1] * 0.8, lch(p.ink)[2]]),
      'primary-fg': p.ref ? '#3b2f2f' : p.ground,
      'field-bg': p.ref ? rgba('#1e1616', 0.22) : rgba(fromLch([0.18, lch(p.ground)[1] * 0.6, lch(p.ground)[2]]), 0.22),
    });
  }
  T.indicator = T['primary-bg']; T.thumb = T['primary-bg'];
  T['milnik-ink'] = gray[11]; T['milnik-ink-fg'] = p.ref === 'light' ? '#fffaf6' : (light ? su.panel : su.app);
  // fields: the ring of an input reaches 3:1 on its own fill and on every surface around it
  const fieldBgs = [over(T['field-bg'], su.panel), over(T['field-bg'], su.app), over(T['field-bg'], su.overlay), su.panel, su.app, su.overlay];
  T['line-field'] = p.ref
    ? (light ? fit(gray[7], fieldBgs, 3.0, -1) : fit(gray[7], fieldBgs, 3.0, +1))
    : inkAt(gray[11], light ? su.app : p.ground, fieldBgs, 3.0);

  // status (milnik: tones at /15, text from step 11)
  const solid = (n) => S[n].steps[8];
  Object.assign(T, {
    'confirmed-bg': rgba(solid('green'), 0.15), 'confirmed-fg': S.green.steps[10], 'confirmed-solid': solid('green'),
    'waiting-bg': rgba(solid('amber'), 0.18), 'waiting-fg': S.amber.steps[10], 'waiting-solid': solid('amber'),
    'declined-bg': rgba(solid('red'), 0.12), 'declined-fg': S.red.steps[10], 'declined-solid': solid('red'),
    'info-bg': rgba(T['milnik-accent-solid'], 0.12), 'info-fg': T['milnik-accent'], 'info-solid': T['milnik-accent-solid'], 'info-text': gray[11],
    'danger-bg': rgba(solid('red'), 0.12), 'danger-fg': S.red.steps[10], 'danger-solid': solid('red'), 'danger-solid-hover': S.red.steps[9],
    'text-on-danger': S.red.contrast, 'text-on-warning': S.amber.contrast, 'text-on-confirmed': S.green.contrast,
    'warning-text': S.amber.steps[11], 'text-accent': T['milnik-accent'],
  });
  if (!light && !p.ref) {
    // counts sit in a pill one shade DEEPER than the ground (a lighter pill would eat the meta text's
    // contrast on a mid-dark ground like the blue)
    T['count-bg'] = rgba(fromLch([0.2, lch(p.ground)[1] * 0.8, lch(p.ground)[2]]), 0.28);
    Object.assign(T, { 'confirmed-bg': A('green', 3), 'waiting-bg': A('amber', 3), 'declined-bg': A('red', 3), 'danger-bg': A('red', 3) });
    // selection, today and info tints: the brand pink as a plain alpha (an exact twin of a dark rose step
    // over the blue needs a strong, brown alpha)
    const pink = '#f6c8c8';
    Object.assign(T, { 'today-bg': rgba(pink, 0.07), 'selected-bg': rgba(pink, 0.13), 'selected-bg-hover': rgba(pink, 0.18),
      'selected-line': rgba(pink, 0.42), 'info-bg': rgba(pink, 0.13) });
  }
  if (p.ref === 'light') {
    // the tuned scales of css/tokens.css are alpha twins over the chrome (gray-1); a selected row sits on the
    // page, where the rose twins turn cold (pinkish purple, hue ≈ 345°). The brand pink as a plain alpha keeps
    // its warm hue on every light surface (page, card, sheet, chrome).
    const pink = '#e6acac';
    Object.assign(T, { 'today-bg': rgba(pink, 0.16), 'selected-bg': rgba(pink, 0.3), 'selected-bg-hover': rgba(pink, 0.4) });
  }
  if (p.accent === 'ink') {
    // selection, today, links, info and the progress ring take the pair's own ink: in the blue pairs the pink is
    // not their colour, in the pink pair a tint of the pink would be a second pink
    const k = light ? { today: 0.05, sel: 0.08, hover: 0.12, line: 0.3, info: 0.08 } : { today: 0.06, sel: 0.1, hover: 0.14, line: 0.42, info: 0.1 };
    Object.assign(T, {
      'today-bg': rgba(p.ink, k.today), 'selected-bg': rgba(p.ink, k.sel), 'selected-bg-hover': rgba(p.ink, k.hover),
      'selected-line': rgba(p.ink, k.line), 'info-bg': rgba(p.ink, k.info),
      'milnik-accent': p.ink, 'milnik-accent-solid': p.ink, 'milnik-accent-soft': p.ink, 'milnik-badge-fg': light ? p.ink : gray[11],
      'info-fg': p.ink, 'info-solid': p.ink, 'text-accent': p.ink,
    });
    // the pink pair: a selected row is the brand pink itself, not a tint of it; today is a hint of the ink
    if (p.pick === 'ground') Object.assign(T, { 'selected-bg': p.ground, 'selected-bg-hover': p.ground, 'selected-line': p.ground, 'today-bg': rgba(p.ink, 0.04) });
  }
  // text-3 (dashes in empty cells, other-month days) also sits on a selected or today's row
  const t3bgs = [su.panel, su.app, over(T['surface-sunken'], su.panel), over(T['selected-bg'], su.panel), over(T['selected-bg-hover'], su.panel), over(T['today-bg'], su.panel)];
  if (minC(T['text-3'], t3bgs) < 4.6) {
    T['text-3'] = fit(isA(T['text-3']) ? over(T['text-3'], su.panel) : T['text-3'], t3bgs, 4.6, light ? -1 : +1);
    notes.push(`text-3 → ${T['text-3']} (reads on a selected / today's row too)`);
  }
  // badge-solid info writes the panel colour on info-solid: in a dark palette where the accent solid
  // is too light for that, the solid steps up (dark: lighter pink) until the panel text reads
  if (minC(su.panel, [T['info-solid']]) < 4.5) {
    T['info-solid'] = fit(T['info-solid'], [su.panel], 4.6, light ? -1 : +1);
    notes.push(`info-solid lifted to ${T['info-solid']} so the panel-coloured text of a solid info badge reads`);
  }

  // shadows and scrim, tinted by the palette
  const sh = light ? hex2rgb(p.ref ? '#3b2f2f' : fromLch([0.3, lch(gray[11])[1] * 0.8, lch(gray[11])[2]])).map((v) => Math.round(v * 255)).join(' ') : hex2rgb(fromLch([0.12, lch(p.ground)[1] * 0.5, lch(p.ground)[2]])).map((v) => Math.round(v * 255)).join(' ');
  const shadowRgb = p.ref === 'dark' ? '0 0 0' : sh;
  const SH = light ? [0.05, 0.09, 0.12] : [0.18, 0.3, 0.4];
  T['milnik-shadow-a'] = `rgb(${shadowRgb} / ${SH[0]})`; T['milnik-shadow-b'] = `rgb(${shadowRgb} / ${SH[1]})`; T['milnik-shadow-c'] = `rgb(${shadowRgb} / ${SH[2]})`;
  T.scrim = light ? `rgb(${shadowRgb} / .3)` : (p.ref ? 'rgb(16 10 10 / .6)' : `rgb(${shadowRgb} / .6)`);
  const ring = (a) => `0 0 0 1px ${cssOf(A('gray', a))}`;
  T['shadow-1'] = `inset ${ring(light ? 5 : 6)}, inset 0 1.5px 2px 0 ${light ? cssOf(A('gray', 2)) : 'rgb(0 0 0 / .18)'}`;
  T['shadow-2'] = `${ring(5)}, 0 1px 1px 0 rgb(${shadowRgb} / ${light ? .05 : .2}), 0 2px 3px -1px rgb(${shadowRgb} / ${light ? .07 : .25})`;
  T['shadow-3'] = `${ring(light ? 5 : 6)}, 0 2px 3px -2px rgb(${shadowRgb} / ${light ? .10 : .3}), 0 3px 12px -4px rgb(${shadowRgb} / ${light ? .12 : .35})`;
  T['shadow-4'] = `${ring(light ? 5 : 6)}, 0 8px 40px rgb(${shadowRgb} / ${light ? .08 : .3}), 0 12px 32px -16px rgb(${shadowRgb} / ${light ? .18 : .45})`;
  T['shadow-5'] = `${ring(light ? 5 : 6)}, 0 12px 60px rgb(${shadowRgb} / ${light ? .14 : .4}), 0 16px 36px -20px rgb(${shadowRgb} / ${light ? .3 : .6})`;
  T['shadow-color'] = light ? `rgb(${shadowRgb} / .25)` : 'rgb(0 0 0 / .45)';

  // avatars (light: step 4 + 11; dark: step 5 + 12) – the fg re-fitted if a palette's step needs it
  for (const c of CATEGORICAL) {
    const st = S[c].steps;
    const bg = light ? st[3] : st[4];
    let fg = light ? st[10] : st[11];
    if (contrast(fg, bg) < 4.6) { fg = fit(fg, [bg], 4.6, light ? -1 : +1); notes.push(`${c} avatar text adjusted to ${fg}`); }
    T[`${c}-avatar-bg`] = bg; T[`${c}-avatar-fg`] = fg;
  }
  // the token names of css/tokens.css (the milnik-* names are only working names inside this generator)
  Object.assign(T, { 'hero-bg': su.hero, 'hero-line': su.heroLine, 'accent-solid': T['milnik-accent-solid'],
    'accent-badge-fg': T['milnik-badge-fg'], 'avatar-me-fg': T['milnik-ink-fg'],
    'shadow-tint-a': T['milnik-shadow-a'], 'shadow-tint-b': T['milnik-shadow-b'], 'shadow-tint-c': T['milnik-shadow-c'] });
  for (const k of Object.keys(T)) if (k.startsWith('milnik-')) delete T[k];
  return { ...p, su, S, T, notes };
}

// ---------- contrast verification ----------
function verify(P) {
  const { su, T, S } = P;
  const rows = []; let fails = 0;
  const R = (group, label, fg, bgs, min) => {
    const pairs = bgs.map(([bn, bg]) => [bn, contrast(fg, bg)]);
    const worst = pairs.reduce((a, b) => (b[1] < a[1] ? b : a));
    const ok = worst[1] >= min - 1e-9; if (!ok) fails++;
    rows.push({ group, label, fg, min, worst: worst[1], worstOn: worst[0], ok, all: pairs });
  };
  const O = (c, bg) => over(c, bg);
  const content = [['stage', su.app], ['panel', su.panel], ['overlay', su.overlay], ['hero', su.hero],
    ['card foot / table head (panel+sunken)', O(T['surface-sunken'], su.panel)], ['row hover (panel+hover)', O(T.hover, su.panel)],
    ['soft button (stage+soft)', O(T.soft, su.app)], ['soft in card (panel+soft-hover)', O(T['soft-hover'], su.panel)],
    ['dialog foot (overlay+sunken)', O(T['surface-sunken'], su.overlay)], ['selected row (panel+selected)', O(T['selected-bg'], su.panel)]];
  const chrome = [['sidebar', su.chrome], ['sidebar hover (=stage)', su.app], ['sidebar count (chrome+count-bg)', O(T['count-bg'], su.chrome)]];
  R('text', 'text-1 (body, titles)', T['text-1'], [...content, ...chrome], 4.5);
  const metaSet = [...content.filter(([n]) => !n.startsWith('soft in card')), ...chrome, ['tab count on hero (hero+count-bg)', O(T['count-bg'], su.hero)]];
  R('text', 'text-2 (meta, labels, nav, counts)', T['text-2'], metaSet, 4.5);
  R('text', 'text-3 (other-month days, dashes)', over(T['text-3'], su.panel), [['panel', su.panel], ['stage', su.app], ['card foot', O(T['surface-sunken'], su.panel)], ['selected row', O(T['selected-bg'], su.panel)], ['selected row hover', O(T['selected-bg-hover'], su.panel)], ['today', O(T['today-bg'], su.panel)]], 4.5);
  R('text', 'text-accent (links)', T['text-accent'], content.slice(0, 6), 4.5);
  R('text', 'selected-fg on selected-bg / -hover', T['selected-fg'], [['panel+selected', O(T['selected-bg'], su.panel)], ['panel+selected-hover', O(T['selected-bg-hover'], su.panel)], ['stage+selected', O(T['selected-bg'], su.app)]], 4.5);
  R('solid', 'primary-fg on primary-bg / hover', T['primary-fg'], [['primary', T['primary-bg']], ['primary hover', T['primary-bg-hover']]], 4.5);
  R('solid', 'count in an ink pill (primary-fg 16 %)', T['primary-fg'], [['primary+16%', O(rgba(T['primary-fg'], 0.16), T['primary-bg'])]], 4.5);
  R('solid', 'milnik-ink-fg on milnik-ink (my avatar)', T['avatar-me-fg'], [['ink', T['text-1']]], 4.5);
  R('solid', 'text-on-confirmed on confirmed-solid', T['text-on-confirmed'], [['solid', T['confirmed-solid']]], 4.5);
  R('solid', 'text-on-warning on waiting-solid', T['text-on-warning'], [['solid', T['waiting-solid']]], 4.5);
  R('solid', 'text-on-danger on declined-solid / hover', T['text-on-danger'], [['solid', T['declined-solid']], ['hover', T['danger-solid-hover']]], 4.5);
  R('solid', 'panel text on info-solid (solid info badge)', su.panel, [['solid', T['info-solid']]], 4.5);
  const statusBgs = (bg) => [['panel', O(bg, su.panel)], ['stage', O(bg, su.app)], ['overlay', O(bg, su.overlay)], ['hero', O(bg, su.hero)]];
  for (const [k, word] of [['confirmed', 'potvrzeno'], ['waiting', 'čeká'], ['declined', 'nemůže'], ['info', 'info']]) {
    R('status', `${k}-fg as a word (${word})`, T[`${k}-fg`], [...content.slice(0, 6), ['dialog foot', O(T['surface-sunken'], su.overlay)]], 4.5);
    R('status', `${k}-fg on ${k}-bg (badge, callout)`, T[`${k}-fg`], statusBgs(T[`${k}-bg`]), 4.5);
  }
  R('status', 'warning-text on waiting-bg (callout body)', T['warning-text'], statusBgs(T['waiting-bg']), 4.5);
  R('status', 'info-text on info-bg (callout body)', T['info-text'], statusBgs(T['info-bg']), 4.5);
  R('status', 'badge-accent (badge-fg on accent 14 %)', T['accent-badge-fg'], statusBgs(rgba(T['accent-solid'], 0.14)), 4.5);
  R('status', 'danger hover (declined-fg on red 20 %)', T['declined-fg'], [['panel', O(rgba(T['declined-solid'], 0.2), su.panel)], ['overlay', O(rgba(T['declined-solid'], 0.2), su.overlay)]], 4.5);
  for (const c of CATEGORICAL) {
    const st = S[c].steps;
    R('categorical', `${c}: chip text c12 on c3 / c4`, st[11], [['c3', st[2]], ['c4 (hover)', st[3]]], 4.5);
    R('categorical', `${c}: avatar fg on avatar bg`, T[`${c}-avatar-fg`], [['avatar', T[`${c}-avatar-bg`]]], 4.5);
    R('categorical', `${c}: cover text cc on c9`, S[c].contrast, [['c9', st[8]]], 4.5);
    R('non-text', `${c}: kind mark icon c11 on panel`, st[10], [['panel', su.panel], ['stage', su.app], ['overlay', su.overlay]], 3);
  }
  const nt = [['stage', su.app], ['panel', su.panel], ['overlay', su.overlay], ['hero', su.hero], ['sidebar', su.chrome]];
  R('non-text', 'focus ring', T.focus, nt, 3);
  R('non-text', 'nav / tab / chip ink pill vs sidebar & stage', T['primary-bg'], [['sidebar', su.chrome], ['stage', su.app], ['hero', su.hero], ['panel', su.panel]], 3);
  R('non-text', 'checkbox / radio ring (line-strong)', T['line-strong'], [...nt.slice(0, 3), ['field', over(T['field-bg'], su.panel)]], 3);
  R('non-text', 'input border (line-field) on its fill & around', T['line-field'], [['field on panel', over(T['field-bg'], su.panel)], ['field on stage', over(T['field-bg'], su.app)], ['field in dialog', over(T['field-bg'], su.overlay)], ['panel', su.panel], ['stage', su.app]], 3);
  R('non-text', 'progress / ring / my-avatar ring (accent-soft)', T['accent-solid'], [['stage', su.app], ['panel', su.panel]], 3);
  R('non-text', 'status icons (confirmed / declined solid) on panel', T['confirmed-solid'], [['panel', su.panel], ['stage', su.app]], 3);
  R('non-text', 'declined-solid icon on panel', T['declined-solid'], [['panel', su.panel], ['stage', su.app]], 3);
  // information only (not a WCAG requirement – buttons are identified by their label and fill)
  const info = [
    ['surface-button ring (line-control) on panel', contrast(over(T['line-control'], su.panel), su.panel)],
    ['row divider (line-1) on panel', contrast(over(T['line-1'], su.panel), su.panel)],
    ['selected row vs plain row', contrast(over(T['selected-bg'], su.panel), su.panel)],
    ['row hover vs plain row', contrast(over(T.hover, su.panel), su.panel)],
    ['stage vs sidebar', contrast(su.app, su.chrome)],
    ...CATEGORICAL.map((c) => [`${c}-9 month dot / roster bar on panel`, contrast(S[c].steps[8], su.panel)]),
  ];
  return { rows, fails, info };
}

// ---------- CSS ----------
const v = (c) => cssOf(c);
function block(P) {
  const out = [];
  out.push(`  color-scheme: ${P.scheme};`);
  out.push(`  --palette-ground:${P.ground}; --palette-ink:${P.ink};   /* the bullseye of the picker's switcher */`);
  for (const [name, sc] of Object.entries(P.S)) {
    out.push(`  --${name}-1:${sc.steps.map((s, i) => `${i ? ` --${name}-${i + 1}:` : ''}${s}`).join(';')};`);
    out.push(`  ${sc.alpha.map((a, i) => `--${name}-a${i + 1}:${v(a)}`).join('; ')};`);
    out.push(`  --${name}-contrast:${sc.contrast};`);
  }
  const keys = Object.keys(P.T);
  for (let i = 0; i < keys.length; i += 4) out.push('  ' + keys.slice(i, i + 4).map((k) => `--${k}:${v(P.T[k])};`).join(' '));
  return out.join('\n');
}

const built = PALETTES.map(build);
// coverage: every colour-carrying custom property of css/tokens.css is set by every palette block
export const missingTokens = (() => {
  const src = readFileSync(TOKENS, 'utf8');
  const colourish = new Set();
  for (const m of src.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (/#[0-9a-f]{3,8}\b|rgb\(|color-mix|var\(--(gray|rose|green|amber|red|blue|plum|teal|surface|text|line|primary|selected|accent|confirmed|waiting|declined|info|danger)/.test(m[2]) && !/^shadow-(card|card-hover|raised|popover|dialog|stage|control)$/.test(m[1])) colourish.add(m[1]);
  }
  const P = built.find((x) => x.id === 'pink-clay');
  const emitted = new Set([...Object.keys(P.T), ...Object.keys(P.S).flatMap((n) => [...Array(12)].flatMap((_, i) => [`${n}-${i + 1}`, `${n}-a${i + 1}`]).concat(`${n}-contrast`))]);
  return [...colourish].filter((k) => !emitted.has(k) && !/^c\d|^c-|^cc$/.test(k));
})();
export const results = built.map((P) => ({ P, ...verify(P) }));
const dropped = results.filter((r) => r.fails > 0);

export let css = `/* ============================================================
   Zvonec – brand palettes (the same pairs as Otázky na tělo: ground / ink).
   GENERATED by zvonec/palettes.mjs – do not edit by hand („node zvonec/palettes.mjs --report x.md“ lists
   every contrast check).
   <html data-palette="…"> picks one (ui/palette.js, the bullseye picker); without it the device decides:
   cream-clay in light mode, clay-pink in dark mode. ui/palette.js also sets data-theme="light|dark" from
   the palette, so the few [data-theme="dark"] component rules follow.
   Selectors are :root[data-palette] (0,2,0) – they win over the base tokens of css/tokens.css (all in
   :where()); ":root [data-palette]" also makes a palette island (#kit). Screen only: print keeps its own
   paper colours (style.css @media print). Loaded last, after every module stylesheet.
   Palettes dropped (contrast): ${dropped.map((r) => r.P.id).join(', ') || 'none'} – the report says why.
   ============================================================ */
@media screen {
`;
for (const r of results) {
  if (r.fails) continue;
  const P = r.P;
  css += `\n/* ${P.label} (${P.scheme}) */\n:root[data-palette="${P.id}"], :root [data-palette="${P.id}"] {\n${block(P)}\n}\n`;
}
const dl = built.find((x) => x.id === DEVICE.light), dd = built.find((x) => x.id === DEVICE.dark);
css += `\n/* the picker's bullseyes: ring = ground, dot = ink (CSP: no inline style, so one rule per palette) */\n`;
for (const r of results) if (!r.fails) css += `.palette-options [data-palette-choice="${r.P.id}"] .bullseye{--ring:${r.P.ground};--dot:${r.P.ink}}\n`;
css += `\n/* Podle zařízení: no data-palette → ${dl.label} (light), ${dd.label} (dark device) */\n:root:not([data-palette]) {\n${block(dl)}\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-palette]) {\n${block(dd).replace(/^/gm, '  ')}\n  }\n}\n}\n`;

// contrast.md
export let md = `# Zvonec palettes – contrast verification\n\nGenerated by \`zvonec/palettes.mjs\` (WCAG 2.x relative-luminance contrast; alpha colours are composited over the\nsurface they sit on). Thresholds: text ≥ 4.5 : 1 everywhere it appears (body, meta, status words, text on\nsolid fills and on tinted badges); non-text (focus ring, input borders, checkbox rings, ink pills, bars,\nstatus icons) ≥ 3 : 1. "worst" = the lowest value over all the listed surfaces.\n\n`;
md += `| palette | ground / ink | scheme | checks | fails | worst text | worst non-text | status |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of results) {
  const wt = r.rows.filter((x) => x.min === 4.5).reduce((a, b) => (b.worst < a.worst ? b : a));
  const wn = r.rows.filter((x) => x.min === 3).reduce((a, b) => (b.worst < a.worst ? b : a));
  md += `| ${r.P.label} \`${r.P.id}\` | ${r.P.ground} / ${r.P.ink} | ${r.P.scheme} | ${r.rows.length} | ${r.fails} | ${wt.worst.toFixed(2)} (${wt.label} on ${wt.worstOn}) | ${wn.worst.toFixed(2)} (${wn.label} on ${wn.worstOn}) | ${r.fails ? '**dropped**' : 'kept'} |\n`;
}
md += `\n**Dropped – the two green palettes of the website.** Cream on green #498660 is 3.60 : 1 and pink on it 2.23 : 1;
even pure white reaches only 4.32 : 1 and black 4.86 : 1 on that green, so no light ink can carry 4.5 : 1 app text on it
(the derivation fails ${results.filter((r) => r.fails).map((r) => `${r.P.id}: ${r.fails}/${r.rows.length} checks`).join(', ')}).
Cream on green would need a clearly darker ground (≈ #2f6545, cream 5.70 : 1 – a different colour from the website's,
so it is not offered); pink on green fails even there (3.54 : 1).

**Changes to the existing dark theme (clay-pink)** that the verification forced (they also apply to the device-dark default):
${built.find((x) => x.id === 'clay-pink').notes.map((n) => `- ${n}`).join('\n')}
(the red solid was 2.54 : 1 as a ✕ icon on the dark card; white text on any red light enough to be a 3 : 1 icon there
fails, so in dark palettes every solid carries the dark ink – the same rule as the pink primary with clay text).
`;
md += `\nRaw pair (ink on ground, before any derivation): ${PALETTES.map((p) => `${p.id} ${contrast(p.ground, p.ink).toFixed(2)}`).join(' · ')}.\n`;
for (const r of results) {
  const P = r.P;
  md += `\n## ${P.label} – \`${P.id}\` (${P.scheme}) ${r.fails ? '– DROPPED' : ''}\n\n`;
  md += `Surfaces: sidebar ${cssOf(P.su.chrome)} · stage ${P.su.app} · panel ${P.su.panel} · overlay ${P.su.overlay} · hero ${P.su.hero}. `;
  md += `Text-1 ${P.T['text-1']} · text-2 ${P.T['text-2']} · text-3 ${cssOf(P.T['text-3'])} · primary ${P.T['primary-bg']} / ${P.T['primary-fg']} · accent ${P.T['milnik-accent']}.\n`;
  if (P.notes.length) md += `\nAdjustments: ${P.notes.join('; ')}.\n`;
  md += `\n| | check | worst | on | all |\n|---|---|---|---|---|\n`;
  for (const x of r.rows) md += `| ${x.ok ? 'ok' : '**FAIL**'} | ${x.label} | ${x.worst.toFixed(2)} (≥ ${x.min}) | ${x.worstOn} | ${x.all.map(([n, c]) => `${n} ${c.toFixed(2)}`).join(' · ')} |\n`;
  md += `\nFor information (not WCAG requirements): ${r.info.map(([n, c]) => `${n} ${c.toFixed(2)}`).join(' · ')}.\n`;
}

export const kept = results.filter((r) => !r.fails).map((r) => r.P.id);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch { /* missing = stale */ }
    const bad = results.filter((r) => r.fails && !r.P.candidate);
    if (bad.length || current !== css || missingTokens.length) {
      console.error(`palettes: ${bad.length ? `failing ${bad.map((r) => r.P.id).join(', ')}; ` : ''}${current !== css ? 'docs/zvonec/css/palettes.css is stale – run node zvonec/palettes.mjs; ' : ''}${missingTokens.length ? `not covered: ${missingTokens.join(' ')}` : ''}`);
      process.exit(1);
    }
    console.log(`palettes: ${kept.join(', ')} pass; palettes.css up to date`);
  } else {
    writeFileSync(OUT, css);
    const at = args.indexOf('--report');
    if (at >= 0 && args[at + 1]) writeFileSync(args[at + 1], md);
    console.log('coverage: tokens not set by the palettes →', missingTokens.length ? missingTokens.join(' ') : 'none');
    for (const r of results) {
      const wt = r.rows.filter((x) => x.min === 4.5).reduce((a, b) => (b.worst < a.worst ? b : a));
      console.log(r.P.id.padEnd(12), 'fails', String(r.fails).padStart(2), ' worst text', wt.worst.toFixed(2), wt.label, '|', wt.worstOn);
      for (const x of r.rows.filter((x) => !x.ok)) console.log('     FAIL', x.label, x.worst.toFixed(2), 'on', x.worstOn, x.fg);
      if (r.P.notes.length) console.log('     notes:', r.P.notes.join('; '));
    }
  }
}
