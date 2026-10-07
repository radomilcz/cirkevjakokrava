# Zvonec One: the design

The final spec of the new Zvonec in `docs/zvonec/one/`. It is a synthesis. The base is the proposal **calm**
(the A·B·C·D skeleton, the period inside the content, Next's whole Setkání detail, Správa in the person's menu).
From **leader** it takes the person tab, Lidé · Skupiny as views, the sidebar from 900, „Filtr 1“ for a default
scope, Podrobný výpis kept in ⋯, and the band-B test. From **system** it takes the build skeleton (one `NAV`
table, `listScreen` / `detail` / `layer`), the depth-stacked layers, the three empty states, the row anatomy and
the container query for Měsíc. Rules that bind every pixel are in `CODEX.md`. The build is in `PLAN.md`.

What the owner asked for, and where this design answers it:

| the owner | here |
|---|---|
| Next's colours and its Setkání detail | §7 (Účel hues as in Next, rose kept), §5.1 (detail kept whole) |
| Simple's simplicity, its person menu and Správa | §2.4 (the menu, Správa in it), §4 (Simple's Moje, A–Z, Rozpis, mini month) |
| „some things belong in the sidebar“: Formáty, Šablony, Lidé as screens | §2.2 (group „Jak se scházíme“), §6.9–6.11 |
| search and Filtr in one place, never jumping | §3 (band B, fixed offsets, nothing above it ever varies) |
| clear and not cluttered | one Filtr button, no chip rows, no lead lines, no FAB, nothing opens by itself |
| phone, tablet and desktop | §1 (three layout classes), wireframes at 390 / 768 / 1440 |
| two colour variants | §7.1 (Krém a hlína, Hlína a růžová, Podle zařízení) |

---

## 1. Width classes

| class | width | navigation | content padding | a list item's detail |
|---|---|---|---|---|
| **phone** | < 600 | tab bar at the bottom, 64 + safe area | 20 | a page |
| **tablet** | 600–1199 | rail 88 (600–899) or sidebar 248 (900–1199) | 32 | a page |
| **desktop** | ≥ 1200 | sidebar 248 | 40 | a **pane** beside the list |

- JavaScript knows only these three classes (`isPhone()`, `isTablet()`, `isSplit()` at 600 and 1200) and
  re-renders when one is crossed. Rail ↔ sidebar at 900 is CSS only: the same `<nav>`, the same items.
- Type steps at 600: phone sizes below it, the denser sizes from 600 up (CODEX §3).
- The **content frame**: tablet list screens and pages max 720, left-aligned; desktop max 1312
  (list 560 + 32 + pane 720), left-aligned after the sidebar. Nothing is centred in leftover space, except
  the signed-out pages and Pastva.
- No sideways page scroll from 360 up. Nothing overlaps, nothing is cut (CODEX §4).

---

## 2. Navigation

### 2.1 The destinations (one `NAV` table drives the tab bar, the rail and the sidebar)

| group | item | route | member | leader | admin | count |
|---|---|---|---|---|---|---|
| main | Moje | `#moje` | ✓ | ✓ | ✓ | duties waiting for my answer |
| main | Obsazení | `#obsazeni` | – | ✓ | ✓ | meetings in 4 weeks with something to do (in my Filtr scope) |
| main | Kalendář | `#kalendar` | ✓ | ✓ | ✓ | – |
| main | Lidé | `#lide` (view Skupiny `#lide/skupiny`) | ✓ | ✓ | ✓ | – |
| Jak se scházíme | Šablony | `#sablony` | – | ✓ | ✓ | – |
| Jak se scházíme | Formáty | `#formaty` | link only | ✓ | ✓ | – |
| Jak se scházíme | Místa | `#mista` | link only | ✓ | ✓ | – |
| person's menu | Můj účet, Kdy nemůžu, Barvy, Veřejný web, Odhlas se | | ✓ | ✓ | ✓ | – |
| person's menu › Správa | Přístupy, Nastavení sboru | `#pristupy`, `#nastaveni` | – | ✓ | ✓ (+ záloha, klíč) | invites waiting |

The split rule: **the sidebar holds the places where weekly work happens** (my duties, meetings, people, and
what meetings are made of). **The person's menu holds you and the system** (your account, your days off,
colours, access, the church's settings, the public web, sign-out). Members do not see „Jak se scházíme“: they
open a Formát from an Osnova point and a Místo from a meeting's place line, read-only. Admin and leader see
the same items; the admin sees more *inside* them (all teams, záloha, klíč, levels), never more items.

### 2.2 Desktop ≥ 1200 and tablet 900–1199: the sidebar (248)

```
┌──────────────────────────┐
│ církev jako kráva        │  brand wordmark, 32 from the top, links to #moje
│                          │  32
│ ⌂  Moje               4  │  item M 44, r12, inset 12, 3 apart; icon 20, label 15/500, count capsule trailing
│ ⊕  Obsazení          10  │  (leaders)
│▌▦  Kalendář              │  current: --pick fill on the whole item + detached 3 px --mark bar at the sidebar's edge
│ ☺☺ Lidé                  │
│                          │  24
│ Jak se scházíme          │  group title 13/620 --ink-2, 8 above its first item (leaders only)
│ ▤  Šablony               │
│ ▯  Formáty               │
│ ⌖  Místa                 │
│            ⋮             │  the item list scrolls on its own if the window is short; the foot stays pinned
│ (RK) Radim Kovář      •  │  foot 56: avatar 36 + name 15/620 + role 13; • = invites wait (leaders)
│      správce             │  click → the person's menu as a popover above the foot
└──────────────────────────┘
```

On a page of the person's menu (Můj účet, Kdy nemůžu, Přístupy, Nastavení sboru) no item is current; the foot
gets the current look instead.

### 2.3 Tablet 600–899: the rail (88)

```
┌──────┐
│  ck  │  brand mark 32
│ ⌂ ⁴  │  cell 88 × 64: icon 24, label 13/500 under it, whole words („Obsazení“, „Kalendář“ fit 72)
│ Moje │  current: pick niche 56 × 32 behind the icon + detached bar at the rail's left edge
│  …   │  Obsazení · Kalendář · Lidé
│ ──── │  group divider 32 × 1, 12 above and below, no title; then Šablony · Formáty · Místa (leaders)
│ (RK)•│  avatar 40 pinned at the foot → the person's menu as a popover to the right of the rail
└──────┘
```

### 2.4 Phone < 600: the tab bar, and the person tab

```
member:  [ ⌂ Moje ]  [ ▦ Kalendář ]  [ ☺☺ Lidé ]  [ (RK) Radim ]
leader:  [ ⌂ Moje ]  [ ⊕ Obsazení ]  [ ▦ Kalendář ]  [ ☺☺ Lidé ]  [ (RK) Radim ]
```

- 64 + safe area, `--bar`, a hairline on top. Each tab: icon 24 in a 56 × 32 niche, label 13/500 under it.
  Current: the niche gets `--pick`; the label keeps its weight and colour.
