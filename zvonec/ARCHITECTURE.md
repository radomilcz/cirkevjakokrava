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
people     people, households, membership                 imports: nothing
groups     groups, roles (duties a team covers), members  imports: people (ids only)
events     event types, events, program, assignments,     imports: people, groups
           formats, places, availability, serving limits
scheduling candidate ranking, propose, same as last time   imports: people, events (needsOf)
conflicts  rules K1–K17                                   imports: all, read-only, pure
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
data/events.json     { "schema": 2, "eventTypes": [], "events": [], "formats": [], "places": [],
                       "availability": [], "servingLimits": [] }
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
household { id: "h…", name, address? }
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
eventType     { id: "t…", name, kind: "service" | "rehearsal" | "smallGroup" | "event",
                startTime: "HH:mm", minutes: int, placeIds: [], needs: [need],
                program?: [{ formatId, minutes }], groupId?,
                public?: bool,                  // events made from this type start as published
                description?, image? }          // defaults copied to the events made from this type (§4b)
event         { id: "e…", title, kind, typeId?, start, end, placeIds: [], seriesId?,
                cancelled?: bool, groupId?, note?, needs: [need], program?: [programItem],
                assignments: [assignment],
                public?: bool,                  // published on the public site (§4b); only `true` counts
                description?: string,           // what people read about the event; public with the event
                image? }                        // file name under data/images/ (e.g. "i-k3j9x0a2.webp")
                                                // `note` stays internal (for the team) and is never public
need          { roleId, count: int }
programItem   { id: "i…", formatId, minutes: int, title?, personId?, note? }   // UI: „osnova“
assignment    { id: "a…", roleId, personId, status: "proposed" | "confirmed" | "declined",
                override?: { reason, by?: personId, at?: date } }
format        { id: "f…", name, minutes: int, leadRoleId?, why?, how?, link?, needs?: [need],
                public?: bool }                 // name, minutes, why and how are public (§4b)
place         { id: "l…", name, shared: bool,
                address?: string,               // one line, e.g. "Sokolovská 12, Nový Jičín"
                lat?: number, lon?: number }    // WGS84; both or none (a map is shown only with both)
availability  { id: "v…", personId, from: date, to: date, reason? }
servingLimits { id: "<personId>", personId, maxPerMonth?: int, maxConsecutiveWeeks?: int,
                paused?: bool }             // paused = do not plan now (moved away, break)
```

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
settings { churchName, address?, timezone: "Europe/Prague",
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

Browser storage keys: `zvonec-me` (remembered login), `zvonec-demo` (demo data),
`zvonec-palette` (colour choice).

## 4. Code layout (`docs/zvonec/`, ES modules, no build, CSP unchanged)

```
index.html, style.css, imprint.svg
app.js                 boot, mode (demo / live), session, router, save-status badge
lib/time.js            dates, recurrence, Czech formatting
lib/access.js          keypairs, PBKDF2, sealing, sign-in, invites
lib/store/merge.js     three-way merge per record id (pure)
lib/store/github.js    Contents API client (GET/PUT/DELETE, directory listing, raw fallback, binary files)
lib/store/local.js     localStorage backend for the demo (incl. binary files)
lib/store/store.js     file map {collection → file}, load all, one save queue per file, refresh by sha,
                       image helpers (saveImage, loadImageUrl, deleteImage)
lib/people.js          names, households, age, membership queries (no planning)
lib/groups.js          members of a group, roles of a person, leaders, skill level
lib/events.js          event types → events, series, needs
lib/program.js         program times, leader of an item
lib/scheduling.js      candidate ranking, availability and limits, "propose the rest", "same as last time"
lib/conflicts.js       rules K1–K17 (used by the app, tests and zvonec/check.mjs)
lib/ics.js             calendar export
lib/public.js          public view of the data: buildPublic() → public.json, publicImages() (pure, §4b)
lib/demo.js            fictitious demo data relative to today
ui/state.js            app state S, can(), change(), render(), navigate(), actAs() (demo), shared Czech labels
ui/dom.js              h(), buttons, dialogs, form fields, toasts; the shared components: pageHeader, section,
                       list/row, avatar, personName/shortName, statusIcon/statusLabel, assignee, menuButton,
                       emptyState, groupMark, eventCover/coverKey, placeLine/placeMap, metaJoin/andJoin
