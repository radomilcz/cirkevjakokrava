# Zvonec – architecture

Zvonec is the base of a church-management and events system for Církev jako kráva (AC Nový Jičín).
It runs only on GitHub: static app on GitHub Pages, data in a private repo, checks in GitHub Actions.

Everything about development is English (identifiers, files, data keys, comments, tests, commits).
Everything people read is Czech (UI text, URL slugs, downloaded file names, commit messages the app
writes into the data repo, the user guide `README.md`).

## 1. Modules

Three layers with a one-way dependency. The **people registry** is the foundation and knows nothing
about planning. Groups pick people from the registry; planning picks people from groups.

```
people     people, households, membership, birthdays,     imports: nothing
           missing data
places     places, rooms inside buildings                 imports: nothing
groups     groups, roles (duties a team covers), members, imports: people
           skill matrix („Kdo co umí“)
events     event types (templates), events, series,       imports: people, groups
           program, assignments, formats, availability,
           serving limits, fill ratio
scheduling candidate ranking, propose, same as last time,  imports: people, events (needsOf)
           serving load (Břemeno), open slots, unconfirmed
conflicts  rules K1–K17                                   imports: all, read-only, pure
validate   data that does not hold together (warnings)    imports: events (RECURRENCE_STEPS)
access     logins, sealing the GitHub token               imports: nothing (links by personId)
```

Three different things, three different records:
1. **Belonging to a group**: `groupMember` (Petr is in the Tech team). Durable.
2. **Role within the group**: `groupMember.leader` and the skill level per role
   (`roles: { sound: "trained" }`). Answers *who can*.
3. **Duty at an event**: `assignment` (Petr does sound on 11 Oct). Answers *who will, when*.

Availability (blocked dates) and serving limits belong to planning, not to the registry: only the
scheduler reads them. The person card still shows them, read from planning.

App permission (`access`: admin / leader / member / invite) and a role in a group (sound tech) are
separate concepts and never share names.

## 2. Data files (private data repo)

```
data/people.json     { "schema": 2, "people": [], "households": [] }
data/groups.json     { "schema": 2, "groups": [], "roles": [], "groupMembers": [] }
data/events.json     { "schema": 2, "eventTypes": [], "events": [], "series": [], "formats": [],
                       "places": [], "availability": [], "servingLimits": [] }
data/settings.json   { "schema": 2, "settings": { … } }
access.json          { "v": 2, "logins": [] }            published to Pages, contains no names
```

- Each file has its own sha. A save writes only the files that changed. A 409 on a file triggers the
  three-way merge per record id for that file (settings merge per key).
- Refresh lists `data/` once and fetches only files whose sha changed.
- Cross-file operations are not atomic. A deleted person leaves dangling `personId`s; they render as
  „někdo smazaný“ and are dropped on the next save of the file that holds them.
- **Privacy, plainly:** one token means every logged-in browser can read every file. Hiding data from
  members is a UI rule, not access control. Therefore no pastoral, health or financial notes, ever.
- `data/images/<name>` holds binary pictures (§3 Pictures); they are not part of the files above.
- `web.yml` refuses to publish anything under `data/`, except the pictures of published events (§4b).

## 3. Schema

Dates `YYYY-MM-DD`. Local date-times `YYYY-MM-DDTHH:mm` (Europe/Prague). `?` = optional.
Ids are a prefix + random string unless noted.

### people.json
```
person {
  id: "p…", firstName, lastName?, nickname?, phone?, email?,
  householdId?, birthDate?,                 // "YYYY-MM-DD" or just "YYYY"
  membership: { status: "member" | "regular" | "guest" | "former", since?: date, until?: date },
  consentDate?: date,                       // required for guests before storing more than a name
  registeredAt?: date,                      // came through an invite
  showInDirectory?: bool,                   // members may see phone/e-mail
  needsReview?: bool,                       // created quickly while planning, card incomplete
  note?                                     // short, non-sensitive, leaders only
}
household { id: "h…", name, address? }     // address = one line, shown on the card and in Tabulka
```
A child is derived: `birthDate` younger than `settings.rules.childAge` (default 15). Not a status.

