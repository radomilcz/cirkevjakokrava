// Zvonec One – Sbírky (Dary, SPEC 9.17, 15.1): a gift for one purpose („Nový zvuk“), with its own code – the specific
// symbol – so the bank's payments find it. Leaders, the treasurer and the admins found them; everyone signed in sees
// the open ones, how much they have collected (never who gave) and sends a gift with their own symbol.
//   #sbirky        the open ones as cards (name, collected of the target, a bar, gifts · until), then the finished
//   #sbirky/<id>   the card, „Pošli dar“, the QR for a poster or the screen in church (leaders), ⋯ Uprav · Ukonči · Smaž
// The sbírky live in the main data (settings.json › fundraisers); the sums in data/giving.json (ui/giving-state.js).

import { S, can, myId, change, navigate, newId } from './state.js';
import { canSeeDary } from './finance-state.js';
import { G, loadGiving, collected } from './giving-state.js';
import { giveSheet, paymentSheet, openFundraisers, giftAccount, parseAmount } from './give.js';
import { money, nextFundraiserCode } from '../lib/gifts.js';
import { today } from '../lib/time.js';
import { dayWithYear } from './more-common.js';
import {
  h, page, section, list, row, quiet, callout, button, toast, formSheet, confirmSheet, field, textInput, textArea,
  dateInput, meta, text, fieldError, clearErrors, agree, empty, icon,
} from './kit.js';

/** Who founds and runs sbírky: leaders, the treasurer and the admins. */
export const canRunFundraisers = () => can('leader') || canSeeDary();

/** Sbírky in the navigation: whoever runs them, and everyone while one is open. */
export const showSbirky = () => !!S.data && (canRunFundraisers() || openFundraisers().length > 0);

const fundraiserById = (id) => (S.data?.fundraisers || []).find((f) => f.id === id) || null;
const darů = (n) => `${n} ${agree(n, 'dar', 'dary', 'darů')}`;

/** „34 000 Kč“ as strong figures with a quiet unit. */
function sumEl(n) {
  const [num] = money(n).split(' Kč');
  return h('span', { class: 'fund__sum' }, h('strong', {}, num), h('span', { class: 'fund__unit' }, ' Kč'));
}

/** One sbírka as a card: the name, collected (of the target, with a bar), gifts · until. A link unless `big`. */
function fundCard(f, { big = false } = {}) {
  const c = collected(f.id);
  const known = G.state === 'ready' || G.data;
  const bar = f.target ? h('span', { class: 'stat__bar fund__bar', 'aria-hidden': 'true' }, h('span', { class: 'stat__fill' })) : null;
  if (bar) bar.firstChild.style.width = `${Math.round(Math.min(1, c.total / f.target) * 100)}%`;   // CSSOM, allowed by the CSP
  const metaWords = [
    known ? (c.gifts ? darů(c.gifts) : 'zatím žádný dar') : null,
    f.closed ? 'skončila' : f.until ? `do ${dayWithYear(f.until)}` : null,
    `specifický symbol ${f.code}`,
  ].filter(Boolean).join(' · ');
  const body = [
    big ? null : h('span', { class: 'fund__name' }, f.name),
    h('span', { class: 'fund__figures' }, known ? sumEl(c.total) : h('span', { class: 'fund__sum' }, '…'),
      f.target ? h('span', { class: 'fund__of' }, `z ${money(f.target)}`) : h('span', { class: 'fund__of' }, 'vybráno')),
    bar,
    h('span', { class: 'fund__meta' }, metaWords),
  ];
  return big
    ? h('div', { class: ['fund', 'fund--big', f.closed && 'fund--closed'] }, body)
    : h('a', { class: ['fund', f.closed && 'fund--closed'], href: `#sbirky/${f.id}`, 'aria-label': `${f.name}: vybráno ${money(c.total)}${f.target ? ` z ${money(f.target)}` : ''}` }, body);
}

// ---------- founding and editing ----------

