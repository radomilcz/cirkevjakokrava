# Zvonec – design brief (binding for the redesign)

Owner's words, condensed: the current UI is both overgrown and not working. Every module must work
perfectly and be understandable on its own: people and roles, formats, events. Lists must be
beautiful. It is a tool and must behave like one – but friendly. Generous with space, never wasteful.
A left sidebar is welcome. Remember what the public sees and what only a signed-in person sees: the
public part is made of what we publish from the private part (events, meetings…).

## 1. Principles

1. **One page = one job.** The page title says what it is. No taglines/eyebrows above titles – if the
   title doesn't work, a tagline won't save it. A lead sentence under the title only when it adds
   something the title can't (max one sentence).
2. **Tool first.** Primary action of the page is one obvious button top-right of the page header.
   Secondary actions are quiet. Destructive actions live in the edit dialog, never in lists.
3. **Lists are the product.** Every collection (people, teams, roles, formats, events, warnings,
   duties) uses the same list component: leading (avatar / date block / dot), primary line, one
   secondary meta line, trailing (status / count / chevron). Whole row clickable when it opens
   something. Same row height rhythm everywhere. Empty state = one sentence + the primary action.
4. **People are shown with their full name** wherever a person is assigned to something (duty,
   osnova item leader, team member, picker). Only the dense roster table may use
   „Veronika F.“ – and only when it must; never a bare first name for an assignment.
5. **Status is a symbol + word, never a word alone.** Assignment status:
   - `confirmed` → filled circle with ✓ + „potvrdil(a)“ / „potvrzeno“
   - `proposed`  → dashed ring with a clock + „čeká na potvrzení“
   - `declined`  → ✕ in a ring, name struck through + „nemůže“
   The symbol is drawn (SVG/CSS), works in every palette, prints in black.
6. **Space:** content column max ~72ch for text, lists up to ~880px, wide tables may use the full
   main area. Consistent spacing scale (4/8/12/16/24/32/48). No 1280px-wide forms; dialogs ≤ 560px
   (wide variant 760px).
7. **Type:** Agrandir Regular for everything readable; Narrow Black only for page titles (h1) and
   section headings (h2); Grand only for the brand mark. Minimum 15px body on phone, 14px meta.
   Muted text must pass 4.5:1 contrast in every palette.
8. **Czech** natural and plain (CLAUDE.md). Buttons = verb (+ object). No calques
   („mít přihlášení“ → „může se přihlásit“).

## 2. Layout

- **Desktop (≥ 960px):** fixed left sidebar 248px: brand at top, navigation, at the bottom the
  signed-in person (avatar + name → Můj účet), palette picker, save status (only while saving / on
  error). Main area: page header (title, optional lead, primary action) then content.
- **Phone:** top bar with brand + menu button; the menu opens the same navigation as a sheet.
  No horizontal scrolling anywhere except inside the roster table.
- Print: no sidebar, no top bar.

## 3. Modules and navigation

Leader / admin sidebar (in this order):
1. **Moje** – my duties waiting for an answer, my next duties, when I can't, my teams (only when the
   signed-in login has a person).
2. **Kalendář** – month / list of events; event detail (people on duties, osnova); new event.
3. **Rozpis** – month table, print.
4. **Lidé** – registry: filters Všichni · Členové · Přátelé · Hosté · Děti · Už nechodí; person detail;
   households.
5. **Týmy a role** – teams, home groups, leadership; a team lists its roles and who can do what.
6. **Formáty** – building blocks of the osnova; each with Proč a Jak; can be published.
7. **Upozornění** – with a count.
8. **Nastavení** – Sbor, Šablony setkání, Místa, Přihlašování, Záloha.

Member sidebar: Moje · Kalendář · Rozpis · Lidé (directory) · Formáty (read-only).

Each module must be complete on its own: list → detail → create/edit/delete, with no detour through
another module to finish its own job (e.g. adding a member to a team happens in the team; setting
someone's roles can also be reached from the person's detail, which links to the team).

## 4. Public vs. signed-in

| | public (not signed in) | member | leader / admin |
|---|---|---|---|
| published events: title, date, time, place, public note | ✓ | ✓ | ✓ |
| published formats: name, Proč, Jak | ✓ | ✓ | ✓ |
| names of people, duties, roster, osnova leaders | – | ✓ | ✓ |
| contacts | – | only people who show them | ✓ |
| membership, notes, consent, availability reasons, warnings | – | – | ✓ |

- Publishing is explicit: `event.public` (default from the event type's `public`), optional
  `event.publicNote`; `format.public`. Nothing else is ever public.
- The public site is built from data the data repo publishes: the data-repo workflow writes
  `public.json` = `{ churchName, address, events: [{id,title,kind,start,end,places:[names],note}],
  formats: [{id,name,minutes,why,how}] }` next to the app; only `public: true` items, upcoming
  (from today −1 day, 120 days ahead), no person data at all. `lib/public.js` builds it (pure,
  tested); the workflow runs it with node.
- Signed-out visitor sees: **Program** (upcoming published events, list grouped by week) ·
  **Jak se scházíme** (published formats) · **Přihlásit se** (button in the sidebar/top bar).
  The sign-in form is a page, not the whole site.
- Demo mode shows the public view too (built from demo data with `lib/public.js`).

## 5. Components (ui/dom.js and friends)

- `pageHeader({ title, lead?, actions? })` – no eyebrow parameter.
- `list(items, row)` + `row({ lead, title, meta, trail, href|onclick })`.
- `avatar(person, size)` – initials circle (colour derived from the palette, not random hues).
- `personName(person, { full = true })` – full name; `shortName` only for the roster table.
- `assignee(assignment, person, { canAnswer, canEdit })` – avatar + full name + status symbol and
  word; answer buttons „Potvrdit“ / „Nemůžu“ when it's mine; leader actions in a small menu.
- `statusIcon(status)` – the three symbols from §1.5.
- `emptyState(text, action?)`, `section(title, actions?)`, dialogs ≤ 560px.

## 6. Done means

- Every flow in every module works in demo and in live mode (mocked GitHub), tested in a browser.
- Lists look calm and consistent at 1280 and 390; nothing stretched, nothing tiny.
- Public part shows only published data; tests prove `public.json` has no person data.
