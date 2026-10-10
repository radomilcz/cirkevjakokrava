// The weekly e-mail (SPEC §11): once a week Zvonec tells each person what waits for them – duties to answer, their
// duties this week, and for leaders what Obsazení still has to solve. Nothing waits → no e-mail. Pure: the data, the
// person and the day come in, { subject, text, html } (or null) goes out; the Action (zvonec/digest.mjs) sends it.
// The HTML is a plain e-mail: tables and inline styles (mail clients ignore stylesheets), the light palette.

import { upcomingDuties } from './events.js';
import { openSlots, unconfirmedDuties } from './scheduling.js';
import { ledBy } from './groups.js';
import { vocative } from './vocative.js';
import { addDays, dayOf, prettyDay, prettyTime, weekday } from './time.js';

/** How far ahead the e-mail looks (Obsazení's four weeks), and what counts as „this week“. */
export const DIGEST_DAYS = 28;
const WEEK = 7;

const agree = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const ON_DAY = ['v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu', 'v neděli'];

/** Does the person want the e-mail? On unless they turned it off (`digest: false`); an e-mail address is needed. */
export const wantsDigest = (person) => !!person?.email && person.digest !== false;

const when = (event) => `${prettyDay(event.start)} v ${prettyTime(event.start)}`;
const roleName = (data, id) => (data.roles || []).find((r) => r.id === id)?.name || 'služba';

/**
 * What waits for one person: { answer: [{ event, role }], week: [{ event, role }], obsazeni: { missing, waiting,
 * problems, lines } | null }. `leader`: the person's login is a leader or an admin; `conflicts` from findConflicts.
 */
export function digestItems(data, person, { today, leader = false, conflicts = [] } = {}) {
  const to = addDays(today, DIGEST_DAYS);
  const mine = upcomingDuties(data, person.id, { from: today, to, includeDeclined: false, includeCancelled: false })
    .filter(({ event }) => dayOf(event.start) >= today);
  const duty = ({ event, assignment }) => ({ event, role: roleName(data, assignment.roleId) });
  const answer = mine.filter((d) => d.assignment.status === 'proposed').map(duty);
  const week = mine.filter((d) => d.assignment.status === 'confirmed' && dayOf(d.event.start) < addDays(today, WEEK)).map(duty);

  let obsazeni = null;
  if (leader) {
    // the teams I lead (Obsazení's default scope); an admin leading none sees every team
    const teams = ledBy(data, person.id).filter((g) => g.kind === 'team' && !g.archived).map((g) => g.id);
    const only = teams.length ? new Set(teams) : null;
    const groupOf = new Map((data.roles || []).map((r) => [r.id, r.groupId]));
    const inScope = (roleId) => !only || only.has(groupOf.get(roleId));
    const missing = openSlots(data, { today, days: DIGEST_DAYS }).filter((s) => s.role && inScope(s.roleId));
    const waitingDuties = unconfirmedDuties(data, { today, days: DIGEST_DAYS, groupIds: only ? [...only] : undefined })
      .filter((d) => d.person && d.person.id !== person.id);
    const waiting = new Set(waitingDuties.map((d) => d.person.id)).size;
    const roleOf = new Map((data.events || []).flatMap((e) => (e.assignments || []).map((a) => [a.id, a.roleId])));
    const events = new Map((data.events || []).map((e) => [e.id, e]));
    const problems = conflicts.filter((c) => {
      const event = events.get(c.eventId);
      if (c.severity !== 'error' || c.overrideNote || !event || event.cancelled) return false;
      if (dayOf(event.start) < today || dayOf(event.start) > to) return false;
      return !only || (c.assignmentIds || []).some((id) => inScope(roleOf.get(id)));
    });
    // one line per missing role in a meeting, nearest first – the three nearest are named, the rest counted
    const byRole = new Map();
    for (const s of missing) {
      const key = `${s.event.id}:${s.roleId}`;
      byRole.set(key, { event: s.event, role: s.role.name, n: (byRole.get(key)?.n || 0) + s.missing });
    }
    const gaps = [...byRole.values()];
    if (gaps.length || waiting || problems.length) obsazeni = { missing: gaps, waiting, problems: problems.length };
  }
  return { answer, week, obsazeni };
}

/** The subject: the most pressing thing first. */
function subjectOf({ answer, week, obsazeni }) {
  if (answer.length) return `${answer.length} ${agree(answer.length, 'služba čeká', 'služby čekají', 'služeb čeká')} na tvou odpověď`;
  if (week.length) {
    const d = week[0].event;
    return `${ON_DAY[weekday(d.start)][0].toUpperCase()}${ON_DAY[weekday(d.start)].slice(1)} máš službu: ${week[0].role}`;
  }
  const n = obsazeni.missing.length + obsazeni.problems + obsazeni.waiting;
  return `V Obsazení ${agree(n, 'zbývá', 'zbývají', 'zbývá')} vyřešit ${n} ${agree(n, 'věc', 'věci', 'věcí')}`;
}

// ---------- the e-mail ----------

const C = { ground: '#fffaf6', card: '#fffdfb', ink: '#2e2323', ink2: '#5b4f4e', line: '#ece4de', act: '#3b2f2f', onAct: '#fffdfb', mark: '#e6acac' };
const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const heading = (t) => `<tr><td style="padding:28px 0 8px;font:600 17px/24px ${FONT};color:${C.ink}">${esc(t)}</td></tr>`;
const line = (title, meta) => `<tr><td style="padding:12px 0;border-top:1px solid ${C.line}">
  <div style="font:600 16px/22px ${FONT};color:${C.ink}">${esc(title)}</div>
  <div style="font:400 15px/21px ${FONT};color:${C.ink2}">${esc(meta)}</div></td></tr>`;
