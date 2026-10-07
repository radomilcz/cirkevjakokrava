# Zvonec 3 – design spec

The spec the v3 engineers build from. Read with `BRIEF.md` (platform, house rules) and the mockups in
`mockups/` (open `mockups/index.html` from the local server; `?paleta=hlina-ruzova` shows the dark palette).
`mockups/mock.css` implements the tokens and most components below with the exact names used here. Copy them
into `docs/zvonec/v3/css/`, don't reinvent them.

Contents: 1 Concept · 2 Principles · 3 Roles · 4 Information architecture · 5 Screens · 6 Interaction patterns ·
7 Design system · 8 Czech copy · 9 MVP cut and work split · 10 Platform notes

---

## 1. Concept: the bell rings only when you're needed

Zvonec means a cowbell. The app stays quiet (cream, clay, neutral lines, one display face for titles) and makes
a sound only when someone is needed. That sound comes in three colours: **amber** when something is waiting,
**red** when something won't work, and **the one pink** when it's about *you*. A member opens it, sees one
sentence about their next duty and answers „Můžu / Nemůžu“ with one click. A leader opens it, sees what is
still missing in their team and fixes it from a list, a grid or a picker that already knows who can serve.
An admin keeps templates, formats, places and logins in a plain „Správa“ corner. It works like Linear or
Planning Center: a sidebar, Ctrl K, side panels instead of page hops, inline editing, undo instead of „Are
you sure?“. Every title is in Agrandir Narrow Black, every word of UI in Schibsted Grotesk.

## 2. Product principles

1. **Your next step first.** Every screen opens on what this viewer has to do (answer, fill, fix) before what
   they could browse. Přehled starts with one sentence about your next duty.
2. **One question per screen.** Each screen answers one question, written down in section 5. If a feature
   doesn't help answer it, it goes elsewhere.
3. **Calm by default, loud for problems.** Surfaces are neutral. Colour only means something: green, amber
   and red are statuses, and pink is *you, here, now*. Nothing is coloured to look nice.
4. **Say it in words.** Every dot, glyph, colour and underline is also said in plain Czech: in the row, in
   the tooltip, in `aria-label`. Problems are whole sentences with a way out („Vyměň“, „Obsaď“, „Vím o tom“).
5. **Fast hands, forgiving app.** Keyboard everywhere, Ctrl K for everything, optimistic changes with a
   „Vrať zpět“ toast. Confirm only what can't be undone (deleting a card, a meeting, a series, a login).
6. **Stay in place.** Details open next to the list (docked panel, peek card, popover). Full pages are only
   for deep work: a meeting, a team, a template.
7. **The pocket is not an afterthought.** The phone gets a tab bar, sheets and thumb-sized answers, and every
   flow works at 390 px. It is not a squeezed desktop.

## 3. Roles and what they see

`can('member'|'leader'|'admin')` from `ui/state.js`. Access is enforced only by the UI (any login holds the
token), so the UI hides what a role can't use. It never shows controls that only fail.

| | Member (`člen`) | Leader (`vedoucí`) | Admin (`správce`) |
|---|---|---|---|
| Přehled | next duty, answers, this week, birthdays | + a card per team they lead | + „Problémy v rozpisu“ card, „K doplnění“ |
| Moje služby, Kdy nemůžu | own | own | own |
| Kalendář, Setkání | read; answer own duties | + create, edit, cancel; assign anyone | same |
| Plánování | – | all teams, default filter = teams they lead | all teams |
| Lidé | **Adresář**: people with `showInDirectory`, name, teams, phone, e-mail | full table, edit cards, add people, households | + archive, delete cards |
| Týmy | read (members, leaders, roles) | edit the teams they lead (members, skills, leader flag) | edit all, add/archive teams, roles |
| Správa (Šablony, Formáty, Místa, Přístupy, Nastavení) | – | – | full |
| Answer for someone else | – | yes (`Odpověď › Může / Nemůže`) | yes |

Leaders may edit every roster (a small church plans together), but every planning view starts filtered to
the teams they lead (`ledBy(data, myId())` from `lib/groups.js`).

**Demo „view as“.** In demo mode the sidebar foot shows „Pohled správce / vedoucího / člena“. It opens a
menu titled „Podívej se očima…“ with the three `DEMO_VIEWERS` (Radim, Martina, Jana) plus „Někoho
jiného…“ (person search → `actAs(personId, access)`). The brand row shows an outline tag „Ukázka“. Live mode has neither.

## 4. Information architecture

### 4.1 Sidebar (desktop ≥ 1024) and tab bar (phone < 768)

```
◉ Zvonec [Ukázka]            ▾  → menu: Můj účet · Barvy · Klávesové zkratky · Odhlas se
[ Hledej…            Ctrl K]
  Přehled                       #prehled
  Moje služby             (3)   #moje            count = my proposed duties (strong badge)
  Kalendář                      #kalendar
  Plánování                     #planovani       leader+
  Lidé                          #lide            members: same item, the screen is the Adresář
  Týmy                          #tymy
MOJE TÝMY                                        leader+: teams they lead
  [CH] Chvály             (4)   #tym/g-worship   count = open slots + waiting + errors, next 21 days
SPRÁVA                                           admin
  Šablony · Formáty · Místa · Přístupy · Nastavení
                                (spacer)
  Pastva ↗                      #pastva (public page, new tab)
  [ Pohled vedoucího ▾]        demo only
  (MD) Martina Dvořáková        → #ucet;  save state under the name: „Uloženo“ / „Ukládám…“ / …
```

* Width 232 px. Collapsible to a 56 px icon rail (`[` toggles, remembered in localStorage); the rail is the
  default at 768–1023 px.
* Current item: solid pink pill (`--nav-current-bg`) with clay text. Its count inverts.
* The content is a raised **sheet** (`--surface-app`, radius 12, `--shadow-2`) floating 8 px inside the
  chrome (`--surface-chrome`). That is the one structural brand gesture: cream paper on a cream table.

**Phone tab bar** (82 px incl. home indicator, `--surface-chrome`, top hairline): Přehled · Moje (badge) ·
Kalendář · **Lidé** (member) / **Plán** (leader, admin) · Více. The current tab gets a pink pill behind the
icon. „Více“ opens a sheet with everything else: Lidé or Plánování (whichever isn't a tab), Týmy, Moje týmy,
Správa items, Pastva, Můj účet, Barvy, the demo switch and Odhlas se.

### 4.2 Routes

Hash routes with Czech slugs. `#<screen>[/<sub>…][?<key>=<value>&…]`. Query keys hold the panel and filters,
so every state you see can be shared and the Back button closes panels.

| Route | Screen | Who |
|---|---|---|
| `#prihlaseni` | Přihlášení (live, signed out) | everyone |
| `#prehled` (also empty hash) | Přehled | member+ |
| `#moje`, `#moje/probehle`, `#moje/nemuzu` | Moje služby: nadcházející · proběhlé · Kdy nemůžu | member+ |
| `#kalendar/mesic/2026-10`, `#kalendar/tyden/2026-10-05`, `#kalendar/seznam/2026-10-07` | Kalendář (view/anchor date); `?setkani=<id>` = peek; `?jen=moje&druh=service` filters | member+ |
| `#setkani/<id>` (`/tym` default, `/osnova`, `/o-setkani`) | Setkání | member+ (edit: leader+) |
| `#setkani/nove?sablona=<typeId>&den=2026-10-18` | Nové setkání (dialog over the current screen) | leader+ |
| `#planovani` (`/k-reseni` default, `/rozpis`, `/vytizeni`) | Plánování; `?tymy=g-worship,g-tech&druh=service&od=2026-10` | leader+ |
| `#lide` (`/clenove`, `/deti`, `/domacnosti`, `/doplnit`, `/archiv`, `/pohled/<id>`) | Lidé; `?osoba=<id>` = panel; `?tym=…&vztah=…&q=…` | member+ (Adresář) |
| `#osoba/<id>` | Osoba (full page of the same panel) | member+ (members: contact and teams only) |
| `#tymy`, `#tym/<id>` (`/lide` default, `/role`, `/dovednosti`, `/rozpis`) | Týmy, Tým | member+ (edit: leader of it, admin) |
| `#sablony`, `#sablona/<id>` | Šablony, Šablona | admin |
| `#formaty?format=<id>` | Formáty (+ panel) | admin |
| `#mista?misto=<id>` | Místa (+ panel) | admin |
| `#pristupy` | Přístupy | admin |
| `#nastaveni` | Nastavení | admin |
| `#ucet` | Můj účet | member+ |
| `#pastva` | Pastva (public, no sign-in) | anyone |
| `#pozvanka/<code>` | redirect to `../next/#pozvanka/<code>` (out of scope) | anyone |

Unknown route → „Tahle stránka tu není“ with „Jdi na Přehled“. Route without access → the same screen with
„Sem se dostane jen správce.“ (no redirect loop).

## 5. Screens

Format per screen: **Q** = the question it answers · **Desktop** · **Phone** · **Actions** · **Data** (lib
functions) · **Empty**.

### 5.1 Přihlášení `#prihlaseni` (live mode, signed out)

* **Q** Who are you? **Desktop/phone** Centered card 400 px on `--surface-chrome`: large bullseye (40 px), title
  „Přihlášení“ (display-lg), fields Jméno, Heslo, checkbox „Pamatuj si mě na tomhle zařízení“ (checked on
  phones), primary „Přihlas se“ full width. Under the card: link „Podívej se, co chystáme“ → `#pastva`.
* Wrong name/password: inline error under the button: „Tohle jméno a heslo nesedí. Zkus to znovu, nebo napiš
  správci.“ The derivation is slow (310 000 PBKDF2 rounds), so the button shows a spinner and „Přihlašuju…“.
* **Data** `signIn(S.logins, name, password)` → `signedIn(result)`; `rememberLogin(result, persistent)`.
  After sign-in go to `S.afterSignIn || '#prehled'`.

### 5.2 Přehled `#prehled` – mockup `prehled.html`

* **Q** What's next for me, and what do I owe an answer to?
* **Desktop** Narrow content (max 1080). Head: eyebrow date („Středa 7. října“), a display-lg **hero
  sentence** about the next duty („Zítra tě čeká Zkouška chval“ / „V neděli tě čeká Setkání na pastvě“ /
  „Teď nikde nesloužíš“), then one line of detail (role · day time · place · „Na tvou odpověď čekají 3
  služby.“). Two columns (1fr / 320):
  * left: **Čeká na tvou odpověď** (ask rows with Můžu / Nemůžu, max 5, „Moje služby ›“), **Tento týden v
    církvi** (next 7 days grouped by day: time, kind icon, title, fill meter for events with needs, a pink
    dot on events where I serve).
  * right: **Tvůj tým X** per led team (leader): three stats (volná místa · čeká na odpověď · problémy),
    the most urgent problem as a callout, the next three Sundays' fill, one action („Obsaď Klávesy na
    neděli“); **Problémy v rozpisu** (admin, errors only, next 14 days); **Narozeniny tento týden**;
    **Kdy nemůžu** (my upcoming blockouts + „Přidej termín“); **K doplnění** (admin: cards missing data).
