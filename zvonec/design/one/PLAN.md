# Zvonec One: the build plan

Build `docs/zvonec/one/` from `DESIGN.md` and `CODEX.md`. One foundation package first (one agent), then five
screen packages in parallel, then QA. **Base: fork `docs/zvonec/simple/`** (it carries the codex tokens, the
person's menu, Moje, Obsazení, the save line, `fitPanes()`, Filtr, Rozpis as a view, the login and first-run pages).
From `docs/zvonec/next/` take only what the plan names (the Setkání band and detail body, `KIND_HUES`, the Formáty
rows, the sidebar group markup).

Rules for every agent:
- Read `CLAUDE.md`, `DESIGN.md`, `CODEX.md` and this plan first. English code and comments, Czech UI in tykání.
- Strict CSP: DOM via `h()`, never `innerHTML`, no inline style or script in markup (`el.style.x` from JS is fine).
- **Never edit** `docs/zvonec/lib/**`, `docs/zvonec/ui/**`, `docs/zvonec/css/palettes.css`, `docs/zvonec/next/**`,
  `docs/zvonec/simple/**`. `node --test zvonec/test/*.test.mjs` stays green.
- Edit only the files your package owns. A change to a file you do not own is a **request** to its owner (foundation
  owner for the kit and shell; the named package for its exports), written as one paragraph with the exact API.
- Screenshots and scripts in your own folder `scratchpad/one/<package>/`; never kill a process you did not start.
  Server: `http://localhost:8765/zvonec/one/` (restart: `cd docs && python3 -m http.server 8765` in the background).

---

## 0. File layout and ownership (all paths under `docs/zvonec/one/`)

Flat `ui/` as in Simple, so relative imports (`../../ui/state.js`, `../../lib/…`) stay unchanged.

| package | owns (create or edit) |
|---|---|
| **F** foundation | `index.html`, `app.js`, `palette-limit.js`; `css/tokens.css`, `css/kit.css`, `css/layers.css`, `css/shell.css`; `ui/h.js`, `ui/icons.js`, `ui/core.js`, `ui/fields.js`, `ui/layers.js`, `ui/layout.js`, `ui/filter.js`, `ui/nav.js`, `ui/me-menu.js`, `ui/palette-choices.js`, `ui/vocative.js`, `ui/kit.js`, `ui/kit-page.js`, `ui/calendar-shared.js` |
| **P1** Moje, účet, vstup, Pastva | `ui/routes-mine.js`, `ui/mine.js`, `ui/home-actions.js`, `ui/account.js`, `ui/blockouts.js`, `ui/login.js`, `ui/public.js`; `css/mine.css`, `css/public.css` |
| **P2** Kalendář | `ui/routes-calendar.js`, `ui/calendar.js`, `ui/month.js`, `ui/roster.js`; `css/calendar.css` |
| **P3** Setkání a Obsazení | `ui/routes-event.js`, `ui/event.js`, `ui/event-duties.js`, `ui/event-form.js`, `ui/program.js`, `ui/staffing.js`; `css/event.css`, `css/staffing.css` |
| **P4** Lidé a Skupiny | `ui/routes-people.js`, `ui/people.js`, `ui/people-card.js`, `ui/people-common.js`, `ui/people-forms.js`, `ui/groups.js`, `ui/groups-forms.js`; `css/people.css` |
| **P5** Jak se scházíme a Správa | `ui/routes-gather.js`, `ui/templates.js`, `ui/formats.js`, `ui/places.js`, `ui/access.js`, `ui/settings.js`, `ui/more-common.js`; `css/gather.css` |
| **Q** QA (after all) | `scratchpad/one/qa/**` only; fixes go back to the owners, then Q may take over any file after the owner is done |

The five `ui/routes-*.js` files and the five screen CSS files are **created by F as stubs** (so `app.js` and
`index.html` can import them from the start) and **owned by their package from then on**; F never edits them again.

`ui/sheet.js` and `ui/kit.js`'s old layout exports: F renames `sheet.js` to `layers.js` and keeps the old names
(`openSheet`, `formSheet`, `confirmSheet`, `menu`, `toast`, `screen`, `topBar`, `splitView`, `detailPane`, `period`,
`fab`) as thin **compat wrappers** in `kit.js`, so the forked screens still run after F. Each package migrates its
screens to the new API; Q deletes the wrappers at the end (and `fab` draws nothing from day one).

---

## 1. Package F: the foundation (one agent, built first, ~1 day)

### 1.1 Start

1. `cp -r docs/zvonec/simple/. docs/zvonec/one/`; rename `css/next-tokens.css` → `css/tokens.css`,
   `css/components.css` → `css/kit.css`, `ui/sheet.js` → `ui/layers.js`; fold `css/simple.css`, `css/home.css`,
   `css/groups.css`, `css/more.css` into the owners' stubs (`mine.css`, `people.css`, `gather.css`) or into `kit.css`
   when shared; delete `css/simple.css`. Rename `calendar.css` stays (P2), add `event.css`, `staffing.css` (P3).
2. Fix every import and `<link>`; fix the font paths in `tokens.css` (one level deeper than Next's: same as Simple).
3. `ui/core.js`: `KIND_HUES = { service: 'rose', rehearsal: 'blue', smallGroup: 'teal', event: 'plum' }` (Next's);
   `HUES` for groups = blue, green, plum, amber, teal (no rose).

### 1.2 `index.html`

Same CSP and head as Simple; title „Zvonec – Církev jako kráva“. Scripts: `../ui/palette.js`, then
`palette-limit.js` (classic, before first paint), then `app.js` (module). Stylesheets in order: `../css/palettes.css`,
`css/tokens.css`, `css/kit.css`, `css/layers.css`, `css/shell.css`, then the screen files (`mine`, `calendar`,
`event`, `staffing`, `people`, `gather`, `public`). Body: skip link, save line, `<nav class="sidenav">` (sidebar and
rail are one element), `#view`, `<nav class="tabbar">`, `.toasts`, `#layers`.

### 1.3 `palette-limit.js` (classic script, no module)

If `<html data-palette>` is set to anything other than `cream-clay` or `clay-pink`, set it to `cream-clay` when its
`data-theme` is light, else `clay-pink`, and set `data-theme`. **Do not write localStorage** (Next and Simple keep
their choice). Re-apply on the `zvonec:appearance` event. `ui/palette-choices.js` draws the three bullseyes (Krém a
hlína, Hlína a růžová, Podle zařízení) with `window.zvonecAppearance.setPalette(id | '')`; it replaces
`paletteChoices` / `palettePicker` from `../../ui/palette-picker.js` in `kit.js`.

### 1.4 `css/tokens.css`

`next-tokens.css` with CODEX values: the type media query at **600** (not 960); add `--type-title-pane: 34px`,
`--lh-title-pane: 36px`, `--type-nav: 15px`; `--gutter: 20px` → 32 at 600 → 40 at 1200; `--title-top` 16 / 32 / 40;
`--filter-w: 120px`, `--count-slot: 28px`, `--seg-w: 120px`, `--period-label-w: 136px`, `--list-col-max: 720px`
(tablet), `--split-list: minmax(400px, 560px)`, `--split-pane: minmax(440px, 720px)`, `--split-gap: 32px`,
`--frame-max: 1312px`, `--page-col: 640px`, `--detail-col: 720px`, `--sidebar-w: 248px`, `--rail-w: 88px`,
`--tabbar-h: 64px`, `--topbar-h: 56px`; colour roles as in CODEX §7, adding `--pick-hover: var(--selected-bg-hover)`;
`--mark` = `--indicator` is the selection bar. Remove `--pick-edge` use.

### 1.5 `ui/layout.js`, `ui/filter.js`, `ui/layers.js` (the patterns every screen uses)

```js
// classes: 'phone' < 600 ≤ 'tablet' < 1200 ≤ 'desktop'; re-render on crossing (onLayoutChange)
isPhone(), isTablet(), isSplit(), onLayoutChange(fn)

// A · B · C · D. No lead/subtitle parameter on purpose (DESIGN §3).
listScreen({
  title,                                   // h1 text
  action,                                  // { label, icon, onclick | href } | null – the main action
  menu,                                    // [{ label, icon, onclick | href, danger }] | null – ⋯
  search,                                  // { placeholder, value, onInput } (always on a list screen)
  filter,                                  // filterButton(...) | null
  views,                                   // { options: [[id, label, href]], value } | null
  body,                                    // nodes of D
  pane,                                    // detail(...) | null – desktop only; drawn in track 2
  wide = false,                            // D spans both tracks (Měsíc grid); B and C stay in track 1
})
page({ title, action, menu, back, body, width: 'column' | 'split' })   // pages (Moje uses 'split')
detail({ frame: 'pane' | 'page', back: { href, label }, close: href, menu, body })
section({ title, action, value, body, id })
empty({ kind: 'none' | 'search' | 'filter', icon, title, text, action })
periodLine({ month, href(month), todayHref })
segmented(options, value, …)             // view row; links with aria-current

filterButton({ key, groups, count, onChange, unit })   // key = 'kalendar' | 'lide' | …, remembered per browser
//   groups: [{ id, title, kind: 'chips' | 'switch', multiple, options: [[value, label, hue?]] }]
//   unit(n) → „12 setkání“ for the phone foot; returns the button; filterState(key) / setFilter(key, patch) read/write

layer.open({ kind: 'sheet' | 'filter' | 'menu' | 'popover' | 'confirm', size: 's' | 'm' | 'l', anchor, title, body, foot })
//   depth-based z-index (40 + 2n), depth ≤ 2, menu closes before a sheet, never inside a scrolling parent
```

- `listScreen` on desktop renders the split grid with both tracks reserved; the toolbar's width is the list track
  (tablet: min(content, 720); phone: content). `fitPanes()` (Simple's, in `app.js`) keeps working on `.split__pane`.
- The compat wrappers (§0) map `screen({ tab })` and `splitView` onto `listScreen` / `page` / `detail` as well as they
  can; packages replace them.

### 1.6 Shell: `app.js`, `ui/nav.js`, `ui/me-menu.js`, `css/shell.css`

- `ui/nav.js`: one `NAV` table `[id, label, icon, href, minAccess, group, count?]` (DESIGN §2.1) drives the tab bar,
  the rail and the sidebar; the person tab and the sidebar foot; current item per route `nav`; counts (Moje answers,
  Obsazení `staffingCount()` from P3's `staffing.js`, invites `waitingInvites()` from P5's `access.js`).
- Rail ↔ sidebar at 900 is CSS only (`.sidenav`, `@media (min-width: 900px)`), the tab bar below 600.
- `ui/me-menu.js`: DESIGN §2.5 exactly; phone sheet / ≥ 600 popover via `layer.open({ kind: 'menu' })`; the phone-only
  „Jak se scházíme“ rows; demo rows from Simple.
- `app.js`: Simple's boot, session, sync, save line, `beforeunload`, `busy()`, scroll restore, `fitPanes()`,
  keyboard („/“, „N“, Esc, Ctrl Z), keyboard-up tab bar hiding, the not-found and error screens. Routes:
  `{ ...MINE, ...CALENDAR, ...EVENT, ...PEOPLE, ...GATHER, prihlaseni/pozvanka/pastva (from MINE), kit }` imported from
  the five `routes-*.js` stubs. `REDIRECTS`: all of Simple's plus DESIGN §8. Tapping the current nav item scrolls to
  the top.
- Each `routes-*.js` stub exports `ROUTES` with the package's slugs mapped to the forked Simple renderers, so the
  app runs end to end after F.

### 1.7 `css/kit.css`, `css/layers.css`, `ui/kit-page.js`

Every component of CODEX §6 drawn once: buttons, icon buttons, fields, search, chips, pills, tags, counts, slot,
segmented, row (+ Seznam event, Obsazení item, Rozpis block anatomies' shared parts), date arch, section, facts,
callout, empty, top bar, title row, toolbar, split grid, pane, period line, sheet, dialog, popover, menu, scrim,
toast. `#kit` shows each one in both palettes (palette islands) at its sizes and states (hover, selected, on/off,
count 0 / 2 / 12).

### 1.8 F's acceptance (before the screen packages start)

- `#kit` renders every component; both palettes; nothing outside CODEX sizes, corners, weights (measured by a
  Playwright probe of `#kit`: heights ∈ {36, 44, 52} for controls, radii ∈ {10, 12, 14, 9, 20, 28, capsule}).
- The shell at 360, 390, 768, 1024, 1280, 1440, 1920: tab bar (member 4, leader 5 tabs, the person tab opens the
  menu), rail 600–899, sidebar ≥ 900, the person's menu as sheet / popover, never clipped, same contents (phone adds
  Jak se scházíme). No sideways scroll.
- A demo list screen in `#kit` (`listScreen` with search, Filtr, views, 30 rows, a pane on click) passes the band-B
  test (§4.1) and the pane-geometry test.
- Every route of DESIGN §8 renders something (the forked screens via the compat wrappers); every redirect resolves.
- Palettes: only three choices; a stored `blue-cream` shows clay-pink in One and stays `blue-cream` in Next.
- `node --test zvonec/test/*.test.mjs` green.
- F writes `scratchpad/one/F/API.md` (the kit API as built, one line per export) for the packages.

---

## 2. Screen packages (in parallel after F)

Cross-package exports (the only coupling; the owner keeps these signatures stable and delivers them first):

| export | owner | used by |
|---|---|---|
| `eventDetail(event, { frame, back, close })` → `detail()`; `renderEventPage(id)`; `notFound()` | P3 `event.js` | P1 (Moje pane), P2 (Seznam, Rozpis panes) |
| `openAddEvent({ day })`, `pickFor`, `openDutySheet`, `openMyAnswer`, `answer`, `fillOpenSlots`, `openEmptySlots`, `teamLines(event, { slots })` | P3 `event-form.js`, `event-duties.js` | P1, P2 |
| `staffingCount()` | P3 `staffing.js` | F (`nav.js`) |
| `personDetail(person, { frame })`, `personForm(person)` | P4 `people-card.js`, `people-forms.js` | P1 (Můj účet › Moje karta), P5 |
| `waitingInvites()`, `inviteSheet(person)` | P5 `access.js` | F (`nav.js`, `me-menu.js`), P4 |
| `blockoutsOf`, `blockoutSheet` | P1 `blockouts.js` | F (`me-menu.js`) |

Every package: migrate its screens to `listScreen` / `page` / `detail` / `layer.open` / `filterButton`; remove every
FAB, lead line, overline, value chip in a head, own head or own pane; check its Czech copy with `kontrola-cestiny`;
run the QA checks of §4 on its routes at 390, 768, 1440 in both palettes as member and leader before handing over.

### P1 · Moje, Můj účet, Kdy nemůžu, Přihlášení, Pozvánka, Pastva

Routes: `#moje[/<eventId>]`, `#ucet`, `#kdy-nemuzu`, `#prihlaseni`, `#pozvanka/<kód>`, `#pastva[/<id>]`.
Work: DESIGN §6.1, §6.11, §6.12, §6.13. Moje = `page({ width: 'split' })`, the date as D's first line, no avatar
circle (delete the `openMeMenu` import), the answer card, Tvoje další služby, declined, Minulé služby; a duty click →
`#moje/<id>` (pane via P3's `eventDetail`). Můj účet: sections with „Uprav“ → layers, Barvy via
`palette-choices.js`. Kdy nemůžu: page, rows open a menu, the clash offer. Login / first run / invite: centred
column, name + password + „Pamatuj si mě“, no reset link. Pastva: public header, column 720, the signed-in strip.
Acceptance: h1 at y 16 / 32 / 40 like every tab root; nothing between h1 and the card except the date line in D;
Můžu / Nemůžu L 52 equal halves; „Vrať“ and Ctrl Z undo an answer; the pane opens only on a click; login works in
demo and live (sign in, Pamatuj si mě, wrong password callout).

### P2 · Kalendář (Seznam, Měsíc, Rozpis)

Routes: `#kalendar`, `#kalendar/seznam[/<id>]`, `#kalendar/mesic/<YYYY-MM>[/<YYYY-MM-DD>]`,
`#kalendar/rozpis/<YYYY-MM>[/<id>]`. Work: DESIGN §6.2. One Filtr model for the three views (Účel, Tým, Jen moje
služby, Ukaž i zrušená) via `filterButton({ key: 'kalendar' })`; search over title, place, Účel and who serves (new
code: a normalised, accent-insensitive text match); Seznam continuous from today with week subheads and „‹ Ukaž, co
už bylo“ / „Ukaž další týdny“; Měsíc by container query at 700 (`month.js`: mini month + day list, or the grid with
chips, „+ 2 další“, the day popover, chip → `#setkani/<id>` page); the period line as D's first line in Měsíc and
Rozpis; Rozpis as Simple's plain list with the team column and slots, Filtr › Tým narrowing lines; ⋯ items (Stáhni
do kalendáře, Vytiskni rozpis…, Doplň volná místa, Břemeno dialog) and print CSS.
Acceptance: the band-B test across Seznam / Měsíc / Rozpis × three months × filter off / on × search empty / with
results / with none; at 1200–1920 the Měsíc grid never has a pane beside it and chip titles break between words; no
„›“ on „Dnes“ at any width or month (label fixed width); the mini month at 360 fits with dots; the Účel bars use
Next's hues (Nedělní rose).

### P3 · Setkání, Osnova, the forms and duties, Obsazení

Routes: `#setkani/<id>`, `#setkani/<id>/osnova`, `#obsazeni[/<id>]`. Work: DESIGN §5.1, §6.3, §6.4. `eventDetail` with
Next's band (96, `--hue-fill`, arch in `--hue-mark`), one Účel tag, facts, „Co nesedí“ (leaders), „Tvoje služba“,
Kdo slouží with collapsed team lines (names, ○ ●, slots; nothing unfolds by itself), the Osnova preview with „Celá
osnova ›“, O setkání; ⋯ items; editing forms as layers (dialog 640 / sheet) with the date picker at depth 2;
Osnova page; the picker, duty sheet and who-waits sheets on `layer.open`; Obsazení as a list screen with the default
team scope counted in Filtr („Filtr 1“), „Doplň volná místa“ in the head (≥ 600) or first in ⋯ (phone), the horizon
line at the end of the list, search over meetings and roles.
Acceptance: the same detail body in pane and page, offsets identical in every frame; a deep link to a past meeting
works; `#setkani/neexistuje` shows the missing-item page; no team unfolds by itself; the picker over a form dims the
form; Obsazení's band B matches Kalendář's at every width.

### P4 · Lidé, Skupiny, Člověk, Domácnost, Skupina, Podrobný výpis

Routes: `#lide[/<id>]`, `#lide/skupiny[/<id>]`, `#lide/domacnost/<id>`, `#lide/vypis`. Work: DESIGN §5.2, §6.5. The
Lidé · Skupiny view row; one search („Hledej jméno“) with groups above people; Filtr per view
(`filterButton({ key: 'lide' })` / `'skupiny'`); A–Z rows (phone single line + call; ≥ 600 meta line); the birthday
line as D's first line; Skupiny rows in sections; the person detail with contact tiles under the head; Domácnost as a
drill-in that replaces the pane; Podrobný výpis (Simple's table, ≥ 900, from ⋯); the old filter slugs as Filtr
presets. Acceptance: names never cut beside the pane at 1200 (list track ≥ 400); the call button only with a phone
number; the main action is „Přidej člověka“ in both views; band B equal in both views and both roles; a long e-mail
never scrolls the person page sideways at 360.

### P5 · Šablony, Formáty, Místa, Přístupy, Nastavení sboru

Routes: `#sablony[/<id>]`, `#formaty[/<id>]`, `#mista[/<id>]`, `#pristupy`, `#nastaveni`. Work: DESIGN §5.2,
§6.6–6.10. Three list screens with search (Šablony also Filtr), rows with the „na webu“ pill in the trail, pane on
click only (remove Next's/Simple's first-item auto-open), the head sentences moved into empty states and details,
add / edit forms as layers; Přístupy as a list screen whose rows open menus, the help sheet and „Vyměň klíč“ in ⋯;
Nastavení as value blocks with „Uprav“ dialogs (no inline fields, no form foot); members read Formáty and Místa
without edit controls. Acceptance: nothing open on arrival at `#formaty`; band B at the same rectangle as Kalendář's on
every screen; „na webu“ never wraps at 360; Přístupy rows never open a pane; Nastavení saves through the dialogs and
the save line.

---

## 3. Order and hand-offs

1. **F** (alone). Done when §1.8 passes; it posts `API.md`.
2. **P1–P5** in parallel. P3 delivers `eventDetail` (and P5 `waitingInvites`, P4 `personDetail`) as its first commit
   of work; until then the forked functions keep working. Kit gaps → a request to F, who stays on call during this
   phase and is the only one editing kit, shell and tokens.
3. **Q**: the checklist below at every width, both palettes, member and leader (demo: „Podívej se očima druhých“) and
   admin; files bugs to owners; deletes the compat wrappers; final `kontrola-cestiny` pass; screenshots for the owner.

---

## 4. QA checklist

Widths: **360, 390, 768, 1024, 1280, 1440, 1920** (heights 780 / 844 / 1024 / 768 / 800 / 900 / 1080).
Palettes: **Krém a hlína** and **Hlína a růžová** (and Podle zařízení with `prefers-color-scheme` light and dark).
Roles: **member**, **leader**, **admin**. Demo mode: goto, `localStorage.clear()`, goto the hash, reload, wait 500 ms.

### 4.1 Gates (a Playwright script in `scratchpad/one/qa/`; every gate must pass)

1. **Band B never moves.** On every list screen (Obsazení, Kalendář × 3 views, Lidé × 2 views, Šablony, Formáty,
   Místa, Přístupy) the toolbar's `getBoundingClientRect()` (x, y, width, height) is identical across views, three
   months, Filtr off / on (count 1 and 12), search empty / matching / not matching, list empty / full, pane closed /
   open, and between screens, at each width. The search's left edge and the Filtr button's rect are equal too.
2. **The h1 never moves.** The h1 rect top is 16 / 32 / 40 (+ safe area) on every tab root, list screen and page of a
   width class; nothing renders between the title row and band B.
3. **No sideways scroll**: `scrollWidth === clientWidth` on every route and open layer at every width.
4. **Nothing overlaps**: pairwise rects of the title row's and the toolbar's controls, the period line's ‹ label ›
   Dnes, the tab bar items, the sheet foot buttons do not intersect.
5. **Nothing is cut**: no `nowrap` label, chip, pill, nav label or placeholder with `scrollWidth > clientWidth`
   without an ellipsis; check „Shromáždění“, „Listopad 2026“, „Červenec 2026“, „Doplň volná místa“, „Hledej šablonu“
   at 360; names beside the pane at 1200.
6. **Sizes**: every control's height ∈ {36, 44, 52} (36 only from 600 up); radii per CODEX §2; control labels 620
   in every state; nav labels 500 in every state (probe current vs not).
7. **Nothing opens by itself**: on arrival at every list route, no pane, no expanded team, no open layer.
8. **Pane geometry** (≥ 1200): the list track's x and width are equal with the pane closed and open; the pane's top =
   band B's top; ⋯ and ✕ on one y; the pane sticks while it fits and scrolls with the page when taller (one scrollbar).
9. **Layers**: a date picker over „Nové setkání“ dims it; depth never exceeds 2; the person's menu and every ⋯ from the
   sidebar, rail or pane are fully inside the window; Esc closes the top layer and focus returns.
10. **Lit rows**: hover, selected and open rows are rounded, whole, 3 apart, with no hairline touching them; the
    selected look = `--pick` + detached 3 px `--mark` bar, kept on hover; no coloured border on a rounded shape.
11. **Palettes**: the picker shows exactly three choices; tokens only (grep for `#` colours in `one/css/*.css` except
    `tokens.css` comments: none); the Účel hues are rose / blue / teal / plum; pink only as itself.
12. **CSP**: no console CSP errors; `grep -rn "innerHTML\|style=\"" docs/zvonec/one` is empty.
13. `node --test zvonec/test/*.test.mjs` green; Next and Simple unchanged (`git diff --stat docs/zvonec/next
    docs/zvonec/simple` empty).

### 4.2 Walk-through (eyes, per role, at 390 · 1024 · 1440, both palettes)

- Member: Moje (Můžu, Vrať) → Kalendář × 3 views → a meeting → Lidé, call → person's menu (every row). No leader
  control anywhere, no „Jak se scházíme“ in the nav.
- Leader: Obsazení („Filtr 1“, + Klávesy, who waits, Doplň volná místa) → Přidej setkání (form + date picker) →
  Setkání ⋯ → Lidé, Skupiny, Podrobný výpis → Šablony, Formáty, Místa → Přístupy (row menu, Pozvi) → Nastavení.
- Admin: plus záloha, klíč, levels; „Podívej se očima druhých“ and back. Signed out: Přihlášení, Pozvánka (valid,
  expired), Pastva, the signed-in strip. A failed / offline save; `beforeunload`; print Rozpis.

### 4.3 The owner's rules (BRIEF.md), read once more before calling it done

No coloured side border on anything rounded · selection = pick + detached 3 px bar · lit rows whole, rounded, 3 apart,
no hairline · gaps 8 / 12 / 24 · heights 36 / 44 / 52, corner follows height, one label size per height, one weight
per kind · one pink as itself, tokens only, two palettes + Podle zařízení · nothing overlaps, nothing cut, no sideways
scroll · one Filtr, no chip rows, nothing opens by itself, a block is one link · search and Filtr never jump ·
tykání, imperatives, nouns for titles, natural Czech.
