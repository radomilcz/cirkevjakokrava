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
archive    the archive of people: archive, restore,       imports: people
           delete a card with the history kept
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
- **Sync never mass-deletes** (`mergeSafe` in lib/store/merge.js, used by both the conflict merge
  and refresh). Mass deletion happens only through an explicit action in the UI.
  - A missing file never means „all records deleted“. A PUT with our sha that GitHub refuses with
    409, 422 or 404 (the demo: stale sha) counts as a conflict, so the file is read again. If that
    read finds no file (storage cleared, file deleted by someone else), our version is written back
    with a PUT without a sha, with no merge. Every other data file missing from `data/` is then
    recreated from memory. A missing repo still fails, because the re-read asks for the repo.
    Refresh ignores files that are missing from the listing.
  - If a merge would drop at least 3 of our records **and** more than half of one collection
    (`MASS_DELETION_MIN`), the dropped records are kept. Smaller per-record deletions by someone
    else merge as usual.
  - Warnings: `console.warn`, `onChange({ status, warning })` and the list `sync.warnings`.
    The kinds are `{ kind: 'recreated', paths }` and `{ kind: 'massDeletion', path, collections }`.
    The UI can show them from `event.warning` as it arrives, or read `sync.warnings` later.
- Cross-file operations are not atomic. A deleted person leaves dangling `personId`s in past events;
  a record that kept the name (`personName`, §3 The archive) shows that name, any other renders as
  „někdo smazaný“.
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
  membership: { status: "member" | "regular" | "guest" | "former", since?: date, until?: date,
                previous?: "member" | "regular" | "guest" },   // former = in the archive (below)
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
programItem   { id: "i…", formatId, minutes: int, title?, personId?, personName?, note? }   // UI: „osnova“
assignment    { id: "a…", roleId, personId, status: "proposed" | "confirmed" | "declined",
                personName?,                    // the full name, kept when the card was deleted (§3 The archive)
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
(stores the record and the events), `extendSeries` is „Prodluž řadu“. `validateData()` (lib/validate.js)
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

### The archive (people who no longer come)

No migration: the archive **is** the stored status `former`, and older data read the same.
`lib/archive.js` (pure, tested in `zvonec/test/archive.test.mjs`):
- `archivePerson(data, id, { today, now })` – „Přesuň do archivu“: `membership = { status: "former",
  since?, until: today, previous: <status before> }`; the person's assignments and program items of
  events starting from `now` are removed / lose `personId` (the slots open again); `leader` is dropped
  on their `groupMember` records. The records themselves stay (teams and skills come back with the
  card), but `membersOf`, `leadersOf`, `peopleForRole` and `skillMatrix` skip archived cards. Past
  events stay untouched. In live mode the UI also removes their logins from `access.json`.
- `restorePerson(data, id)` – „Vrať z archivu“: back to `previous`, `regular` (přítel) when unknown
  (older data); released duties and leading do not come back.
- `deletePersonKeepHistory(data, id, { now })` – „Smaž kartu“: past assignments and program items
  keep `personId` and get `personName` (the full name), future ones are released; the card, its
  `groupMember` records, availability and serving limits are removed. `personOrSnapshot(data, record)`
  (lib/people.js) and `personInEvent(data, event, personId)` give the card or a stand-in
  `{ id, firstName, lastName?, deleted: true }`; every screen that shows a past duty or osnova leader
  reads through them (and does not link a stand-in to `#osoba/`).
- An archived card is left out everywhere else: Lidé filters and search, pickers and proposals
  (`candidates` never returns it, not even with `includeInactive`), Břemeno (`servingLoad`), birthdays,
  `missingData`, group lists, the household block of a card, „Jak to vidí ostatní“, CSV of everyone. Only
  `#lide/archiv` (leaders) and the card itself (leaders) show it.
- One year: `archiveOverdue(person, today)` is true after more than a year in the archive (a card
  without `until`, older data, counts as over). `#lide/archiv` asks „<n> karet je v archivu déle než
  rok. Chceš je smazat?“ (one confirmation deletes them all with the history kept); Přehled / Domů show the
  same line to leaders.

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
`zvonec-demo` (demo data), `zvonec-palette` (the colour palette, `ui/palette.js`; a stored `zvonec-theme` is
migrated once – light → cream-clay, dark → clay-pink – and removed, as is a stale `zvonec-look`; a palette the
old Zvonec offered and this one does not becomes the light or dark default), `zvonec-calendar-view` (last Kalendář view per viewer),
`zvonec-people-view`, `zvonec-people-sort` (Lidé), `zvonec-more` (open „Další možnosti“ per form).

## 4. Code layout (`docs/zvonec/`, ES modules, no build, CSP unchanged)

```
index.html, app.js     Zvonec One, the app, at the main address: boot, routes (specified in zvonec/SPEC.md and
                       zvonec/design/one/); palette-limit.js keeps One to its two palettes
one/                   only a redirect: old /one/ links go to the main address (query and hash travel along)
css/                   tokens, kit, shell, screens; palettes.css – the brand palettes (generated by
                       zvonec/palettes.mjs from zvonec/palette-scales.css)
ui/state.js            app state S, can(), change(), render(), navigate(), actAs() (demo), shared Czech labels
ui/palette.js          the colour palette (classic script in <head>: applies data-palette before the first paint,
                       ?paleta= / ?rezim= links)
ui/                    the kit and every screen
lib/time.js            dates, recurrence (incl. monthlyRule), Czech formatting
lib/access.js          keypairs, PBKDF2, sealing, sign-in, invites
lib/store/merge.js     three-way merge per record id (pure)
lib/store/github.js    Contents API client (GET/PUT/DELETE, directory listing, raw fallback, binary files)
lib/store/local.js     localStorage backend for the demo (incl. binary files)
lib/store/store.js     file map {collection → file}, load all, one save queue per file, refresh by sha,
                       image helpers (saveImage, loadImageUrl, deleteImage)
lib/people.js          names, households, age, membership queries, upcomingBirthdays, missingData, the archive's
                       queries (isArchived, archivedOn, archiveOverdue, overdueArchive, personOrSnapshot) (no planning)
lib/archive.js         archivePerson, restorePerson, deletePersonKeepHistory, futureDutiesOf, personInEvent (§3)
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
zvonec/palettes.mjs      the colour palettes → docs/zvonec/css/palettes.css: node zvonec/palettes.mjs [--report x.md|--check]
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
  from the demo data with `buildPublic`. The public pages (Pastva, one event, Jak se scházíme) read only this
object. See SPEC.md §10.

## 5. Shell, routes and screens

The app is Zvonec One (`docs/zvonec/`, at the main address). Its access levels, routes, navigation, UI system and every screen are
specified in [SPEC.md](SPEC.md) §2 and §7–§9; the design decisions and their history are in
[design/one/DESIGN.md](design/one/DESIGN.md), the pixel-level rules in [design/one/CODEX.md](design/one/CODEX.md).

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
- Retention: guests without a visit for 12 months are deleted. People who stop coming go to the archive
  (§3 The archive); after a year there Zvonec asks leaders to delete the cards, and deleting keeps only
  the name on past duties (`personName`) – contact and every other detail go.
- Git history keeps old versions; full erasure means rewriting the data repo history.