* **Phone** One column, same order, cards collapse to the first item. The first request shows its buttons,
  the others are rows that open Moje služby.
* **Actions** Můžu / Nemůžu (toast + undo), Obsaď (opens the picker in place), Přidej setkání (C, leader),
  Kdy nemůžu.
* **Data** `upcomingDuties(data, myId(), { from: today })`, `eventsInRange`, `fillRatio`, per team:
  `openSlots` + `unconfirmedDuties({ groupIds })` + `S.conflicts`, `upcomingBirthdays`, `data.availability`,
  `peopleWithMissingData`.
* **Empty** Without duties the hero says „Teď nikde nesloužíš. Užij si pastvu.“ Empty cards are hidden,
  except Tento týden („Tento týden nic není.“).

### 5.3 Moje služby `#moje` – mockup `moje.html`

* **Q** When do I serve, and what do I still owe an answer to?
* **Desktop** Top bar actions: „Stáhni do kalendáře“ (ghost, `.ics` via `lib/ics.js`), „Dej vědět, kdy
  nemůžeš“. Segmented: Nadcházející · Proběhlé · Kdy nemůžu (counts). Two columns:
  * **Čeká na tvou odpověď**: ask rows (date block, title + role tags, meta line, buttons). If a blockout
    covers it, **Nemůžu becomes primary** and a callout says why („Ten den máš dovolenou
    (24. 10.–1. 11.). Odpověz Nemůžu a vedoucí týmu Děti najdou záskok.“). Under each row: „Slouží s tebou …“
    (avatar stack + first names).
  * **Potvrzené**: rows with the badge „Potvrzeno“ and a ⋯ menu (Změň odpověď · Otevři setkání · Přidej do
    kalendáře).
  * „Proběhlé služby · 7 za poslední 3 měsíce ›“.
  * right: **Kdy nemůžu** card (list + „Přidej termín“ + hint „Dokud tu termín máš, nikdo tě na ten čas
    nenaplánuje.“), **Tvoje týmy** (team, my roles, who leads).
* **Proběhlé** List by month, newest first, read-only. Declined ones are struck through.
* **Kdy nemůžu** (`#moje/nemuzu`) List of `availability` records (range, reason, edit, delete with undo).
  „Přidej termín“ opens a dialog (desktop) or sheet (phone): Od, Do (range date picker), Proč (optional,
  „uvidí to vedoucí“). If the range covers duties that are waiting or confirmed, a callout lists them and a
  checked checkbox „Odpověz u nich rovnou Nemůžu“ is offered.
* **Phone** Segmented full width, cards with 44 px buttons, the form as a sheet (mockup).
* **Data** `upcomingDuties`, `data.availability` (`{ id, personId, from, to, reason }`), `unavailability`,
  `ics.js`.
* **Empty** „Teď nikde nesloužíš. Až tě někdo naplánuje, uvidíš to tady.“ + „Podívej se do kalendáře“.
  Kdy nemůžu: „Tady zatím nic není. Jedeš na dovolenou? Přidej termín a nikdo tě na ten čas nenaplánuje.“

### 5.4 Kalendář `#kalendar` – mockup `kalendar.html`

* **Q** What's on, and when?
* **Desktop** Top bar: title, ‹ ›, month label (display-xs), „Dnes“ (T), segmented Měsíc · Týden · Seznam
  (1/2/3), „Přidej setkání“ (C, leader). Toolbar: chips „Jen moje“, „Druh“, „Tým“, „Zrušená“, legend.
  * **Měsíc**: Monday-first grid, weekend cells on `--surface-sunken`, today's number in a pink circle.
    Event chip = time + title. Sunday services are a soft filled chip (`--soft-hover`, 600). My duty = a 3 px
    pink rule. Missing people = amber dot, a problem = red dot. Cancelled = struck through and muted. More
    than 4 events → „+2 další“. Click on a free part of a day (leader) → Nové setkání for that day.
  * **Týden**: 7 columns of time (7.00–22.00 visible, scrolls), events as blocks with overlap lanes.
  * **Seznam**: agenda by day with the week strip (the phone default).
  * **Peek card** (not a drawer, because the Sunday column is on the right edge): 400 px popover anchored
    to the event and flipped away from the edge. It shows kind, title, Kdy / Kde / Řada / Pastva props, a
    **Tvoje služba** box (pink rule, status, Můžu / Nemůžu), team fill and status counts, the meeting's
    problems, and the footer buttons „Otevři setkání ↵“ and „Osnova“. Esc closes it, ←/→ move to the
    neighbouring event.
* **Phone** Title, search, +. Segmented Seznam · Měsíc. Week strip (today pink, dots for days with
  events, a darker dot for days with my duty), then the agenda: „Dnes“ always first (even when empty: „nic
  se neděje“), cards with time, title, place, fill. Tap → full Setkání page.
* **Data** `eventsInRange`, `fillRatio`, `S.eventSeverity`, `KIND_LABELS`/`KIND_ICONS`.
* **Empty** „Tenhle měsíc nic není.“ + „Přidej setkání“ (leader).

### 5.5 Setkání `#setkani/<id>` – mockup `setkani.html`

* **Q** Is this meeting ready, and who does what?
* **Desktop** Top bar: breadcrumb (Kalendář › title · date), ‹ › previous/next in the series, „Stejní lidé
  jako minule“, primary „Doplň volná místa“, ⋯ menu (Uprav · Duplikuj · Zruš setkání / Obnov setkání ·
  Stáhni do kalendáře · Smaž). Head: eyebrow kind, title (display-lg), **property chips** (each opens its
  own editor popover): Kdy, Kde, Řada („Každou neděli do 27. 12.“), Na Pastvě, Šablona (ghost). Tabs:
  **Tým** (fill) · **Osnova** (count · minutes) · **O setkání**.
* **Tým tab** Left: one block per team (h3 + fill), rows `role | slots`. A role row says „nutné“ for
  essential roles. A slot is a **person chip** (avatar, name, status glyph; mine has the pink avatar;
  declined is struck through and outlined) or an **open slot** („+ Obsaď“, dashed). Hover on a chip →
  hover card (contact, month load, Odeber, Vyměň, Odpověď › Může / Nemůže). Notes like „také stavění stanu
  – víme o tom“ show as an outline tag. Right rail (280): status summary (potvrzeno · čeká · nemůže ·
  volné), **Problémy** of this meeting (with actions), Osnova summary, team note.
