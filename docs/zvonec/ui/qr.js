// Zvonec One – a QR code as an SVG (createElementNS, CSP: no innerHTML, nothing to load). One <path> of the dark
// modules on a white square with the quiet zone of four modules, so a bank app reads it on any palette.
// Encoding by the vendored qrcode-generator (lib/vendor/qrcode.js), error correction M.

import qrcode from '../lib/vendor/qrcode.js';

const NS = 'http://www.w3.org/2000/svg';
const QUIET = 4;

function el(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** qrCode('SPD*1.0*…', { label: 'QR platba' }) → <svg class="qr" role="img">. */
export function qrCode(text, { label } = {}) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const size = n + QUIET * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  }
  const svg = el('svg', { class: 'qr', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': label || 'QR kód', 'shape-rendering': 'crispEdges' });
  svg.append(el('rect', { width: size, height: size, fill: '#fff' }), el('path', { d, fill: '#000' }));
  return svg;
}
