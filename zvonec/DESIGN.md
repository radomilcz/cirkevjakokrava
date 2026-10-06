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
   state is one sentence plus the primary action.
4. **Full names** wherever a person is assigned to something (duty, osnova item, team member, picker).
   Only the dense Rozpis table may shorten („Veronika F.“), never to a bare first name.
5. **Status = symbol + colour + word**, never one of them alone and never outline style alone.
   `confirmed` filled circle with a tick, green, „potvrzeno“; `proposed` dashed ring with a clock,
   amber, „čeká na potvrzení“; `declined` ✕ in a ring, red, name struck through, „nemůže“. Warnings:
   `error` / `warning` / `info` have their own symbols and the words chyba / pozor / info. Symbols
   are drawn (SVG), use `currentColor` and print in black.
6. **Semantics before looks.** Screens and the kit emit one semantic DOM; looks only override tokens
   and a few structural rules (§2). No raw colours, font names or radius numbers in module CSS.
7. **Czech** is natural and plain (CLAUDE.md, `kontrola-cestiny`). Buttons are a verb (+ object).
   „Může se přihlásit“, never „má přihlášení“.
8. **Keyboard and screen reader:** real buttons and links, a label on every field, a visible focus ring
   (2 px `--focus`), Esc closes dialogs and menus, `aria-current` / `aria-pressed` / `aria-selected`
   mirror what is shown as chosen.

## 2. Two looks, one DOM

| | look **Zvonec** (default) | look **Milníkovač** (`milnik`) |
|---|---|---|
| attribute | `<html data-look="zvonec">` | `<html data-look="milnik">` |
| file | `css/tokens.css` (the base for every look; no `look-zvonec.css`) | `css/look-milnik.css`, loaded last |
| character | tool on a cream stage, sheet inset in the chrome, rounded rectangles for controls, uppercase Narrow titles 32 px | the owner's prototype in our palette: pill controls and pill tabs, sentence-case Narrow titles 36 px, hero page head, wider sidebar (264 px), narrower lists (780 px) |

Both use the brand: clay `#3b2f2f`, pink `#e6acac`, cream `#f9e7dd`; Agrandir Regular, Agrandir Narrow
Black, Agrandir Grand Heavy.

- **Mode** (`data-theme="light|dark"`, absent = the device decides) and **look** are independent.
  Both are chosen in the header menu „Vzhled“ (sections „Režim“: Podle zařízení · Světlý · Tmavý, and
  „Vzhled“: Zvonec · Milníkovač), and again in Můj účet. They are remembered per browser
  (`localStorage` `zvonec-theme`, `zvonec-look`; never part of the data).
- A link may set them: `?vzhled=milnik|zvonec`, `?rezim=svetly|tmavy|zarizeni`; the choice is kept.
- `ui/palette.js` is a classic script in `<head>`: it applies both attributes before the first paint,
  exposes `window.zvonecAppearance` and fires `zvonec:appearance`.
- A look may change tokens, the shell, tabs, buttons, badges, titles; it must not change structure,
  copy or behaviour. Every feature works the same in both.

## 3. Tokens and semantic rules

Components use only **semantic tokens**; raw scale steps only for categorical colour.

- **Scales** (OKLCH, 12 steps, pinned to the palette): gray (warm „clay“), rose (accent), green, amber,
  red, blue, plum, teal. Steps: 1–2 backgrounds · 3–5 fills · 6–8 lines · 9 solid · 10 solid hover ·
  11 low-contrast text · 12 high-contrast text; `-aN` = alpha twin. Contrast is verified (WCAG AA for
  text, 3:1 for non-text), light and dark.
- **Surfaces**, lighter = closer: `--surface-chrome` (header, sidebar) → `--surface-app` (the stage,
  brand ground) → `--surface-panel` (cards, lists, tables, menus) → `--surface-overlay` (dialogs,
  popovers, toasts). Shadows define containers, `--line-1` divides content inside them.
- **Text:** `--text-1` (ink) · `--text-2` (meta, ≥ 4.5:1 everywhere) · `--text-3` (placeholder,
  disabled only) · `--text-accent`.
- **Status:** `--confirmed-*` green, `--waiting-*` amber, `--declined-*` red, `--info-*` blue, each
  `-bg` / `-fg` / `-solid`.
- **Role tokens a look overrides:** `--radius-control-1..3`, `--radius-nav|card|dialog|badge|chip|tab|
  avatar|mark|stage`, `--shadow-*`, `--title-font|transform|size|line`, `--section-size`,
  `--row-min-height`, `--nav-item-height`, `--control-1..3`, `--w-*`, `--sidebar`.
