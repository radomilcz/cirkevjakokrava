# Zvonec – design brief (binding)

Owner's words, condensed: a tool, not a poster. Every module works perfectly and is understandable on
its own. Lists are beautiful. Friendly, generous with space, never wasteful. Remember what the public
sees and what only a signed-in person sees: the public part is made of what we publish from the
private part. Source of the numbers: `docs/zvonec/css/tokens.css` (tokens) and the living specimen
`#kit` (leaders only, not in the nav). If this file and the code disagree, fix one of them in the
same change.

## 1. Principles

1. **One page = one job.** The page title says what it is. No eyebrows or taglines above titles. A lead
   sentence only when it adds something the title can't (max one).
2. **Tool first.** One obvious primary action, top right of the page header (`solid` button, one per
   view). Secondary actions are quiet. Destructive actions live bottom-left in the edit dialog or page,
   never in lists.
3. **Lists are the product.** Every collection uses the same `list` / `row`: leading (avatar, date
   block, team mark), title, one meta line, trailing (status, count, chevron). The whole row is
   clickable when it opens something. Lists sit in a panel, not as hairlines on the page. An empty
   state is one sentence plus the primary action. A date block is always three lines (weekday · day ·
   month), so a list may cross months, and the meta line never repeats the date.
4. **Full names** wherever a person is assigned to something (duty, osnova item, team member, picker).
   Only the dense Rozpis table may shorten („Veronika F.“), never to a bare first name.
5. **Status = symbol + colour + word**, never one of them alone and never outline style alone.
   `confirmed` filled circle with a tick, green, „potvrzeno“; `proposed` dashed ring with a clock,
   amber, „čeká na potvrzení“; `declined` ✕ in a ring, red, name struck through, „nemůže“. Warnings:
   `error` / `warning` / `info` have their own symbols and the words chyba / pozor / info. Symbols
   are drawn (SVG), use `currentColor` and print in black. The fill ring has two arcs on the empty
   track – green potvrzeno, amber (dashed when large) čeká – and its words say both: „14 z 15 · 3 čekají“.
   One „zrušeno“ everywhere: the gray pill with ⊘ (`cancelledBadge`) and the title struck through.
   Progress bars have one colour meaning: accent = progress, amber = over a limit / warning, red = error.
6. **Semantics first.** Screens and the kit emit one semantic DOM; the look lives in tokens and the kit
   CSS (§2–3). No raw colours or font names in module CSS; radii come from tokens.
7. **Czech** is natural and plain (CLAUDE.md, `kontrola-cestiny`). Buttons are a verb (+ object).
   „Může se přihlásit“, never „má přihlášení“.
8. **Keyboard and screen reader:** real buttons and links, a label on every field, a visible focus ring
   (2 px `--focus`), Esc closes dialogs and menus, `aria-current` / `aria-pressed` / `aria-selected`
   mirror what is shown as chosen.

## 2. One look

Zvonec has one look: the owner's Milníkovač prototype in the cow's palette and fonts – the sidebar on the
cream ground (brand at its top, the person and the colour picker at its foot), the stage a lighter window inset in it,
pill controls and pill tabs, sentence-case titles in Agrandir Narrow Black, cards with a border and a soft
shadow. Brand: clay `#3b2f2f`, pink `#e6acac`, cream `#f9e7dd`; Agrandir Regular, Agrandir Narrow Black,
Agrandir Grand Heavy (the brand mark only).

- **Palettes.** The colours come in the website's ground / ink pairs, the same as Otázky na tělo:
  Hlína a růžová `clay-pink` (dark) · Růžová a hlína `pink-clay` · Modrá a krém `blue-cream` (dark) ·
  Krém a modrá `cream-blue` · Krém a hlína `cream-clay` (the light default), plus **Podle zařízení** (no
  attribute: cream-clay on a light device, clay-pink on a dark one). `<html data-palette="…">` picks one and
  `data-theme="light|dark"` follows from it (the few `[data-theme="dark"]` rules). The green pairs of the website
  are left out: no light ink reaches 4.5 : 1 on green `#498660` (cream 3.60, pink 2.23, even white 4.32).