### groups.json
```
group       { id: "g…", name, kind: "team" | "community" | "leadership", description?, archived?: bool }
role        { id: "r…", groupId, name, count: int (default 1), essential?: bool, adultsOnly?: bool,
              childcare?: bool, window?: { startMin: int, endMin?: int },   // minutes from event start
              combinableWith?: [roleId] }                                   // symmetric
groupMember { id: "<groupId>~<personId>", groupId, personId, leader?: bool,
              roles?: { [roleId]: "trained" | "learning" }, since?: date }
```
Only `team` groups have roles and feed planning.

### events.json
```
eventType     { id: "t…", name, kind: "service" | "rehearsal" | "smallGroup" | "event",   // UI: Šablona, kind = Účel
                weekday?: 0..6,                 // 0 = Monday; the day its events usually fall on (prefills the calendar)
                startTime: "HH:mm", minutes: int, placeIds: [], needs: [need],
                program?: [{ formatId, minutes }], groupId?,
                public?: bool,                  // events made from this type start as published
                description?, image? }          // defaults copied to the events made from this type (§4b)
event         { id: "e…", title, kind, typeId?, start, end, placeIds: [], seriesId?,
                cancelled?: bool, groupId?, note?, needs: [need], program?: [programItem],
                assignments: [assignment],
                attendance?: { adults?: int, children?: int },   // headcount of a past event; never per person
                public?: bool,                  // published on the public site (§4b); only `true` counts
                description?: string,           // what people read about the event; public with the event
                image? }                        // file name under data/images/ (e.g. "i-k3j9x0a2.webp")
                                                // `note` stays internal (for the team) and is never public
series        { id: "s…", typeId?, step: "weekly" | "biweekly" | "monthly", from: date, until: date }
                                                // events stay materialised and point to it by `seriesId`;
                                                // monthly = the same nth (or last) weekday every month
need          { roleId, count: int }
programItem   { id: "i…", formatId, minutes: int, title?, personId?, note? }   // UI: „osnova“
assignment    { id: "a…", roleId, personId, status: "proposed" | "confirmed" | "declined",
                override?: { reason, by?: personId, at?: date } }
format        { id: "f…", name, minutes: int, leadRoleId?, why?, how?, link?, needs?: [need],
                public?: bool }                 // name, minutes, why and how are public (§4b)
place         { id: "l…", name, shared: bool,
                partOf?: placeId,               // a room inside a building (one level); it inherits the
                                                // address and coordinates, its own values win
                address?: string,               // one line, e.g. "B. Martinů 1885/2, Nový Jičín"
                lat?: number, lon?: number }    // WGS84; both or none (a map is shown only with both)
availability  { id: "v…", personId, from: date, to: date, reason? }
servingLimits { id: "<personId>", personId, maxPerMonth?: int, maxConsecutiveWeeks?: int,
                paused?: bool }             // paused = do not plan now (moved away, break)
```

Older data with a `seriesId` but no `series` record still work: `seriesFor()` infers `{ …, inferred: true }`
from the events (`step: null` when the dates do not follow a rule). New series go through `addSeries`
(stores the record and the events), `extendSeries` is „Prodloužit řadu“. `validateData()` (lib/validate.js)
reports records that do not hold together: an unknown series step, a series ending before it starts,
negative or non-integer `attendance`, `partOf` pointing to a missing place, to itself or to a room, a
non-text household address. It returns Czech texts; `zvonec/check.mjs` prints them as warnings and never
fails the run over them.