- The last tab is **the person**: avatar 24 + the first name (ellipsis at 72; „Účet“ without a card). It opens the
  person's menu as a bottom sheet from every screen. Its count dot = invites waiting (leaders). It is the current
  tab on Můj účet, Kdy nemůžu, Šablony, Formáty, Místa, Přístupy and Nastavení sboru. Never the word „Více“.
- Counts: a capsule 20 high, 13/620, `--act` / `--on-act`, at the icon's top right.
- Tapping the current tab scrolls the screen to the top (nothing else). The tab bar hides while the keyboard is up.

### 2.5 The person's menu (one build: phone bottom sheet, ≥ 600 popover 320)

```
┌───────────────────────────────────────┐
│ (RK) Radim Kovář                  ›   │  → #ucet; meta „Můj účet · správce“ (row 64, avatar 40)
│ Kdy nemůžu                        ›   │  → #kdy-nemuzu; meta = the next range „24.–26. 10. · dovolená“
│ Barvy  (◉)(◉)(◉)                      │  Krém a hlína · Hlína a růžová · Podle zařízení; a tap applies, the menu stays
│                                       │  24
│ Jak se scházíme          (phone only) │  13/620 heading, leaders: Šablony › · Formáty › · Místa ›
│ Správa                                │  leaders: Přístupy [1 čeká] › · Nastavení sboru ›
│                                       │
│ Veřejný web                       ›   │  meta „Pastva, jak ji vidí návštěvníci“
│ Ukázka                    (demo only) │  Podívej se očima druhých › (meta „teď: Radim Kovář · správce“) ·
│                                       │  Začni ukázku znovu · Začni načisto
│ Odhlas se                             │  single row, --no-ink text
└───────────────────────────────────────┘
```

- The contents are the same at every width. The only difference: the phone adds „Jak se scházíme“, because it has
  no sidebar. Rows are the standard row (CODEX §6.6), one weight. A tap on a link row closes the menu, then
  navigates. A row that opens a sheet („Začni ukázku znovu“ → confirm) closes the menu first (layers never stack
  a menu under a sheet).
