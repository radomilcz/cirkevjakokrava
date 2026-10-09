// Zvonec One – Sbírky (Dary, SPEC 9.17, 15.1): a gift for one purpose („Nový zvuk“), with its own code – the specific
// symbol – so the bank's payments find it. Leaders, the treasurer and the admins found them; everyone signed in sees
// the open ones, how much they have collected (never who gave) and sends a gift with their own symbol.
//   #sbirky        rows (the heart mark 40, the name, „vybráno 34 500 Kč z 80 000 Kč · do 31. 12.“), then „Skončené“;
//                  ≥ 1200 a split page with the open sbírka in the pane (the newest when none is chosen)
//   #sbirky/<id>   a detail: the heart mark, the name, facts (until, the code); the feature figure block with the bar
//                  and [Pošli dar]; „Na co se vybírá“; „Na plakát“ (those who run it); ⋯ Uprav · Ukonči · Smaž
// The sbírky live in the main data (settings.json › fundraisers); the sums in data/giving.json (ui/giving-state.js).

import { S, can, myId, change, navigate, newId } from './state.js';
import { canSeeDary } from './finance-state.js';
import { G, loadGiving, collected } from './giving-state.js';
import { giveSheet, paymentSheet, openFundraisers, giftAccount, parseAmount } from './give.js';
import { money, nextFundraiserCode } from '../lib/gifts.js';
import { today } from '../lib/time.js';
import { dayWithYear } from './more-common.js';
import {
  h, page, section, list, row, callout, button, toast, formSheet, confirmSheet, field, textInput, textArea,
  dateInput, meta, text, fieldError, clearErrors, agree, empty, placeMark, pill, facts, figures, detail, detailHead,
  missingItem, rowLink, isSplit, isPhone,
} from './kit.js';

/** Who founds and runs sbírky: leaders, the treasurer and the admins. */
export const canRunFundraisers = () => can('leader') || canSeeDary();

/** Sbírky in the navigation: whoever runs them, and everyone while one is open. */
export const showSbirky = () => !!S.data && (canRunFundraisers() || openFundraisers().length > 0);

const fundraiserById = (id) => (S.data?.fundraisers || []).find((f) => f.id === id) || null;
const darů = (n) => `${n} ${agree(n, 'dar', 'dary', 'darů')}`;

const NB = '\u00a0';
const short = (d) => `${Number(d.slice(8, 10))}.${NB}${Number(d.slice(5, 7))}.`;

/** „vybráno 34 500 Kč z 80 000 Kč · do 31. 12.“ – one meta line, the same in every list. */
function fundMeta(f) {
  const c = collected(f.id);
  return [
    `vybráno ${money(c.total)}${f.target ? ` z ${money(f.target)}` : ''}`,
    f.closed ? `skončila ${short(f.closed)}` : f.until ? `do ${short(f.until)}` : null,
  ].filter(Boolean).join(' · ');
}

/** One sbírka as a row – the same anatomy here, on Moje and in Dary. */
export const fundRow = (f, { selected = false } = {}) => row({
  lead: placeMark('heart'), title: f.name, meta: fundMeta(f), href: `#sbirky/${f.id}`, selected,
});

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

