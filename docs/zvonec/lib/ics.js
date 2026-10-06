// Calendar export for phones (.ics, RFC 5545).
// Times are local, hence TZID=Europe/Prague plus the zone definition (summer/winter time).
// Functions take the flat app data and read `places`, `roles`, `events` and `settings`.

const TIMEZONE_BLOCK = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

const icsTime = (t) => `${t.replace(/[-:]/g, '')}00`;
const escape = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Lines over 75 bytes are folded (a continuation starts with a space). */
function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let part = '';
  let length = 0;
  for (const char of line) {
    const d = encoder.encode(char).length;
    if (length + d > (parts.length ? 74 : 75)) { parts.push(part); part = ''; length = 0; }
    part += char;
    length += d;
  }
  parts.push(part);
  return parts.join('\r\n ');
}

/**
 * items: [{ event, name?, description?, uid? }] – name defaults to event.title, uid to event.id.
 */
export function ics(data, items, calendarName) {
  const places = new Map((data.places || []).map((p) => [p.id, p]));
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const address = data.settings?.address;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cirkev jako krava//Zvonec//CS',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escape(calendarName)}`, 'X-WR-TIMEZONE:Europe/Prague', ...TIMEZONE_BLOCK];
  for (const { event, name, description, uid } of items) {
    const where = (event.placeIds || []).map((id) => places.get(id)?.name).filter(Boolean).join(', ');
    lines.push('BEGIN:VEVENT',
      `UID:${uid || event.id}@zvonec.cirkevjakokrava.cz`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Prague:${icsTime(event.start)}`,
      `DTEND;TZID=Europe/Prague:${icsTime(event.end)}`,
      `SUMMARY:${escape(name || event.title)}`);
    if (where || address) lines.push(`LOCATION:${escape([where, address].filter(Boolean).join(' · '))}`);
    if (description) lines.push(`DESCRIPTION:${escape(description)}`);
    if (event.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** Duties of one person from a day on – one item per event, roles in the name. */
export function icsForPerson(data, personId, fromDay) {
  const roles = new Map((data.roles || []).map((r) => [r.id, r]));
  const items = [];
  for (const event of data.events || []) {
    if (event.start.slice(0, 10) < fromDay) continue;
    const mine = (event.assignments || []).filter((a) => a.personId === personId && a.status !== 'declined');
    if (!mine.length) continue;
    const what = mine.map((a) => roles.get(a.roleId)?.name || 'služba').join(' + ');
    items.push({
      event, uid: `${event.id}-${personId}`, name: `${what} · ${event.title}`,
      description: mine.some((a) => a.status === 'proposed') ? 'Čeká na potvrzení – dej vedoucímu vědět, jestli můžeš.' : '',
    });
  }
  return items;
}
