// Zvonec One – a person's photo in place of the initials (the owner's wish).
// The photo is a square WebP (JPEG where the browser cannot write WebP), 512 px, in the private data repo's
// data/images/ like an event's picture; person.photo holds its file name. Only signed-in people ever see it: public.json
// lists only the pictures of published events, so a photo never reaches the public web (the web.yml guard checks it).
// Who may change it: leaders, and anyone their own. The avatar of every list shows it once loaded (kit avatar() asks
// setPhotoSource; the store caches the image, so a redraw has it at once).

import { h, icon, avatar, button, field, formSheet, toast, setPhotoSource } from './kit.js';
import { S, can, myId, change } from './state.js';
import { saveImage, loadImageUrl, deleteImage } from '../lib/store/store.js';
import { personById, displayName, fullName } from '../lib/people.js';

setPhotoSource((name) => (S.store ? loadImageUrl(S.store, name) : null));

const SIZE = 512;
const NOT_A_PHOTO = 'Tohle není fotka. Vyber obrázek (JPG, PNG, WebP).';

/** Leaders change anyone's photo, everyone their own. */
export const mayChangePhoto = (person) => !!person && !person.deleted && (can('leader') || person.id === myId());

/** The middle square of the picture, 512 × 512: { data (a data URL), ext }. */
async function squarePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(NOT_A_PHOTO));
      image.src = url;
    });
    const side = Math.min(img.naturalWidth || 1, img.naturalHeight || 1);
    const sx = ((img.naturalWidth || 1) - side) / 2;
    const sy = ((img.naturalHeight || 1) - side) / 2;
    const out = Math.min(SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, out, out);
    let data = canvas.toDataURL('image/webp', 0.82);
    let ext = 'webp';
    if (!data.startsWith('data:image/webp')) { data = canvas.toDataURL('image/jpeg', 0.85); ext = 'jpg'; }
    return { data, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A photo file nobody uses any more goes from the repo (a failure only leaves a harmless file behind). */
export function dropPhoto(name) {
  if (!name || !S.store || (S.data.people || []).some((p) => p.photo === name)) return;
  deleteImage(S.store, name, 'Zvonec: fotka smazána').catch(() => {});
}

/** „Fotka“: the preview, Vyber fotku / Vyber jinou, Odeber fotku; Ulož writes it (a new file, the old one goes). */
export function photoSheet(person) {
  const state = { pending: null, removed: false };
  const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: -1 });
  const preview = h('div', { class: 'photo-preview' });
  const problem = h('p', { class: 'field__error', hidden: true }, h('span'));
  const pick = button('Vyber fotku', { size: 's', icon: 'image', onclick: () => input.click() });
  const remove = button('Odeber fotku', { size: 's', variant: 'quiet', onclick: () => { state.pending = null; state.removed = true; draw(); } });
  function draw() {
    const shown = state.removed ? { ...person, photo: undefined } : person;
    const av = avatar(shown, { size: 'xxl', me: person.id === myId() });
    if (state.pending) {
      av.classList.add('avatar--photo');
      av.replaceChildren(h('img', { src: state.pending.data, alt: '' }));
    }
    preview.replaceChildren(av);
    const has = !!state.pending || (!!person.photo && !state.removed);
    pick.lastChild.textContent = has ? 'Vyber jinou' : 'Vyber fotku';
    remove.hidden = !has;
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    problem.hidden = true;
    try {
      state.pending = await squarePhoto(file);
      state.removed = false;
    } catch (error) {
      problem.firstChild.textContent = error.message || NOT_A_PHOTO;
      problem.hidden = false;
    }
    draw();
  });
  draw();
  formSheet({
    title: 'Fotka',
    subtitle: fullName(person),
    size: 's',
    body: field({
      label: 'Fotka místo písmen',
      hint: 'Zvonec z ní vyřízne čtverec. Uvidí ji jen přihlášení ve Zvonci, na veřejný web se nedostane.',
      control: h('div', { class: 'photo-field' }, preview, h('div', { class: 'cluster' }, pick, remove), problem, input),
    }),
    onSubmit: async () => {
      const target = personById(S.data, person.id);
      if (!target) return 'Tahle karta už tu není.';
      const old = target.photo || null;
      if (state.pending) {
        if (!S.store) return 'Fotku teď nejde uložit.';
        let name;
        try { name = await saveImage(S.store, state.pending.data, state.pending.ext, 'Zvonec: fotka'); } catch (error) { return `Fotku se nepodařilo uložit. ${error.message || ''}`.trim(); }
        target.photo = name;
        change(`fotka ${displayName(target)}`);
        dropPhoto(old);
        toast('Fotka je uložená.');
        return undefined;
      }
      if (state.removed && old) {
        delete target.photo;
        change(`bez fotky ${displayName(target)}`);
        dropPhoto(old);
        toast('Fotka je pryč.');
      }
      return undefined;
    },
  });
}

/** The avatar of a person's head: for who may change it a button „Přidej fotku“ / „Změň fotku“ with a camera badge. */
export function headAvatar(person, { me = false } = {}) {
  const av = avatar(person, { size: 'xl', me });
  if (!mayChangePhoto(person)) return av;
  const label = person.photo ? 'Změň fotku' : 'Přidej fotku';
  return h('button', { type: 'button', class: 'photo-btn', 'aria-label': label, title: label, onclick: () => photoSheet(person) },
    av, h('span', { class: 'photo-btn__badge', 'aria-hidden': 'true' }, icon('camera', { size: 's' })));
}