- **One recipe, verified.** `zvonec/palettes.mjs` derives every colour token from the pair and writes
  `css/palettes.css` (generated – never edit it by hand): the sidebar is the ground in light palettes (a deeper
  ground in dark ones), the stage a lighter window (the ground itself in dark ones), cards and dialogs lighter
  still; text-1 and the primary solid are the ink; meta text, placeholders, checkbox rings and field rings are
  „the ink at x %“ toward the ground, solved so every check passes; status and categorical scales are re-fitted
  to the ground. It checks 55 pairs per palette (text ≥ 4.5 : 1 on every surface it sits on, incl. tinted badges,
  selected rows and solids; focus ring, field rings, checkbox rings, ink pills, bars and status icons ≥ 3 : 1)
  and `zvonec/test/palettes.test.mjs` keeps it so. In dark palettes every solid (red, green, the pink primary)
  is light enough to be a 3 : 1 icon on the cards and carries the dark ink.
- **The picker** is the bullseye of Otázky (the favicon's mark: a ring in the ground colour, a dot in the
  ink): `ui/palette-picker.js` builds it with `h()`; at the foot of the sidebar next to the person (in the
  sheet on a phone) and as a radio group in Můj účet („Barvy“). Remembered per browser (`localStorage`
  `zvonec-palette`); a link may set it with `?paleta=hlina-ruzova|ruzova-hlina|modra-krem|krem-modra|krem-hlina|zarizeni`,
  the older `?rezim=svetly|tmavy|zarizeni` maps to cream-clay / clay-pink / the device.
- `ui/palette.js` is a classic script in `<head>`: it applies the palette before the first paint (and migrates
  a stored `zvonec-theme` once), exposes `window.zvonecAppearance` and fires `zvonec:appearance`.

## 3. Tokens and semantic rules

Components use only **semantic tokens**; raw scale steps only for categorical colour.

- **Scales** (OKLCH, 12 steps, pinned to the palette): gray (warm „clay“), rose (accent), green, amber,
  red, blue, plum, teal. Steps: 1–2 backgrounds · 3–5 fills · 6–8 lines · 9 solid · 10 solid hover ·
  11 low-contrast text · 12 high-contrast text; `-aN` = alpha twin. Contrast is verified (WCAG AA for
  text, 3:1 for non-text) in every palette.
- **Surfaces**, lighter = closer: `--surface-chrome` (header, sidebar) → `--surface-app` (the stage,
  brand ground) → `--surface-panel` (cards, lists, tables, menus) → `--surface-overlay` (dialogs,
  popovers, toasts). Shadows define containers, `--line-1` divides content inside them.
- **Text:** `--text-1` (ink) · `--text-2` (meta, ≥ 4.5:1 everywhere) · `--text-3` (placeholder,
  disabled only) · `--text-accent`.
- **Status:** `--confirmed-*` green, `--waiting-*` amber, `--declined-*` red, `--info-*` the accent, each
  `-bg` / `-fg` / `-solid`.
- **Lines:** `--line-1` (dividers), `--line-2` (card edges), `--line-control` (surface buttons, chips, dashed
  frames), `--line-field` (the resting ring of a field: ≥ 3 : 1 on its fill and the surface around it),
  `--line-strong` (checkbox / radio rings), `--line-hover`.
- **Role tokens:** `--radius-control-1..3`, `--radius-field|nav|card|dialog|menu|badge|chip|avatar|mark|stage`,
  `--shadow-card|card-hover|raised|popover|dialog|stage`, `--title-font|transform|size|line`, `--section-size`,
  `--row-min-height`, `--nav-item-height`, `--control-1..3`, `--control-icon`, `--w-*`, `--sidebar`,
  `--brand-h`, `--sidebar-foot-h`, `--hero-bg|line`, `--accent-solid`.
- **Selected vs clickable.** *Selected* nav items, tabs, segments and filter chips take the ink fill of
  the mode (clay in light, pink in dark) with the light text, plus a ✓ on a filter chip, a tick or dot in
  checkbox / radio and the matching `aria-` attribute. Rose tints (`--selected-bg`) mark „mine“ (my duty,
  my row in Rozpis, today) and selected table rows. *Clickable* is shown by a fill (buttons are never an
  outline alone; a surface button inside a panel gets a soft fill), a hover fill, the cursor and a chevron
  or ⋯ at the row end. The primary action is the same ink.
- **Shape rule.** Controls, tabs, nav items, badges, chips, avatars and the switch are pills; fields are
  rounded 12, cards and dialogs 16, small panels inside a card 12. Dashed lines mean „čeká“, an empty state
  frame and the „add“ button at the end of a list. Round = a person, rounded square = a team.