- The popover lives in the layer root, anchored above the sidebar foot (or right of the rail's avatar), max height
  = window − 48, scrolls inside. Never clipped by the scrolling sidebar.

---

## 3. The one list screen

Every list screen (Obsazení, Kalendář, Lidé, Šablony, Formáty, Místa, Přístupy) is drawn by `listScreen()`.
It has four bands, always in this order, **each one present or absent per screen and role, never per state**:

```
A  title row   h1 ··································· [⋯] [main action]
B  toolbar     [⌕ search ·························] [⚟ Filtr ⁿ]          ← the same x, y and width on every list screen
C  view row    [ Seznam | Měsíc | Rozpis ]                              ← only Kalendář and Lidé
D  content     list / grid; its own first line may be a period line, a birthday line or a note
```

**Nothing in a band can move or resize anything in a band above it.** That is the whole mechanism behind
„search and Filtr never jump“:

- **A** is fixed text plus fixed buttons. The h1 never carries a chip, a date, a count or a subtitle. The main
  action never changes with the view, the month or the filter.
- **There is nothing between A and B, on any screen, for any role.** No lead sentence, no overline, no scope chip,
  no birthday line, no „Filtr: …“ line. Explanations go into the content (its end or the empty state) or into the
  dialog where they matter. `listScreen()` has no parameter for it.
- **B**: search M 44, `flex: 1`, min 160; **Filtr** quiet M, **fixed 120**, with a count slot of 28 always reserved.
  Turning a filter on changes only the digit. A screen without filters has no Filtr and the search fills B; its left
  edge, y and height are the same. **B's width is the list column's width** in every view (phone: content width;
  tablet: min(content, 720); desktop: the list track). Měsíc may be wider underneath; B never stretches.
- **C**: segmented M 44. Phone: full width, equal segments. ≥ 600: fixed segments of 120 (3 → 360, 2 → 240),
  left-aligned. The chosen view is remembered per browser.
- **The period is content, not toolbar.** Seznam is one continuous list from today. Only Měsíc and Rozpis have a
  month, and its line `[‹] Říjen 2026 [›] ··· [Dnes]` is **the first line of D**, with a fixed-width label (the longest
  month, „Listopad 2026“ at 17/620). So the owner's „› over Dnes“ cannot recur, and a month change never touches B or C.
- B and C are **not sticky**: the head scrolls away with the list (a pinned band would cost 68 px of every phone
  screen). Tapping the current tab, or „/“ on a keyboard, brings the search back.
- Offsets (CODEX §4): A → B 12, B → C 12, the last control row → D 24. The h1 top: phone 16 under the safe area,
  tablet 32, desktop 40. So the search's top is at y 72 / 88 / 96 on every list screen of a class.

### 3.1 Phone 390 (Kalendář · Seznam, leader)

```
  0 ┌──────────────────────────────────────┐
 16 │ Kalendář                    [+]  [⋯] │ A  h1 34/36; [+] primary M 44 (aria „Přidej setkání“); [⋯] quiet M
    │                                      │ 12
 72 │ [⌕ Hledej setkání        ][⚟ Filtr  ]│ B  search 222 · 8 · Filtr 120 (content 350 = 390 − 2 × 20)
    │                                      │ 12
128 │ [  Seznam  |  Měsíc   |  Rozpis  ]   │ C  full width
    │                                      │ 24
196 │ ‹ Ukaž, co už bylo                   │ D  quiet link 15/620 --ink-accent
    │ Tento týden                          │ subhead 13/620 --ink-2
    │ ╭──╮ 18.30 ┃ Zkouška chval           │ date arch 44 × 56 · times · Účel bar 3 (a separate element)
    │ │ČT│ 20.30 ┃ Monta, Sál              │
    │ │ 8│       ┃ ◯ 6 z 6 · ○ 1 čeká      │ (leaders: the fill)
    │ ╰──╯ 19.30 ┃ Rada starších           │
    ├──────────────────────────────────────┤
    │ Moje  Obsazení  Kalendář  Lidé  Radim│ tab bar
    └──────────────────────────────────────┘
```

At 360 the search is 192 wide; „Hledej setkání“ still fits (every placeholder is „Hledej“ + one noun, and ends
in „…“ if it ever must).

### 3.2 Tablet 768 (rail 88, padding 32, list column 616)

```
┌──────┬───────────────────────────────────────────────────────────────┐
│  ck  │ Kalendář                          [+ Přidej setkání]  [⋯]     │ A  h1 40/44, top 32
│ ⌂    │                                                               │ 12
│ ⊕    │ [⌕ Hledej setkání                          ][⚟ Filtr   ]      │ B  88: search 488 · Filtr 120
│▌▦    │                                                               │ 12
│ ☺☺   │ [ Seznam | Měsíc | Rozpis ]                                   │ C  360
│ ──── │                                                               │ 24
│ ▤    │ Tento týden                                                   │ D
│ ▯    │ ╭──╮ 18.30–20.30 ┃ Zkouška chval            ◯ 6 z 6       ›   │
│ ⌖    │ ╰──╯             ┃ Monta, Sál                                 │
│(RK)• │                                                               │
└──────┴───────────────────────────────────────────────────────────────┘
```

A click on a row opens the detail as a page (§5). At 1024 the same layout sits beside the 248 sidebar
(list column 712).

### 3.3 Desktop 1440 (sidebar 248, padding 40, frame 1112 = list 520 · 32 · pane 560)

```
┌──────────────┬──────────────────────────────────────────────────────────────────────────────────┐
│ církev jako… │ Kalendář                                          [+ Přidej setkání]  [⋯]       │ A  spans list + pane
│              │                                                                                  │ 12
│ ⌂ Moje     4 │ [⌕ Hledej setkání              ][⚟ Filtr  ]  ┌──────────────────────────[⋯][✕]┐ │ B  list track only
│ ⊕ Obsazení10 │                                               │ ▒▒▒▒▒ Účel band 96 ▒▒▒▒▒▒ ∩∩ ▒ │ │ pane top = B top
│▌▦ Kalendář   │ [ Seznam | Měsíc | Rozpis ]                   │ (Zkouška)                      │ │ C
│ ☺☺ Lidé      │                                               │ Zkouška chval                  │ │
│              │ ‹ Ukaž, co už bylo                            │ ◷ čt 8. 10. · 18.30–20.30      │ │ D
│ Jak se sch…  │ Tento týden                                   │ ⌖ Monta, Sál                 › │ │
│ ▤ Šablony    │▌╭──╮ 18.30 ┃ Zkouška chval        ◯ 6 z 6 ▒▒ │ ⟳ Každý čtvrtek do 28. 1. 2027 │ │ open row: pick + bar
│ ▯ Formáty    │ ╰──╯ 20.30 ┃ Monta, Sál                       │ Kdo slouží     ◯ 6 z 6 · 1 čeká │ │
│ ⌖ Místa      │       19.30 ┃ Rada starších                   │ …                              │ │
│ (RK) Radim • │ |←──────── list track 520 ───────→|    32     |←────── pane 560 ───────→|      │
└──────────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

- Grid: `minmax(400px, 560px) 32px minmax(440px, 720px)`, both tracks **always reserved**. At 1200: 400 | 440; at
  1440: 520 | 560; from ≈ 1660: 560 | 720. **The list keeps its width and x whether the pane is open or not**, so
  names are never cut to „B…“. With nothing open the pane track is plain page ground.
- A spans both tracks; the main action and ⋯ sit at the pane track's right edge and never move.

### 3.4 Search, Filtr and empty states

- **Search** filters as you type (no submit), ✕ inside clears it, „/“ focuses it. The text survives a view switch
  (kept in memory for the session, not stored). What it matches is listed per screen in §6.
- **Filtr** opens one layer: a bottom sheet on a phone, a popover 360 under the button on ≥ 600 (CODEX §6.9).
  Choices apply at once. The count on the button is the only sign that a filter is on; there is no filter line.
  Filters are remembered per browser and per screen. A default scope counts (Obsazení starts at „Filtr 1“).
- **Empty** (one component, three cases; A, B and C stay exactly where they were; 48 under the last control row):

| case | title (h2) | sentence | action |
|---|---|---|---|
| nothing yet | „Zatím tu nejsou žádná setkání.“ (per screen) | what the screen is for (the old head subtitles live here) | the main action, quiet M, only if the viewer may |
| nothing found | „Nic tomu neodpovídá.“ | „Hledáš „Kučer“.“ | „Vymaž hledání“ |
| filtered empty | „S tímhle filtrem tu nic není.“ | „Filtr skrývá 12 setkání.“ | „Zruš filtr“ |

  In Měsíc and Rozpis the grid or the month stays; the empty case is one quiet line under the period line.
- **A missing item** (`#setkani/neexistuje`, a deleted person): a page with the empty well, „Tohle setkání už tu
  není.“ and „‹ Kalendář“.

---

## 4. Pages (not lists)

Moje, Kdy nemůžu, Můj účet and Nastavení sboru are **pages**: A (title row at the same y as every list screen),
then D 24 under it. No B. On a desktop Moje uses the list | pane grid (a duty opens the meeting beside it); the
other pages are one column of 640.

---

## 5. The one detail

`detail()` draws the same body in one of two frames. There is no third (no detail in a dialog).

| frame | when | head |
|---|---|---|
| **pane** | ≥ 1200, beside its list (Moje, Obsazení, Kalendář Seznam and Rozpis, Lidé, Skupiny, Šablony, Formáty, Místa) | an action row 44 at the pane's top: `‹ Back` on the left only when drilled in; ⋯ and ✕ on the right, 8 apart |
| **page** | < 1200 always; and at any width for a deep link `#setkani/<id>`, a meeting from Měsíc, and Osnova | a top bar 56: `‹ Parent` (quiet M with its label) on the left, ⋯ on the right; sticky, hairline once scrolled. On ≥ 600 the page's column is 720 |

- **It opens only on a click.** No route opens the nearest or the first item. With nothing chosen, the pane track is
  empty. The URL carries the item: `#<list>/<id>` (§8). ✕, Esc, or a click on the open row closes it.
- The open row has the selected look (pick + bar) while its pane is open.
- **The pane** is a block: `--card`, r20, padding 24, `--lift-2`. It sticks 24 under the window top while it fits;
  a taller pane scrolls with the page (one scrollbar, Simple's shipped `fitPanes()`). It never scrolls inside.
  Its menus open in the layer root.
- Going deeper inside a pane (a person from Kdo slouží, a household from a person) **replaces** the pane content
  and shows `‹ Zkouška chval` in the action row. Panes never stack.
- **Head order, same offsets in every detail:** mark or band → tag → h1 (34/36 in a pane and on a phone, 40/44 on
  a ≥ 600 page) → facts (icon 20 + text 16, rows 32, › where a fact links on) → sections.
- **Section** = h2 20/26 + at most one action at its right edge (quiet S „Uprav“ or tint S „+ Přidej“; M on a phone)
  or one value (a count, the ring). 32 between sections, 12 from the h2 to its content.
- **Editing is always in a layer** (sheet or dialog), never an inline edit mode. Destructive actions only in ⋯.
- **An item that has only actions and no content opens a menu, not a detail** (Přístupy rows, Kdy nemůžu rows).

### 5.1 Setkání (Next's detail, kept whole)

```
phone 390 (page)                              pane at 1440 (560)
┌──────────────────────────────────────┐      ┌─────────────────────────────────────────┐
│ ‹ Kalendář                       [⋯] │ 56   │                               [⋯] [✕]   │ 44
│ ╭────────────────────────────────╮   │      │ ╭─────────────────────────────────────╮ │
│ │ ▒▒▒▒ Účel band 96 ▒▒▒▒▒▒ ∩∩ ▒▒ │   │      │ │ ▒▒▒▒▒ --hue-fill, arch --hue-mark ∩∩│ │ band 96, r20
│ ╰────────────────────────────────╯   │      │ ╰─────────────────────────────────────╯ │
│ (Zkouška)                            │      │ (Zkouška) (na webu)                     │ tag capsules 13
│ Zkouška chval                        │      │ Zkouška chval                           │ h1 34/36
│ ◷ čt 8. 10. · 18.30–20.30            │      │ ◷ čt 8. 10. · 18.30–20.30               │
│ ⌖ Monta, Sál                      ›  │      │ ⌖ Monta, Sál                         ›  │ → Místo
│ ⟳ Každý čtvrtek do 28. 1. 2027       │      │ ⟳ Každý čtvrtek do 28. 1. 2027          │
│ ╭ Co nesedí ──────────────────────╮  │      │ ● Ondra má dvě služby naráz          ›  │ leaders, only when something
│ │ ● Ondra má dvě služby naráz  ›  │  │      │                                         │   does not fit
│ ╰─────────────────────────────────╯  │      │ ╭ Tvoje služba ────────────────────────╮│ only when I serve
│ ╭ Tvoje služba ───────────────────╮  │      │ │ Zpěv · čeká na tvou odpověď          ││ --feature, r20, padding 20
│ │ Zpěv · čeká na tvou odpověď     │  │      │ │ [   Můžu   ]  [  Nemůžu  ]       L52 ││
│ │ [   Můžu   ] [  Nemůžu  ]  L52  │  │      │ ╰──────────────────────────────────────╯│
│ ╰─────────────────────────────────╯  │      │ Kdo slouží            ◯ 6 z 6 · 1 čeká  │ h2 + value
│ Kdo slouží       ◯ 6 z 6 · 1 čeká    │      │ (CH) Chvály                     5 z 5 ⌄ │ team row 52
│ (CH) Chvály                  5 z 5 ⌄ │      │      Daniel ○, Hedvika, Martina, Ty     │ collapsed: names + marks
│      Daniel ○, Hedvika, Ty           │      │      [+ Klávesy]                        │ empty slot (leaders) S capsule
│      [+ Klávesy]                     │      │ (TE) Technika     ✓ všichni potvrdili ⌄ │
│ (TE) Technika    ✓ všichni         ⌄ │      │ Osnova                          [Uprav] │
│ Osnova                       [Uprav] │      │ 10.00 Přivítání 5′ · 10.05 Chvály 25′ … │ first 4 points
│ 10.00 Přivítání 5′ · Chvály 25′ …    │      │ Celá osnova ›                           │
│ Celá osnova ›                        │      │ O setkání                               │ text, Pro tým (leaders),
│ O setkání                            │      │ …  Otevři v mapě ↗   Ukaž na webu (○—)  │ map link, web switch
└──────────────────────────────────────┘      └─────────────────────────────────────────┘
```

- **Teams are never opened by the app.** A collapsed team row shows its names with ○ (waits) / ● (problem) and, for
  leaders, its „+ Role“ slots, so nothing actionable hides. ⌄ (or a click on the row) unfolds role → person → state
  words (✓ potvrzeno / ○ čeká / ● nesedí + reason). A click on a name (leaders) opens the duty sheet; on a slot, the
  picker („Klávesy · ne 11. 10.“: who can, longest rested first, who cannot greyed with the reason, Můžou / Nejde
  to, „Hledej mezi všemi lidmi“).
- A member sees the same detail without slots, ⋯ and „Co nesedí“; „Ty“ marks the viewer.
- ⋯ (leaders): Uprav setkání · Uprav, kolik lidí je potřeba · Prodluž řadu · Vytiskni · Zruš setkání / Obnov
  setkání · Smaž setkání. Past meetings add „Kolik lidí přišlo“ (leaders).
- Dropped from Next: the photo picker in the band, duplicate pills. Cancelled: the tag „zrušeno“ and a struck h1.

### 5.2 The other details (same frame, same head offsets)

| detail | mark | facts | sections, in order | ⋯ |
|---|---|---|---|---|
| **Člověk** `#lide/<id>` | avatar 72 | membership pill, team pills (links) | contact tiles **Zavolej · SMS · E-mail** (L 52, equal thirds, only those with data, right under the head); leaders: callout „Chybí datum narození · Doplň“; Příští služby; Kontakt [Uprav]; Domácnost (rows ›); Skupiny [+ Přidej]; Kdy nemůže; Poznámka (leaders) | Uprav · Pozvi do Zvonce · Přesuň do archivu · Smaž |
| **Domácnost** (drill-in) | house mark 56 | address | Lidé (rows) | Uprav · Přidej člověka · Smaž |
| **Skupina** `#lide/skupiny/<id>` | team mark 56 | „9 lidí · vedou David Kučera a Radim Kovář“ | Role (role → who can, [+ Přidej]); Lidé (rows with call); Příští služby | Uprav · Přidej člověka · Přesuň do archivu · Smaž |
| **Šablona** `#sablony/<id>` | Účel mark 56 | „každou neděli · 10.00–12.00 · Sál“ | a first line „Nové setkání ze šablony dostane čas, místo, role i osnovu.“; Kdo je potřeba [Uprav]; Osnova [Uprav]; Na webu (switch); Setkání v plánu (next 5 + „Ukaž všech 16“) | Uprav · Naplánuj setkání · Zkopíruj · Přesuň do archivu · Smaž |
| **Formát** `#formaty/<id>` | minutes block 56 „5 min“ | „vede role Projekce“ | Proč to děláme; Jak to probíhá; Kdo je potřeba; Kde se používá (Šablony as links); Na webu (switch) | Uprav · Smaž |
| **Místo** `#mista/<id>` | pin mark 56 | address + „Otevři v mapě ↗“ | Mapa (16:9, r20); Místnosti [+ Přidej]; Kdy se tu scházíme (next 5) | Uprav · Smaž |

On a phone the person's contact tiles are inside the first screen: reaching someone is why people open Lidé.

---

## 6. Every screen

`P` = phone 390, `D` = desktop 1440 (sidebar omitted). Tablet = P's structure with the rail or sidebar, the
labelled main action and the page detail. „Member / leader“ differences are noted per screen.

### 6.1 Moje `#moje[/<eventId>]` (everyone) – „When do I serve?“

Page. A: „Ahoj, Radime“ (vocative), no main action, no ⋯. D starts with the date line.

```
P                                         D (list track | pane on click)
Ahoj, Radime                              Ahoj, Radime
                                          
Středa 7. října                           Středa 7. října                       │ (empty until a duty is
╭ Čeká na tvou odpověď ──── 1 ze 4 ╮      ╭ Čeká na tvou odpověď ──── 1 ze 4 ╮  │  clicked; then the
│ ╭──╮ Kázání                      │      │ ╭──╮ Kázání · Setkání na pastvě   │  │  Setkání as I see it)
│ │18│ Setkání na pastvě · 10.00   │      │ ╰──╯ ne 18. 10. · 10.00          │  │
│ [   Můžu   ]   [  Nemůžu  ]  L52 │      │ [   Můžu   ]   [  Nemůžu  ]     │  │
╰──────────── • ○ ○ ○ ─────────────╯      ╰──────────── • ○ ○ ○ ────────────╯  │
Tvoje další služby                        Tvoje další služby
╭──╮ Kázání · Křest u řeky       ✓        ╭──╮ Kázání · Křest u řeky · 15.00   ✓
Minulé služby ›                           Minulé služby ›
```

- One answer card (`--feature`, r20, padding 20) at a time; after an answer the next slides in, toast „Díky, máš to
  potvrzené. · Vrať“. Nothing waiting: one line „Všechno máš zodpovězené.“, no card. Declined duties in their own
  quiet section (Simple #36). No leader blocks here: the Obsazení count says it.
- Member and leader: the same. Empty (no duties at all): the well „Zatím tu nemáš žádné služby.“

### 6.2 Kalendář `#kalendar/<seznam|mesic|rozpis>[…]` (everyone) – „What is happening?“

A: „Kalendář“ · [Přidej setkání] (leaders) · ⋯ (Stáhni do kalendáře · Vytiskni rozpis… · Doplň volná místa
(leaders) · Břemeno (leaders, dialog)). B: „Hledej setkání“ + Filtr. C: Seznam · Měsíc · Rozpis.
**Filtr** (one model, the same count in every view): Účel (4 chips with hue dots) · Tým · Jen moje služby (switch)
· Ukaž i zrušená (switch). **Search** matches the title, the place, the Účel and the names of who serves
(„Kučera“ finds the meetings where a Kučera serves); Seznam lists the matches, Měsíc hides non-matching chips
and dots, Rozpis hides non-matching meetings.

**Seznam** `#kalendar/seznam[/<id>]`: §3.1 / §3.3. Continuous from today, week subheads („Tento týden“,
„Příští týden“, „19.–25. 10.“), one date arch per day, time from–to, the Účel bar, title, place, „ty · Kázání ·
potvrzeno“ when I serve; leaders also ◯ 14 z 15 · chybí 1. Cancelled: struck + „zrušeno“. „‹ Ukaž, co už bylo“ on
top, „Ukaž další týdny“ at the end. Click → pane (D) or page (P, tablet).

**Měsíc** `#kalendar/mesic/<YYYY-MM>[/<YYYY-MM-DD>]`: the form is chosen by the content's own width (container
query at 700), not by the device.

```
narrow (P, tablet 768, content < 700)          wide (content ≥ 700: 1024 tablet, desktop)
[ Seznam | Měsíc | Rozpis ]                    [⌕ Hledej setkání        ][⚟ Filtr ]     (B in the list track)
                                               [ Seznam | Měsíc | Rozpis ]
[‹] Říjen 2026 [›]              [Dnes]         [‹] Říjen 2026 [›]  ·········································  [Dnes]
 po út st čt pá so ne                          po        út        st        čt        pá        so        ne
 28 29 30  1  2  3  4                          ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬────────┐
     •  •  •  •     •                          │ 5       │ 6       │ 7 ●     │ 8       │ 9       │ 10      │ 11     │
  5  6 (7) 8  9 10 11     (7) = today disc      │         │┃9.30 Mam│         │┃18.30 Zk│┃18.00 Ml│         │▓10.00 S│ ▓ = mine
     •     ••             chosen = pick + bar   │         │┃19.00 Mo│         │┃19.30 Ra│         │         │┃14.00 Z│
 …                                             └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴────────┘
St 7. 10.                                      the grid spans the whole content frame (list + pane tracks)
╭──╮ 18.30 ┃ Zkouška chval                    chip 24: 3 px Účel bar on its square left edge, right corners 9,
                                               13/620 time + 13 title, ellipsis after whole words; „+ 2 další“
```

- Narrow: the mini month (cells 44, day 16, up to 3 Účel dots 6 px, today = `--act` disc, chosen = `--pick` +
  detached bar), and under it **the chosen day's list** (Simple). A tap on a day only chooses it. Default: today,
  or the first day with meetings in another month.
- Wide: cells ≥ 100 (cell ≥ 130: time + title; 100–129: title only). Mine = `--hue-fill` chip with `--hue-ink`.
  A click on a chip opens **the Setkání page** (back „‹ Kalendář“ returns to the same month). **No pane beside the
  grid, ever.** A click on a day number or „+ 2 další“ opens the day popover (320, anchored to the cell: the day's
  rows + „Přidej setkání“ for leaders).
- The period line is D's first line; it is identical in both forms.

**Rozpis** `#kalendar/rozpis/<YYYY-MM>[/<id>]` (Simple's plain list of meetings):

```
P                                          D (list track | pane on click)
[‹] Říjen 2026 [›]              [Dnes]     [‹] Říjen 2026 [›]  ··········  [Dnes]
○ čeká na odpověď  ● něco nesedí           ○ čeká na odpověď  ● něco nesedí            (legend, once)
╭──╮ Setkání na pastvě · 10.00             ╭──╮ Setkání na pastvě · 10.00                ◯ 14 z 15
│11│ Chvály    Daniel ○, Hedvika,          │11│ Chvály     Daniel Sýkora ○, Hedvika Sedláčková, …
╰──╯           Martina, Jakub              ╰──╯ Technika   Jan Novák
     Slovo     Jiří Zeman [+ Kázání]            Slovo      Jiří Zeman  [+ Kázání]
```

- Team label column 96 (P) / 120 (≥ 600), 13/620 `--ink-2`; names 15, wrapping between names; slots S capsules.
  Filtr › Tým narrows the lines (no team chip in the head). A click on a name (leaders) → the duty sheet; on the
  block → detail. „Vytiskni rozpis…“ prints the shown month (print CSS, Simple's).
- Member: the same, without slots. Empty month: „V říjnu tu nic není.“ under the period line.

### 6.3 Setkání `#setkani/<id>` and Osnova `#setkani/<id>/osnova`

§5.1. Osnova is a page at every width (top bar „‹ Zkouška chval“): points with times, minutes and their Formát (a
link), the running clock, drag handles and „+ Přidej bod“ (S slot at the end) for leaders. „Nové setkání“ and
„Uprav setkání“ are forms in a layer (phone sheet, ≥ 600 dialog 640); the date picker stacks on them (depth 2).

### 6.4 Obsazení `#obsazeni[/<id>]` (leaders) – „Whom do we still need?“

A: „Obsazení“ · [Doplň volná místa] (≥ 600; on a phone it is the first item of ⋯, so the title row has only ⋯)
· ⋯ (Připomeň všem, kdo neodpověděli · Vytiskni rozpis). B: „Hledej setkání“ + Filtr (Tým: my teams by default,
admins Všechny týmy → **„Filtr 1“** · Co řešit: Chybí lidi · Čeká na odpověď · Něco nesedí). No C.

```
P                                          D (list track | pane: the Setkání as a leader sees it)
Obsazení                             [⋯]   Obsazení                       [Doplň volná místa] [⋯]
[⌕ Hledej setkání        ][⚟ Filtr 1]      [⌕ Hledej setkání          ][⚟ Filtr 1]  ┌──────[⋯][✕]┐
Tento týden                                Tento týden                                │ …          │
╭──╮ Zkouška chval            6 z 6 ◯      ▌╭──╮ Zkouška chval · 18.30      6 z 6 ◯ ▒  │            │
│ 8│ 18.30 · Monta, Sál                     ╰──╯ ○ 1 člověk ještě neodpověděl ›      │            │
╰──╯ ○ 1 člověk ještě neodpověděl ›         ╭──╮ Setkání na pastvě · 10.00 14 z 15 ◔  │            │
╭──╮ Setkání na pastvě      14 z 15 ◔       ╰──╯ [+ Klávesy]  ● Ondra má dvě služby … │            │
╰──╯ [+ Klávesy]                            …                                         └────────────┘
…                                          Dál než 4 týdny dopředu: Rozpis ›
Dál než 4 týdny dopředu: Rozpis ›
```

- Only meetings in the next 4 weeks with something to do. The horizon is said **at the end of the list**.
- „+ Klávesy“ → the picker. „○ n ještě neodpověděli ›“ → who waits (rows: person, duty, „čeká 5 dní“, SMS ·
  Zavolej · Připomeň with a ready text). „● … ›“ → the duty sheet with its fixes. A row click → pane / page.
- Empty: „Na příští 4 týdny je všechno obsazené.“ (nothing yet), or the filtered case („Zruš filtr“ shows all teams).

### 6.5 Lidé `#lide[/<id>]` and Skupiny `#lide/skupiny[/<id>]` (everyone) – „How do I reach someone?“

A: „Lidé“ · ⋯ · [Nový člověk] (leaders, in both views; the owner's wording) (Přidej skupinu · Přidej domácnost · Pozvi do Zvonce
· Zkopíruj e-maily · Stáhni seznam · Podrobný výpis (≥ 900) – leaders; members: Stáhni seznam).
B: „Hledej jméno“ + Filtr. C: Lidé · Skupiny.

```
P                                          D (list track | pane: Člověk)
Lidé                          [⋯]  [+]     Lidé                                   [⋯] [+ Nový člověk]
[⌕ Hledej jméno          ][⚟ Filtr  ]      [⌕ Hledej jméno              ][⚟ Filtr ]  ┌───────────[⋯][✕]┐
[     Lidé      |    Skupiny      ]        [ Lidé | Skupiny ]                         │ (B) Bára        │
                                                                                      │ host            │
🎂 Dnes slaví Eva Kučerová, do týdne 2 ›    🎂 Dnes slaví Eva Kučerová, do týdne 2 › │ [Zavolej][SMS]… │
B                                          B                                          │ ● Chybí příjmení│
(B)  Bára                                  ▌(B)  Bára                                ▒ │ Příští služby   │
Č                                              host · chybí příjmení a kontakt        │ …               │
(PČ) Petra Černá                    [✆]    Č                                          └─────────────────┘
(OČ) Ondřej Černý (Ondra)           [✆]    (PČ) Petra Černá                      [✆]
                                                člen · Děti, Maminky s dětmi
```

- **Lidé view:** Simple's A–Z, letter subheads 13/620. Phone row: avatar 40 + name 17/620 + a call button (quiet M
  icon) only when there is a phone number the viewer may see. ≥ 600: a meta line „člen · Chvály, Technika“ (leaders
  also „chybí …“ in `--wait-ink`). The birthday line (leaders, only when someone has a birthday within 7 days) is the
  first line of D: a row link to Filtr › Narozeniny.
- **Skupiny view:** sections Týmy · Skupinky · Vedení; rows: team mark 40, name, „9 lidí · vedou …“, a „ty“ pill in
  the trail when I am in it. Click → the Skupina detail.
- **Search** in the Lidé view matches name, nickname, phone, e-mail and, above the people, up to 3 matching groups
  (a „Skupiny“ subhead); in the Skupiny view it matches groups. **Filtr**: Lidé view – Členství (Členové · Přátelé ·
  Hosté · Děti) · Tým · Chybí údaje (leaders) · Narozeniny (leaders, sorts by the next birthday) · Ukaž i archiv
  (leaders); Skupiny view – Druh (Týmy · Skupinky · Vedení) · Jen moje · Ukaž i archiv (leaders). Members get the
  same Filtr with their groups only, so B is identical for every role.
- **Podrobný výpis** `#lide/vypis` (leaders, ≥ 900): Simple's table (Jméno, Členství, Domácnost, Telefon, E-mail,
  Skupiny, Narozeniny; ticks + bulk bar) under the same A·B·C; the view row stays Lidé · Skupiny and a quiet line at
  the top of D says „Podrobný výpis · Ukaž jednoduchý seznam“.

### 6.6 Šablony `#sablony[/<id>]` (leaders)

A: „Šablony“ · [Přidej šablonu]. B: „Hledej šablonu“ + Filtr (Účel · Na webu · Ukaž i archiv). Rows 64: Účel mark
40 (arch, hue tint + icon), name, „každou neděli · 10.00–12.00 · Sál“, trail „na webu“ pill (nowrap, never in the
meta). Click → pane / page. Empty: „Zatím tu není žádná šablona.“ + „Nové setkání ze šablony dostane čas, místo,
role i osnovu.“ + [Přidej šablonu]. The add / edit form is a layer (dialog 640).

```
P                                           D
Šablony                       [+]  [⋯]     Šablony                                     [+ Přidej šablonu] [⋯]
[⌕ Hledej šablonu        ][⚟ Filtr  ]      [⌕ Hledej šablonu            ][⚟ Filtr ]   ┌───────────[⋯][✕]┐
(☼) Setkání na pastvě          na webu     ▌(☼) Setkání na pastvě           na webu ▒ │ (☼) Setkání na… │
    každou neděli · 10.00–12.00 · Sál           každou neděli · 10.00–12.00 · Sál      │ Kdo je potřeba  │
(♫) Zkouška chval                          (♫) Zkouška chval                           └─────────────────┘
```

### 6.7 Formáty `#formaty[/<id>]` (leaders in the nav; members by link, read-only)

A: „Formáty“ · [Přidej formát] (leaders). B: „Hledej formát“ (no Filtr: the search fills B). Rows: minutes block
40 („25 / min“), name, „vede role Vedení chval“, trail „na webu“. **Nothing is open until clicked** (Next opened the
first one). Pane / page. Empty: „Zatím tu není žádný formát.“ + „Z formátů se skládá osnova setkání.“

```
P                                           D
Formáty                       [+]  [⋯]     Formáty                                       [+ Přidej formát]
[⌕ Hledej formát                     ]     [⌕ Hledej formát                         ]   (pane track empty)
(5 min)  (B)učení – video                  (5 min)  (B)učení – video
         vede role Projekce                         vede role Projekce
(25 min) Chvály                na webu     (25 min) Chvály                    na webu
```

### 6.8 Místa `#mista[/<id>]` (leaders in the nav; members by link)

A: „Místa“ · [Přidej místo]. B: „Hledej místo“ (no Filtr). Rows: pin mark 40, name, address · „3 místnosti“; the
main place first with „hlavní místo“. Rooms live in the place's detail, not as indented rows. Pane / page.

### 6.9 Přístupy `#pristupy` (leaders; from the person's menu)

A: „Přístupy“ · [Pozvi člověka] · ⋯ (Jak se lidé dostanou dovnitř – help sheet · Vyměň klíč – admin).
B: „Hledej člověka“ + Filtr (Úroveň: Správce · Vedoucí · Člen · Jen pozvánky). One column (list track); **no pane**:
a row opens its menu (popover / action sheet: Změň přístup (admin for leaders) · Pošli pozvánku znovu · Zruš
pozvánku / Odeber přístup). Sections: Pozvánky (2) – „platí do 19. 10.“ or „Vypršela 21. 9.“ in `--no-ink`;
Správci · Vedoucí · Členové; Přístupy bez karty. Trail: the level pill. Demo: an info callout as D's first line.
„Každá změna začne platit za pár minut.“ is said in the Pozvi dialog and the change menu, not under the title.

### 6.10 Nastavení sboru `#nastaveni` (leaders; admin rows marked)

Page, one column 640. Blocks (r20, `--card`, padding 24), each a section with quiet S „Uprav“ → a dialog / sheet:
**Sbor** (název, hlavní místo, adresa, web) · **Pravidla** (Nejvíc služeb za měsíc, Nejvíc nedělí po sobě) · **Kdy
Zvonec bučí** (days before) · **Děti** (Dospělý je od) · **Záloha** (Stáhni zálohu; admin: Nahraj zálohu). Values
are shown as „label — value“ rows. No inline fields, no form foot.

### 6.11 Můj účet `#ucet`, Kdy nemůžu `#kdy-nemuzu` (everyone; from the person's menu)

- **Můj účet**: page 640. Head (avatar 72, name, „správce“). Sections: Moje karta (contact facts, [Uprav] → the person
  form) · Přihlášení (jméno, [Změň heslo]) · Kalendář v telefonu ([Stáhni] / odběr) · Barvy (the same three
  bullseyes) · „Odhlas se“ (quiet M, `--no-ink`) at the end. Without a card: a callout „Zvonec neví, která karta
  v Lidech je tvoje…“.
- **Kdy nemůžu**: page 640. A: „Kdy nemůžu“ · [Přidej] (phone „+“). D: „Zapiš si dny, kdy nemůžeš. Zvonec tě na ně
  nebude navrhovat.“, then rows „24.–26. 10. · dovolená“; a row opens its menu (Uprav · Smaž). Empty: „Zatím žádné
  dny.“ The add sheet: date range, reason and, when duties clash, „Odmítni i služby v těch dnech“ with the list.

### 6.12 Přihlášení `#prihlaseni`, Nový Zvonec, Pozvánka `#pozvanka/<kód>` (signed out)

No app chrome. A centred column max 400 on `--ground`; on ≥ 600 a block (r20, `--card`, padding 32) at 20 % of the
height. Fields M 44 (16 px text), 12 apart; main action L 52 full width; the error as a callout above the button.

```
          církev jako kráva                      wordmark
          Přihlášení                             h1 34/40
          Jméno           [________________]
          Heslo           [____________ 👁 ]
          [✓] Pamatuj si mě                      no „forgot password“ link (there is no reset)
          [          Přihlas se          ]       L 52 primary
          Podívej se na Pastvu ›                 quiet link
```

- **Nový Zvonec** (first run, live mode without logins): the GitHub key and the first admin, same frame (Simple).
- **Pozvánka**: „Pozvánka do Zvonce“, „Zve tě Radim Kovář“, name (prefilled), a new password, [Přijmi pozvánku].
  Expired: one sentence and „Požádej o novou pozvánku“ (mailto to the inviter).

### 6.13 Veřejný web / Pastva `#pastva[/<id>]` (public)

No app chrome. Header 64: wordmark left, „Přihlas se“ (quiet M) right; signed in, a strip above it „Takhle to vidí
návštěvníci · ‹ Vrať se do Zvonce“. Column 720, centred. h1 „Pastva“, a paragraph, **Co bude** (Seznam rows of
public meetings: arch, time, Účel bar, title, place – no people), **Jak se scházíme** (public formats as rows with
the minutes block, anchor `jak-se-schazime`). A meeting: the band, title, when, where + map, description, the
public Osnova points. The same two palettes.

---

## 7. Colour

### 7.1 Two palettes and the device

| role (One token) | Krém a hlína `cream-clay` (light) | Hlína a růžová `clay-pink` (dark) |
|---|---|---|
| page `--ground` | #fffaf6 | #3b2f2f hlína |
| sidebar, rail, tab bar `--bar` | #f9e7dd krém | #2a2020 |
| pane, cards, dialogs `--card` / `--overlay` | #fffdfb | #3e3232 / #443636 |
| text `--ink` / `--ink-2` / `--ink-3` | #3b2f2f / #625252 / #70605f | #faebe6 / #dcc2c0 / #d5bfbe |
| main action `--act` / `--on-act` | hlína #3b2f2f / #fffaf6 | **růžová #e6acac** / #3b2f2f |
| selection `--pick` + bar `--mark` | pink α .30 + hlína bar | pink α .14 + pink bar |
| links `--ink-accent` | #943b42 | #f1b1b2 |
| the Moje card, „Tvoje služba“ `--feature` | #fdf0ea | #433434 |

- **One pink, used as itself.** In Hlína a růžová it is the main action, the counts, the today disc and the
  selection bar. In Krém a hlína it appears only as the selection tint. Never pink avatars, tags or text.
- The picker offers exactly: Krém a hlína · Hlína a růžová · Podle zařízení (light → Krém a hlína, dark → Hlína a
  růžová). A palette stored by Next or Simple that One does not offer is shown in One as its scheme's palette
  (light → Krém a hlína, dark → Hlína a růžová) without rewriting the stored choice (`one/palette-limit.js`).

### 7.2 Next's Účel hues (unchanged; Sunday stays rose)

`KIND_HUES = { service: 'rose', rehearsal: 'blue', smallGroup: 'teal', event: 'plum' }` (Next's; Simple's amber
and green are dropped). Each hue gives `--hue-fill` (step 3), `--hue-mark` (11), `--hue-ink` (12). They appear in
exactly these places, nowhere else:

1. the 3 px Účel bar beside a meeting's text (Seznam, Rozpis, Obsazení, Moje's rows, Pastva), a separate element;
2. the month chip: its bar on the chip's square left edge; „mine“ = `--hue-fill` chip with `--hue-ink`;
3. the mini month's dots (6 px, max 3);
4. the Setkání band (fill + arch in mark) and its Účel tag;
5. the Šablona mark; 6. the dot before each choice in Filtr › Účel.

Never on buttons, navigation, selection or links. A rose „mine“ chip never sits beside the pick look: the grid has
no selected chip (a chip opens a page). Avatars and team marks use the avatar pairs blue, green, plum, amber, teal
(no rose). Status: ✓ green confirmed, ○ amber waiting, ● red problem – always symbol + word, never colour alone.

---

## 8. Routes

Every list route carries the open item: `#<list>/<id>` draws the list with the pane at ≥ 1200 and the detail page
below 1200 (its back link goes to `#<list>`).

| route | screen | access |
|---|---|---|
| `#moje[/<eventId>]` | Moje | member |
| `#obsazeni[/<eventId>]` | Obsazení | leader |
| `#kalendar` → the remembered view | Kalendář | member |
| `#kalendar/seznam[/<eventId>]` · `#kalendar/mesic/<YYYY-MM>[/<YYYY-MM-DD>]` · `#kalendar/rozpis/<YYYY-MM>[/<eventId>]` | views | member |
| `#setkani/<id>` · `#setkani/<id>/osnova` | Setkání page (deep link, Měsíc) · Osnova | member |
| `#lide[/<personId>]` · `#lide/skupiny[/<groupId>]` · `#lide/vypis` · `#lide/domacnost/<id>` | Lidé | member (vypis: leader) |
| `#sablony[/<id>]` · `#formaty[/<id>]` · `#mista[/<id>]` | Jak se scházíme | leader · member · member |
| `#pristupy` · `#nastaveni` | Správa | leader |
| `#ucet` · `#kdy-nemuzu` | person's menu pages | member |
| `#prihlaseni` · `#pozvanka/<kód>` · `#pastva[/<id>]` · `#kit` | signed out, public, the specimen | – |

Redirects (all of Simple's stay): `#osoba/<id>` → `#lide/<id>`; `#tym/<id>`, `#skupina/<id>`, `#skupiny`, `#tymy` →
`#lide/skupiny[/<id>]`; `#domacnost/<id>` → `#lide/domacnost/<id>`; `#sablona/<id>` → `#sablony/<id>`; `#misto/<id>` →
`#mista/<id>`; `#domu`, `#vice`, `#prehled` → `#moje`; `#kalendar/<YYYY-MM>` → `#kalendar/mesic/<YYYY-MM>`;
`#kalendar/<YYYY-MM-DD>` → `#kalendar/mesic/<YYYY-MM>/<day>`; `#rozpis[/<m>]` → `#kalendar/rozpis/<m>`;
`…/bremeno` → Rozpis + the Břemeno dialog; `#upozorneni`, `#kolize` → `#obsazeni` with Filtr „Něco nesedí“;
`#lide/<filter slug>` (clenove, pratele, hoste, deti, doplnit, narozeniny, archiv) → `#lide` with that filter set.

---

## 9. What was removed or merged, and why

| removed / merged | was in | now | why |
|---|---|---|---|
| Více tab | Next | the person tab (phone), sidebar foot (≥ 600) | „more“ is a junk drawer; the owner likes Simple's menu |
| the circle only on Moje | Simple | the person tab on every screen | Kdy nemůžu, Barvy, Správa were two taps from anywhere else |
| sidebar group „Sbor“ (Přístupy, Nastavení, Veřejný web) | both | the person's menu › Správa | rare, system-level; the owner likes Simple's Správa |
| Šablony, Formáty, Místa under the circle | Simple (phone, 960–1199) | sidebar / rail „Jak se scházíme“ (phone: the menu) | the owner: they belong in the sidebar |
| month chip „Říjen ▾“ on the h1, scope chip „Všechny týmy“, Rozpis team chip | Simple | period line in D (Měsíc, Rozpis); Filtr › Tým | they overlapped the h1 and were cut |
| period in the top bar / toolbar | Next, Simple | the first line of D, fixed-width label | the source of „› over Dnes“ and of every jump |
| chip rows (Všichni / Členové…, Chybí lidi / Čeká…, team tabs) | Next | one Filtr with a count | „one Filtr, not rows of chips“ |
| „Filtr: … · Zruš“ line | Simple | the count + the filtered empty state | it pushed the content |
| lead lines and overlines in the head (Moje date, Obsazení, Šablony, Přístupy, Formáty) | both | D's first or last line, the empty state, the dialog | they moved B to a different y per screen |
| FAB | Next, Simple phone | the main action in A („+“ on a phone) | it covered call buttons and slots, and rode on the keyboard |
| pane opening by itself (Next Kalendář, Formáty; Simple Obsazení) | both | pane on click only | „nothing opens by itself“ |
| month grid beside a pane | both | full-width grid; a meeting opens as a page | cells squeezed to 2–6 letters, › on Dnes |
| icon-only rail 960–1199 | both | labelled rail 600–899, full sidebar from 900 | at 1024 a full sidebar fits |
| „Co je potřeba“ on Domů | Next | Obsazení + its count | Moje answers one question |
| Upozornění / Kolize views and chips | Next | Obsazení › Filtr › Něco nesedí; „● … ›“ lines; „Co nesedí“ in Setkání | problems live where they are fixed |
| „Doplň volná místa“ as Rozpis's head button | both | Obsazení's main action; Kalendář ⋯ | a screen's main action never changes with the view |
| Rozpis as a page from ⋯ | Simple | the third Kalendář view | it is the month a leader plans, with the same Filtr |
| group cards with avatar stacks | Next, Simple | rows „9 lidí · vedou …“ | read faster, wrap without cutting |
| indented rooms in Místa | Next | inside the place's detail | broke the one-row look |
| two-column Nastavení with inline fields | Next | one column of value blocks + „Uprav“ dialogs | editing is always in a layer |
| photo picker and duplicate pills in the Setkání head | Next | the Účel band and one tag | a calmer detail |
| palettes other than the two | both | Krém a hlína, Hlína a růžová, Podle zařízení | the owner's call |
| auto-open first team in Setkání | proposal calm | collapsed team lines that show names, marks and slots | counts as „opening by itself“ |

**Kept on purpose.** From Simple: Moje's answer card, the person's menu, Lidé A–Z, the mini month with the day
list, Rozpis as a plain list, one Filtr, the picker („Můžou / Nejde to“, „Hledej mezi všemi lidmi“), the save line,
Ctrl Z / „Vrať“, „/“ and „N“, the blockout clash offer, the login and first-run pages, Podrobný výpis (in ⋯). From
Next: the Účel hues and calendar dots, the Seznam list with date arches, the minutes blocks, the Setkání detail
with its band, Kdo slouží, ring and Osnova preview, the sidebar groups. Names users know stay (Obsazení, Břemeno,
Doplň volná místa).