/** The sbírka as a detail (a pane ≥ 1200, a page below): the head, the figure block with [Pošli dar], what for, a poster. */
function fundDetail(f, frame) {
  const run = canRunFundraisers();
  const c = collected(f.id);
  const account = giftAccount();
  const known = G.state === 'ready' || !!G.data;
  const give = account && !f.closed
    ? button('Pošli dar', { variant: 'primary', size: 'l', icon: 'heart', onclick: () => giveSheet({ fundraiserId: f.id }) })
    : null;
  return detail({
    frame,
    back: frame === 'page' ? { href: '#sbirky', label: 'Sbírky' } : null,
    close: frame === 'pane' ? null : undefined,
    label: f.name, title: f.name,
    menu: run ? [
      { label: 'Uprav', icon: 'pencil', onclick: () => fundraiserSheet(f) },
      run ? { label: 'Ukaž QR pro plakát', icon: 'image', onclick: () => paymentSheet({ fundraiser: f, poster: true }) } : null,
      f.closed ? { label: 'Obnov sbírku', icon: 'undo', onclick: () => setClosed(f, false) } : { label: 'Ukonči sbírku', icon: 'check', onclick: () => setClosed(f, true) },
      c.gifts ? null : '-',
      c.gifts ? null : { label: 'Smaž', icon: 'trash', danger: true, onclick: () => removeFundraiser(f) },
    ].filter(Boolean) : null,
    cls: 'fund-detail',
    body: [
      detailHead({
        mark: placeMark('heart', { size: 'l' }),
        tags: f.closed ? [pill(`skončila ${dayWithYear(f.closed)}`)] : null,
        title: f.name,
        facts: facts([
          f.until && !f.closed ? { icon: 'calendar', text: `Do ${dayWithYear(f.until)}` } : null,
          { icon: 'key', text: `Specifický symbol ${f.code}` },
        ]),
      }),
      section({
        title: 'Vybráno',
        body: [
          figures({
            feature: true,
            n: known ? money(c.total).replace(/\s?Kč$/, '') : '…',
            of: f.target ? `Kč z ${money(f.target)}` : 'Kč',
            bar: f.target ? c.total / f.target : null,
            say: known ? (c.gifts ? `${darů(c.gifts)}${f.closed ? '. Děkujeme všem, kdo přispěli.' : ''}` : 'Zatím žádný dar.') : null,
            action: give,
          }),
          !account && !f.closed ? callout({ tone: 'wait', title: 'Sbor zatím nemá vyplněný účet pro dary.', text: 'Správce ho doplní v Nastavení sboru › Úřední údaje.' }) : null,
          run ? meta('Kdo dal kolik, vidí jen pokladník a správci v Darech.') : null,
        ],
      }),
      f.note ? section({ title: 'Na co se vybírá', body: text(f.note) }) : null,
      run && account ? section({
        title: 'Na plakát',
        body: list([row({ lead: placeMark('image'), title: 'QR platba pro plakát nebo plátno', meta: 'Bez variabilního symbolu, s kódem sbírky.', onclick: () => paymentSheet({ fundraiser: f, poster: true }), chevron: true })], { label: 'Na plakát' }),
      }) : null,
    ],
  });
}

function listBody(chosenId) {
  const all = S.data.fundraisers || [];
  const open = openFundraisers();
  const done = all.filter((f) => f.closed).sort((a, b) => String(b.closed).localeCompare(String(a.closed)));
  const run = canRunFundraisers();
  return [
    open.length ? list(open.map((f) => fundRow(f, { selected: f.id === chosenId })), { label: 'Probíhající sbírky' }) : empty({
      icon: 'heart', title: 'Teď neběží žádná sbírka.',
      text: run ? 'Když sbor potřebuje peníze na něco konkrétního, založ sbírku. Dostane vlastní QR platbu.' : 'Až nějaká začne, uvidíš ji tady.',
    }),
    done.length ? section({ title: 'Skončené', count: done.length, body: list(done.map((f) => fundRow(f, { selected: f.id === chosenId })), { label: 'Skončené sbírky' }) }) : null,
  ];
}

/** #sbirky · #sbirky/<id> */
export function renderSbirky(parts = []) {
  loadGiving();
  const id = parts[0] || null;
  const f = id ? fundraiserById(id) : null;
  const split = isSplit();
  if (id && !split) return f ? fundDetail(f, 'page') : missingItem({ frame: 'page', back: { href: '#sbirky', label: 'Sbírky' }, icon: 'heart', label: 'Sbírka', title: 'Tahle sbírka už tu není.' });
  // ≥ 1200 the pane is never empty: the chosen sbírka, else the newest open one
  const shown = id ? f : openFundraisers()[0] || null;
  return page({
    title: 'Sbírky',
    action: canRunFundraisers() ? { label: 'Založ sbírku', icon: 'plus', onclick: () => fundraiserSheet(null) } : null,
    back: isPhone() ? { href: '#moje', label: 'Moje' } : null,
    width: 'split',
    label: 'Sbírka',
    cls: 'funds-page',
    body: listBody(shown?.id),
    pane: split ? (id && !f ? missingItem({ frame: 'pane', close: '#sbirky', icon: 'heart', title: 'Tahle sbírka už tu není.' }) : shown ? fundDetail(shown, 'pane') : null) : null,
  });
}

/** Moje: the open sbírky as the same rows, nothing when none is open. */
export function fundraisersOnMine() {
  const open = openFundraisers();
  if (!open.length) return null;
  loadGiving();
  return section({
    title: 'Sbírky',
    body: [
      list(open.slice(0, 3).map((f) => fundRow(f)), { label: 'Sbírky' }),
      open.length > 3 ? rowLink('Všechny sbírky', { href: '#sbirky' }) : null,
    ],
  });
}