- **Categorical hues** (teams, Účel, avatars): rose, blue, green, plum, teal, amber through `.c-<hue>`
  classes that set `--c3/4/5/9/11/12` (CSP-safe, no inline styles). Účel: Nedělní setkání rose,
  Zkouška blue, Skupinka teal, Akce plum. An avatar's hue is a stable hash of the person id.
  Colour never carries a meaning alone: Účel has an icon (`sun`, `music`, `home`, `star`).
- **The imprint** (cow-skin pattern) only on public pages and generated covers.

## 4. Type, space, size

| token | px | use |
|---|---|---|
| `--title-size` | 36 (28 in a compact head, 26 there on a phone) | h1 page title, Narrow Black, sentence case |
| `-7` | 24 | big numbers |
| `-6` | 20 | template and place card names |
| `-5` | 17 | section titles (`--section-size`, sentence case), lead on the public pages, size-3 controls |
| `-4` | 15 | body, size-2 controls; row titles are 16 Regular |
| `-3` | 14 | meta, table cells, field labels, hints (not inside pills) |
| `-2` | 13 | badges, chips, row meta, size-1 controls |
| `-1` | 12 · 11 | Narrow labels (uppercase, tracking .08em), counts |

**Type roles.** Agrandir Regular for everything you read, **all row titles in lists included** (one calm
weight). Agrandir Narrow Black in **sentence case** for page titles, section titles, dialog titles and the
names of people, events, households and places used as headings. Agrandir Narrow Black **uppercase with a
little tracking** for small labels: card titles and section labels inside cards and dialogs (`card-title`,
`label`, `form-section-title`, the month cards of Narozeniny, the sections of the template editor), table
heads, calendar weekday headers and day numbers, date blocks, the quiet label above a hero title, initials
in avatars and team marks. Grand Heavy for the brand only. Font sizes in controls are whole pixels that
Agrandir lays out without rounding (12, 13, 15, 16, 17); the optical centring (`--optical`) stays.

Space: 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64. Radius: 6 checkbox · 12 fields and small panels · 16
cards, dialogs and the stage · pills for everything you act on. Control heights 32 / 40 / 44, an icon
button 36 (44 for anything tappable in a row on a phone). **Rows:** lists 58 (56 on a phone); the dense
tables – Lidé › Tabulka, Rozpis, Kdo co umí, Břemeno – about 44, with tighter cells (6 × 12).
Widths: text and list 780, form 640, wide 1240; dialogs 560 (wide 760).
**Width belongs to the module, not the tab:** the page head (title + primary action) never moves when
the tab changes. Kalendář, Lidé, an event and a person are `wide` (narrower lists and forms inside stay
left-aligned); Týmy a skupinky, Jak se scházíme, Nastavení, Upozornění and Můj účet are one centred `list`
column on every tab (Kdo co umí scrolls sideways inside it).

## 5. Layout and shell

```
header.appbar     brand „církev jako kráva“ + „Zvonec“ · save status (only while saving / on error) ·
                  colour picker (bullseye) · me (avatar + name → Můj účet) | „Přihlásit se“
                  (desktop: the brand sits at the top of the sidebar, the picker and the person at its foot)
div.app-body
  aside.sidebar   nav (icon + label, count on Upozornění) · at the bottom „Veřejná část“ / „Zpátky do Zvonce“
  main.stage      div.page > header.page-head (back link · h1 · lead · actions · tabs · toolbar) + div.page-body
dialog#dialog · div.toasts
```

- **Page head:** title, optional lead, primary action top right, **views as tabs** under the title
  (`tabs`; sections of one object), a **toolbar** below (period navigator, filters, search).
  `viewSwitch` (segmented) is for switching how one thing is shown inside a tab. Two variants, chosen by
  the module with `page({ compact })`, never by the route in CSS:
  - **hero head** (default) – Přehled, detail pages (setkání, osoba, domácnost, tým, šablona, formát,
    místo) and the public part: a tinted band from the stage top (`--hero-bg`), a quiet uppercase label
    with the module name above the title, title 36, lead and meta, the tabs under the band;
  - **compact head** (`compact: true`, `header.page-head.compact`) – the working screens: Kalendář (all
    four views), Lidé (every view), Upozornění, Týmy a skupinky (lists and Kdo co umí): title 28 and
    actions on one line, a lead as one small line, the tabs right under them, no band; about 116 px from
    the stage top to the bottom of the tabs on a desktop (134 with a lead), so the work starts high.