/** Založ sbírku / Úprava sbírky: the name, what for, the target and the last day (both optional). */
export function fundraiserSheet(f) {
  const name = textInput({ name: 'name', value: f?.name || '', autocomplete: 'off', placeholder: 'např. Nový zvuk' });
  const note = textArea({ name: 'note', value: f?.note || '', rows: 3, placeholder: 'Na co se vybírá a proč' });
  const target = textInput({ name: 'target', value: f?.target ? String(f.target) : '', inputmode: 'decimal', autocomplete: 'off', placeholder: 'např. 80 000' });
  const until = dateInput({ name: 'until', value: f?.until || '', placeholder: 'Bez konce', label: 'Do kdy', min: today() });
  formSheet({
    title: f ? 'Úprava sbírky' : 'Nová sbírka',
    submitLabel: f ? 'Ulož' : 'Založ sbírku',
    size: 'm',
    body: [
      f ? null : meta('Sbírka dostane vlastní specifický symbol. Podle něj Zvonec pozná platby, které do ní přijdou.'),
      field({ label: 'Název', control: name }),
      field({ label: 'Na co', control: note, optional: true, hint: 'Uvidí to všichni ve Zvonci.' }),
      field({ label: 'Kolik potřebujeme', control: target, optional: true, hint: 'Částka v Kč. Zvonec pak ukáže, kolik se už vybralo.' }),
      field({ label: 'Do kdy', control: until, optional: true }),
    ],
    onSubmit: (form, values) => {
      clearErrors(form);
      const n = name.value.trim();
      if (!n) { fieldError(name, 'Doplň název.'); return false; }
      const goal = target.value.trim() ? parseAmount(target.value) : null;
      if (target.value.trim() && !goal) { fieldError(target, 'Napiš částku, třeba 80 000.'); return false; }
      const fields = { name: n, note: note.value.trim() || undefined, target: goal || undefined, until: values.until || undefined };
      if (f) {
        const hit = fundraiserById(f.id);
        if (!hit) return 'Tahle sbírka už tu není.';
        for (const [k, v] of Object.entries(fields)) { if (v === undefined) delete hit[k]; else hit[k] = v; }
        change(`úprava sbírky ${n}`);
        toast('Uloženo.');
        return undefined;
      }
      const id = newId('f');
      const code = nextFundraiserCode(S.data.fundraisers || []);
      S.data.fundraisers = [...(S.data.fundraisers || []), { id, code, ...JSON.parse(JSON.stringify(fields)), created: today(), ...(myId() ? { createdBy: myId() } : {}) }];
      change(`nová sbírka ${n}`);
      toast(`Sbírka má specifický symbol ${code}.`);
      navigate(`#sbirky/${id}`);
      return undefined;
    },
  });
}

function setClosed(f, closed) {
  const hit = fundraiserById(f.id);
  if (!hit) return;
  if (closed) hit.closed = today(); else delete hit.closed;
  change(closed ? `sbírka ${f.name} skončila` : `sbírka ${f.name} pokračuje`);
  toast(closed ? 'Sbírka skončila. Platby s jejím symbolem se k ní dál připisují.' : 'Sbírka zase běží.', { action: () => setClosed(f, !closed) });
}

function removeFundraiser(f) {
  confirmSheet({
    title: `Chceš smazat sbírku ${f.name}?`,
    text: 'Zatím do ní nepřišel žádný dar. Kdyby někdo poslal platbu s jejím symbolem, Zvonec ji už nepozná.',
    confirmLabel: 'Smaž sbírku',
    onConfirm: () => {
      S.data.fundraisers = (S.data.fundraisers || []).filter((x) => x.id !== f.id);
      change(`smazaná sbírka ${f.name}`);
      navigate('#sbirky');
      toast('Sbírka je smazaná.');
    },
  });
}

// ---------- the screens ----------