- **Selected vs clickable.** *Selected* changes three channels at once: fill hue (neutral → rose
  `--selected-bg`), a shape mark (indicator bar on nav and rows, underline on tabs, raised thumb on a
  segmented control, ✓ on a filter chip, tick or dot in checkbox / radio), and text colour
  (`--selected-fg`), plus the matching `aria-` attribute. *Clickable* is shown by a fill (buttons are
  never an outline alone), a hover fill, the cursor and a chevron or ⋯ at the row end. Rose means
  selection; the primary action is the ink of the mode (clay in light, pink in dark).
- **Shape rule.** Rounded rectangles are things you act on (buttons, fields, segmented, nav items);
  full pills are state and identity (badges, counts, filter chips, avatars, switch). Dashed lines are
  reserved for „čeká“. Round = a person, rounded square = a team. (Look Milníkovač makes controls pills
  too, but selection still uses the three channels.)
- **Categorical hues** (teams, Účel, avatars): rose, blue, green, plum, teal, amber through `.c-<hue>`
  classes that set `--c3/4/5/9/11/12` (CSP-safe, no inline styles). Účel: Nedělní setkání rose,
  Zkouška blue, Skupinka teal, Akce plum. An avatar's hue is a stable hash of the person id.
  Colour never carries a meaning alone: Účel has an icon (`sun`, `music`, `home`, `star`).
- **The imprint** (cow-skin pattern) only on public pages and generated covers.

## 4. Type, space, size

| token | px | use |
|---|---|---|
| `--font-size-8` | 32 (36 in Milníkovač) | h1 page title, Narrow Black, uppercase (sentence case in Milníkovač) |
| `-7` | 24 | h1 on a phone, big numbers |
| `-6` | 20 | h2 section, dialog title (Narrow, uppercase) |
| `-5` | 17 | lead sentence, size-3 controls |
| `-4` | 15 | body, row titles, size-2 controls |
| `-3` | 14 | meta, table cells, labels, hints (not inside pills) |
| `-2` | 13 | badges, chips, size-1 controls |
| `-1` | 12 | Narrow labels (tracking .08em), counts |

Agrandir Regular for everything readable; Narrow Black for titles, labels and marks (initials, day
numbers, times in chips); Grand Heavy for the brand only. Font sizes in controls are whole pixels that
Agrandir lays out without rounding (12, 13, 15, 16, 17); the optical centring (`--optical`) stays.
Space: 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64. Radius: 4 checkbox · 6 / 8 / 10 controls · 14 cards ·
18 dialogs and stage. Control heights 28 / 36 / 44 (44 for anything tappable in a row on a phone).
Widths: text 72ch, list 960, form 640, wide = the whole stage; dialogs 560 (wide 760).

## 5. Layout and shell

```
header.appbar     brand „církev jako kráva“ + „Zvonec“ · save status (only while saving / on error) ·
                  Vzhled menu · me (avatar + name → Můj účet) | „Přihlásit se“
div.app-body
  aside.sidebar   nav (icon + label, count on Upozornění) · at the bottom „Veřejná část“ / „Zpátky do Zvonce“
  main.stage      div.page > header.page-head (back link · h1 · lead · actions · tabs · toolbar) + div.page-body
dialog#dialog · div.toasts
```

- **Page head:** title, optional lead, primary action top right, **views as tabs** under the title
  (`tabs`; sections of one object), a **toolbar** below (period navigator, filters, search).
  `viewSwitch` (segmented) is for switching how one thing is shown inside a tab.
- **Phone (< 960 px):** the appbar has the brand and „Menu“; the sidebar becomes a sheet that also holds
  Vzhled and the person; tabs scroll sideways. Calendar and tables degrade on purpose: Měsíc is a compact
  grid with a day list under it, Týden shows 3 days, Tabulka falls back to Seznam. No horizontal page
  scroll except inside tables.
- **Print:** no sidebar, no appbar, white paper. Osnova A4 portrait, Rozpis A4 landscape.

## 6. Modules and views (sitemap)

Sidebar in order of frequency; slugs are what people see and share.