- **Phone (< 960 px):** the appbar has the brand and „Menu“; the sidebar becomes a sheet that also holds
  the colour picker and the person; tabs and filter chips scroll sideways in one row, the hidden edge fades and the
  chosen one is scrolled into view. Calendar and tables degrade on purpose: Měsíc is a compact grid with
  a day list under it, Týden shows 3 days, Rozpis becomes one card per event („Role · ✓ Jméno“),
  Tabulka falls back to Seznam, Kdo co umí becomes a row of role chips per person. No horizontal page
  scroll except inside tables. A dialog's foot is two even rows (the main action across the full width).
- **Print:** no sidebar, no appbar, white paper. Osnova A4 portrait, Rozpis A4 landscape.

## 6. Modules and views (sitemap)

Sidebar in order of frequency; slugs are what people see and share.

| module | route | views / tabs | leader | member |
|---|---|---|---|---|
| **Přehled** | `#prehled` | blocks per role (answer, my duties, next Sunday, week, open slots, what doesn't fit, people, logins) | yes | yes, own blocks |
| **Kalendář** | `#kalendar/<pohled>/<datum>` | **Měsíc · Týden · Seznam · Rozpis**; filters Účel, Tým, „Jen moje služby“ | edit, plan in Rozpis | read |
| Setkání | `#setkani/<id>[/sluzby\|/osnova]` | **Přehled · Kdo slouží · Osnova** | edit | read, answer own duty |
| **Upozornění** | `#upozorneni[/lide]` | **Podle setkání · Podle lidí**; Závažnost, Kdy | yes | – |
| **Lidé** | `#lide/<pohled>/<filtr>` | **Seznam · Tabulka · Domácnosti · Podle skupin · Narozeniny · Břemeno**; filters Všichni · Členové · Přátelé · Hosté · Děti (+ Chybí údaje); a quiet „Archiv (n)“ at the end of the list | all six | Seznam · Domácnosti · Podle skupin |
| Archiv | `#lide/archiv` (old `…/nechodi` opens it) | cards in the archive: „v archivu od …“, Vrátit z archivu, Smazat kartu; after a year „<n> karet je v archivu déle než rok. Smazat je?“ | yes | – |
| Karta člověka | `#osoba/<id>`, `#domacnost/<id>` | per-section editing; „Přesunout do archivu“ in ⋯ (and under Členství, field „Stav“) | edit | reduced card (never an archived one) |
| **Týmy a skupinky** | `#tymy/<tymy\|skupinky\|vedeni\|umi>` | **Týmy · Skupinky · Vedení · Kdo co umí** (matrix) | yes | – |
| Tým | `#tym/<id>/<lide\|role\|umi\|setkani>` | skupinka and vedení: Lidé · Setkání only | edit | – |
| **Jak se scházíme** | `#sablony`, `#formaty[/<id>]`, `#mista` | **Šablony · Formáty · Místa**; full-page editors `#sablona/<id>`, `#misto/<id>` | edit | Formáty · Místa read |
| **Nastavení** | `#nastaveni/<sbor\|pravidla\|pristupy\|zaloha>` | **Sbor · Pravidla · Přístupy · Záloha** (GitHub klíč and „Nahrát zálohu“: admin) | yes | – |
| **Můj účet** | `#ucet` | contact, kdy nemůžu, .ics, Barvy, heslo, odhlásit; demo „Dívat se jako“ | yes | yes |
| **Veřejná část** | `#program[/<id>]`, `#jak-se-schazime` | Program (hero, weeks, „Kde nás najdete“), one event, published formats | everyone | everyone |

Navigation per role: leader **Přehled · Kalendář · Upozornění · Lidé · Týmy a skupinky · Jak se
scházíme · Nastavení**; member **Přehled · Kalendář · Lidé · Jak se scházíme**; visitor **Program · Jak se
scházíme · Přihlásit se**. Rozpis is a Kalendář view (the planning surface: a cell opens the picker in
place), not a module. Each module is complete on its own: list → detail → create / edit / delete,
with no detour through another module. Old slugs redirect (list in ARCHITECTURE.md §5).

## 7. Forms

- **At most ~7 visible controls.** The rest under **„Další možnosti“** (`disclosure`; remembers its
  state; opens by itself when something inside is set).
- Sections with a small heading and a one-line hint only when needed. Labels above, hints below.
- A time of day is always a 24-hour text field written the Czech way („10.00“, typing „930“ works) with a
  list of quarter hours (`timeInput`, never `<input type=time>`); a date is always the Czech date button
  with our calendar, on touch too. Placeholders start with „např.“ and never name a real entity.
- Single choice of ≤ 4 options: segmented control; more: select or combobox. Yes / no: **switch with a
  sentence label**, never a checkbox paragraph. Several entities: chips with a check mark and fill.
- **Dialog ≤ 560 px** for ≤ 2 sections (wide 760 for two text areas). Anything with a list inside (needs,
  osnova, rooms) is a **page** with a section nav and a sticky „Uložit“, not a dialog.
- Validation inline, in Czech, with the ✕ symbol; never only a red border. Fields are 40 px with a
  border plus a lighter fill plus a label.
- A series question („Jen tohle setkání / I N dalších“) is asked **on save**, as two buttons.
- Footer: destructive action soft red on the left, „Zrušit“ ghost and „Uložit“ solid on the right.

## 8. Public vs. signed-in

| | public (not signed in) | member | leader / admin |
|---|---|---|---|
| published events: title, date, time, places (address, map), description, picture | yes | yes | yes |
| published formats: name, minutes, Proč, Jak | yes | yes | yes |
| names of people, duties, Rozpis, osnova leaders | – | yes | yes |
| contacts | – | only people who share them | yes |
| membership, ages, notes, consent, availability reasons, Upozornění, Břemeno | – | – | yes |

- Publishing is explicit: `event.public` (a new event starts from its template's `public`), the text
  people read in `event.description`; `format.public`. `event.note` („Pro tým“) is never public.
  Nothing else ever is.
- The public site is built from `public.json`, written by the data-repo workflow from published,
  upcoming items only (`lib/public.js`, pure, tested; no person data at all). Rooms are resolved to
  `{ name, building?, address?, lat?, lon? }`.
- A visitor sees Program, Jak se scházíme and „Přihlásit se“; the sign-in form is a page, not the site.
  Demo mode shows the same public pages built from demo data („Veřejná část“ in the sidebar).
- Every event has a picture, title, date, time and description: uploaded `event.image`, else the
  template's, else a **generated cover** (palette, imprint, title in Narrow Black; one template or
  series = one composition). Places show address and „Otevřít v mapě“ and, with coordinates, an
  OpenStreetMap iframe.

## 9. Components (the kit: `ui/kit.js`, `ui/icons.js`, re-exported by `ui/dom.js`)

Screens import only from `ui/dom.js`. The specimen `#kit` renders every piece in both modes.

- **Page:** `page({ title, lead, meta, back, media, actions, tabs, toolbar, body, width, compact })`, `tabs`,
  `viewSwitch`, `toolbar`, `spacer`, `dateNav`, `searchField`, `chips`, `chipLinks`.
- **Actions:** `button` (variants `solid` · `soft` · `surface` · `ghost` · `danger`; sizes s / m / l),
  `iconButton`, `menuButton` (kebab).
- **Status:** `badge`, `countBadge`, `statusBadge`, `statusIcon`, `severityBadge`, `severityIcon`,
  `cancelledBadge`, `meTag` („ty“), `callout`, `fillRing` (`{ confirmed }` = two arcs) / `progressBar`
  („12 z 14“), `toast`.
- **Containers:** `card`, `panel`, `facts`, `emptyState`, `list` / `row` / `groupedList`, `dateBlock`,
  `table` (sortable, selectable, bulk bar, `statusCell`).
- **People and marks:** `avatar`, `avatarStack`, `personName`, `personLine`, `assignee`, `groupMark`,
  `kindMark`, `eventCover`, `placeLine`, `placeMap`, `metaJoin`.
- **Forms:** `formDialog`, `infoDialog`, `formSection`, `disclosure`, `field`, `textField`, `textArea`,
  `selectField`, `segmentedField`, `chipsField`, `switchField`, `dateField`, `timeRange` / `timeField`
  (`timeInput`), `numberField`,
  `personPicker`; modules may define kit candidates (`peopleField`, `placeChipsField`, `coordsField`,
  `skillMatrixTable`) until they are promoted.
- Meta lines join their parts with „ · “ (`metaJoin`; the dot stays at the end of a wrapped line).
- New piece needed: build it in your module, list it in the change, then promote it into the kit and
  the specimen.

## 10. Done means

- Every flow of every module works in demo and in live mode (mocked GitHub) for admin, leader, member
  (via „Dívat se jako“) and signed out.
- Screens checked at 1440 × 900 and 390 × 844, light and dark; nothing stretched or
  tiny, no horizontal scroll, zero console errors.
- Contrast holds in every mode; focus is visible; everything works by keyboard.
- Public part shows only published data; tests prove `public.json` has no person data.
- `node --test zvonec/test/*.test.mjs` is green and every JS file passes `node --check`.
