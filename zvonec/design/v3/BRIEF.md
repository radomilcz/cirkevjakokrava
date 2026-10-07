# Zvonec 3 – the brief for the new team

> **Status (7 Oct 2026): not built.** The owner preferred the look of Next and Simple, so v3 stops at this
> spec and the mockups. It stays here as a source of behaviour ideas (§1–6) that are being ported into
> Simple, in Simple's look. Its visual system (§7) is superseded by Simple's.

Zvonec is the serving-schedule app of the church Církev jako kráva (Nový Jičín): who serves when, the
calendar of meetings (setkání), people and teams, the outline of a meeting (osnova). Two versions exist
(`docs/zvonec/next/`, `docs/zvonec/simple/`). The owner wants a **third one, made from scratch by a new team,
as a modern SaaS application** – think Linear, Notion, Planning Center, Height, Cal.com: a calm sidebar app
with a command palette, fast keyboard work, tables with filters and saved views, side panels instead of page
hops, inline editing, clear empty states – **only in the church's colours and typography**.

## The rule of the clean slate

Do **not** open or copy the existing apps' UI: nothing under `docs/zvonec/next/`, `docs/zvonec/simple/`,
`docs/zvonec/stara.html`, `docs/zvonec/app.js`, `docs/zvonec/style.css`, `docs/zvonec/css/tokens.css`, and nothing
under `docs/zvonec/ui/` **except** the three shared platform files below. No screenshots of them either. Their
design decisions are not yours to inherit; your own judgment is the point.

## What you may (and should) use – the platform

- **Data and logic:** everything in `docs/zvonec/lib/` (read it – it is the domain): `events.js` (events, needs,
  fill), `scheduling.js` (open slots, suggestions, who can serve), `conflicts.js` (warnings), `people.js`,
  `groups.js` (teams, roles, members, skills), `program.js` (osnova), `places.js`, `time.js`, `ics.js`,
  `demo.js` (rich demo data, `createDemo(today)`, `DEMO_VIEWERS`), `access.js` (sign-in), `public.js`,
  `store/` (`load`, `saveAll`, `Sync`, `LocalStore`, `GithubStore`, `emptyData`).
- **State:** `docs/zvonec/ui/state.js` – `S` (the whole state: `S.data`, `S.me`, `S.mode`, `S.conflicts`…),
  `change(note)` (after you mutate `S.data`: recompute, save, re-render; `note` is short Czech for the commit),
  `can('admin'|'leader'|'member')`, `myId()`, `navigate(hash)`, `render()`, `setHooks({ render, signedIn })`,
  `signedIn(result)`, `rememberLogin`, `loadRemembered`, `forgetRemembered`, `logout`, the Czech label maps
  (`ACCESS_LABELS`, `ASSIGNMENT_STATUS_LABELS`, `MEMBERSHIP_LABELS`, …), `recompute`, `replaceAll`, `actAs`.
- **Colours:** `docs/zvonec/css/palettes.css` (generated from the brand: five palettes – Krém a hlína is the
  default light one, Hlína a růžová the dark one, plus Růžová a hlína, Krém a modrá, Modrá a krém; every colour
  token: `--surface-*`, `--text-*`, `--line-*`, `--primary-*`, `--selected-*`, `--confirmed-*`, `--waiting-*`,
  `--declined-*`, `--info-*`, scales `--gray-1…12`, …). Use **only** these tokens for colour – no raw colours.
  `docs/zvonec/ui/palette.js` (classic script in `<head>`, applies the chosen palette before first paint, honours
  `?paleta=hlina-ruzova|ruzova-hlina|modra-krem|krem-modra|krem-hlina|zarizeni`) and
  `docs/zvonec/ui/palette-picker.js` (the bullseye picker, `paletteChoices()` / `palettePicker()`).
  The brand colours: clay `#3b2f2f`, pink `#e6acac`, cream `#f9e7dd`, blue `#464994`, green `#498660`. The
  owner's rules: the brand has **one** pink (use it as itself, never as tints that read as other pinks); no
  hue outside the brand (no teal, purple, orange) except the status colours (green confirmed, amber waiting,
  red error), which carry meaning.
- **Type:** `docs/assets/fonts/` – Agrandir Narrow Black (titles), Agrandir Grand Heavy (the brand mark only),
  Agrandir Regular / Grand, and **Schibsted Grotesk** (variable, the UI text face). Favicon in `docs/assets/`.

## Boot, sign-in, saving (copy this flow; it is platform, not design)