| module | route | views / tabs | leader | member |
|---|---|---|---|---|
| **Přehled** | `#prehled` | blocks per role (answer, my duties, next Sunday, week, open slots, what doesn't fit, people, logins) | yes | yes, own blocks |
| **Kalendář** | `#kalendar/<pohled>/<datum>` | **Měsíc · Týden · Seznam · Rozpis**; filters Účel, Tým, „Jen moje služby“ | edit, plan in Rozpis | read |
| Setkání | `#setkani/<id>[/sluzby\|/osnova]` | **Přehled · Kdo slouží · Osnova** | edit | read, answer own duty |
| **Upozornění** | `#upozorneni[/lide]` | **Podle setkání · Podle lidí**; Závažnost, Kdy | yes | – |
| **Lidé** | `#lide/<pohled>/<filtr>` | **Seznam · Tabulka · Domácnosti · Podle skupin · Narozeniny · Břemeno**; filters Všichni · Členové · Přátelé · Hosté · Děti · Už nechodí (+ Chybí údaje) | all six | Seznam · Domácnosti · Podle skupin |
| Karta člověka | `#osoba/<id>`, `#domacnost/<id>` | per-section editing | edit | reduced card |
| **Týmy a skupinky** | `#tymy/<tymy\|skupinky\|vedeni\|umi>` | **Týmy · Skupinky · Vedení · Kdo co umí** (matrix) | yes | – |
| Tým | `#tym/<id>/<lide\|role\|umi\|setkani>` | skupinka and vedení: Lidé · Setkání only | edit | – |
| **Jak se scházíme** | `#sablony`, `#formaty[/<id>]`, `#mista` | **Šablony · Formáty · Místa**; full-page editors `#sablona/<id>`, `#misto/<id>` | edit | Formáty · Místa read |
| **Nastavení** | `#nastaveni/<sbor\|pravidla\|prihlaseni\|zaloha>` | **Sbor · Pravidla · Přihlášení · Záloha** (GitHub klíč and „Nahrát zálohu“: admin) | yes | – |
| **Můj účet** | `#ucet` | contact, kdy nemůžu, .ics, Vzhled, heslo, odhlásit; demo „Dívat se jako“ | yes | yes |
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
- Single choice of ≤ 4 options: segmented control; more: select or combobox. Yes / no: **switch with a
  sentence label**, never a checkbox paragraph. Several entities: chips with a check mark and fill.
- **Dialog ≤ 560 px** for ≤ 2 sections (wide 760 for two text areas). Anything with a list inside (needs,
  osnova, rooms) is a **page** with a section nav and a sticky „Uložit“, not a dialog.
- Validation inline, in Czech, with the ✕ symbol; never only a red border. Fields are 36 px with a
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

- **Page:** `page({ title, lead, meta, back, media, actions, tabs, toolbar, body, width })`, `tabs`,
  `viewSwitch`, `toolbar`, `spacer`, `dateNav`, `searchField`, `chips`, `chipLinks`.
- **Actions:** `button` (variants `solid` · `soft` · `surface` · `ghost` · `danger`; sizes s / m / l),
  `iconButton`, `menuButton` (kebab).
- **Status:** `badge`, `countBadge`, `statusBadge`, `statusIcon`, `severityBadge`, `severityIcon`,
  `callout`, `fillRing` / `progressBar` („12 z 14“), `toast`.
- **Containers:** `card`, `panel`, `facts`, `emptyState`, `list` / `row` / `groupedList`, `dateBlock`,
  `table` (sortable, selectable, bulk bar, `statusCell`).
- **People and marks:** `avatar`, `avatarStack`, `personName`, `personLine`, `assignee`, `groupMark`,
  `kindMark`, `eventCover`, `placeLine`, `placeMap`, `metaJoin`.
- **Forms:** `formDialog`, `infoDialog`, `formSection`, `disclosure`, `field`, `textField`, `textArea`,
  `selectField`, `segmentedField`, `chipsField`, `switchField`, `dateField`, `timeRange`, `numberField`,
  `personPicker`; modules may define kit candidates (`peopleField`, `placeChipsField`, `coordsField`,
  `skillMatrixTable`) until they are promoted.
- Meta lines join their parts with „ · “ (`metaJoin`; the dot stays at the end of a wrapped line).
- New piece needed: build it in your module, list it in the change, then promote it into the kit and
  the specimen.

## 10. Done means

- Every flow of every module works in demo and in live mode (mocked GitHub) for admin, leader, member
  (via „Dívat se jako“) and signed out.
- Screens checked at 1440 × 900 and 390 × 844, light and dark, in **both looks**; nothing stretched or
  tiny, no horizontal scroll, zero console errors.
- Contrast holds in every mode; focus is visible; everything works by keyboard.
- Public part shows only published data; tests prove `public.json` has no person data.
- `node --test zvonec/test/*.test.mjs` is green and every JS file passes `node --check`.
