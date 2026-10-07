# Zvonec Simple – the codex of controls

The owner found the screens „a jumble of elements and sizes“. These rules fix that. They are binding for
Simple (`docs/zvonec/simple/`), and the tokens live in `css/next-tokens.css`.

## 1. Three heights, nothing in between

| size | px | what |
|---|---|---|
| **S** | 36 | A quiet control beside text on a desktop: Filtr, Dnes, an action in a row. Its hit area is still 44 (`::after`). |
| **M** | 44 | Every other control: buttons, icon buttons, the segmented switch, search, fields, selects, chips, the month chip. |
| **L** | 52 | The one main action at the foot of a sheet or a form, the floating action, the answer pair Můžu / Nemůžu. |

Tokens: `--control-s`, `--control-m`, `--control-l`. A control never sets its own height in pixels.

## 2. The corner follows the height

- **Soft rectangles** (what you act on): S → 10, M → 12, L → 14 (`--radius-s/m/l`). A part inside a control
  is the outer corner minus the gap; the segmented thumb is 12 − 3 = 9 (`--shape-inner`).
- **Capsules** (`--shape-pill`) are for values and states: filter chips, the month chip, „+ Role“ for an
  empty slot, pills, counts, badges.
- **Blocks:** cards, menus and the detail pane are 20 (`--shape-block`); a sheet's top is 28.
- **Never** a coloured side border on anything rounded. The selection bar is detached (§5).

## 3. One label size per height, one weight

- Labels and typed text: S 14, M 16 on a phone / 15 on a desktop, L 17 (`--type-control-s`,
  `--type-control`, `--type-control-l`). Typed text stays ≥ 16 on a phone, so the phone does not zoom in.
- Every control label is 620 (`--weight-control`). A chosen chip, segment or tab changes its fill, never its
  weight, so the words don't jump.
- Values are not controls: pills, counts and badges are 13 (`--type-caption`).

## 4. Width and rhythm

- Controls stacked in one column share one width: the switch and the search under a title line up on both
  edges.
- A row of controls shares one height (M). Don't mix a 52 field with 44 buttons.
- The gap between stacked controls is 12. Between a control group and the content under it, 24. Never glued.

## 5. Lit rows and selection

- A lit row (hover, selected, open) lights up whole and rounded, and no hairline touches it. The line belongs
  to the row below (`::before`) and hides for the lit row and the one under it. Lit rows keep 3 px apart.
- Selected or open: a detached 3 px bar (`border-radius: 0 3px 3px 0`, inset from the top and bottom), never
  a side border.

## 6. Colour

Palette tokens only. The brand has one pink, used as itself, never as tints. No hue outside the brand
except the status colours (green confirmed, amber waiting, red error).