`public` has no default: a missing value means not published. `normalize()` keeps it as stored, and
`createFromType` copies a boolean `public` from the event type to the new event (an edit of a series
copies `public`, `description` and `image` to the following events too). `createFromType` also copies the
type's `description` and `image`. Data saved before 2026-10 with `event.publicNote` are read as
`description` by `normalize()` (the old key is dropped on the next save).

**Pictures.** An image is a binary file `data/images/<name>` in the private data repo (name
`i-xxxxxxxx.webp|jpg`, resized in the browser, ≲ 400 kB); records refer to it by file name only. The
store has `readBinary(path) → { base64, sha } | null`, `writeBinary(path, base64, message, sha?)`
and `remove(path, message)` (GitHub Contents API; the demo keeps the same in its storage); lib/store/store.js
wraps them as `saveImage`, `loadImageUrl` (cached object/data URL) and `deleteImage`. Images are not
data files: `Sync` never sees them and `list('data')` does not return them.

**Full needs.** What an event needs is `needsOf(data, event)` (lib/events.js): `event.needs` merged
with the needs of the formats in its program (`programNeeds`, lib/program.js). A format brings its
`needs` plus one person for its `leadRoleId`; an item with a hand-picked `personId` does not ask for
the lead role. The same role is not added up – the larger count wins. Event types store only their own
needs; the program's needs are never copied into `event.needs`. Everything that reads needs uses the
full list: the slots on the event screen, the roster columns, `proposeRemaining`, `sameAsLastTime`,
K5 (unfilled) and K12 (childcare). K17 is left for a format whose lead role no longer exists.

### settings.json
```
settings { churchName, address?, mainPlaceId?, timezone: "Europe/Prague",   // mainPlaceId: where we usually meet
           defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 3 },
           rules: { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 15 } }
```

### access.json
```
{ v: 2, logins: [{ id, personId?, access: "admin" | "leader" | "member" | "invite",
                   created: date, expires?: date, lookup, pub, iv, ct, gh }] }
```
The sealed `gh` payload keeps its short keys (`t` token, `o` owner, `r` repo, `c` path = `"data"`,
`v` branch). PBKDF2 salt: `cirkevjakokrava-zvonec:login`.

Browser storage keys (this browser only, never in the data): `zvonec-me` (remembered login),
`zvonec-demo` (demo data), `zvonec-theme` (the mode, `ui/palette.js`; the old `zvonec-palette` is migrated
once and removed, a stale `zvonec-look` is removed), `zvonec-calendar-view` (last Kalendář view per viewer),
`zvonec-people-view`, `zvonec-people-sort` (Lidé), `zvonec-more` (open „Další možnosti“ per form).

## 4. Code layout (`docs/zvonec/`, ES modules, no build, CSP unchanged)

