// A small SMTP client for the weekly e-mail (zvonec/digest.mjs): implicit TLS on port 465, AUTH LOGIN, one
// connection for every message. No packages – the data repo's Action runs plain Node. Gmail, Seznam and most
// mailboxes speak this; the password is an app password kept in the repo's secrets, never in code.

import { connect } from 'node:tls';
import { randomUUID } from 'node:crypto';

const CRLF = '\r\n';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s) => s.replace(/.{1,76}/g, (line) => `${line}${CRLF}`);
/** A header word in UTF-8 („=?UTF-8?B?…?=“) when it is not plain ASCII. */
const word = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** One e-mail with a text and an HTML version (multipart/alternative, base64 bodies). */
export function mimeMessage({ from, fromName, to, subject, text, html, unsubscribe, date = new Date() }) {
  const boundary = `zvonec-${randomUUID()}`;
  const domain = from.split('@')[1] || 'zvonec';
  const headers = [
    `From: ${fromName ? `${word(fromName)} ` : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${word(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    unsubscribe ? `List-Unsubscribe: <${unsubscribe}>` : null,
    'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', wrap(b64(body))].join(CRLF);
  return [...headers, '', part('text/plain', text), part('text/html', html), `--${boundary}--`, ''].join(CRLF);
}

/**
 * Open a session: `const mail = await smtp({ host, port, user, pass })`, then `await mail.send(from, to, message)`
 * for each e-mail and `await mail.close()`. A reply outside 2xx/3xx throws with the server's words.
 */
export async function smtp({ host, port = 465, user, pass, timeout = 30000 }) {
  const socket = connect({ host, port: Number(port), servername: host });
  socket.setEncoding('utf8');
  socket.setTimeout(timeout, () => socket.destroy(new Error('SMTP: server neodpovídá.')));
  let buffer = '';
  const waiting = [];
  let failure = null;
  const pump = () => {
    // a reply ends with a line „250 text“ (code + space); „250-text“ lines continue it
    const m = buffer.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n/);
    if (!m || !waiting.length) return;
    const end = m.index + m[0].length;
    const reply = buffer.slice(0, end);
    buffer = buffer.slice(end);
    waiting.shift().resolve({ code: Number(m[1]), reply: reply.trim() });
    pump();
  };
  socket.on('data', (chunk) => { buffer += chunk; pump(); });
  socket.on('error', (e) => { failure = e; while (waiting.length) waiting.shift().reject(e); });
  const read = () => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return; }
    waiting.push({ resolve, reject });
    pump();
  });
  const expect = async (ok) => {
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.reply.split('\r\n').pop()}`);
    return r;
  };
  const say = (line, ok) => { socket.write(`${line}${CRLF}`); return expect(ok); };

  await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
  await expect([220]);
  await say(`EHLO ${host.includes('.') ? 'zvonec.local' : host}`, [250]);
  await say('AUTH LOGIN', [334]);
  await say(b64(user), [334]);
  await say(b64(pass), [235]);

  return {
    async send(from, to, message) {
      await say(`MAIL FROM:<${from}>`, [250]);
      await say(`RCPT TO:<${to}>`, [250, 251]);
      await say('DATA', [354]);
      // dot-stuffing: a line starting with „.“ gets a second one
      socket.write(`${message.replace(/\r?\n/g, CRLF).replace(/\r\n$/, '').replace(/^\./gm, '..')}${CRLF}.${CRLF}`);
      await expect([250]);
    },
    async close() {
      try { await say('QUIT', [221]); } catch { /* the server may hang up first */ }
      socket.end();
    },
  };
}