```js
setHooks({ render: renderApp, signedIn: startLive });
// live mode shows itself by access.json one folder up (../access.json); else demo
const access = await fetch('../access.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (access) {
  S.mode = 'live'; S.logins = access.logins || []; S.repoInfo = await fetchJson('../repo.json');
  const remembered = loadRemembered();
  if (remembered) { const result = await restore(S.logins, remembered); if (result && result.record.access !== 'invite') return startLive(result); }
  renderApp();               // signed out: your sign-in screen (lib/access.js signIn(S.logins, name, password) → signedIn(result))
} else {
  S.mode = 'demo';
  S.me = { login: null, priv: null, github: null, personId: DEMO_VIEWERS.admin, access: 'admin' };
  const store = new LocalStore({ key: DEMO_KEY });
  if (!store.hasData()) await saveAll(store, createDemo(today()), 'Zvonec: ukázka');
  useStore(store, (await load(store)) || emptyData());
}
// startLive(result): S.me = { login: result.record, priv: result.priv, github: result.github,
//   personId: result.record.personId || null, access: result.record.access }; store = new GithubStore(result.github);
//   useStore(store, await load(store) || emptyData())
// useStore(store, data): S.store = store; S.data = data;
//   S.sync = new Sync(store, data, { onChange: (event) => { /* show save status; if (event.reloaded) { recompute(); renderApp(); } */ } });
//   recompute(); renderApp();
// pull what others saved: on focus / visibilitychange / every 60 s → S.sync.refresh()
// beforeunload: warn when S.sync.status !== 'saved'
```

Invites (`#pozvanka/<code>`): send them to `../next/#pozvanka/<code>` – out of scope here.
The demo lets an admin look as others (`actAs(personId, access)` – a „view as“ switch is welcome).

## House rules (`CLAUDE.md`)

- Static vanilla ES modules on GitHub Pages, **no build step, no dependencies**. Strict CSP (copy this meta):
  `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:;
  connect-src 'self' https://api.github.com; frame-src https://www.openstreetmap.org; object-src 'none';
  base-uri 'none'; form-action 'none'` – so **no inline styles or scripts**, the DOM built with your own `h()`
  helper, **never `innerHTML`**; setting `el.style.x` from JS is allowed.
- **English** for all code, names, comments, CSS classes, file names. **Czech** for everything people read:
  natural Czech, one kind voice in **tykání**; actions (buttons, menu items, aria-labels of icon buttons) are
  imperative 2nd person singular („Přidej setkání“, „Ulož“, „Přihlas se“); page / section / dialog titles are
  nouns, never infinitives („Lidé“, „Nové setkání“). URL slugs people see are Czech (`#kalendar`, `#lide`).
- Personal data lives only in the private data repo – never in this repo (the demo data is invented).
- Accessibility: real buttons and links, focus visible, keyboard everywhere, `aria-*` on custom widgets,
  text contrast ≥ 4.5 : 1 (the palette tokens are verified for that – stay on them).
- Phones matter as much as desktops: every screen works at 390 px.

## Where it lives

- The app: `docs/zvonec/v3/` (`index.html`, `app.js`, `ui/`, `css/`), relative paths to `../lib/`,
  `../ui/state.js`, `../ui/palette.js`, `../ui/palette-picker.js`, `../css/palettes.css`, `../../assets/`.
  Published at `https://zvonec.cirkevjakokrava.cz/v3/` (live data) and as a demo at
  `https://manifest.cirkevjakokrava.cz/zvonec/v3/`. The main address stays on the old app.
- Design notes: `zvonec/design/v3/` (this brief, `DESIGN.md`, mockups). Screenshots are not committed.

## Tooling

- Local server: `cd /home/user/cirkevjakokrava/docs && (python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1`
  → `http://localhost:8765/zvonec/v3/` (demo mode, data in localStorage).
- Screenshots: Playwright at `/opt/node-tools/node_modules/playwright/index.mjs`, launch with
  `executablePath: '/opt/pw-browsers/chromium'`. Write scripts and images to your scratchpad
  (`/tmp/claude-0/-home-user/c2a9e1cb-18da-535d-bc87-8052e9066dad/scratchpad/v3/`), use absolute paths.
- Tests: `node --test zvonec/test/*.test.mjs` (must stay green; add tests for pure logic you write, if any).
- Syntax check a module: copy it to the scratchpad as `x.mjs` and `node --check x.mjs`.
- Do not commit, push or open pull requests – the lead does that.