```
index.html             the shell skeleton (appbar, sidebar, stage, dialog, toasts) and the CSS order
style.css              base layer: fonts, base, shell, page, kit components, print (semantic tokens only)
css/tokens.css         design tokens: scales, surfaces, text, lines, status, role tokens; light + dark
                       (all selectors in :where(), so any rule can override a token)
css/<module>.css       one per module: people, calendar, events, roster, groups, formats, library, home,
                       settings, public – semantic tokens only, no raw colours, fonts or radius numbers
imprint.svg
app.js                 boot (demo / live), session, router, shell (nav per role, header, phone sheet), save status
lib/time.js            dates, recurrence (incl. monthlyRule), Czech formatting
lib/access.js          keypairs, PBKDF2, sealing, sign-in, invites
lib/store/merge.js     three-way merge per record id (pure)
lib/store/github.js    Contents API client (GET/PUT/DELETE, directory listing, raw fallback, binary files)
lib/store/local.js     localStorage backend for the demo (incl. binary files)
lib/store/store.js     file map {collection → file}, load all, one save queue per file, refresh by sha,
                       image helpers (saveImage, loadImageUrl, deleteImage)
lib/people.js          names, households, age, membership queries, upcomingBirthdays, missingData (no planning)
lib/places.js          placeById, buildingOf, resolvePlace, placeAddress, placesOf, roomsOf, placeTree
lib/groups.js          members of a group, roles of a person, leaders, skill level, skillMatrix
lib/events.js          event types → events, series (addSeries, extendSeries, seriesFor, seriesSummary), needs,
                       fillRatio, lastDuty, KIND_LABELS / KIND_ICONS (Účel)
lib/program.js         program times, leader of an item
lib/scheduling.js      candidate ranking, availability and limits, "propose the rest", "same as last time",
                       servingLoad (Břemeno), openSlots, unconfirmedDuties
lib/conflicts.js       rules K1–K17 (used by the app, tests and zvonec/check.mjs)
lib/validate.js        validateData(): records that do not hold together (series, attendance, partOf, address)
lib/ics.js             calendar export
lib/public.js          public view of the data: buildPublic() → public.json, publicImages() (pure, §4b)
lib/demo.js            fictitious demo data relative to today (seeded, deterministic): createDemo, createDemoAccess,
                       demoBase (the first-setup base without people), DEMO_VIEWERS
ui/state.js            app state S, can(), change(), render(), navigate(), actAs() (demo), shared Czech labels
ui/icons.js            the icon set (Lucide-like, drawn with SVG, no font) + status and severity symbols
ui/kit.js              the kit: page, tabs, buttons, badges, list parts, table, form fields, dialogs (see „The kit“ in §5)
ui/dom.js              h(), older helpers, avatars, covers, place lines, dialogs; re-exports kit.js and icons.js –
                       screens import from here only
ui/kit-page.js         #kit – the living specimen (leaders, not in the nav), every piece in light and dark
ui/palette.js          the mode (classic script in <head>, applies it before first paint, wires the Vzhled menu;
                       a setting = an entry in CHOICES + a radio group in index.html)
ui/select.js, stepper.js, datepicker.js   enhancers: drop-downs, number − / +, date fields with our own calendar
ui/sortable.js         drag-and-drop (mouse, touch, keyboard) for ordered lists
ui/picker.js           shared people picker (event slots, group members, households), quick-add
ui/home.js             #prehled – blocks per role
ui/calendar.js         #kalendar page: tabs, toolbar, filters; re-exports the calendar helpers
ui/calendar-shared.js  views, filters, links, remembered view, event row, cover, fill, warnings of an event
ui/calendar-month.js, calendar-week.js, calendar-list.js   the Měsíc, Týden and Seznam views
ui/roster.js           the Rozpis view (events × roles, planning in place, print)
ui/event.js            #setkani/<id>: Přehled · Kdo slouží · Osnova
ui/event-duties.js     changing who serves (shared by Kdo slouží and Rozpis)
ui/event-form.js       Přidat / Upravit setkání, series question, „Kolik lidí je potřeba“
ui/program.js          the Osnova tab and the printable program (A4)
ui/people.js           front door of Lidé (re-exports); people-views.js (Seznam, Tabulka, Domácnosti, Podle skupin,
                       Narozeniny, Břemeno), people-card.js (person card, household page), people-forms.js (dialogs),
                       people-common.js (filters, who sees what, wording)
ui/groups.js           #tymy, #tym/<id>: teams, skupinky, vedení, roles, members, Kdo co umí
ui/formats.js          #formaty – Formáty; also the helpers of Jak se scházíme (libraryTabs, needs editor, publishField)
ui/templates.js        #sablony, #sablona/<id> – the full-page template editor
ui/places.js           #mista, #misto/<id> – buildings, rooms, address and map; placeChipsField, coordsField
ui/conflicts.js        #upozorneni: Podle setkání / Podle lidí, inline fix, override; warning rows for other screens
ui/settings.js         #nastaveni: Sbor · Pravidla · Přístupy · Záloha
ui/account.js          #ucet – Můj účet (contact, Kdy nemůžu, .ics, Vzhled, password, „Dívat se jako“)
ui/public.js           the public part: #program[/<id>], #jak-se-schazime (from publicData(), never S.data)
ui/login.js            sign-in (#prihlaseni), first setup, invite registration, the logins view
```
Rules: `lib/*` never touches the DOM. `lib/people.js` and `lib/places.js` import nothing. `lib/groups.js` never imports
from events, program, scheduling or conflicts. `lib/events.js` and `lib/program.js` never import
scheduling or conflicts (those read `needsOf` from events.js – no cycle). A test checks the import lines.