* **The picker** (see 6.9) opens on an open slot, beside it on desktop, as a sheet on the phone.
* **Osnova tab** A run sheet table: computed start time · item (format name or own title) · minutes (inline
  number) · who leads (from the format's lead role, or picked by hand: „Vyber, kdo vede“) · a note. Rows
  reorder with a drag handle and with Alt+↑/↓ (and „Posuň nahoru/dolů“ in the row menu). Footer: total bar
  „112 ze 120 min“, which turns amber when over (K15), and „Přidej bod“ (format menu with search, showing
  each format's minutes). Click a row → panel with the format's Proč / Jak / Odkaz. Empty: „Osnova je
  prázdná.“ + „Přidej bod“ + „Vezmi osnovu ze šablony“.
* **O setkání tab** A form with inline edits: Název, Druh, Kdy (date, start, end), Místa (multi, map of the
  first place with an address in an OSM frame), Tým (group), Zveřejni na Pastvě (switch) + Text pro web
  (description) + Obrázek (later), Poznámka pro tým, Řada (summary, „Prodluž řadu“), Účast (adults /
  children, past meetings only). Editing a series event asks „Jen toto setkání“ / „Toto a všechna další“
  (`updateSeries`).
* **Phone** Back link, ⋯, eyebrow date, title, segmented tabs, team blocks as lists. Leaders get a sticky
  bottom bar „Doplň volná místa“ while the meeting has open slots.
* **Data** `eventById`, `needsOf`, `fillRatio`, `candidates`, `proposeRemaining`, `sameAsLastTime`,
  `previousEvent`, `programTimes`, `programDuration`, `itemLeaders`, `addFormat`, `moveItem`, `placesOf`,
  `seriesFor`, `seriesSummary`, `extendSeries`, `updateSeries`, `cancelEvent`, `deleteEvent`,
  `S.conflicts.filter(c => c.eventIds.includes(id))`.
* **Members** see the same page read-only, plus their own Můžu / Nemůžu box under the head.

**Nové setkání** (dialog 560 px; sheet on phone): Šablona (select, first option „Bez šablony“), Název
(prefilled from the template), Den, Začátek, Konec, Místa, Opakování (Neopakuje se · Každý týden · Každý
druhý týden · Každý měsíc), Do (date, live count „· 12 setkání“, `seriesCount`), Tým, Zveřejni na Pastvě.
Primary „Přidej setkání“ / „Přidej 12 setkání“. Data: `createFromType`, `addSeries`.

### 5.6 Plánování `#planovani` – mockup `planovani.html`

* **Q** What still needs fixing across meetings, and who carries too much?
* Top bar: title + view tabs **K řešení** (count) · **Rozpis** · **Vytížení**, period ‹ › label. Toolbar:
  chips Druh, Týmy (default: teams I lead), + Filtr. KPI chips on the right double as filters.
* **K řešení** (leader inbox, desktop: three columns; phone: stacked cards):
  * **Volná místa** (`openSlots`, 21 days): role, meeting, date, essential first → „Obsaď“ (picker).
  * **Čeká na odpověď** (`unconfirmedDuties`, 14 days, my teams): person, role, meeting, how soon →
    „Připomeň“ menu (Napiš SMS · Napiš e-mail · Zkopíruj zprávu; see 8.6) and „Odpověď › Může / Nemůže“.
  * **Problémy** (`S.conflicts`, upcoming, my teams): grouped by severity, the lib's sentence, the meeting and
    date → „Vyřeš“ (opens the meeting with the row highlighted) and, for errors, „Vím o tom“ (override dialog,
    see 6.10).
* **Rozpis** (the roster grid): meetings as columns (default: Sundays, two months), roles as rows grouped by
  team, one cell = one role slot. Column head: weekday, date (display-xs), fill meter. Cell: first names with
  status glyphs; „+ Obsaď“ when open (a compact „+“ when the cell holds people too); a declined person keeps
  only a red glyph if the slot is open again; problems are a 2 px underline (amber / red) and are explained
  in the cell's tooltip. Past columns are muted and read-only. My cells: bold name + pink dot. Sticky head
  and first column. Keyboard: arrows move, Enter opens the picker, Delete removes (undo), M / N record the
  person's answer, Ctrl C / Ctrl V copy a cell to another. A focused cell shows a tooltip with its action
  („Obsaď Klávesy · ne 11. 10. ↵“).
* **Vytížení** (`servingLoad(data, month)`): table with person, count / limit (bar; amber at the limit, red
  over it), Sundays in a row / limit, last duty, paused. Click → person panel at „Kolik může sloužit“.
  Month switcher.
* **Phone** K řešení only (mockup). Rozpis on the phone is one meeting at a time (swipe or ‹ › between
  columns, rows as a list). Vytížení is a simple list.
* **Empty** „Nic k řešení. Rozpis sedí.“; per section „Všechna místa jsou obsazená.“, „Všichni
  odpověděli.“, „Žádné problémy.“

### 5.7 Lidé `#lide` – mockup `lide.html`

* **Q** Who is who, how do I reach them, and what can they do?
* **Desktop** Top bar: title + total, „Zkopíruj e-maily“ (of the current view), primary „Přidej člověka“ (C).
  Row 1: view tabs **Všichni · Členové · Děti · Domácnosti · K doplnění · Archiv** (counts from
  `filterCounts`) + saved personal views. Row 2: search (/, matches name, nickname, phone, e-mail via
  `matchesText`), filter chips (Tým, Umí, Vztah, Věk, Domácnost), „+ Filtr“, „Ulož pohled“.
* **Table** columns: ☐ · Jméno (avatar, full name, nickname muted, tags „vede“, „pauza“) · Vztah · Týmy (or
  „Co umí (Chvály)“ when filtered to a team) · Telefon · E-mail · Věk · Naposledy (`lastDutyDays`) · Chybí (icon
  + tooltip from `MISSING_LABELS`). Sort by clicking a header (Czech collation `comparePeople`). Selecting
  rows shows a **bulk bar** in place of row 2: „3 vybraní · Přidej do týmu · Zkopíruj e-maily · Přesuň do
  archivu · Zruš výběr“.
* **Person panel** (docked 440 px on the right, the table reflows; ↑/↓ walks the rows while the panel
  follows; `#osoba/<id>` is the same content as a page): avatar 56 + name (display-md) + „člen od dubna 2016 ·
  42 let“; quick actions Zavolej (`tel:`), Napiš e-mail (`mailto:`), Služby (no gendered
  „Jeho/Její“); props with inline edit (Telefon, E-mail, Datum narození, Domácnost);
  household chips; **Co umí** (team · role tags, learning as outline „· učí se“; „Uprav“ opens a role
  checklist with three states umí / učí se / –); **Nejbližší služby**; **Kdy nemůže**; **Kolik může
  sloužit** (limits from `limitsOf`; edit opens fields Nejvýš za měsíc, Nejvýš nedělí po sobě, Pauza);
  Poznámka; Údaje (Vztah, Členem od, Souhlas se zpracováním údajů, V adresáři). Footer menu: Přesuň do
  archivu / Vrať z archivu, Smaž kartu (admin; confirm).
* **Domácnosti** view: cards per household (name, address, members adults first, children with age),
  „Přidej domácnost“.
* **K doplnění**: the table with the Chybí column first; „Doplň“ opens the panel at the first missing field.
* **Archiv**: archived cards, „Vrať z archivu“, overdue ones (> 1 year) flagged with „Smaž kartu“.
* **Members (Adresář)**: the same screen without views, bulk select, edit or the panel's private sections;
  only people with `showInDirectory`; columns Jméno, Týmy, Telefon, E-mail.
* **Phone** Search, view chips, alphabetical list with letter headers (display font), a row = avatar 40,
  name, teams or role line, call button. Tap → full-screen person page.
* **Data** `filterPeople`, `matchesFilter`, `filterCounts`, `groupsOf`, `skillsOf`, `householdMembers`,
  `peopleByHousehold`, `missingData`, `archive.js` operations, `upcomingDuties`, `limitsOf`.
* **Empty** Search: „Nikoho takového nenacházím. Zkus jiné slovo, nebo uber filtry.“ + „Vymaž filtry“.
  Archiv: „Archiv je prázdný.“

### 5.8 Týmy `#tymy`, Tým `#tym/<id>`

* **Q** Who serves in which team, and in what?
* **Týmy** sections Týmy (kind `team`), Skupinky (`community`), Vedení (`leadership`), Archivované
  (collapsed). Each row: team mark (initials square), name, description (1 line), leaders' avatars, members
  count, roles count, a warning „Málo lidí: Klávesy (2)“ for scarce roles (`skillMatrix(...).roles.scarce`).
* **Tým** head: name (display-lg), description (inline edit), leaders. Tabs:
  * **Lidé** members list: name, role tags with level, „vede“ switch (leader / admin), Odeber. „Přidej
    člena“ = person combobox.
  * **Role** (teams only): table of roles with Název, Kolik lidí, Nutná, Jen dospělí, Hlídá děti, Kdy slouží
    (window: from / to minutes relative to the start, e.g. „90–130 min po začátku“), Jde spojit s (roles),
    plus „Přidej roli“.
  * **Kdo co umí** (`skillMatrix`): people × roles. A cell cycles – / učí se / umí on click or Space.
    The header shows trained / learning counts, scarce roles get an amber head.
  * **Rozpis**: the Plánování grid filtered to this team.
* **Phone** List, team page with segmented tabs; Kdo co umí becomes a per-person list of role toggles.

### 5.9 Správa (admin)

**Šablony** `#sablony` (event types): table Název · Druh · Kdy (weekday + time, length) · Místa · Tým ·
Na Pastvě · Řady (count). **Šablona** `#sablona/<id>` page: head + tabs **Nastavení** (name, kind, start,
length, places, team, public + description), **Potřeby** (needs editor: role picker grouped by team ×
count stepper; roles brought by the osnova formats are listed read-only „z osnovy“), **Osnova** (the same
run sheet as a meeting, no people), **Řady** (`seriesOfType`: each series with `seriesSummary`, count,
„Prodluž řadu“ → date, „Ukaž setkání“). Primary action: „Vytvoř setkání“ (opens Nové setkání with the
template).

**Formáty** `#formaty`: table Název · Minut · Vede (role) · Přidává (needs) · Na Pastvě. Panel: Název,
Minut, Kdo vede (role select or „nikdo z rozpisu“), Přidává role (needs editor), Proč, Jak, Odkaz, Zveřejni
na Pastvě. K17 („role z formátu už neexistuje“) shows as a red field error here.

**Místa** `#mista`: tree (`placeTree`): buildings with rooms indented. Panel: Název, Patří do (building),
Adresa (rooms inherit, shown as placeholder), Poloha (lat/lon, „Najdi na mapě“ opens OSM), „Můžou tu být
dvě setkání naráz“ (= `shared`, K9 becomes info).

**Přístupy** `#pristupy`: table Člověk · Přístup (select správce / vedoucí / člen) · Od · Stav („pozvánka
– vyprší 19. 10.“, „pozvánka vypršela“, „karta smazaná“). Actions: „Pozvi“ (person combobox + level →
creates an invite through the same flow as `../next/`, shows the link and code to copy), „Pozvi znovu“,
„Nové heslo“ (shows `newPassword()` once), „Odeber přístup“ (confirm). Data: `loginList()`,
`updateLogins`, `createLogin`, `ACCESS_LABELS`.

**Nastavení** `#nastaveni`: sections Církev (name, address, main place), Pravidla plánování (Nejvýš služeb
za měsíc, Nejvýš nedělí po sobě, Kolik dní předem hlídat nutné role, … nepotvrzené, … ostatní volná místa,
Od kolika let je dospělý), Data (Stáhni zálohu, Obnov ze zálohy → `replaceAll`, demo: „Začni znovu
s ukázkou“), O aplikaci (version, link to the old app).

### 5.10 Můj účet `#ucet`

Sections: Ty (my card summary → „Otevři kartu“), Barvy (`paletteChoices()`), Přihlášení (live: name,
„Změň heslo“ → `changePassword`), Kalendář v mobilu („Stáhni služby (.ics)“), Klávesové zkratky (opens the
cheat sheet), „Odhlas se“ (`logout()`).

### 5.11 Pastva `#pastva` (public, also linked from the sidebar and sign-in)

A single public page from `publicData()`. Head: bullseye, church name, title „Pastva“, subtitle „Setkání, na
která můžeš přijít“. List of published events: date block, title, time, places (map link when they have
coordinates), description, „Zrušeno“ badge. Below: „Co u nás zažiješ“, the public formats with Proč / Jak.
Footer: „Přihlas se“ (members). No sidebar, max width 720, works signed out.

### 5.12 Global states

* **Booting / loading data** (live): sidebar renders at once, the sheet shows skeleton rows (3 cards on
  Přehled, 12 rows on tables) – never a blank page or a spinner over everything.
* **Saving** (from `S.sync` events): the save state under my name: „Uloženo“ (green dot), „Ukládám…“
  (pulsing dot), „Neuloženo – zkouším znovu“ (amber), „Jsi offline, uložím to, až se připojíš“
  (amber), „Uložit se nepodařilo“ (red, + „Zkus to znovu“). `beforeunload` warns when not saved.
* **Someone else saved** (`event.reloaded`): re-render in place, keep scroll, panel and selection, toast
  „Ostatní mezitím něco uložili. Už to tu máš.“

## 6. Interaction patterns

### 6.1 Navigation

* Sidebar for places, top bar for the current screen (title or breadcrumb, view switch, actions, max one
  primary button). Breadcrumbs only on detail pages (Setkání, Tým, Šablona, Osoba).
* Back/forward work everywhere: opening a panel or peek pushes `?osoba=`/`?setkani=`; Esc and Back close it.
* Each route renders from the top except panel changes, which keep the list scroll.

### 6.2 Command palette (Ctrl K / ⌘K, also „Hledej…“ in the sidebar, the phone's search icon)

640 px dialog, `--shadow-5`, top third of the screen; phone: full-screen sheet with the field on top.
Empty query: **Nedávné** (last 5 opened people / meetings) and **Přejdi na** (screens). Typing searches
across groups, each with max 5 results and a „Ukaž všechny“ row:

| Group | Matches | Enter does |
|---|---|---|
| Přejdi na | screen names and synonyms („rozpis“, „zkratky“, „barvy“) | navigate |
| Lidé | `matchesText` (name, nickname, phone, e-mail) | open person panel |
| Setkání | title + date words: „neděle“, „ne 18“, „18. 10.“, „příští neděle“, „zkouška“ | open peek / page |
| Týmy | name | open team |
| Akce | Přidej setkání · Přidej člověka · Přidej termín (Kdy nemůžu) · Změň barvy · Podívej se očima… · Odhlas se | run |

Right side of a row: kind hint (e.g. „člověk“, „ne 18. 10.“). ↑↓ moves, Enter runs, Ctrl Enter opens as a
full page, Esc closes. Diacritics-insensitive.

### 6.3 Keyboard shortcuts

Never fire while typing in a field (except Esc, Ctrl K, Ctrl Enter, Ctrl Z). „?“ opens the cheat sheet
(dialog „Klávesové zkratky“). Mac shows ⌘ for Ctrl.

| Keys | Action |
|---|---|
| Ctrl K | Hledání (command palette) |
| / | focus the search of the current list |
| G then P / M / K / R / L / T / U | Přehled / Moje služby / Kalendář / Plánování (Rozpis) / Lidé / Týmy / Můj účet |
| C | Přidej… in context (setkání in Kalendář and Plánování, člověka in Lidé, termín in Kdy nemůžu, bod in Osnova) |
| Esc | close the topmost layer (popover, then dialog, then panel); in a field: cancel the edit |
| J / K or ↓ / ↑ | next / previous row (lists, tables, K řešení) |
| Enter | open the focused row; on an open slot open the picker |
| X | select the row (tables) |
| M / N | Můžu / Nemůžu on a focused request (own) or record the answer (leader, focused person) |
| A | assign: open the picker on the focused slot |
| ← / → | previous / next period (Kalendář, Rozpis, Vytížení) or neighbour event in a peek |
| T | today |
| 1 / 2 / 3 | Měsíc / Týden / Seznam (Kalendář); tabs on detail pages |
| Alt ↑ / Alt ↓ | move an osnova item |
| Ctrl Z / Ctrl Shift Z | undo / redo the last change (same as the toast) |
| Ctrl Enter | save a dialog / sheet |
| [ | collapse / expand the sidebar |

### 6.4 Which layer for what

| Need | Layer | Desktop | Phone |
|---|---|---|---|
| Look at one record from a list, keep the list | **Panel** (docked, 440 px; table reflows) | Lidé, Formáty, Místa, Vytížení → person | full-screen page |
| Look at an event in a dense grid | **Peek card** (anchored popover 400 px, flips) | Kalendář | full page |
| Pick something for a slot / field | **Popover** (380 px, beside the anchor) | picker, date, place, role select | bottom sheet |
| Create or edit a small record | **Dialog** (480–560 px, centred) | Nové setkání, Přidej termín, Přidej člověka, Vím o tom | bottom sheet (≤ 92 % height) |
| Deep work on one thing | **Page** | Setkání, Tým, Šablona, Osoba (`#osoba`) | page |
| Feedback after an action | **Toast** (bottom-left, 6 s, max 1 visible + queue) | everywhere | above the tab bar |
| Explain a glyph / truncated text | **Tooltip** (after 500 ms, on focus too) | everywhere | long-press → tooltip as a toast |

Layers stack at most two deep (e.g. panel + popover). A dialog opened from a panel closes nothing.

### 6.5 Inline editing

Fields of panels, meeting props, osnova minutes, team descriptions and role table cells are **text until
hovered** (hover background `--hover`, a pencil icon at the end on focus). Click or Enter turns the field
into an input with its current value selected. Enter or blur saves (`change(note)`), Esc restores. Invalid
input stays in edit mode with a red message under it (`--danger-fg`), focus stays. Multi-value fields
(places, needs, skills) open a popover checklist. Saved fields flash nothing; the save state in the
sidebar is the only feedback (plus toast for destructive or multi-record edits).

### 6.6 Tables (Lidé, Vytížení, Šablony, Formáty, Přístupy, role tables)

* Header 32 px (12 px / 600 / `--text-3`), sticky; rows 36 px (compact 32 via „Hustota“ later); hairline
  separators, no zebra.
* Sort: click a header (asc → desc → default), the arrow shows on the sorted column only.
* Filter **chips**: „+ Filtr“ opens a menu of fields → a value menu (multi-select with search). An active
  chip shows „Pole Hodnota ×“. Built-in views are tabs; „Ulož pohled“ stores the chips + sort + columns as
  a personal view in localStorage (per viewer; shared views later).
* Selection: checkbox column (visible on hover or when something is selected), X key, Shift-click ranges.
  A bulk bar replaces the filter row.
* The current row (open in the panel) has `--soft` background and a 2 px pink inset rule on the left.
* Loading: 12 skeleton rows. Empty: the empty state inside the table body, the header stays.

### 6.7 Forms

Labels above fields (13 / 600 / `--text-2`), optional fields say „(nepovinné)“ in the label, help text
under the field (12 px). One column on dialogs and sheets; two short fields may share a row (Od / Do).
Primary button bottom-right on desktop dialogs („Ulož“, or the specific verb „Přidej setkání“), secondary
„Zpět“ to its left; on phones the primary is full width at the bottom of the sheet. Validation on blur and
on submit, never on every keystroke. Disabled primary only when nothing changed; otherwise submit and show
errors.

### 6.8 Changes, undo and confirmation

Every mutation goes through one helper: snapshot the touched records (`structuredClone`), mutate `S.data`,
`change(note)`, push an undo entry, and show a toast with „Vrať zpět“ (Ctrl Z) for 6 s. Undo restores the
snapshots and calls `change('vráceno: …')`. The undo stack keeps the last 20 entries for Ctrl Z.

Confirm (dialog with the consequence spelled out, red primary, „Zpět“ secondary) only for: Smaž kartu,
Smaž setkání / řadu, Zruš setkání with people in the roster („14 lidí z rozpisu to uvidí jako zrušené.“),
Odeber přístup, Obnov ze zálohy. Everything else is optimistic + undo.

### 6.9 The assignment picker (core component, owned by the Meetings package)

* **Opens** on an open slot (click, Enter, A), on „Vyměň“ of a person chip, from „Obsaď“ in K řešení and in
  Rozpis. Desktop: popover 380 px beside the slot, flipped and shifted to stay inside the sheet. Phone:
  bottom sheet.
* **Head**: role + meeting date and time; search field (focused); segmented **Umí to · Celý tým ·
  Všichni** with counts (`SCOPES` skilled / team / all), Tab cycles it.
* **List** from `candidates(data, eventId, roleId, { scope })`, split into **Můžou** (no `error` reason)
  and **Nejde to** (has an error), each row: avatar 32, full name, a sub line with level („umí“ / tag
  „učí se“), age for children, „v říjnu 2×“, „naposledy 20. 9.“, and the reasons as small words with an
  icon (warning amber, error red). The first row of Můžou is active. Rows in Nejde to stay selectable
  (a leader may know better), but assigning one of them opens the „Vím o tom“ dialog first.
* **Smart repair**: if the reason is K2 („má Bicí“) at the same meeting, the row offers **„Přesuň sem“**,
  which moves that person here and opens their old slot (one undo).
* **Tip** at the bottom when Můžou has no trained person: „Nikdo zkušený nemá čas. Zkus Celý tým.“
* **Footer**: „Nový člověk“ (quick card: first name, optional last name → `needsReview: true`, lands in
  K doplnění), key hints.
* **Assign** = new assignment `{ id: newId('a'), roleId, personId, status: 'proposed' }`, toast
  „Přiřazeno: Šimon Pokorný – Klávesy, ne 11. 10.“ + undo. A leader assigning themself may pick „potvrzeno“
  directly (checkbox in the footer „Rovnou potvrzeno“).

### 6.10 Problems (conflicts K1–K17)

* Source: `S.conflicts` (recomputed on every change) and `S.eventSeverity`. Text: the lib's Czech
  sentences, unchanged. Titles from `CODES` are used only as group headers in K řešení.
* Severity → presentation: **error** red icon `--danger-fg` / red underline / red dot; **warning** amber
  icon `--waiting-fg` / amber underline / amber dot; **info** `--text-3` icon, no dot. Never a red or pink
  background area – callouts use a 3 px left rule on the panel surface.
* Where: the meeting rail (that meeting), K řešení (all), Rozpis cells (underline + tooltip), calendar dots,
  Přehled team card (the most urgent one), the picker (as reasons).
* **Vím o tom** (errors on assignments only): dialog „Výjimka z pravidla“ with the conflict text and a
  required field „Proč je to v pořádku?“ → `assignment.override = { reason }`; the conflict becomes info and
  shows „Vím o tom: …“. „Zruš výjimku“ in the row menu removes it.

### 6.11 Answering (Můžu / Nemůžu)

One click sets `status` to `confirmed` / `declined`, toast with undo. A declined duty stays visible to me
(struck through, „Nemůžeš“), and leaders see the slot as open again. „Změň odpověď“ is in the row menu
until the meeting starts. Members never see a confirmation dialog. When a blockout covers the date, Nemůžu
is primary and the reason is shown (5.3).

### 6.12 Empty, loading, error states

* Empty state = outlined bullseye rings (48 px, `--line-2`), one bold line, one sentence, at most one
  button. Kind tone, no exclamation marks, no stock illustrations.
* Skeletons: `--soft` blocks in the shape of the content, a slow 1.6 s shimmer (off with reduced motion).
* Errors in place: a field error under the field; a failed load of a section shows a callout with „Zkus to
  znovu“. Only sync failures are global (save state + toast).

### 6.13 Mobile adaptations (< 768)

* Tab bar (4.1) instead of the sidebar; the top bar is 52 px with a display title (26 px), max two icon
  buttons (search, + or ⋯) and my avatar on Přehled.
* Panels and peeks become full pages; popovers and dialogs become bottom sheets (grab handle, scrim,
  swipe-down or ✕ to close, primary button full width at the bottom, the keyboard pushes the sheet up).
* Touch targets ≥ 44 px, list rows ≥ 56 px, body text 15 / 22, inputs 16 px (no iOS zoom).
* Tables become lists (row = the two most important columns + a chevron); Rozpis becomes one meeting at a
  time; Kalendář defaults to Seznam.
* No hover-only actions: everything in a hover card is also in the row's ⋯ menu or the detail page.

### 6.14 Accessibility

Real `<button>`/`<a>`; one `<h1>` per screen (the top bar title or the page title). Landmarks: `nav`
(sidebar / tab bar), `main` (sheet), `aside` (panel, rail). Custom widgets follow ARIA patterns: tabs
(`tablist`), segmented (`radiogroup`), menus (`menu`/`menuitem`), picker and palette (`combobox` +
`listbox`, `aria-activedescendant`), grids (`grid` with roving tabindex for Rozpis and Kdo co umí),
dialogs (`dialog` + focus trap + return focus), toasts (`role="status"`, the undo button reachable with
Tab and Ctrl Z). Status glyphs carry `role="img"` + `aria-label`. Text contrast stays on palette tokens
(≥ 4.5 : 1); pink is never the only carrier of meaning (it is always paired with text or position).
`prefers-reduced-motion` turns movement into fades.

## 7. Design system

All values below exist in `mockups/mock.css` (section 1) with these names. The app's CSS defines them on
`:root` once (`css/tokens.css` of v3 – a new file, not the old one), components only use the tokens.

### 7.1 Colour

Colours come **only** from `../css/palettes.css`. v3 adds *role* tokens that point at palette tokens; it
never writes a colour value.

| Role | Token(s) | Use |
|---|---|---|
| App chrome (sidebar, tab bar, sign-in ground) | `--surface-chrome` | the „table“ |
| Sheet (main content) | `--surface-app` | the „paper“, raised with `--shadow-2`, radius 12 |
| Cards, buttons, chips on a sheet | `--surface-panel` (`--card-bg`) | with `--shadow-2` (it includes the hairline ring) |
| Popovers, panels, dialogs, sheets | `--surface-overlay` (`--float-bg`) | with `--shadow-4` / `--shadow-5` |
| Hover / pressed / quiet fills | `--hover`, `--pressed`, `--soft`, `--soft-hover`, `--surface-hover`, `--surface-sunken` | rows, chips, segmented, weekend cells |
| Text | `--text-1` (primary), `--text-2` (secondary, labels), `--text-3` (meta, placeholders, disabled) | |
| Lines | `--line-1` (separators), `--line-2` (outlines), `--line-control` (checkbox), `--line-field`, `--line-strong` (open slot dashes) | |
| Fields | `--field-bg` + `--shadow-1` | inputs, the sidebar search |
| Primary action | `--primary-bg`, `--primary-bg-hover`, `--primary-fg` | one per view |
| Tab / focus | `--indicator` (`--tab-indicator`), `--focus` | 2 px tab underline, 2 px focus outline |
| Status: confirmed | `--confirmed-solid` (glyph fill), `--confirmed-fg` (text), `--confirmed-bg` (badge) | |
| Status: waiting | `--waiting-solid` (bars, dots, rules), `--waiting-fg` (text, glyph stroke, icons), `--waiting-bg` (badge) | |
| Status: declined / error | `--declined-solid` / `--danger-solid` (glyph fill, underline, dot, rule), `--declined-fg` / `--danger-fg` (text, icons), `--text-on-danger` | **no red background areas** |
| Danger button | `--danger-solid`, `--danger-solid-hover`, `--text-on-danger` | |
| Toast, tooltips on dark | `--gray-12` bg, `--gray-1` text (`--toast-bg`, `--toast-fg`) | inverted surface |
| Scrim | `--scrim` | behind dialogs and sheets |
| Avatars | `--avatar-bg` + `--text-2`; mine: `--accent` + `--on-accent` | no coloured avatars |
| **The one pink** | `--accent: var(--rose-9)`, `--on-accent: var(--rose-contrast)` | see below |
| Logo | `--logo-pink: var(--rose-9)`, `--logo-ink: var(--gray-12)` (dark grounds: `var(--gray-1)`) | the bullseye only |

**The one pink.** The brand's pink `#e6acac` is `--rose-9` in every palette block (device modes too). In
v3 it is the token `--accent`, always **solid**, and it always means *you, here, now*:

* the current sidebar item and the current tab (pill), my avatar, my duty's rule / dot (calendar, Rozpis,
  Přehled), today (calendar circle, week strip), the selected range ends in the date picker, the „dnes“
  badge, the „Tvoje služba“ box rule, the selected table row's 2 px rule, the logo.
* **Never**: as text colour, at reduced opacity, as a tint, for buttons, links, hover, status or
  decoration. At most three pink things in view at once (the nav item counts).
* Don't use these palette tokens (they are tints of the pink, or read as other pinks on cream):
  `--selected-bg`, `--selected-bg-hover`, `--selected-line`, `--today-bg`, `--info-*`, `--text-accent`,
  `--accent-solid`, `--accent-badge-fg`, `--hero-bg`, `--hero-line`, `--rose-1…8`, `--rose-10…12`,
  `--rose-a*`, `--rose-avatar-*`. Also no red tints (`--declined-bg`, `--danger-bg`): on cream they read as
  pink. Red is solid or text.
* Pink on light grounds has low contrast (1.6–1.9 : 1): it is a fill under clay text (6.6 : 1) or it
  repeats something said in text. It is never the only signal.
* Per-palette overrides (all token references, in v3's CSS):
  `[data-palette="pink-clay"]` – the chrome itself is pink, so `--nav-current-bg: var(--surface-app)`,
  `--nav-current-fg: var(--text-1)`. `[data-palette="cream-blue"], [data-palette="blue-cream"]` – no pink
  in the pair: `--accent: var(--primary-bg)`, `--on-accent: var(--primary-fg)`.
  `[data-palette="clay-pink"], [data-palette="blue-cream"]` and the dark device block: `--logo-ink:
  var(--gray-1)`.
* In Hlína a růžová the palette's own ink is the pink, so primary buttons are pink there. That is the
  palette speaking (`--primary-bg`), not a v3 use of `--accent`.

**Forbidden hues**: `--plum-*`, `--teal-*`, `--blue-*` (in clay palettes), any raw colour, any colour
outside palettes.css. Event kinds and teams are **not** colour-coded (icons and initials instead).

**Dark mode** is a palette (Hlína a růžová; Modrá a krém), chosen by `ui/palette.js` (`data-palette`,
`data-theme`), or the device decides. v3 writes no `prefers-color-scheme` rules except the
`--logo-ink` override for the device-dark block.

### 7.2 Type

```css
@font-face { font-family: "Agrandir Narrow Black"; src: url("../../assets/fonts/Agrandir-NarrowBlack.woff") format("woff"); font-weight: 900; font-display: swap; }
@font-face { font-family: "Agrandir Grand Heavy"; src: url("../../assets/fonts/Agrandir-GrandHeavy.woff") format("woff"); font-weight: 800; font-display: swap; }
/* Schibsted Grotesk comes in two subsets – both are needed for Czech (á í é ú ý are in latin, ě š č ř ž ů ť ď ň in latin-ext) */
@font-face { font-family: "Schibsted Grotesk"; src: url("../../assets/fonts/schibsted-grotesk-latin-wght-normal.woff2") format("woff2"); font-weight: 400 900; font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Schibsted Grotesk"; src: url("../../assets/fonts/schibsted-grotesk-latin-ext-wght-normal.woff2") format("woff2"); font-weight: 400 900; font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
```

Paths are from `docs/zvonec/v3/css/`. The brand fonts have no ⌘ ⇧ ⌥ → (use SVG icons for arrows,
`--font-keys` for key symbols).

| Token | Size / line | Face, weight | Use |
|---|---|---|---|
| `--display-xl` | 44 / 44 | Agrandir Narrow Black | sign-in, Pastva title |
| `--display-lg` | 32 / 36 | 〃 | page titles with a hero (Přehled hero, Setkání, Tým, Šablona) |
| `--display-md` | 24 / 28 | 〃 | panel titles (person), phone hero |
| (top bar title) | 22 / 26 | 〃 | the title in the desktop top bar; phone top bar 26 / 30 |
| `--display-sm` | 20 / 24 | 〃 | peek and sheet titles, summary numbers |
| `--display-xs` | 17 / 20 | 〃 | date numerals (Rozpis heads, week strip, letter headers), month label |
| date block numeral | 22 / 24 | 〃 | the date block |
| `--ui-xl` | 18 / 26 | Schibsted 400 | lead paragraphs (Pastva) |
| `--ui-lg` | 16 / 24 | 400 | hero line, phone inputs |
| `--ui-base` | 14 / 20 | 400; 500 nav and buttons; 600 titles in cards and rows | default UI text |
| `--ui-md` | 13 / 18 | 400 / 500 | secondary text, table cells, chips, meta |
| `--ui-sm` | 12 / 16 | 500 / 600 | badges, table heads, eyebrows, cell text in Rozpis |
| `--ui-xs` | 11 / 14 | 600–700 | section labels (uppercase, +0.04em), kbd, tab bar labels |

Rules: display face only for titles, names on panels and numerals, never for running text or buttons,
never letter-spaced, sentence case (no uppercase in the display face). Uppercase only for `--ui-xs` labels
(team headers, section labels, weekdays in date blocks). Body weights 400 / 500 / 600 / 700 only.
Proportional figures by default; times stay proportional („9.30“). Tabular figures only in counts that
line up (`.num`, fill meters, the date picker).

### 7.3 Space, size, radius, elevation, motion

```css
:root {
  --space-0-5: 2px; --space-1: 4px; --space-1-5: 6px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px;
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px; --radius-full: 999px;
  --control-sm: 28px; --control-md: 32px; --control-lg: 40px; --control-touch: 44px;
  --row-compact: 32px; --row: 36px; --row-comfy: 44px;
  --sidebar-w: 232px; --topbar-h: 52px; --drawer-w: 440px; --popover-w: 380px; --palette-w: 640px;
  --tabbar-h: 64px; --content-max: 1080px;
  --ease-out: cubic-bezier(.2, .8, .2, 1); --ease-in-out: cubic-bezier(.4, 0, .2, 1);
  --dur-1: 120ms; --dur-2: 180ms; --dur-3: 260ms;
}
```

* **Grid**: 4 px. Page padding 32 (desktop) / 16 (phone). Card padding 20 / 16. Gaps between cards 24.
  Top bar padding 24 left, 16 right.
* **Radii**: 4 kbd, checkbox · 6 tags, small buttons · 8 buttons, fields, nav items, chips in segmented ·
  10 date blocks, stats, touch buttons · 12 cards, sheet, popovers, panels, dialogs · 16 phone sheets · full
  for chips, badges, avatars, pills.
* **Elevation** (palette shadows include the hairline ring, so cards need no border): `--shadow-1` inset –
  fields · `--shadow-2` – cards, the sheet, raised buttons, pressed chips, person chips · `--shadow-3` –
  menus, tooltips, hover cards · `--shadow-4` – popovers, peek, floating panels, toasts · `--shadow-5` –
  dialogs, command palette, phone sheets.
* **Z-index**: sticky 10 · sidebar 20 · popover 40 · panel 50 · dialog / sheet 60 · toast 70 · palette 80 ·
  tooltip 90.
* **Motion**: hover 120 ms; popover / menu fade + scale .98 → 1 in 180 ms `--ease-out`; panel slides 16 px +
  fade 260 ms; sheet slides up 260 ms; toast rises 8 px 180 ms; the new chip in a slot fades in 180 ms.
  Nothing bounces. `prefers-reduced-motion: reduce` → opacity only, 120 ms.
* **Breakpoints**: phone < 768 (tab bar, sheets, one column) · tablet 768–1023 (56 px icon rail, panels
  overlay, Přehled one column) · desktop ≥ 1024 (full sidebar, docked panels) · wide ≥ 1440 (content max
  1080 centred, Rozpis shows more columns).
* **Density**: desktop rows 36, list rows 44, controls 32; phone rows ≥ 56, controls 44.

### 7.4 Icons

Inline SVG built with `h()` via `document.createElementNS` (no `innerHTML`): 24 × 24 viewBox, `fill:
none`, `stroke: currentColor`, `stroke-width: 1.75` (2 at 14 px, 3 inside status glyphs), round caps and
joins. Sizes 14 / 16 / 18 (default) / 22 (phone). One `ui/icons.js` map of path strings → `icon(name)`.
The set used in the mockups (the `i-…` symbols in each mockup's sprite): home, duty (check in circle), calendar, plan
(grid), people, teams (three circles), template, format, place, key, settings (sliders), search, plus,
down/right/left, x, more, external, expand, globe, clock, repeat, sun (service), music (rehearsal), group
(small group), star (event), check, warn, error, info, phone, mail, copy, filter, sort, eye, download,
pencil, userplus, calx (blockout), sparkle (Doplň), undo, cake, menu, back, bell (Připomeň), swap,
grip, list, columns, bookmark. Event kinds map to sun / music / group / star (`KIND_ICONS` keys sun,
music, home, star – v3 draws „home“ as the group icon).

### 7.5 Focus

`:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }` everywhere (fields: offset 1px;
grid cells: inset −2px). Never remove it, never replace it with colour only. In lists with roving focus
the focused row also gets `--soft-hover`.

### 7.6 Component inventory

States every interactive component has: default, hover, focus-visible, active/pressed, disabled
(`--text-3`, no shadow, `cursor: not-allowed`), loading where async. Classes as in `mock.css`.

| Component | Variants / parts | States and notes |
|---|---|---|
| **Button** `.btn` | default (panel + `--shadow-2`), `.btn-primary`, `.btn-ghost`, `.btn-danger`; sizes `.btn-sm` 28, md 32, `.btn-lg` 40, `.btn-touch` 44; `.btn-icon` square; optional icon (16) and `.kbd` hint | hover: surface-hover / primary-bg-hover; pressed: `--pressed`; loading: spinner replaces the icon, label stays; max one primary per view |
| **Icon button** | ghost square 28/32, phone 44 round | needs `aria-label` (imperative: „Zavři“, „Další akce“) |
| **Text field** `.field` | text, search (icon + kbd), number with stepper, textarea, `.field-touch` | focus outline; error: message under, `aria-invalid`; placeholder `--text-3` |
| **Select / menu** | button + popover menu with `--shadow-3`, items 32 px, icons, shortcuts on the right, separators, a checked mark | type-ahead, ↑↓, Enter, Esc |
| **Combobox** | person / role / place / format search lists | as the picker: field + listbox, `aria-activedescendant` |
| **Segmented** `.segmented` | 2–4 options, counts `.n` | selected: panel + `--shadow-2`; arrow keys |
| **Tabs** `.tabs` | underline tabs with counts | selected: text-1 600 + 2 px `--indicator` bar |
| **View tabs** `.views` | pill tabs in toolbars | selected: `--soft-hover`, 600 |
| **Chip** `.chip` | filter („Pole Hodnota ▾ / ×“), toggle (`aria-pressed`), `.chip-add` dashed-ish outline | pressed: panel + shadow |
| **Tag** `.tag` | neutral (role, „vede“), `.tag-outline` (learning, „pauza“, „Ukázka“) | static |
| **Badge** `.badge` | `-ok`, `-wait`, `-no` (neutral bg, red text), `-open`, `-me` (pink), `-neutral` | always with a word |
| **Status glyph** `.st` | `-ok` filled green + check, `-wait` ring + half disc, `-no` filled red + cross, `-open` dashed ring + plus | `role="img"` + Czech `aria-label` |
| **Avatar** `.av` | 20 / 24 / 32 / 40 / 56; `.av-me` pink; deleted person: dashed ring + „?“; `.stack` overlapping (ring in the card colour) | initials of the full name |
| **Person chip** `.person` | in slots: avatar 20, name, glyph; `.declined` struck + outline | hover card; drag later |
| **Open slot** `.open-slot` | dashed outline + „Obsaď“ | focus opens nothing until Enter |
| **Candidate row** `.cand` | avatar, name, sub line with reasons, right action | `.active` (soft-hover), `.blocked` (name text-2) |
| **Roster cell** | names + glyphs, `.gap-cell` (full / compact), underline `.warn` / `.err`, `.past`, `.na`, `.focus-cell` | grid keyboard model, tooltip |
| **Date block** `.date` | weekday + numeral; `.date-today` pink | |
| **Fill meter** `.fill` | 28 × 4 bar + „14 z 15“; full = green, gap = amber | |
| **Callout** `.callout` | warning (amber rule), `-error` (red rule), info (no rule, `--soft`) | panel surface + 3 px rule, never a tinted area |
| **Problem item** `.problem` | icon by severity, sentence, „where“, actions | |
| **Card** `.card` | head (title, count, link), body | no border, `--shadow-2` |
| **List row** `.row`, `.ask`, `.duty`, `.prow` | 44 / 56 px | hover `--hover`; whole row clickable when it has one target |
| **Table** `.table` | sticky head, sortable, checkbox, `.current`, bulk bar | see 6.6 |
| **Panel** `.panel` / `.drawer` | head (breadcrumb, expand, ⋯, ✕), body sections `.block`, optional foot | docked (reflow) or floating (`--shadow-4`) |
| **Peek / popover** `.popover` | anchored, flips | Esc, click outside, focus returns to the anchor |
| **Dialog** | 480 / 560, title (display-sm), body, foot (Zpět · primary) | focus trap, Ctrl Enter submits |
| **Sheet** `.sheet-up` | grab handle, head (display-sm + ✕), body, full-width primary | swipe down, scrim tap closes when nothing changed |
| **Toast** `.toast` | success (+ Vrať zpět), error (+ Zkus to znovu), info | 6 s, pauses on hover / focus |
| **Tooltip** | `--toast-bg`, 12 / 600, max 280 px | 500 ms delay, also on focus |
| **Command palette** | field, grouped results, footer hints | 6.2 |
| **Date picker** `.dp` | single, range (pink ends, `--soft-hover` band), month header, today underlined in pink | arrows move days, PageUp/Down months |
| **Time input** | „10.00“ field with a 15-min list popover | accepts 10, 10:00, 10.00, 1000 |
| **Switch, checkbox, radio** | `.check` 16 px, checked = primary fill + check | labels clickable |
| **Empty state** `.empty` | rings, title, text, one button | |
| **Skeleton** | blocks on `--soft` | shimmer, reduced motion = static |
| **Save state** `.save-state` | dot + word | see 5.12 |
| **Kbd** `.kbd` | | shown in buttons, menus, tooltips; hidden on touch devices |

## 8. Czech UI copy

### 8.1 Voice

* One kind voice, **tykání**. Actions are imperative 2nd person singular („Přidej setkání“, „Obsaď“,
  „Ulož“, „Přihlas se“). Titles of pages, sections and dialogs are nouns („Přihlášení“, „Nové setkání“,
  „Kdy nemůžu“ is the feature's own name and stays).
* **No gendered forms**: there is no gender in the data. Never write past tense about the reader or other
  people („odpověděl(a)“), never decline names (no vocative „Martino“, no dative „Danielovi“). Use present
  tense, nouns or „Jméno: …“: „Martina: nemůže“, „Přiřazeno: Šimon Pokorný – Klávesy“, „tvoje odpověď:
  nemůžu“.
* Short, concrete, warm. One sentence per message; say what happened and what to do. A bit of the
  church's humour is welcome where the lib already does it („I kráva potřebuje volnou neděli na pastvě.“),
  not in errors.
* No „Opravdu…?“, no „Úspěšně“, no exclamation marks except greetings.
* Check new texts with the `kontrola-cestiny` skill.

### 8.2 Typography in texts

Dates „ne 11. 10.“ (lists), „neděle 11. října“ (headings), „Neděle 11. října, 10.00–12.00“ (properties);
relative words within 7 days: „dnes“, „zítra“, „v pátek“. Times with a period, no leading zero: „9.30“.
Ranges with an en dash without spaces: „10.00–12.00“, „24. 10.–1. 11.“. Non-breaking space after the day
and month number (`11.&nbsp;10.`), after one-letter prepositions (v, k, s, z, u, o, a, i). Quotes „…“.
Counts „14 z 15“, „2×“. Plurals: 1 služba · 2–4 služby · 5 služeb; 1 volné místo · 2–4 volná místa · 5
volných míst; 1 člověk · 2–4 lidé · 5 lidí; 1 chyba · 2 chyby · 5 chyb; 1 bod · 2 body · 5 bodů; „min“ for
minutes.

### 8.3 Navigation and titles

Přehled · Moje služby · Kalendář · Plánování · Lidé · Týmy · Moje týmy · Správa · Šablony · Formáty ·
Místa · Přístupy · Nastavení · Pastva · Můj účet · Hledej… · Barvy · Ukázka · Pohled správce / vedoucího /
člena · Podívej se očima… · phone tabs: Přehled · Moje · Kalendář · Lidé / Plán · Více.

Views and tabs: Nadcházející · Proběhlé · Kdy nemůžu · Měsíc · Týden · Seznam · Tým · Osnova · O setkání ·
K řešení · Rozpis · Vytížení · Všichni · Členové · Děti · Domácnosti · K doplnění · Archiv · Lidé · Role ·
Kdo co umí · Nastavení · Potřeby · Řady.

Section titles: Čeká na tvou odpověď · Potvrzené · Tento týden v církvi · Tvůj tým Chvály · Narozeniny
tento týden · Tvoje týmy · Volná místa · Čeká na odpověď · Problémy · Chyby · Upozornění · Co umí ·
Nejbližší služby · Kolik může sloužit · Poznámka · Údaje · Kontakt · Domácnost.

Dialog titles: Nové setkání · Úprava řady · Zrušení setkání · Smazání setkání · Nový termín · Výjimka
z pravidla · Nový člověk · Smazání karty · Nová pozvánka · Klávesové zkratky · Hledání.

### 8.4 Actions

| Context | Labels |
|---|---|
| Answering | Můžu · Nemůžu · Změň odpověď · Odpověď › Může / Nemůže (leader for someone) |
| Slots | Obsaď · Přiřaď · Přesuň sem · Vyměň · Odeber z rozpisu · Doplň volná místa · Stejní lidé jako minule · Nový člověk |
| Problems | Vyřeš · Vím o tom · Zruš výjimku · Připomeň (Napiš SMS · Napiš e-mail · Zkopíruj zprávu) |
| Meetings | Přidej setkání · Otevři setkání · Uprav · Duplikuj · Zruš setkání · Obnov setkání · Smaž setkání · Prodluž řadu · Zveřejni na Pastvě · Stáhni z Pastvy · Stáhni do kalendáře · Jen toto setkání · Toto a všechna další |
| Osnova | Přidej bod · Posuň nahoru · Posuň dolů · Odeber bod · Vyber, kdo vede · Vezmi osnovu ze šablony |
| Kdy nemůžu | Dej vědět, kdy nemůžeš · Přidej termín · Uprav termín · Smaž termín · Odpověz u nich rovnou Nemůžu |
| People | Přidej člověka · Zavolej · Napiš e-mail · Zkopíruj e-maily · Doplň · Přidej do týmu · Přidej do domácnosti · Přesuň do archivu · Vrať z archivu · Smaž kartu · Ulož pohled · Vymaž filtry · Zruš výběr |
| Teams | Přidej tým · Přidej člena · Přidej roli · Odeber z týmu · „Vede tým“ (switch) |
| Admin | Přidej šablonu · Vytvoř setkání · Přidej formát · Přidej místo · Najdi na mapě · Pozvi · Pozvi znovu · Nové heslo · Odeber přístup · Stáhni zálohu · Obnov ze zálohy · Začni znovu s ukázkou |
| General | Ulož · Zpět (dismiss a dialog) · Zavři · Hledej · Vrať zpět · Zkus to znovu · Ukaž všechny · Přihlas se · Odhlas se · Změň heslo · Pamatuj si mě na tomhle zařízení · Podívej se, co chystáme |

### 8.5 Statuses and labels

* Assignment: **čeká na odpověď** (proposed) · **potvrzeno** (confirmed) · **nemůže** / mine **nemůžu**
  (declined) · **volné místo** (open). v3 keeps its own label map (`ui/copy.js`); it says „čeká na
  odpověď“ where `state.js` says „čeká na potvrzení“.
* Meeting: zrušeno · na Pastvě · nutné (essential role) · „14 z 15“.
* Person: člen · přítel · host · v archivu · má pauzu · vede · karta k doplnění. Skills: umí · učí se.
* Access: správce · vedoucí · člen · pozvánka · pozvánka vypršela.
* Save: Uloženo · Ukládám… · Neuloženo – zkouším znovu · Jsi offline, uložím to, až se připojíš · Uložit
  se nepodařilo.

### 8.6 Messages

* Toasts: „Potvrzeno: Zkouška chval, čt 5. 11.“ · „Zapsáno: nemůžeš v neděli 25. 10. Vedoucí to uvidí.“ ·
  „Přiřazeno: Šimon Pokorný – Klávesy, ne 11. 10.“ · „Odebráno z rozpisu: Anna Růžičková – Kafe.“ ·
  „Setkání je zrušené.“ · „Přidáno 12 setkání.“ · „Ostatní mezitím něco uložili. Už to tu máš.“ · every one with
  „Vrať zpět“ when it can be undone.
* Reminder text (Připomeň, copied / prefilled, no name, tykání): „Ahoj, v neděli 11. 10. máš v rozpisu
  Klávesy (Setkání na pastvě, 10.00). Můžeš? Odpověz prosím ve Zvonci: <odkaz>“
* Confirmations: „Zrušení setkání – 14 lidí z rozpisu to uvidí jako zrušené. Zrušit můžeš i všechna další
  setkání řady.“ buttons „Zruš setkání“ / „Zpět“. „Smazání karty – Karta zmizí, v proběhlých rozpisech
  zůstane jen jméno. Tohle nejde vrátit.“ buttons „Smaž kartu“ / „Zpět“.
* Empty states: see section 5 (each screen). General pattern: what's empty + what to do.
* Errors: „Tohle jméno a heslo nesedí. Zkus to znovu, nebo napiš správci.“ · „Datum Do je dřív než Od.“ ·
  „Tahle stránka tu není.“ · „Sem se dostane jen správce.“ · „Nepodařilo se načíst data. Zkus to znovu.“

## 9. MVP cut and work split

### 9.1 Build 1 – the core flows must work end to end

| # | Screen / feature | Route | Scope in build 1 |
|---|---|---|---|
| 1 | Shell | – | sidebar, top bar, phone tab bar + Více sheet, routing with `?` params, palette picker, save state, toasts + undo stack, dialogs / sheets / popovers / panels, tooltips, Ctrl K palette (Přejdi na, Lidé, Setkání, basic Akce), shortcuts Ctrl K, /, G-chords, C, Esc, J/K, Enter, Ctrl Z |
| 2 | Přihlášení + boot + demo view-as | `#prihlaseni` | as BRIEF boot flow; remember me; demo switch with 3 viewers + „Někoho jiného…“ |
| 3 | Přehled | `#prehled` | hero, answers, this week, team card (leader), problems card (admin), Kdy nemůžu card |
| 4 | Moje služby | `#moje`, `#moje/probehle`, `#moje/nemuzu` | answering + undo, confirmed, past, Kdy nemůžu CRUD with the range picker and „Odpověz rovnou Nemůžu“, .ics download |
| 5 | Kalendář | `#kalendar/mesic/…`, `#kalendar/seznam/…` | Měsíc + Seznam, filters Jen moje / Druh / Zrušená, peek card, click a day → Nové setkání |
| 6 | Setkání + Nové setkání | `#setkani/<id>/…`, `#setkani/nove` | Tým (picker, assign, remove, swap, Přesuň sem, Doplň volná místa, Stejní lidé jako minule, answers for others, problems rail, Vím o tom); Osnova (add from formats, minutes, reorder by buttons / Alt+↑↓, leader override, totals); O setkání (all fields, publish, cancel / restore, delete, series edit choice, Prodluž řadu); create with series |
| 7 | Plánování | `#planovani/k-reseni`, `/rozpis`, `/vytizeni` | K řešení (3 lists with actions), Rozpis grid (Sundays + kind filter, keyboard, picker), Vytížení table |
| 8 | Lidé + Osoba | `#lide/…`, `#osoba/<id>` | built-in views, search, chips Tým / Vztah, sort, person panel with inline edit, skills, limits, Kdy nemůže, households view, add person, archive / restore / delete, Adresář mode for members |
| 9 | Týmy + Tým | `#tymy`, `#tym/<id>/lide`, `/role` | lists, members with skill levels and the leader switch, roles table |
| 10 | Správa | `#sablony`, `#sablona/<id>`, `#formaty`, `#mista`, `#pristupy`, `#nastaveni` | full CRUD as in 5.9 (Šablona tabs Nastavení, Potřeby, Osnova, Řady) |
| 11 | Můj účet | `#ucet` | palette, password (live), .ics, sign out |
| 12 | Pastva | `#pastva` | public page |

### 9.2 Later

Týden view; drag and drop (calendar moves, roster cells, osnova); Kdo co umí matrix and team Rozpis tab
(read-only list of skills is in the person panel in build 1); saved personal views, column chooser, density
switch, more bulk actions; hover cards on person chips; event pictures; attendance entry; OSM map frame in
O setkání; birthdays card; print / PDF of Rozpis and Osnova; shared (team-wide) saved views; command palette
fuzzy date parsing beyond „ne 18“ / „18. 10.“; phone Rozpis swipe view (build 1 shows K řešení and Vytížení
on phones, Rozpis opens one meeting at a time as plain lists).

### 9.3 Suggested split among engineers

| Package | Owns | Depends on |
|---|---|---|
| **A Shell & kit** | `index.html`, `app.js` boot, router, `ui/dom.js`-style `h()`, `ui/icons.js`, `css/tokens.css` + components (from `mock.css`), sidebar, tab bar, Více sheet, panel / popover / dialog / sheet / toast / tooltip primitives, undo stack, command palette, shortcuts, save state, demo view-as | – (start first, a skeleton in days) |
| **B Me** | Přehled, Moje služby, Kdy nemůžu (+ date-range picker), Můj účet, Přihlášení, Pastva | A |
| **C Meetings** | Kalendář (Měsíc, Seznam, peek), Setkání (Tým, Osnova, O setkání), Nové setkání, series, **the picker** and the problem list component, Vím o tom | A |
| **D Planning** | Plánování (K řešení, Rozpis grid, Vytížení), Připomeň menu | A, C's picker |
| **E People & teams** | Lidé (table, views, chips, bulk), person panel / page, households, archive, Týmy, Tým (Lidé, Role), person combobox | A |
| **F Admin** | Šablony (+ needs editor, osnova reuse from C), Formáty, Místa, Přístupy, Nastavení | A, C (run sheet, needs editor shared) |

Shared components are owned by one package and reused: picker, problem item, run sheet (C); person
combobox (E); date / time pickers (B); table + chips (E).

## 10. Platform notes for the lead

* `ui/palette-picker.js` imports `./dom.js` (an old-app file). Importing the picker is fine as platform,
  and v3's own `h()` lives in `v3/ui/`.
* Every palette block in `palettes.css` (device modes included) defines the scales, so `--rose-9` (the
  pink) and `--gray-1/12` are always there. `--plum-*` and `--teal-*` exist too and are forbidden in v3.
* v3 status copy differs from `state.js` (`čeká na odpověď`). Keep `state.js` as it is and put v3's labels in
  `v3/ui/copy.js`.
* Pure logic v3 adds (route parsing, undo snapshots, Czech plurals, date-word search for the palette)
  should be small modules with tests in `zvonec/test/` (`node --test zvonec/test/*.test.mjs`).
* The mockups are static and use demo data as of Wednesday 7 October 2026. The generator lives only in a
  scratchpad. Edit the HTML directly if needed.