ui/palette.js          colour picker (classic script, loaded in <head>)
ui/home.js             #moje – member home
ui/calendar.js         month grid / day list, new event
ui/event.js            event detail: needs, assignments, program editor
ui/program.js          printable program „osnova“ (A4)
ui/roster.js           month table (rozpis), print
ui/people.js           registry list, person card, person dialog, households, directory
ui/groups.js           teams and groups (#tymy), roles, members and skill levels
ui/formats.js          #formaty – the Formáty module (members read, leaders edit)
ui/public.js           the public part: #program, #jak-se-schazime (from publicData(), never S.data)
ui/picker.js           shared people picker (event slots, group members, households), quick-add
ui/settings.js         church, event types, places, logins, backup, my account („Dívat se jako“ in the demo)
ui/conflicts.js        conflict list and override
ui/login.js            sign-in (#prihlaseni), first setup, invite registration
```
Rules: `lib/*` never touches the DOM. `lib/people.js` imports nothing. `lib/groups.js` never imports
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
                           places: [{ name, address?, lat?, lon? }], cancelled?: true }],
               formats: [{ id, name, minutes, why, how }] }
images/<name>   the pictures of the published events (copied from data/images/)
```
- Publishing is explicit. Events: `event.public === true` (a new event starts from its type's
  `public`), text for visitors in `event.description` (empty string when none). `image` is the event's
  own picture, else its type's, else `null` (the UI then draws a generated cover). Places: name, plus
  `address` and `lat`/`lon` only when the place has them. Formats: `format.public === true`. Nothing
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
  from the demo data with `buildPublic`. See DESIGN.md §4.

## 5. Screens and routes

The shell (app.js): a fixed left sidebar on desktop (≥ 960 px) – brand, navigation, at the bottom the
signed-in person (→ Můj účet), the colour picker and the save status (only while saving or on error);
on a phone a top bar with the brand and „Menu“, which opens the same sidebar as a sheet.

Leader navigation: **Moje** (only when the login has a person) **· Kalendář · Rozpis · Lidé · Týmy a role ·
Formáty · Upozornění · Nastavení**. Member navigation: **Moje · Kalendář · Rozpis · Lidé · Formáty**
(Lidé = directory). Public navigation (signed out, and on public routes): **Program · Jak se scházíme**
and the button **Přihlásit se**. The demo is signed in as admin; „Veřejná část“ at the bottom of the
sidebar opens the public pages as a visitor sees them („Zpátky do Zvonce“ returns).

| route | screen | who |
|---|---|---|
| `#program` | upcoming published events | everyone |
| `#jak-se-schazime` | published formats | everyone |
| `#prihlaseni` | sign-in (first setup while there are no logins) | signed out |
| `#pozvanka/<code>` | registration | signed out |
| `#moje` | member home: waiting for answer, my duties (.ics), when I can't, my groups, my contact | signed in |
| `#kalendar`, `#kalendar/2026-10` | month | signed in |
| `#setkani/<id>` | event detail | signed in, edit leader |
| `#setkani/<id>/osnova` | printable program („osnova“) | signed in |
| `#rozpis`, `#rozpis/2026-10` | month table | signed in |
| `#lide`, `#lide/clenove` · `pratele` · `hoste` · `deti` · `nechodi` · `doplnit` (old `vsichni`, `neclenove` still open) | registry + filter | leader; member = directory |
| `#osoba/<id>` | person card | leader; member = reduced card |
| `#domacnosti`, `#domacnost/<id>` | households | leader |
| `#tymy`, `#tym/<id>` | teams and groups, team card with members × roles | leader |
| `#formaty` | formats | signed in, edit leader |
| `#upozorneni` | conflicts („Upozornění“) | leader |
| `#nastaveni`, `#nastaveni/sablony` · `mista` · `prihlaseni` · `zaloha` | settings | leader |
| `#nastaveni/ucet` | Můj účet (`#nastaveni` shows a member the account) | signed in |

Old slugs redirect: `#udalost/<id>` → `#setkani/<id>`; `#porad/<id>`, `#setkani/<id>/porad` and
`#setkani/<id>/prubeh` → `#setkani/<id>/osnova`; `#skupiny`, `#sluzby` → `#tymy`; `#skupina/<id>` →
`#tym/<id>`; `#nastaveni/formaty` → `#formaty`; `#kolize` → `#upozorneni`. An empty or unknown hash opens
`#kalendar` for leaders, `#moje` for members and `#program` for visitors (`#prihlaseni` while there are
no logins). A member opening a leader route lands on `#moje`; a visitor opening an app route lands on
`#prihlaseni` and, after signing in, on the route they asked for (`S.afterSignIn`).
Inside a screen the UI still hides what members must not see (§6).

Person card: left column is owned by the registry (contact, household, membership, consent, note,
login); right column shows read-only blocks from other modules with a link to where they are edited
(groups and roles, upcoming duties, availability and limits, conflicts).

Picking people (`ui/picker.js`): one picker for event slots, program leaders, group members and
households. With an event and a role it ranks `candidates()` and shows the reasons as pills (solid =
error); pills **Umí to · Celý tým · Všichni lidé** switch the pool. The search always covers the whole
registry (former and paused people included). For a leader, a search adds „+ Nový člověk „…““: a small
form (first name, last name, phone, e-mail – split from the query) that warns about similar names,
creates a minimal card (`guest`, `needsReview`), optionally adds the person to the team (the role as
`learning`) or group, and picks it in one step. Enter picks the first row.

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