Outside `docs/zvonec/`:
```
zvonec/check.mjs        conflict check for the data repo: node zvonec/check.mjs data [--today YYYY-MM-DD]
                        [--markdown file]; reads data/*.json via lib/store fromFiles, Czech output,
                        exit 1 when an upcoming event has an error
zvonec/build-public.mjs  public.json for the data repo: node zvonec/build-public.mjs data site/public.json
                        [--today YYYY-MM-DD]; reads data/*.json via lib/store fromFiles, writes lib/public.js output
                        and copies the pictures of published events from data/images/ to images/ next to it
zvonec/data-repo/       workflow templates for the data repo: web.yml (publishes the app + access.json +
                        public.json + images/ of published events, refuses data/, names in access.json,
                        person data in public.json and images public.json does not list),
                        check.yml („Collision check“)
zvonec/test/            node --test zvonec/test/*.test.mjs
.github/workflows/zvonec.yml   „Zvonec tests“: tests + node --check of every module
```
`web.yml` puts the app at the domain root and `docs/assets/{fonts,favicon*.…,icon-180.png}` into
`assets/` (index.html and style.css refer to `../assets/…`, which resolves to `/assets/…` on the root),
and writes `repo.json` = `{ "owner", "repo" }` (read by the first-setup screen).

## 4b. Public data

Visitors who are not signed in must see the upcoming program and how the church meets, without any
login and without the app being allowed to read the private repo. So the data repo publishes one more
file next to `access.json`: `public.json`, built from `data/` by `lib/public.js`.