function listPage() {
  const all = S.data.fundraisers || [];
  const open = openFundraisers();
  const done = all.filter((f) => f.closed).sort((a, b) => String(b.closed).localeCompare(String(a.closed)));
  const run = canRunFundraisers();
  return page({
    title: 'Sbírky',
    action: run ? { label: 'Založ sbírku', icon: 'plus', onclick: () => fundraiserSheet(null) } : null,
    cls: 'funds-page',
    body: [
      open.length ? h('div', { class: 'funds' }, open.map((f) => fundCard(f))) : empty({
        icon: 'heart', title: 'Teď neběží žádná sbírka.',
        text: run ? 'Když sbor potřebuje peníze na něco konkrétního, založ sbírku. Dostane vlastní QR platbu.' : 'Až nějaká začne, uvidíš ji tady.',
      }),
      done.length ? section({ title: 'Skončené', count: done.length, body: list(done.map((f) => row({
        title: f.name, meta: [`vybráno ${money(collected(f.id).total)}`, `skončila ${dayWithYear(f.closed)}`].join(' · '),
        href: `#sbirky/${f.id}`, chevron: true,
      })), { label: 'Skončené sbírky' }) }) : null,
    ],
  });
}

function detailPage(f) {
  const run = canRunFundraisers();
  const c = collected(f.id);
  const account = giftAccount();
  return page({
    title: f.name,
    back: { href: '#sbirky', label: 'Sbírky' },
    cls: 'funds-page',
    menu: run ? [
      { label: 'Uprav', icon: 'pencil', onclick: () => fundraiserSheet(f) },
      f.closed ? { label: 'Obnov sbírku', icon: 'undo', onclick: () => setClosed(f, false) } : { label: 'Ukonči sbírku', icon: 'check', onclick: () => setClosed(f, true) },
      c.gifts ? null : '-',
      c.gifts ? null : { label: 'Smaž', icon: 'trash', danger: true, onclick: () => removeFundraiser(f) },
    ].filter(Boolean) : null,
    body: [
      f.note ? text(f.note) : null,
      fundCard(f, { big: true }),
      f.closed ? callout({ tone: 'info', title: `Sbírka skončila ${dayWithYear(f.closed)}.`, text: 'Děkujeme všem, kdo přispěli.' }) : null,
      !account ? callout({ tone: 'wait', title: 'Sbor zatím nemá vyplněný účet pro dary.', text: 'Správce ho doplní v Nastavení sboru › Úřední údaje.' }) : null,
      account && !f.closed ? h('div', { class: 'gift-actions' },
        button('Pošli dar', { variant: 'primary', icon: 'heart', onclick: () => giveSheet({ fundraiserId: f.id }) }),
        run ? button('Ukaž QR pro plakát', { icon: 'image', onclick: () => paymentSheet({ fundraiser: f, poster: true }) }) : null) : null,
      run ? meta('Kdo dal kolik, vidí jen pokladník a správci v Darech.') : null,
    ],
  });
}

/** #sbirky · #sbirky/<id> */
export function renderSbirky(parts = []) {
  loadGiving();
  if (parts[0]) {
    const f = fundraiserById(parts[0]);
    if (!f) return page({ title: 'Sbírka', back: { href: '#sbirky', label: 'Sbírky' }, body: quiet('Tahle sbírka už tu není.') });
    return detailPage(f);
  }
  return listPage();
}

/** Moje: the open sbírky as rows (name, collected), nothing when none is open. */
export function fundraisersOnMine() {
  const open = openFundraisers();
  if (!open.length) return null;
  loadGiving();
  return section({
    title: 'Sbírky',
    body: list(open.slice(0, 3).map((f) => {
      const c = collected(f.id);
      return row({
        lead: icon('heart'),
        title: f.name,
        meta: `vybráno ${money(c.total)}${f.target ? ` z ${money(f.target)}` : ''}`,
        href: `#sbirky/${f.id}`, chevron: true,
      });
    }), { label: 'Sbírky' }),
  });
}
