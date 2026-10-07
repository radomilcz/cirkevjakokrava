# Zvonec One: the codex

The binding rules for every screen, sheet, pane and menu of One (`docs/zvonec/one/`). It is codex v2
(`zvonec/design/one-question/codex.md`) adjusted to `DESIGN.md`. Where v2 and this file differ, this file wins
for One. A screen never sets its own size, corner, weight, gap or colour: it uses a token or a kit component.
Tokens live in `one/css/tokens.css` (forked from `simple/css/next-tokens.css`, names kept, values below).

Changes from v2, in one line each:
1. The toolbar is **one row: search + Filtr**. The view switch is its own row under it; the period is the first line
   of the content (v2 §6 „`[‹ label ›][Dnes] ··· [view switch][Filtr]`“ is retired with its wrap rule).
2. No overline, subtitle, lead line or chip between the title row and the toolbar, ever.
3. No floating action button. The main action is in the title row at every width.
4. S (36) is used for actions inside content **from 600 up**; on a phone those actions are M.
5. The type steps at **600** (was 960). Breakpoints: 600 / 900 (CSS only: rail ↔ sidebar) / 1200.
6. The selection bar is `--mark` (`--indicator`), not `--selected-line`.
7. The pane: one geometry (§6.4); a detail is never shown in a dialog.

---

## 1. Heights: three, nothing in between

| size | px | token | what |
|---|---|---|---|
| **S** | 36 | `--control-s` | ≥ 600 only: an action inside content (a section head's „Uprav“ / „+ Přidej“, a row's call button, the „+ Role“ slot, „Celá osnova ›“ when a button). Hit area 44 via `::after`. |
| **M** | 44 | `--control-m` | every other control: buttons, icon buttons, search, fields, selects, chips, the segmented switch, ‹ › „Dnes“, „Filtr“, sidebar items, popover menu rows; on a phone also everything S is on ≥ 600 |
| **L** | 52 | `--control-l` | the one main action at the foot of a sheet or dialog, Můžu / Nemůžu, the contact tiles Zavolej · SMS · E-mail, the sign-in button |

Fixed structural heights (not controls): tab bar 64 + safe area (`--tabbar-h`), top bar 56 (`--topbar-h`), title row
44, sidebar foot 56, rail cell 64, row 64 / 52 on a phone, 60 / 48 from 600 (`--row-h`, `--row-h-single`), team row in
Kdo slouží 52, month chip 24 (hit 44 via the cell), mini-month cell 44, Setkání band 96 (120 on a ≥ 600 page).

