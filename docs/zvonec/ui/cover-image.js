// Zvonec One – the picture of a meeting or a template, always 16 : 9 (the owner: a thumbnail that will look good in a
// public listing). The middle of the photo is cut to 16 : 9 and scaled to at most 1600 × 900, WebP (JPEG on white where
// the browser cannot write WebP), at most about 400 kB. The Setkání band shows such a picture whole (css/event.css).

export const COVER_RATIO = 16 / 9;
const MAX_W = 1600;
const MAX_BYTES = 400 * 1024;
export const NOT_AN_IMAGE = 'Tohle není obrázek. Vyber fotku nebo grafiku (JPG, PNG, WebP).';

/** A chosen file → { dataUrl, ext }: its middle 16 : 9, at most 1600 × 900. */
export async function prepareCover(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error(NOT_AN_IMAGE);
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(NOT_AN_IMAGE); }
  // the largest 16 : 9 window in the middle of the picture
  let sw = bitmap.width;
  let sh = Math.round(sw / COVER_RATIO);
  if (sh > bitmap.height) { sh = bitmap.height; sw = Math.round(sh * COVER_RATIO); }
  const sx = Math.round((bitmap.width - sw) / 2);
  const sy = Math.round((bitmap.height - sh) / 2);
  const w = Math.max(1, Math.min(MAX_W, sw));
  const hgt = Math.max(1, Math.round(w / COVER_RATIO));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, hgt);
  bitmap.close?.();
  let result = null;
  for (const quality of [0.8, 0.65, 0.5]) {
    let dataUrl = canvas.toDataURL('image/webp', quality);
    let ext = 'webp';
    if (!dataUrl.startsWith('data:image/webp')) {
      // JPEG has no transparency: flatten onto white first (a property of the file, not a colour of the UI)
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const ctx = flat.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      dataUrl = flat.toDataURL('image/jpeg', quality);
      ext = 'jpg';
    }
    result = { dataUrl, ext };
    if (dataUrl.length * 0.75 <= MAX_BYTES) break;
  }
  return result;
}