```
public.json  { v: 1, churchName, address, generated: "YYYY-MM-DD",
               events:  [{ id, title, kind, start, end, description, image: "images/<name>" | null,
                           places: [{ name, building?, address?, lat?, lon? }], cancelled?: true }],
               formats: [{ id, name, minutes, why, how }] }
images/<name>   the pictures of the published events (copied from data/images/)
```
- Publishing is explicit. Events: `event.public === true` (a new event starts from its type's
  template's `public`), text for visitors in `event.description` (empty string when none). `image` is the event's
  own picture, else its type's, else `null` (the UI then draws a generated cover). Places: name, plus
  `address` and `lat`/`lon` only when the place has them; a room is resolved through its building (`partOf`:
  the building's name as `building`, its address and coordinates unless the room has its own). Formats: `format.public === true`. Nothing
  else is ever published.
- Window: events reaching into the days from yesterday to 120 days ahead (`daysAhead`), sorted by start
  then id. Cancelled events stay with `cancelled: true`, so people see the cancellation.
- No person data: no assignments, no program (so no leaders), no person ids, no `note`, no availability.
  Place ids are turned into public places (name, address, coordinates). Titles are written by leaders – a title is public, so no
  names of private people in it.
- `zvonec/build-public.mjs` runs in the data repo's `web.yml` (node 22, Prague date) and writes
  `site/public.json`. The workflow runs on a push to `data/events.json` or `data/settings.json` (and
  daily), so publishing an event is live within minutes. Its guard fails the run when `public.json`
  contains `"personId"`, `"assignments"`, `"firstName"`, `"lastName"`, `"email"` or `"phone"`, and
  `data/` itself is still never published. The only files from `data/` on the site are
  `site/images/<name>` of published, upcoming events (`publicImages()`; a missing file is a warning); the
  guard fails the run when `site/images/` holds anything `public.json` does not list. The workflow also
  runs on a push to `data/images/**`.
- The app loads `public.json` (same origin) for signed-out visitors; demo mode builds the same object
  from the demo data with `buildPublic`. The public pages (Program, one event, Jak se scházíme) read only this
object. See DESIGN.md §8.

## 5. Shell, routes and screens

### The shell (app.js + index.html)

`header.appbar` (brand, save status, the **Vzhled** menu, the signed-in person → Můj účet, or „Přihlásit se“)
across the top; under it `aside.sidebar` (navigation per role, at the bottom „Veřejná část“ / „Zpátky do
Zvonce“) and `main.stage` with one `div.page`. On a phone (< 960 px) the appbar shows the brand and „Menu“;
the sidebar becomes a sheet and `app.js` moves the Vzhled menu and the person into it (`placeTools`). The
hero page head gets `data-context` = the nav label of the section, shown as a quiet label above the title
(not where it would repeat the title, not under a back link, not in a compact head).

Navigation per role (`NAV_LEADER`, `NAV_MEMBER`, `NAV_PUBLIC` in app.js; `[id, label, icon, href]`):
leader **Přehled · Kalendář · Upozornění (count) · Lidé · Týmy a skupinky · Jak se scházíme · Nastavení**;
member **Přehled · Kalendář · Lidé · Jak se scházíme**; visitor and public routes **Program · Jak se
scházíme · Přihlásit se**. The demo is signed in as admin; „Veřejná část“ opens the public pages as a
visitor sees them.

### Routes

A route is `{ render(parts), access, menu? }`. `access`: `'public'` · `'signedOut'` · `'member'` ·
`'leader'` · `'admin'` or a function of the parts. `menu` = which nav id lights up (defaults to the
section; `null` = none). `render` returns a kit `page()` (older screens may return a list starting with
`page()`; `asPage()` wraps it).

| route | screen | access |
|---|---|---|
| `#prehled` | Přehled | member |
| `#kalendar[/<mesic\|tyden\|seznam\|rozpis>[/<datum>]]` | Kalendář; `#kalendar` opens the remembered view | member |
| `#setkani/<id>[/sluzby\|/osnova]` | event: Přehled · Kdo slouží · Osnova | member (leader edits) |
| `#upozorneni[/lide]` | Upozornění: Podle setkání / Podle lidí | leader |
| `#lide[/<pohled>[/<filtr>]]` | Lidé; views seznam · tabulka · domacnosti · skupiny · narozeniny · bremeno; filters `clenove` · `pratele` · `hoste` · `deti` · `nechodi` · `doplnit`; `bremeno` takes a month | member (members: seznam, domacnosti, skupiny) |
| `#osoba/<id>` | person card | member (reduced) |
| `#domacnost/<id>` | household | leader |
| `#tymy[/<tymy\|skupinky\|vedeni\|umi>[/<týmId>]]`, `#tym/<id>[/<lide\|role\|umi\|setkani>]` | teams and groups, team page | leader |
| `#sablony`, `#sablona/<id>` (`nova`) | templates (cards, full-page editor) | leader |
| `#formaty[/<id>]` | formats | member (leader edits) |
| `#mista`, `#misto/<id>` | places | member (leader edits) |
| `#nastaveni[/<sbor\|pravidla\|pristupy\|zaloha>]` | settings | leader |
| `#ucet` | Můj účet | member |
| `#program[/<id>]`, `#jak-se-schazime` | public: events, one event, published formats | public |
| `#prihlaseni`, `#pozvanka/<code>` | sign-in (first setup while there are no logins), registration | signedOut |
| `#kit`, `#kit/ikony` | the living specimen | leader, not in the nav |

Old slugs redirect (`REDIRECTS` in app.js, applied until none matches): `#moje` → `#prehled`; `#rozpis[/m]` →
`#kalendar/rozpis[/m]`; `#kalendar/2026-10` → `#kalendar/mesic/2026-10`; `#domacnosti` → `#lide/domacnosti`;
`#udalost/<id>` → `#setkani/<id>`; `#porad/<id>`, `#setkani/<id>/porad`, `#setkani/<id>/prubeh` →
`#setkani/<id>/osnova`; `#nastaveni/formaty` → `#formaty`; `#nastaveni/sablony` → `#sablony`;
`#nastaveni/mista` → `#mista`; `#nastaveni/ucet` → `#ucet`; `#skupiny`, `#sluzby` → `#tymy`; `#skupina/<id>` →
`#tym/<id>`; `#kolize` → `#upozorneni`. In `#lide`, the old filter slugs `vsichni` and `neclenove` still open.

An empty or unknown hash opens `#prehled` for signed-in people, `#program` for visitors (`#prihlaseni`
while there are no logins). A person opening a route above their access lands on the home of their role;
a visitor opening an app route lands on `#prihlaseni` and, after signing in, on the route they asked for
(`S.afterSignIn`). Inside a screen the UI still hides what members must not see (§6).

### Route slots (who edits app.js)

Routes are grouped per module in marked blocks, so modules can be built in parallel:
`// IMPORTS:<module>` … `// IMPORTS:<module> end` and `// ROUTES:<module>` … `// ROUTES:<module> end`
(`calendar`, `people`, `groups-library`, `home-admin`); `SHELL_ROUTES` (sign-in, invite, kit), navigation,
redirects and the shell belong to the shell. A module edits only its own blocks.

### The kit

`ui/kit.js` (re-exported by `ui/dom.js`, so screens import from `./dom.js` only) is the one set of
components. A page is built with `page({ title, lead, actions, tabs, toolbar, body, width, compact })`
(DOM: `div.page > header.page-head + div.page-body`, widths `w-text` 780 · `w-list` 780 · `w-form` 640 ·
`w-wide` 1240). **Two heads**, chosen by the module, never by the route in CSS: the default is the hero head
(a tinted band with the quiet label, title, actions, lead and meta, the tabs under it) for Přehled, detail
pages and the public part; `compact: true` puts `header.page-head.compact` – title and actions on one line,
the tabs right under them, no band (~116 px to the bottom of the tabs on a desktop) – on the working screens
(Kalendář, Lidé, Upozornění, Týmy a skupinky). The rest: `button` (variants solid · soft · surface · ghost · danger), `iconButton`, `badge`,
`countBadge`, `statusBadge`, `severityBadge`, `callout`, `tabs`, `viewSwitch`, `chips`, `chipLinks`, `card`,
`panel`, `facts`, `list` / `row` / `groupedList`, `table`, `avatar`, `avatarStack`, `personLine`, `assignee`,
`kindMark`, `groupMark`, `eventCover`, `placeLine`, `placeMap`, `emptyState`, `progressBar`, `fillRing`,
`dateNav`, `toolbar`, `toast`, and the forms: `formDialog`, `infoDialog`, `formSection`, `disclosure`
(„Další možnosti“), `field`, `textField`, `textArea`, `selectField`, `segmentedField`, `chipsField`,
`switchField`, `dateField`, `timeRange`, `numberField`, `searchField`, `personPicker`. `#kit` renders all of
it. A piece that only one module needs lives in that module first (`placeChipsField`, `coordsField`,
`skillMatrixTable`, `householdPicker`) and is promoted to the kit when a second module needs it.

### Screens in short

- **Přehled** – cards in two columns, ≤ 5 rows each: my answers, my duties, next Sunday (fill ring), this
  week, Kdy nemůžu, my groups; leaders: Co nesedí, Volná místa (`openSlots`), Čeká na potvrzení
  (`unconfirmedDuties`), Lidé (cards to complete, guests, birthdays); admins: Přístupy.
- **Kalendář** – one toolbar for four views (period navigator, Účel, Tým, „Jen moje služby“). Rozpis is
  the planning surface: a leader's click on a cell opens the picker in place (`ui/event-duties.js`).
- **Lidé** – Tabulka is the default on a desktop, Seznam on a phone; the view is remembered.
- **Person card** – left column owned by the registry (contact, household, membership, consent, note, login),
  right column read-only blocks from planning (teams and roles, upcoming duties, Kdy nemůže, Břemeno,
  Upozornění) with links to where they are edited; each block has its own small „Upravit“ dialog.
- **Template page** – sections Základ · Na webu · Kdo je potřeba · Osnova · Řady, edits a draft, writes on „Uložit“.

Picking people (`ui/picker.js`): one picker for event slots, program leaders, group members and
households. With an event and a role it ranks `candidates()` and shows the reasons as pills (solid =
error); pills **Umí to · Celý tým · Všichni lidé** switch the pool. The search always covers the whole
registry (former and paused people included). For a leader, a search adds „+ Nový člověk „…““: a small
form (first name, last name, phone, e-mail – split from the query) that warns about similar names,
creates a minimal card (`guest`, `needsReview`), optionally adds the person to the team (the role as
`learning`) or group, and picks it in one step. Enter picks the first row.

### How to add a module

1. Data first: records and their rules in `lib/<name>.js` (no DOM, tests in `zvonec/test/`); a new
   collection goes into `FILES` in `lib/store/store.js` (it then gets `emptyData`, `normalize`, merge
   and save for free) and into `validateData` if it has invariants.
2. Screens in `ui/<name>.js` (split `<name>-*.js` when it grows): return `page()`; import from `./dom.js`
   only; text in Czech, code in English; DOM through `h()`, never `innerHTML`, no inline styles.
3. Styles in `css/<name>.css` with semantic tokens only; add the `<link>` in `index.html` after the other
   module CSS. A working screen (a list or a planning surface people use daily) passes `compact: true` to
   `page()`; a detail page keeps the hero head. Check both modes at 1440 and 390.
4. Routes: a `// IMPORTS:` and a `// ROUTES:` block in app.js (slug in Czech, `access`, `menu`), a row in
   `NAV_LEADER` / `NAV_MEMBER` if it is a top-level module, redirects for any slug it replaces.
5. Update DESIGN.md §6 (sitemap), this file, `zvonec/README.md` (what people find where) and the `#kit`
   specimen if you added a kit piece. `node --test zvonec/test/*.test.mjs` and `node --check` every file.

### One look, two modes

There is one look (the Milníkovač system in the cow's palette, DESIGN.md §2). `css/tokens.css` holds every
token for light and dark; `style.css` and the module CSS use semantic tokens only. A new colour scheme (e.g. a
brand palette) is a set of token overrides per `[data-…]` attribute on `<html>` plus a setting in
`ui/palette.js` (`CHOICES`) and a radio group in the Vzhled menu (index.html) and in `ui/account.js`; never
fork module CSS or screens. Run the contrast check for any new colour pair.

## 6. Who sees what

| | admin / leader | member |
|---|---|---|
| name, household | yes | yes |
| phone, e-mail | yes | only if the person set `showInDirectory` |
| membership, birth date, note, consent, login | yes | no |
| groups | yes | names only |
| duties, availability, conflicts | yes | own only (rota is public to members) |

Membership reveals religion (GDPR Art. 9), so it never appears in member views or print.

## 7. GDPR

- Members, former members and regular attenders: Art. 9(2)(d) (legitimate activities of a religious
  body), data never leaves the church. Guests: consent before storing more than a first name.
- Children under 15: contact goes through a parent; no own phone or e-mail.
- Retention: guests without a visit for 12 months are deleted; former members keep only name and
  membership dates after 12 months.
- Git history keeps old versions; full erasure means rewriting the data repo history.
