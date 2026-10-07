# Concept: one screen, one question

A simpler Zvonec. The owner approved the direction („Je to dobrý směr“) and then each screen one by one.
Every screen answers one question and fits on one phone screen; details are one tap further.

Open the pages from a local server rooted at the repo, so the tokens and fonts under `docs/` load
(e.g. `python3 -m http.server` in the repo root, then `/zvonec/design/one-question/moje.html`).
`index.html` is the first overview; the other pages are the refined screens, drawn as a 390 × 844 phone or a
1440 × 900 desktop. Screenshots are not committed (`*.png` is ignored outside `docs/`).

## Tabs

| Tab | Question | Who |
|---|---|---|
| Moje | When do I serve? | everyone |
| Obsazení | Whom do we still need? | leaders |
| Kalendář | What is happening? | everyone |
| Lidé | How do I reach someone? | everyone |

Account, Kdy nemůžu, colours, the public web and administration live under the person's circle (top right
on a phone, the name at the bottom of the rail on a desktop). There is no Více tab.

## Decisions per screen

1. **Moje** (`moje.html`, variant A approved)
   - Top: the day („Středa 7. října“) and a greeting in the vocative („Ahoj, Radomile“), no „Moje služby“ title.
   - One answer card at a time with „1 ze 3“ and dots; after Můžu / Nemůžu the next one comes.
   - When nothing waits: „Všechno máš zodpovězené · Až tě bude někdo potřebovat, Zvonec se ozve.“ and a
     toast „Díky, máš to potvrzené. · Vrať“.
   - Below: „Tvoje další služby“ (confirmed, ✓). Kdy nemůžu is not here (it is under the circle).
2. **Setkání** (`setkani.html`, approved)
   - When, where; „Tvoje služba“ card (with Můžu / Nemůžu while it waits); „Kdo slouží“ as one line per
     team with the names; the viewer is „Ty“ (capital T).
   - Leader: ○ before a name that has not answered (legend „○ čeká na odpověď“), „+ Role“ under a team
     for an empty slot, › to open the team (roles with ✓ potvrzeno / ○ čeká na odpověď / „+ Doplň“).
   - **No fill ring** on this screen (the owner removed it); Osnova and „O setkání a místě“ are rows.
   - Editing the event (time, place, Osnova, cancel) is in ⋯. No cover picture, no kind / web pills, no
     recurrence line.
3. **Kalendář** (`kalendar.html`, approved)
   - Phone: one list from today, grouped by week, one date arch per day; „Ty“ where I serve; a cancelled
     event is struck through with „zrušeno“. „Říjen ▾“ opens a mini month (dots on days with events,
     arrows to other months, „Dnes“). Leaders have „+“. No view switch, no filters, no Rozpis tab
     (its job moves to Obsazení; the printable roster stays in ⋯).
   - Desktop (`index.html` desktop frame): the month grid and the open event beside it, as on the event
     screen.
4. **Obsazení** (`obsazeni.html`, approved; leaders only)
   - Only events in the next 4 weeks with something to do. Right: „14 z 15“ with the fill ring (kept here,
     where events are compared). Under the title: „+ Role“ per empty slot, „○ 2 ještě neodpověděli ›“,
     „● Radomil má dvě služby naráz ›“. Scope chip: the leader's team / „Všechny týmy“ for admins.
   - „+ Klávesy“ opens the picker titled by the role: people of the team who can, longest-rested first;
     who cannot that day is greyed out with the reason; „Hledej mezi všemi lidmi“.
   - „2 ještě neodpověděli“ opens who waits, with their duty, how long it waits, SMS and call buttons.
5. **Lidé** (`lide.html`, approved)
   - Search („Hledej jméno nebo tým“) and A–Z with a call button on each row; no filters, chips or table.
   - Searching finds a team too (team row, then its people with what they do) – no separate Skupiny tab.
   - ⋯ (leaders): Týmy a skupinky, Narozeniny, Chybí údaje, Hosté bez souhlasu, Archiv, Stáhni seznam.
   - Person: avatar (initials in the UI font, optically centred), name, membership and team chips, Zavolej ·
     SMS · E-mail, for leaders what is missing („Chybí datum narození · Doplň“), Příští služby, then
     „Kontakt, domácnost a údaje ›“. Editing in ⋯.
6. **Under the circle** (`menu.html`, shown)
   - Member: Můj účet, Kdy nemůžu (with the next range), Barvy (bullseyes inline), Veřejný web, Odhlas se.
   - Admin: plus Správa – Šablony setkání, Formáty, Místa, Přístupy (with what waits), Nastavení sboru.
   - Kdy nemůžu: one sentence, the list, „Přidej“.
7. **Desktop** (`pocitac.html`, shown)
   - Rail: Moje · Obsazení · Kalendář · Lidé and the person at the bottom. Each tab is its phone screen on
     the left and the chosen item on the right (Moje → the event of the chosen duty as a member sees it,
     Obsazení → the event as a leader sees it, Lidé → the person).
   - The chosen item has only a soft fill, no edge (the owner did not like the dark bar). The fill is a solid
     step of our pink (`--rose-1`): the alpha tint `--pick` is solved over the rail colour, so on the lighter
     page it turns cold and pinkish-purple. The build fixes `--pick` at the source (`zvonec/palettes.mjs`).
   - No divider touches the fill: the chosen (and the hovered) row hides its own line and the one of the row
     above it.
   - The rail keeps the fine bar at the left edge of the current item, as in the live app.

Data and logic stay as they are – only the screens change.

## The build

The owner approved the concept („Ano. Začni.“). It is built at `docs/zvonec/simple/` – a fork of Zvonec Next on
the shared `docs/zvonec/lib`, next to it, so the two can be compared: https://zvonec.cirkevjakokrava.cz/simple/
(the demo: https://manifest.cirkevjakokrava.cz/zvonec/simple/). The main address stays on `next/` until the owner
says otherwise (`docs/zvonec/go.js`).

- Shell (`simple/app.js`, `simple/ui/me-menu.js`): the four tabs, the circle on Moje and the person at the rail's
  foot open one menu; Next's `#domu` and `#vice` lead to `#moje`, Next's calendar views to `#kalendar`.
- Screens: `ui/mine.js` (Moje, `#moje[/<event>]`), `ui/event.js` (Setkání), `ui/calendar.js` (Kalendář, the printable
  roster at `#kalendar/rozpis`), `ui/staffing.js` (Obsazení, `#obsazeni[/<event>]`), `ui/people.js` and
  `ui/people-card.js` (Lidé, `#osoba/<id>[/udaje]`), `ui/event-duties.js` (`pickFor`: the picker titled by the
  role). Their styles are in `simple/css/simple.css` (loaded last).
- The selection tint of the light Krém a hlína palette is now a plain alpha of the brand pink (`zvonec/palettes.mjs`),
  so it stays warm on the page in all three apps.
- One hover everywhere: the whole row lights up, rounded, with its trailing buttons (⋯, ›) inside the fill, and
  neither its own line nor the one above it touches the fill – rows, Osnova points (Next too), the team lines,
  the team sheet and „Osnova ›“ / „O setkání a místě ›“.
- Colours from the brand only. The two blue palettes take selection, today, links, info and the progress ring from
  their own ink, not the pink (`zvonec/palettes.mjs`, all three apps). In Simple, avatars, team marks and kind tags
  are the brand's pink, blue, green, sand and lilac mixed into the palette, and the calendar chips are one colour
  (mine bold, the open one filled), as in the concept.