const button = (label, href) => `<tr><td style="padding:16px 0 0"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:${C.act};color:${C.onAct};font:600 16px/20px ${FONT};text-decoration:none">${esc(label)}</a></td></tr>`;
const para = (t) => `<tr><td style="padding:0 0 12px;font:400 15px/21px ${FONT};color:${C.ink2}">${esc(t)}</td></tr>`;

/**
 * The whole e-mail for one person, or null when nothing waits for them. `appUrl`: Zvonec's address
 * (https://zvonec.cirkevjakokrava.cz/), `church`: the sbor's name for the greeting's signature.
 */
export function digestFor(data, person, { today, leader = false, conflicts = [], appUrl, church = 'Zvonec' } = {}) {
  if (!wantsDigest(person)) return null;
  const items = digestItems(data, person, { today, leader, conflicts });
  const { answer, week, obsazeni } = items;
  if (!answer.length && !week.length && !obsazeni) return null;
  const name = vocative(person.nickname || person.firstName || '') || '';
  const link = (hash) => `${appUrl.replace(/#.*$/, '')}${hash}`;
  const hello = `Ahoj${name ? `, ${name}` : ''}`;
  const text = [`${hello},`, ''];
  const rows = [];

  if (answer.length) {
    rows.push(heading('Čeká na tvou odpověď'), para('Dej vedoucím vědět, jestli můžeš.'));
    text.push('Čeká na tvou odpověď:');
    for (const d of answer) { rows.push(line(d.role, `${d.event.title} · ${when(d.event)}`)); text.push(`– ${d.role}: ${d.event.title}, ${when(d.event)}`); }
    rows.push(button('Odpověz ve Zvonci', link('#moje')));
    text.push(`Odpověz ve Zvonci: ${link('#moje')}`, '');
  }
  if (week.length) {
    rows.push(heading('Tento týden sloužíš'));
    text.push('Tento týden sloužíš:');
    for (const d of week) { rows.push(line(d.role, `${d.event.title} · ${when(d.event)}`)); text.push(`– ${d.role}: ${d.event.title}, ${when(d.event)}`); }
    if (!answer.length) rows.push(button('Otevři Zvonec', link('#moje')));
    text.push('');
  }
  if (obsazeni) {
    const { missing, waiting, problems } = obsazeni;
    rows.push(heading('V Obsazení zbývá vyřešit'));
    text.push('V Obsazení zbývá vyřešit:');
    for (const m of missing.slice(0, 3)) {
      const what = `Chybí ${m.n > 1 ? `${m.n}× ` : ''}${m.role}`;
      rows.push(line(what, `${m.event.title} · ${when(m.event)}`));
      text.push(`– ${what}: ${m.event.title}, ${when(m.event)}`);
    }
    const more = [
      missing.length > 3 ? `ještě ${missing.length - 3} ${agree(missing.length - 3, 'místo chybí', 'místa chybí', 'míst chybí')}` : null,
      waiting ? `${waiting} ${agree(waiting, 'člověk ještě neodpověděl', 'lidé ještě neodpověděli', 'lidí ještě neodpovědělo')}` : null,
      problems ? `${problems} ${agree(problems, 'věc nesedí', 'věci nesedí', 'věcí nesedí')}` : null,
    ].filter(Boolean);
    if (more.length) {
      const t = `${more.join(', ')}.`.replace(/^./, (c) => c.toUpperCase());
      rows.push(`<tr><td style="padding:12px 0;border-top:1px solid ${C.line};font:400 15px/21px ${FONT};color:${C.ink2}">${esc(t)}</td></tr>`);
      text.push(t);
    }
    rows.push(button('Otevři Obsazení', link('#obsazeni')));
    text.push(`Otevři Obsazení: ${link('#obsazeni')}`, '');
  }

  const foot = 'Zvonec ti tenhle e-mail posílá v pondělí, jen když na tebe něco čeká. Nechceš ho? Vypni si ho v Můj účet.';
  text.push('Díky, že sloužíš.', church, '', '—', foot, link('#ucet'));
  const subject = subjectOf(items);
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.ground}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 0 20px"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.mark};font:700 13px/18px ${FONT};color:${C.ink}">Zvonec</span></td></tr>
<tr><td style="font:700 26px/32px ${FONT};color:${C.ink}">${esc(hello)}</td></tr>
<tr><td style="padding:6px 0 0;font:400 16px/23px ${FONT};color:${C.ink2}">Tohle na tebe ve Zvonci čeká.</td></tr>
${rows.join('\n')}
<tr><td style="padding:32px 0 0;font:400 16px/23px ${FONT};color:${C.ink}">Díky, že sloužíš.<br>${esc(church)}</td></tr>
<tr><td style="padding:32px 0 0;border-bottom:1px solid ${C.line}"></td></tr>
<tr><td style="padding:16px 0 0;font:400 13px/19px ${FONT};color:${C.ink2}">Zvonec ti tenhle e-mail posílá v pondělí, jen když na tebe něco čeká. Nechceš ho? <a href="${esc(link('#ucet'))}" style="color:${C.ink2}">Vypni si ho v Můj účet</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text: text.join('\n'), html };
}