A control never sets its own pixel height. Anything drawn smaller (a cell's „+“, a table tick, a chip in a grid)
gets the 44 hit area through `::after`.

## 2. Corners: the corner follows the height

| what | radius | token |
|---|---|---|
| S control | 10 | `--radius-s` |
| M control, a lit row, a field, the toast | 12 | `--radius-m` |
| L control | 14 | `--radius-l` |
| a part inside a control (segmented thumb, stepper part) | 9 (12 − 3) | `--shape-inner` |
| values: chips, pills, counts, badges, tags, the „+ Role“ slot, the month chip's right side | capsule | `--shape-pill` |
| blocks: pane, card, Moje's answer card, dialog, popover, menu, the Setkání band, the map | 20 | `--shape-block` |
| a phone sheet's top corners | 28 | `--shape-sheet` |
| person | circle | – |
| group / team mark | 30 % | `--shape-team` |
| date arch, empty-state well, mini-month day | arch | `--shape-arch`, `--shape-arch-l`, `--shape-arch-sm` |

No other radius exists (no 7, 8, 16, 18, 24). **Never a coloured side border on anything rounded.** A colour bar
is either detached (§5) or sits on a straight edge (the month chip's Účel bar: the chip is square on that side) or
is its own element (the Účel bar in Seznam).

## 3. Type: one size per role, one weight per kind, no weight change by state

Two families: Schibsted Grotesk (`--font-ui`) for everything people read and touch; Agrandir Narrow Black
(`--font-title`) only for the h1, the date-arch numeral, the minutes-block number and the empty-state headline;
Agrandir Grand Heavy (`--font-brand`) only for the wordmark.

| role | phone < 600 | ≥ 600 | weight | token |
|---|---|---|---|---|
| h1 of a screen or a page | 34/36 | 40/44 | (Agrandir) | `--type-title` |
| h1 in a pane | 34/36 | 34/36 | (Agrandir) | `--type-title-pane` |
| h2: section, sheet / dialog title | 20/26 | 20/26 | 620 | `--type-lead` |
| row title | 17/24 | 16/22 | 620 | `--type-body` |
| body text | 17/24 | 16/22 | 400 | `--type-body` |
| meta, hints, field labels | 15/20 | 14/20 | 400 (field labels 620) | `--type-meta` |
| control label S / M / L, typed text | – / 16 / 17 | 14 / 15 / 17 | 620 (typed text 400) | `--type-control-s/-/-l` |
| caption: tab and rail labels, weekdays | 13/16 | 13/16 | 500 | `--type-caption` |
| values: counts, badges, pills, tags | 13/16 | 13/16 | 620 | `--type-caption` |
| subheads in a list („Tento týden“, „B“, „Týmy“), group titles | 13/16 | 13/16 | 620, `--ink-2` | `--type-caption` |
| sidebar item | – | 15/20 | 500 | `--type-nav` |
| period label | 17/24 | 17/24 | 620, fixed width `--period-label-w` | – |

- **A state never changes a weight or a size.** Current, chosen, open, hovered: the fill and the bar change; the words
  do not move. Navigation has one weight (500) in every state.
- Typed text is ≥ 16 on a phone (no zoom). Placeholders are „Hledej“ + one noun and end in „…“ if cut.
- Text in narrow places breaks between words (`overflow-wrap: normal`) and ends with „…“; labels that must stay whole
  are `white-space: nowrap; flex: none`.

## 4. Space and rhythm

| gap | px | where |
|---|---|---|
| side by side | 8 | controls in a row (search ↔ Filtr, ⋯ ↔ main action, Můžu ↔ Nemůžu, chips in a row) |
| stacked controls | 12 | title row → toolbar, toolbar → view row, chip rows in Filtr, buttons in a sheet foot |
| control group → content | 24 | the last control row → D; a sheet head → its body |
| between sections | 32 | in a detail and on a page (`--section-gap`) |
| section head → its content | 12 | |
| lit rows | 3 | the gap between two rows that may light up |
| empty state | 48 | under the last control row |

- Gutters / content padding: phone 20, tablet 32, desktop 40 (`--gutter`). Title top under the safe area: 16 / 32 / 40
  (`--title-top`). Hence the search's top: y 72 / 88 / 96.
- Controls stacked in one column share one width (search row and view row line up on the left; the toolbar and the
  list share the list column's width).
- **A row of controls shares one height.** Never a 36 next to a 44.
- Nothing overlaps, nothing is cut, no sideways page scroll from 360 up. When a group of controls runs out of room
  it wraps as a whole; nothing squeezes under anything (with this design no toolbar ever needs to wrap).

## 5. Lit rows, selection, current

- **Hover:** `--wash` fill on the whole row, radius 12. **Pressed:** `--press`.
- **Selected / open / current** (one look everywhere: rows, Seznam events, Rozpis blocks, Obsazení items, nav items,
  table rows, the chosen mini-month day): `--pick` fill + a **detached 3 px bar** in `--mark`:
  `width: 3px; border-radius: 0 3px 3px 0`, at the item's left edge, **16 px tall (`--mark-h`), centred on the item** – the owner found a
  bar running the item's height too tall (sidebar: at the sidebar's edge, the same 16). The chosen mini-month day: `--pick` on its arch + a 16 × 3 bar centred 3 under the cell,
  radius 3. Selected + hover = `--pick-hover`, never grey.
- Phone tab, rail cell: the niche (56 × 32 capsule behind the icon) takes `--pick`; the rail adds the bar at its edge.
- **No hairline touches a lit row.** The hairline belongs to the row below (`::before`, inset to the text start) and
  hides for the lit row and the row after it. Lit rows keep 3 apart.
- A block that leads to a detail is **one link** with a whole-block hover; its inner controls (call button, slot,
  „○ … ›“) still work and stop the click from reaching the block.

## 6. The shared components (one build each, in `one/ui/kit/`)

### 6.1 Screen head – `screenHead({ title, action, menu, back })`

```
[‹ Parent]                                   (drill-in pages only: a top bar 56 on every width, §6.5)
h1 ································ [⋯][main action]
```
- Title row: min-height 44, items centred; h1 `flex: none`, one line (a long page title wraps under the actions,
  never under them). At the content's right edge (≥ 1200: the list track's, §6.4): ⋯ (outlined like a quiet button, so it never reads as an empty place), then the main action, 8 apart – the main action ends at the edge (the owner's order).
- **Main action:** primary M (`--act` / `--on-act`, r12, 620). Phone: icon-only 44 square with its aria-label
  („Přidej setkání“). ≥ 600: icon 20 + label. `data-primary` (the „N“ key). Shown only to who may use it.
- **⋯:** quiet icon M, aria-label „Další možnosti“; opens a menu (§6.10). Absent when empty.
- Same y on every screen of a width class. Never an overline, subtitle, chip or count in the head.

### 6.2 List toolbar – `toolbar({ search, filter })` (band B)

```
[⌕  Hledej setkání ················· ✕][⚟ Filtr ⁿ]
```
- Width = the list column (`--list-col`). One row, height 44, no wrap.
- **Search** (`searchField`): M 44, r12, `--field-bg`, 1 px `--edge-field`, icon 20 inside left at 12, text 16 (phone)
  / 15, `flex: 1 1 auto; min-width: 160px`; ✕ (icon button 44, quiet) appears inside on the right when there is
  text. `type=search`, `enterkeyhint=search`, label = placeholder.
- **Filtr button** (`filterButton`): quiet M (transparent, 1 px `--edge-control`), **width 120**
  (`--filter-w`), `flex: none`: icon „sliders“ 20 · 8 · „Filtr“ 620 · 8 · count slot 28 wide. The slot holds a
  count capsule (20 high, min-width 20, 13/620, `--act` / `--on-act`); at 0 it is `visibility: hidden`. Pressed
  state while its layer is open: `--press`. aria-label „Filtr, zapnuto 2“ / „Filtr“.

### 6.3 View row and period line

- **View switch** (`segmented`): M 44, track `--tint`, padding 3, outer r12; thumb r9, `--thumb` fill with
  `--on-act` text, `--lift-2`; labels 16 / 15, 620 in both states. Phone: full width, `grid-auto-columns: 1fr`. ≥ 600:
  each segment 120 (`--seg-w`). Links (`<a>` with `aria-current`), so a view is a URL.
- **Period line** (`periodLine`, first line of D in Měsíc and Rozpis): `[‹] [label] [›]` (icon buttons M + a label of
  fixed width `--period-label-w: 136px`, 17/620, centred, `flex: none`), then a flexible gap, then „Dnes“ (quiet M,
  the same look as Filtr without the slot) at the right edge. ← / → change the month on ≥ 600 when no field has
  focus. „Dnes“ is always shown (in the current month it chooses today).

### 6.4 Detail pane and detail page – `detail({ back, close, menu, body })`

- **Split grid** (≥ 1200): `grid-template-columns: minmax(400px, 560px) minmax(440px, 720px); column-gap: 32px;`
  max width 1312 (`--frame-max`). A, B, C and the list are in track 1 (A's actions end at the list's right edge;
  under 440 the main action is icon-only, a container query on A); the pane in track 2,
  `align-self: start`, its top level with B's top. Both tracks always exist. Měsíc's wide grid spans both tracks.
- **Pane:** `--card`, r20, padding 24, `--lift-2`; `position: sticky; top: 24px` while it fits, `data-tall` → static
  (Simple's `fitPanes()`); never `overflow: auto`. Action row 44 at the top: `‹ Back` (quiet M with its label) left,
  only when drilled in; ⋯ then ✕ (quiet icon M, 8 apart, `data-pane-close`) right. The band / mark starts 12 under it.
- **Page** (< 1200, deep links, Osnova): a top bar 56, sticky, `--ground`, hairline once scrolled: `‹ Parent` left, ⋯
  right. On ≥ 600 the page column is 720 (`--detail-col`), left-aligned. The body starts 12 under the top bar.
- Head order and offsets: band 96 or mark 56 / 72 → 16 → tag(s) → 8 → h1 → 12 → facts (rows 32, icon 20 + text 16, 8
  apart; a linked fact ends in › and lights as a row) → 32 → sections.
- **Section head** (`section`): h2 20/26 620 left; right edge: at most one action (quiet S „Uprav“ or tint S „+
  Přidej“; M on a phone) or one value (count, ring 20 + 13 text). 12 to its content, 32 between sections.

### 6.5 Top bar (drill-in pages)

56 tall, padding = the gutter, `‹ Parent` (quiet M, chevron 20 + label 16/15 620) left, ⋯ right; sticky on every
width; `--lift-1` once scrolled. Tab roots and list screens never have a top bar.

### 6.6 Row – `row({ lead, title, meta, trail, href | onclick, selected })`

```
[lead 40] 12 [title 17/620 ·····························] 12 [trail]
             [meta 15/400 --ink-2 ·························]
```
- Min-height `--row-h` (64 / 60) with meta, `--row-h-single` (52 / 48) without; padding 8 × 12; radius 12.
- **Lead** (one of): avatar 40, date arch 44 × 56, team mark 40, Účel mark 40, minutes block 40, pin mark 40, icon 24.
- **Trail** (exactly one or none): a value (pill or count), the fill ring, one control (call button: quiet icon M on a
  phone, S with a 44 hit on ≥ 600), or ›. A value never sits inside the meta line.
- Title and meta wrap between words; the trail is `flex: none`.
- States per §5. The whole row is one `<a>` (or `<button>`); the trail control is a sibling, not a child of it.
- Variants with the same anatomy: the Seznam event (time column 52, Účel bar 3, text), the Obsazení item (arch +
  text + ring + slot line), the Rozpis block (arch + title/time + team lines), the person's-menu row, menu rows.

### 6.7 Chip, pill, tag, count, slot

- **Chip** (a choice in Filtr and in forms): M 44 capsule, padding 0 16, label 16 / 15, 620 in both states. Off:
  transparent + 1 px `--edge-control`. On: `--act` fill, `--on-act` text, no border change in size, **no ✓ that adds
  width**. A hue dot 8 before the label in Filtr › Účel. Chips wrap: 8 across, 12 down.
- **Pill** (a value: „na webu“, „ty“, „správce“, „host“): 24 high capsule, 13/620, padding 0 10, `--tint` / `--ink-2`,
  `white-space: nowrap; flex: none`.
- **Tag** (Účel): a pill in `--hue-fill` / `--hue-ink`.
- **Count / badge**: 20 high capsule, min-width 20, 13/620, `--act` / `--on-act` (on the tab icon, the sidebar item's
  trail, Filtr's slot). The person tab's invite mark is an 8 dot in `--act`.
- **Slot** („+ Klávesy“): S capsule on ≥ 600, M on a phone; dashed 1 px `--edge-control`, transparent, label 14 / 16
  620, icon „plus“ 16. Hit 44.

### 6.8 Buttons

| variant | fill | text | border |
|---|---|---|---|
| primary | `--act` | `--on-act` | – |
| quiet | transparent | `--ink` | 1 px `--edge-control` |
| tint | `--tint` | `--ink` | – |
| danger | `--no-solid` | `--on-no` | – |
| icon (quiet) | transparent | `--ink` | – (44 square, icon 24 / 20 on S) |

Labels 620 in every state; icon 20 (S 16) then 8 then the label. Hover: `--act-hover` / `--wash` / `--tint-2`.

### 6.9 Layers – `layer.open({ kind, size, anchor, title, body, foot })`

| kind | phone < 600 | ≥ 600 |
|---|---|---|
| `sheet` (form, picker, a choice with fields) | bottom sheet: top r28, grabber 36 × 4 at 8, head 44 (h2 20/620 + ✕ quiet M), padding 20, body scrolls, foot sticky; max-height 92dvh | dialog centred, r20, padding 24; width S 400 · M 480 · L 640; max-height 85vh |
| `filter` | bottom sheet as above | popover 360 under the Filtr button, right edges aligned, r20, padding 20 |
| `menu` (⋯, a row's menu, the person's menu) | action sheet, titled by its object („Zkouška chval“), rows 52, no foot | popover min 240 / max 320, r20, padding 8, rows M 44 (r12, lit per §5); the person's menu 320 |
| `popover` (a day in the month grid) | – | 320, anchored to the cell, r20, padding 16 |
| `confirm` | sheet: the question as h2 („Chceš smazat Zkoušku chval?“), one sentence, foot | dialog S 400 |

- **Foot:** phone – primary L full width, the secondary (quiet L) 12 under it. Dialog – L buttons right-aligned,
  secondary 8 to the left of the primary. Confirm: primary = danger when destructive; secondary „Nech to být“.
- **Filtr layer:** groups (h3 13/620 `--ink-2`, 24 between groups), chips per §6.7 or switch rows. Choices apply at
  once. Phone foot: [Ukaž 12 setkání] (primary L, the live count; closes) and [Zruš filtr] (quiet L, only when
  something is on). Popover foot: [Zruš filtr] quiet M, only when something is on.
- **Stacking:** all layers mount in `#layers`. Layer n (1-based) sets its scrim `z-index: 40 + 2n` and itself
  `41 + 2n` from JS (CSSOM, allowed by the CSP); each layer has its own `--dim` scrim, so a second layer dims the
  first. **Depth ≤ 2** (form → date picker; picker → its confirm). A menu item that opens a sheet closes the menu
  first. On a phone a second sheet is 24 shorter than the first so its top edge shows, dimmed.
- Anchored layers flip up when there is no room below and keep 8 from every window edge. A layer is never a child of
  a scrolling parent (sidebar, rail, pane, table). Esc and a scrim tap close the top layer; focus goes in and returns
  to the opener.

### 6.10 Toast

`--overlay`, r12, `--lift-4`, padding 12 16, text 15 / 14 + at most one action („Vrať“, quiet S on ≥ 600, M on a
phone). Phone: centred, 16 above the tab bar, max 360. ≥ 600: bottom-left of the content frame, 24 from the bottom,
max 400. 6 s; Ctrl Z triggers its „Vrať“. z-index 60 (above layers).

### 6.11 Main action (there is no FAB)

The main action is the primary button in the title row (§6.1). There is no floating button at any width. A view
never changes it. When a screen's main action is not an „add“ and the phone has no room for its label (Obsazení:
„Doplň volná místa“), the phone puts it first in ⋯.

### 6.12 Empty state – `empty({ case, title, text, action })`

Arch well 88 (`--shape-arch-l`, `--tint`) with an icon 32 `--ink-2`; 16 → h2 20/620; 8 → one sentence 15 / 14
`--ink-2`; 24 → at most one quiet M action. Left-aligned in the list column, 48 under the last control row. Cases:
`none`, `search`, `filter` (DESIGN §3.4). In Měsíc and Rozpis: one quiet line under the period line instead.

### 6.13 Navigation pieces

- **Sidebar** 248, `--bar`, full height, fixed; brand 32 from the top; items M 44, r12, inset 12, 3 apart, icon 20,
  label 15/500, count trailing; group title 13/620 `--ink-2`, 24 above, 8 below; the item list scrolls on its own,
  the foot (56) is pinned.
- **Rail** 88 (600–899): cells 64, icon 24 + label 13/500 under it, niche 56 × 32; group divider 32 × 1 `--hairline`,
  12 above and below; avatar 40 pinned at the foot.
- **Tab bar** 64 + safe area, `--bar`, hairline on top; equal tabs; icon 24 in the niche, label 13/500; hidden while
  the keyboard is up (`data-keyboard`).
- **Person's menu**: §6.9 menu kind; rows per §6.6; section headings 13/620 `--ink-2`, 24 above, 8 below; „Barvy“ row
  = label + three bullseyes (44 each, 8 apart).

### 6.14 Calendar pieces

- **Date arch** 44 × 56, `--tint`, weekday 13/500 caps `--tracking-caps`, numeral Agrandir 22; today = `--act` /
  `--on-act`.
- **Účel bar** (Seznam, Rozpis, Obsazení, Pastva): its own element, 3 wide, as tall as title + meta, square ends,
  `--hue-mark`, 12 from the time column and 12 from the text.
- **Month chip** 24, padding 0 8, square left edge with the 3 px bar, right corners 9; time 13/620 + title 13/400;
  mine: `--hue-fill` / `--hue-ink`; cancelled: struck, `--ink-3`; max 3 per cell, then „+ 2 další“ (13/620 link).
- **Grid cell** min-height 112, padding 8, hairlines `--hairline`; the day number 16/620 in a 28 arch (today `--act`).
- **Mini month**: cells 44; day 16/400 (today `--act` disc, chosen `--pick` + bar per §5); dots 6, 3 apart, under the
  number, `--hue-mark`.

### 6.15 Save line

Simple's, unchanged: a status capsule (13/620) that says „Ukládám…“ after 1 s, stays with „Změny se neuložily · Zkus
to znovu“ (`--no-fill` / `--no-ink`) or the offline sentence, and is otherwise hidden; `beforeunload` while unsaved.

## 7. Colour

- Palette tokens only (`../css/palettes.css`, mapped to One's role names in `tokens.css`). No raw colour anywhere in
  One's CSS or JS, except the bullseye rules that `palettes.css` already carries.

| One token | palette token | use |
|---|---|---|
| `--ground` | `--surface-app` | page |
| `--bar` | `--surface-chrome` | sidebar, rail, tab bar |
| `--card` / `--overlay` | `--surface-panel` / `--surface-overlay` | pane, cards / sheets, menus, toast, thumb |
| `--feature` | `--hero-bg` | Moje's answer card, „Tvoje služba“ (one per screen) |
| `--ink`, `--ink-2`, `--ink-3`, `--ink-accent` | `--text-1/2/3`, `--text-accent` | text, meta, placeholder, links |
| `--hairline`, `--edge`, `--edge-control`, `--edge-field` | `--line-1`, `--line-2`, `--line-control`, `--line-field` | rows, blocks, quiet controls, fields |
| `--wash`, `--press`, `--tint`, `--tint-2` | `--hover`, `--pressed`, `--soft`, `--soft-hover` | hover, pressed, soft fills |
| `--act`, `--act-hover`, `--on-act`, `--thumb` | `--primary-bg`, `--primary-bg-hover`, `--primary-fg`, `--thumb` | main action, chosen chip, counts, today |
| `--pick`, `--pick-hover`, `--mark` | `--selected-bg`, `--selected-bg-hover`, `--indicator` | selection fill, its hover, the 3 px bar |
| `--ok-*`, `--wait-*`, `--no-*`, `--info-*` | the status tokens | ✓ ○ ● and callouts |
| `--hue-fill`, `--hue-mark`, `--hue-ink` | `--<hue>-3`, `--<hue>-11`, `--<hue>-12` via `[data-hue]` | Účel only (DESIGN §7.2) |
| `--dim` | `--scrim` | layer scrims |
| `--lift-1 … --lift-4` | from `--line-*` and `--shadow-tint-*` | top bar, thumb/pane, sheet, menu/dialog/toast |

- The brand has one pink, used as itself (`--act` in Hlína a růžová, `--pick`), never as a ramp, a text colour or an
  avatar. Hues outside the brand: the status colours and the four Účel hues only.
- `KIND_HUES = { service: 'rose', rehearsal: 'blue', smallGroup: 'teal', event: 'plum' }`. Avatar and team hues:
  blue, green, plum, amber, teal (no rose).

## 8. Code rules that keep the codex true

- DOM is built with `h()`; never `innerHTML`; no inline `style` or `<script>` in markup (CSP). Values computed at run
  time (z-index of layers, a popover's position) are set through `el.style.x` from JS.
- Screens call the kit: `listScreen`, `page`, `detail`, `row`, `section`, `empty`, `layer.open`, `filterButton`,
  `periodLine`, `segmented`. A screen that needs something the kit cannot draw asks the foundation owner to extend
  the kit for every screen; it never draws its own head, toolbar, pane or layer.
- Every Czech string: actions in the imperative, 2nd person singular (tykání); titles are nouns. Checked with
  `kontrola-cestiny`.
