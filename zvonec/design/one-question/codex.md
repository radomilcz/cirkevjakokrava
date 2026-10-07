# Zvonec – the codex

The owner found the screens „a jumble of elements and sizes“ and, after a toolbar overlap, asked for „one
consistent system“. These rules are that system. They bind **both** apps, Next (`docs/zvonec/next/`) and Simple
(`docs/zvonec/simple/`), and every screen, sheet, pane and menu in them. The tokens live in each app's
`css/next-tokens.css` (the two files carry the same codex tokens); the kit (`css/components.css`, `ui/*.js`) draws
every control from them. A screen never invents its own size, corner, weight or gap.

The four audits behind version 2 (scratchpad, 2026-10-07) measured every control on every screen at 360–1920 px.

## 1. Three heights, nothing in between

| size | px | what |
|---|---|---|
| **S** | 36 | An action **inside content** on a desktop: a section head's „Uprav“ / „+ Přidej“, a row's or a card's action, the „+ Role“ slot. Its hit area is still 44 (`::after`). |
| **M** | 44 | Every other control: buttons, icon buttons, the segmented switch, search, fields, selects, chips, the month chip, and **everything in a toolbar** (‹ › , „Dnes“, the view switch, „Filtr“). |
| **L** | 52 | The one main action at the foot of a sheet or a form, the floating action, the answer pair Můžu / Nemůžu, the contact tiles Zavolej · SMS · E-mail. |

Tokens: `--control-s`, `--control-m`, `--control-l`. A control never sets its own height in pixels. Anything that
must be drawn smaller (a cell's „+“, a table tick, an inline dot) gets the 44 hit area through `::after`.

## 2. The corner follows the height

- **Soft rectangles** (what you act on): S → 10, M → 12, L → 14 (`--radius-s/m/l`). A part inside a control
  is the outer corner minus the gap; the segmented thumb is 12 − 3 = 9 (`--shape-inner`).
- **Capsules** (`--shape-pill`) are for values and states: filter chips, the month chip, the „+ Role“ slot, pills,
  counts, badges.
- **Blocks:** cards, menus, popovers, the detail pane and a desktop dialog are 20 (`--shape-block`); a phone sheet's
  top is 28 (`--shape-sheet`). No other radius exists (no 7, 8, 16, 18, 24).
- **Never** a coloured side border on anything rounded. A colour bar is either detached (§5) or sits on a straight
  edge (the calendar chip's Účel bar: the chip is square on that side).

## 3. One label size per height, one weight per kind, no weight change by state

- Control labels and typed text: S 14, M 16 on a phone / 15 on a desktop, L 17 (`--type-control-s`,
  `--type-control`, `--type-control-l`). Typed text stays ≥ 16 on a phone, so the phone does not zoom in.
- **Controls** (buttons, chips, segments, toolbar parts): 620 (`--weight-control`).
- **Navigation and rows** (rail items, the tab bar, menu items, list rows): their own one weight.
- **A state never changes the weight.** Chosen, current, open, hovered: the fill (and the bar, §5) changes, the words
  don't move.
- Values are not controls: pills, counts and badges are 13 (`--type-caption`) capsules.

## 4. Width and rhythm

- Controls stacked in one column share one width: the switch, the search and a toolbar under a title line up on both
  edges.
- **A row of controls shares one height.** Don't mix a 52 field with 44 buttons or a 36 „Dnes“ with 44 arrows.
- Gaps: 8 between controls side by side; 12 between stacked controls (also the buttons in a sheet's foot); 24 between
  a control group and the content under it. Never glued, never 16 or 20 for these.
- Nothing overlaps, nothing is cut. A label never shrinks below its words (`flex: none` / `white-space: nowrap` on
  labels that must stay whole); when a row runs out of room it wraps as a whole group onto the next line, it never
  squeezes one control under another. No horizontal page scroll at any width from 360 up.
- Text in narrow places breaks between words, never inside one (`overflow-wrap: normal`), and ends with „…“.

## 5. Lit rows, selection and „open“

- A lit row (hover, selected, open) lights up whole and rounded, and no hairline touches it. The line belongs
  to the row below (`::before`) and hides for the lit row and the one under it. Lit rows keep 3 px apart.
- **One selected/open look everywhere** (rows, events in a list, roster cards, calendar chips, table rows): the pick
  fill (`--pick`) plus a detached 3 px bar (`border-radius: 0 3px 3px 0`, inset from the top and bottom). It stays
  while hovered (hover never turns a selected row grey).

## 6. The shared pieces (one build each)

- **Screen head:** title row = h1, then on its right at the content's edge the main action (M, primary) and ⋯ (M).
  The h1 sits at the same y on every screen of a width class. On a desktop ⋯ of a page is in the title row, never
  in a top bar; a top bar on a desktop carries only „‹ back“. 12 to a control group under it, 24 to content.
- **Toolbar** (Kalendář, Rozpis, any list with a period): `[‹ label ›][Dnes] ······ [view switch][Filtr]`, all M.
  The period never shrinks and its label has a fixed width (the longest month), so ‹ › and „Dnes“ never move when
  the month changes. „Filtr“ reserves room for its count, so turning a filter on moves nothing. „Dnes“ and „Filtr“
  are the same quiet M button. The view switch is a control (segmented or a quiet button), never an accent link.
  When the row runs out of room, the end group wraps as a whole to a second row, 12 under. 24 to the content.
- **Detail pane** (beside a list ≥ 1200): one width rule, its top aligned with the list column's first line,
  padding 24, ⋯ and ✕ in one row at the top right, the title at the same offset under them in every pane.
  Beside the month grid only when a day cell stays ≥ 110 px wide; narrower, the day or the meeting opens in a sheet.
- **Layers:** every sheet, dialog, menu and popover lives in the layer root with a depth; a second layer dims the
  first. Nothing floating is clipped by a scrolling parent (the rail).
- **Section-head action:** quiet S („Uprav“), or tint S „+ Přidej“; one per section head, at its right edge.

## 7. Colour

Palette tokens only. The brand has one pink, used as itself, never as tints. No hue outside the brand
except the status colours (green confirmed, amber waiting, red error) and the Účel hues of the calendar.
