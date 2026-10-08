# Zvonec: build spec for the platform and the data model

This file is the complete brief for a coding agent (for example OpenAI Codex) that builds Zvonec or rebuilds it from
scratch. It describes the platform as it runs today in `docs/zvonec/one/` („Zvonec One“), on the shared data layer in
`docs/zvonec/lib/`.

What wins when sources disagree:
1. **Code** in `docs/zvonec/lib/**` and `docs/zvonec/one/**`.
2. **This file.**
3. The top „Update …“ notes of `zvonec/design/one/DESIGN.md`, then `zvonec/design/one/CODEX.md` (pixel-level UI
   rules), then the older sections of DESIGN.md and `zvonec/ARCHITECTURE.md`.

All names in examples are fictional demo people from `docs/zvonec/lib/demo.js` (Radim Kovář, Martina Dvořáková,
Jana Nováková). Never use real church data for development, examples or tests.

Contents:
0. Working rules for the agent
1. Product
2. Access levels and privacy
3. Platform and constraints
4. Storage, sync and backup
5. Data model
6. Domain logic
7. Information architecture and routes
8. The UI system
9. Screens
10. Public web and public.json
11. Notifications
12. Tests and acceptance
13. Build order
14. Open decisions

---

## 0. Working rules for the agent

Copy these into `AGENTS.md` if the agent reads that file.

- **Language.** Everything about development is English: identifiers, file and folder names, CSS classes and custom
  properties, data keys and stored enum values, comments, tests, commit messages, PR titles and bodies. Everything
  people read is Czech: UI text, URL slugs people see (`#kalendar`, `#pozvanka/…`), downloaded file names, the commit
  messages the app writes into the data repo, the user guide `zvonec/README.md`.
- **Czech voice.** One kind voice in tykání.
  - Actions (buttons, menu items, action links, aria-labels of icon buttons) are imperative 2nd person singular:
    „Přidej setkání“, „Ulož“, „Přihlas se“, „Zruš filtr“.
  - Page, section and dialog titles are nouns, never infinitives: „Přihlášení“, „Nové setkání“, „Úprava setkání“.
    Established exceptions: „Nový člověk“, „Nová skupina“.
  - Search placeholders are „Hledej“ + one noun („Hledej setkání“). Confirms ask „Chceš …?“.
  - Natural Czech, no calques.
- **No build step.** Static vanilla ES modules. No framework, no bundler, no npm runtime dependencies.
- **Strict CSP.** No inline scripts or styles, never `innerHTML`. DOM is built with `h()`.
- **Personal data** lives only in the private data repo. Never in this public repo, never in `public.json`, never
  in `access.json` (no names there), never in test fixtures other than the fictional demo.
- **Secrets.** The GitHub token is never in code, logs or the repo. It exists only sealed inside `access.json`.
- **Tests** run with `node --test zvonec/test/*.test.mjs` and must stay green. Domain logic is pure functions over
  plain data, tested without a browser.

---

## 1. Product

**Zvonec** („the bell“) plans who serves at which meeting in one small church („Církev jako kráva“). Members answer
their duties; leaders fill the open slots and fix conflicts. It also keeps the church's people register and
publishes a public programme („Pastva“).

Three layers with a one-way dependency:
1. **Lidé** (people): people, households, membership, birthdays, missing data. Imports nothing.
2. **Skupiny** (groups): týmy (teams) with roles and skills („umí“ / „učí se“), skupinky (small groups), vedení
   (leadership). Imports people.
3. **Setkání** (meetings): templates, events, series, the people needed per role, duties (assignments), the Osnova
   (order of service), formats, places, availability, serving limits. Imports people and groups.

Each screen answers one question:

| screen | question |
|---|---|
| Moje | When do I serve, and what do I still have to answer? |
| Obsazení | Whom do we still need, and what is wrong? (leaders) |
| Kalendář | What is coming up? |
| Lidé | How do I reach someone? |
| Skupiny | Who is in which team, who leads it, who can do what? |
| Setkání | Everything about one meeting: who serves, the Osnova, the place. |

---

## 2. Access levels and privacy

Stored values and Czech labels: `admin` „správce“, `leader` „vedoucí“, `member` „člen“, `invite` „pozvánka“.
Rank: member 1 < leader 2 < admin 3; `can(level)` compares ranks. An access level and a team role are different
things and never share a name.

| | člen (member) | vedoucí (leader) | správce (admin) |
|---|---|---|---|
| Navigation | Moje, Kalendář, Lidé, Skupiny | + Obsazení, the group „Zdroje“ (Šablony, Formáty, Místa), „Správa“ in the person menu (Přístupy, Nastavení sboru) | the same items as a leader |
| Duties | answers own duties (Můžu / Nemůžu); sees the whole Rozpis, read-only | plans everything: meetings, needs, picker, auto-fill, overrides, conflicts, Břemeno | same |
| People | names and households; phone and e-mail only when the person shared them | edits people, households, groups, roles, archive; invites | same |
| Formáty, Místa | read-only, reached by links | edit | edit |
| Access | – | invites; manages member and invite logins | + „Změň přístup“, „Vyměň klíč“, „Nahraj zálohu“ |

Privacy rules (GDPR; membership of a church reveals religion, GDPR Art. 9):
- A member never sees another person's membership, birth date, note, consent or access. Membership is never printed.
- Contact visibility (`seesContact`): leaders, the person themself, or anyone when the person set
  `showInDirectory`.
- An availability reason is visible only to leaders and the person.
- `person.note` is for leaders only and must never hold health, money or pastoral notes (the form says so).
- An invite always creates a člen. Only an admin raises the level.
- **Hiding data from members is a UI rule only.** Every login unseals the same GitHub token, which can read every
  data file. Document this; do not pretend otherwise.

---

## 3. Platform and constraints

### 3.1 Stack
- GitHub Pages serves `docs/`. The app is `docs/zvonec/one/index.html` + `app.js`. Shared code:
  `docs/zvonec/lib/**` (pure domain logic and storage), `docs/zvonec/ui/state.js` (shared state), the kit in
  `docs/zvonec/one/ui/`, styles in `docs/zvonec/one/css/{tokens,kit,shell,…}.css` and
  `docs/zvonec/css/palettes.css` (generated by `zvonec/palettes.mjs`).
- The private data repo (`<owner>/church-data`) holds the data and runs two workflows copied from
  `zvonec/data-repo/`: `web.yml` (publishes the site and `public.json`) and `check.yml` (runs the conflict check).
- GitHub Actions in this repo run the tests (`test` job).

### 3.2 Content Security Policy (meta tag)
```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:;
connect-src 'self' https://api.github.com; frame-src https://www.openstreetmap.org; object-src 'none';
base-uri 'none'; form-action 'none'
```
- All DOM comes from `h(tag, props, ...children)` (`one/ui/h.js`). Text always goes in as text nodes; `class` takes
  arrays; `dataset`; `on*` props attach listeners.
- Values known only at run time (layer z-index, popover position, bar widths) are set through `el.style.x` (CSSOM),
  which the CSP allows. Never a `style` attribute in markup.
- Fonts are self-hosted: Schibsted Grotesk (UI), Agrandir Narrow Black (h1, arch numerals, minutes number, empty
  headline), Agrandir Grand Heavy (wordmark „církev jako kráva“).

### 3.3 Modes
`boot()` fetches `../access.json` next to the app.
- **Live** (the file exists): the published logins are loaded, `repo.json` gives `{ owner, repo }`, signed-out
  visitors get `public.json`. Signing in unseals the GitHub config and creates a `GithubStore`.
- **Demo** (no file): a `LocalStore` in localStorage key `zvonec-demo`, seeded on first run by
  `createDemo(today())` from `lib/demo.js`. The viewer starts as admin Radim Kovář. „Podívej se očima druhých“
  switches to leader Martina Dvořáková, member Jana Nováková, or a generic member / leader / admin. Public data is
  built on the fly with `buildPublic`.
- **First run** (live, no logins): „Nový Zvonec“ asks for the GitHub key, repo owner and name, the first admin, and
  the base data („Z ukázky“ / „Žádný“).

### 3.4 Sign-in and the sealed token
- One fine-grained personal access token, limited to the data repo, with Contents: Read and write.
- Every login has an RSA-OAEP-2048 key pair.
  - The private key is encrypted with AES-GCM under a PBKDF2 key: SHA-256, 310 000 iterations,
    salt = SHA-256(`cirkevjakokrava-zvonec:login`)[0..16], material = `foldName(name) + "\0" + NFC(password)`.
    `foldName` removes diacritics and case, so „Diakritika a velká písmena nevadí.“
  - `lookup` = hex of bits 32..48 of the derived key; it finds the login record without a name.
  - `gh` = the GitHub config `{ t: token, o: owner, r: repo, c: 'data', v: 'main' }` sealed to the public key.
  - `resealAll` swaps the token for every login without new passwords („Vyměň klíč“).
- „Pamatuj si mě“ stores `zvonec-me` = `{ id, priv }` in localStorage; otherwise sessionStorage.
- No password reset. A leader sets a new password („Nastav nové heslo“).
- A signed-out visitor following an app link signs in first, then lands on that route (`S.afterSignIn`).
- **Invite**: a leader creates a login with `access: 'invite'`, name `invite`, password = a random code, valid
  14 days, single use. The link is `#pozvanka/<kód>`. Registering creates or updates the person (`registeredAt`,
  `consentDate`; a newcomer stays `guest`), stores the roles they chose as `learning`, and replaces the invite with
  a `member` login.
- Access changes take effect „za pár minut“: `access.json` is republished by the data repo's `web.yml`.

### 3.5 Theming
- `<html data-palette>` sets every palette token; One maps them to its role tokens (`one/css/tokens.css`).
- Three choices: **Krém a hlína** (`cream-clay`, light), **Hlína a růžová** (`clay-pink`, dark), **Podle zařízení**
  (no attribute; follows the device). Stored in localStorage `zvonec-palette`; can be set by
  `?paleta=krem-hlina|hlina-ruzova|zarizeni` or the older `?rezim=svetly|tmavy`.
- The picker is three 44 px „bullseyes“ (ring = ground, dot = ink; Podle zařízení = two halves). A tap applies.
- Print always uses white paper.

### 3.6 Keyboard
„/“ focuses the search · „N“ clicks the `[data-primary]` main action · Esc closes the top layer, then the pane ·
← / → change the month at ≥ 600 · Ctrl/⌘ Z runs the newest toast's „Vrať“.

---

## 4. Storage, sync and backup

### 4.1 Data repo layout

| path | contents |
|---|---|
| `data/people.json` | `{ schema: 2, people: [], households: [] }` |
| `data/groups.json` | `{ schema: 2, groups: [], roles: [], groupMembers: [] }` |
| `data/events.json` | `{ schema: 2, eventTypes: [], events: [], series: [], formats: [], places: [], availability: [], servingLimits: [] }` |
| `data/settings.json` | `{ schema: 2, settings: {…} }` |
| `data/images/<name>` | Pictures. Name matches `/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(webp\|jpe?g\|png)$/`. The app creates `i-xxxxxxxx.webp\|jpg`, at most 1600 px, about 400 kB. Records reference the file name only. Sync never touches images. |
| `access.json` | `{ v: 2, logins: [] }`: sealed logins, no names. Published to Pages. |

Serialisation: `JSON.stringify(json, null, 1) + "\n"`.

In memory the app holds one flat object:
`{ people, households, groups, roles, groupMembers, eventTypes, events, series, formats, places, availability,
servingLimits, settings }`.

`normalize()` runs on every load:
- missing collections become `[]`; non-objects are dropped;
- settings are merged over `defaultSettings()`;
- record defaults: person without `membership` → `{ status: 'guest' }`; role with a non-integer `count` → 1;
  eventType → `placeIds: []`, `needs: []`; event → `placeIds`, `needs`, `assignments` default to `[]`;
- legacy `event.publicNote` becomes `description` (an existing `description` wins);
- unknown top-level keys are kept; the `schema` envelope key is dropped.

### 4.2 GitHub store
- Contents API `https://api.github.com/repos/{o}/{r}/contents/{path}` with `Authorization: Bearer <token>`,
  `X-GitHub-Api-Version: 2022-11-28`, `cache: 'no-store'`.
- The local store (demo) mirrors it: `{ files: { [path]: { sha, json } | { sha, base64 } } }`, shas are counters.

### 4.3 Saving (`Sync`)
- A screen mutates `S.data` in place, then calls `change(note)`. That recomputes conflicts, queues a save and
  re-renders.
- Debounce 1500 ms. One save at a time. Only files whose collections differ from `base` are written, one PUT per
  file, with that file's last sha.
- Status: `saved | pending | saving | error | offline` (offline = network status 0). On failure the notes are kept.
- Save line (top-centre capsule): „Ukládám…“ appears only after 1 s; on failure „Změny se neuložily.“ +
  [Zkus to znovu]; offline „Chybí připojení k internetu. Zvonec změny uloží, až se připojení vrátí.“
  `beforeunload` warns while anything is unsaved.
- **Commit message**: `Zvonec: <first 3 notes joined by ", ">`, then ` a N další` (N ≤ 4) or ` a N dalších`.
  Without notes: `Zvonec: úprava`. Notes are short Czech phrases: `Petr na Zvuk 11. 10.`, `vráceno: …`,
  `nový člověk …`, `smazaná karta …`. Other messages: `Zvonec – přístupy: <msg>`, `Zvonec: obrázek k setkání`,
  `Zvonec: obrázek smazán`, `Zvonec: založení`, `Zvonec: registrace <jméno>`, `Zvonec: ukázka`.

### 4.4 Conflicts and merge (`lib/store/merge.js`)
A PUT refused with 409, 422, or 404 with a sha raises `Conflict`. The file is re-read and three-way merged, up to
3 attempts.
- Lists merge per record `id`. Order follows theirs; my new records go last.
- A field changed on one side takes that side. Changed on both sides: mine wins, except nested `id`-lists, which
  merge per id.
- Deleted by them and untouched by me: deleted. Edited by me and deleted by them: my edit survives.
- `settings` merges per key, recursively.
- **Never mass-delete** (`mergeSafe`):
  - A missing remote file: mine is written back without a sha; other missing data files are recreated; warning
    `{ kind: 'recreated', paths }`.
  - If a merge would drop at least 3 of my records **and** more than half of a collection
    (`MASS_DELETION_MIN = 3`), the records are kept; warning `{ kind: 'massDeletion', path, collections }`.
- Changes made during the save are re-merged into memory.

### 4.5 Refresh
On focus, on visibilitychange and every 60 s, only while `status === 'saved'`: list `data/` once, re-read files
whose sha changed, three-way merge, then toast „Zvonec načetl, co mezitím uložili ostatní.“ Leaders also re-read
`access.json`.

### 4.6 Direct read-modify-write
`store.update`: 4 retries with a random 300–1200 ms wait. Used for `access.json` (`updateLogins`), first setup
(`saveAll`) and invite registration (edits `data/people.json` and `data/groups.json` directly).

### 4.7 Undo
- Reversible actions run at once. Their toast has „Vrať“. Undo is an in-memory closure (for example a JSON snapshot
  of `event.assignments` or the previous status). Undoing is a new change with the note `vráceno: …`, so it is a
  new commit, never a git revert. Toast after undo: „Vráceno.“
- Irreversible actions ask first in a confirm: deleting an event, household, group, role, template, format, place
  or person card; revoking a login; restoring a backup.

### 4.8 Backup
- Download (leaders): `zvonec-YYYY-MM-DD.json` = `{ schema: 2, ...normalize(data) }`, without access.
- Upload (admin only): `readBackup` rejects the old format (keys `lide|udalosti|sluzby|nastaveni`) and needs at
  least one collection array. Confirm „Chceš nahradit všechna data zálohou?“, then `replaceAll` saves everything.

---

## 5. Data model

### 5.1 Conventions
- Dates are `YYYY-MM-DD`. Date-times are local Europe/Prague `YYYY-MM-DDTHH:mm`, stored as text and compared as
  strings. There are no UTC timestamps in the data.
- `?` = optional. Empty strings and false flags are deleted, not stored („set if truthy, else `delete`“). Boolean
  flags are stored as `true` only (exception: `event.public`, which the form writes as a boolean).
- **IDs**: `randomId(prefix)` = prefix + 8 random base36 characters. The demo uses readable ids (`p01`, `e0001`,
  `r-sound`, `g-tech`, `l-monta`, `t-sunday`, `s-sunday`, `f-sermon`).

| prefix | entity | prefix | entity |
|---|---|---|---|
| `p` | person | `s` | series |
| `h` | household | `i` | program item |
| `g` | group | `a` | assignment |
| `r` | role | `f` | format |
| `t` | event type (Šablona) | `l` | place |
| `e` | event | `v` | availability |
| `k` | login | | |

Deterministic ids: groupMember = `<groupId>~<personId>`; servingLimits id = `personId`; image = `i-xxxxxxxx.ext`.

### 5.2 Settings (`data/settings.json`)
```js
defaultSettings() = {
  churchName: 'Církev jako kráva',
  timezone: 'Europe/Prague',
  defaults: { maxPerMonth: 4, maxConsecutiveWeeks: 3 },
  rules: { essentialDaysBefore: 7, unconfirmedDaysBefore: 5, childAge: 15 },
}
```
Optional: `address` (one line, shown on Pastva); `mainPlaceId` (the usual place; prefills new templates and events;
cleared when that place is deleted); `rules.openDaysBefore` (default 7 in `scheduling.js DEFAULT_RULES`).

UI ranges: `maxPerMonth` 1–31 · `maxConsecutiveWeeks` 1–52 · `*DaysBefore` 0–60 · `childAge` 1–25
(label „Dospělý je od“).

### 5.3 person (`people.json`)

| field | type | notes |
|---|---|---|
| `id` | `"p…"` | |
| `firstName` | string, required | |
| `lastName?` | string | |
| `nickname?` | string | Shown instead of the first name (`displayName`). |
| `phone?` | string | Not allowed for children. |
| `email?` | string | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Not allowed for children. |
| `householdId?` | → household | |
| `birthDate?` | `"YYYY-MM-DD"` or `"YYYY"` | Parsed from „8. 6. 1984“, „1984“ or ISO. Year 1900..now, not in the future. |
| `membership` | object, required | `{ status, since?: date, until?: date, previous?: status }`; default `{ status: 'guest' }` |
| `consentDate?` | date | Consent to keep the data. |
| `registeredAt?` | date | Came in through an invite. |
| `showInDirectory?` | `true` | Others may see phone and e-mail. Stored only with a phone or e-mail; never for a child. |
| `needsReview?` | `true` | Quick card created while planning. Cleared when a last name is set or the card is archived. |
| `note?` | string | Leaders only. |

`membership.status`:

| value | label | form choice |
|---|---|---|
| `member` | člen | Člen |
| `regular` | přítel | Přítel |
| `guest` | host | Host (default) |
| `former` | v archivu | never offered; set only by archiving |

`previous` = the status before archiving; `until` = the archive day.
**Child** is derived, never stored: age < `settings.rules.childAge`. Unknown age counts as an adult.

### 5.4 household
`{ id: "h…", name: string (required), address?: string (one line) }`. Deleting a household removes `householdId`
from its people.

### 5.5 group (`groups.json`)
`{ id: "g…", name, kind, description?, archived?: true }`
- `kind`: `team` „tým“, `community` „skupinka“, `leadership` „vedení“. Chosen at creation only.
- Only `team` groups have roles and feed planning.
- Archived groups are hidden from pickers, the skill matrix, `peopleForRole` and `servingLoad`.

### 5.6 role
`{ id: "r…", groupId, name, count, essential?: true, adultsOnly?: true, childcare?: true,
window?: { startMin, endMin? }, combinableWith?: [roleId] }`
- `groupId` must be a `team`. `count`: integer ≥ 1 (UI 1–10), the default people per event.
- `essential` „Bez toho to nepůjde“ · `adultsOnly` „Jen pro dospělé“ · `childcare` „Je s dětmi“.
- `window` „Jen část setkání“: minutes from the event start. `startMin` −60..240; `endMin` 0..300, where 0 or
  missing = until the end; `endMin > startMin`.
- `combinableWith` „Jde naráz s“: a pair is allowed if either side lists it; the UI writes both sides.

### 5.7 groupMember
`{ id: "<groupId>~<personId>", groupId, personId, leader?: true, roles?: { [roleId]: "trained" | "learning" },
since?: date }`
- Skill levels: `trained` „umí“, `learning` „učí se“; a missing key = „neumí“. Role keys belong to the same group.
- `leader` is labelled „Vede tým“ / „Vede skupinku“ / „Předsedá“ by group kind. A group can have several leaders.

### 5.8 eventType (UI „Šablona“)
`{ id: "t…", name, kind, startTime: "HH:mm", minutes: 5–1440, placeIds: [], needs: [need],
program?: [{ formatId, minutes }], groupId?, weekday?: 0..6 (0 = Monday), public?: true, description?, image?,
archived?: true }`
- `weekday` prefills the calendar; without it, it is inferred from the template's events.
- An archived template is not offered for new events.

### 5.9 event
`{ id: "e…", title, kind, typeId?, start, end, placeIds: [], seriesId?, cancelled?: true, groupId?, note?,
needs: [need], program?: [programItem], assignments: [assignment], attendance?: { adults?, children? },
public?: boolean, description?, image? }`

`kind` (UI „Účel“):

| value | label | icon | hue |
|---|---|---|---|
| `service` | Nedělní setkání | sun | rose |
| `rehearsal` | Zkouška | music | blue |
| `smallGroup` | Skupinka | home | teal |
| `event` | Akce | star | plum |

- `end` may pass midnight. If the form's end ≤ start, the end moves to the next day. Default length 60 min.
- `groupId` = „Pro koho“; empty = „Celý sbor“.
- `note` = „Pro tým“: internal, never public.
- `description` = „Popis pro web“. `public` = „Ukaž na webu“; only `true` publishes.
- Cover image: the event's `image`, else its template's, else a generated arch cover in the kind's hue.
- `attendance` („Kolik lidí přišlo“, 0–999 each) is entered after the start. Zeros are dropped. Never per person.

### 5.10 need
`{ roleId, count: int }`. A missing count counts as 1.

### 5.11 series
`{ id: "s…", typeId?, step: "weekly" | "biweekly" | "monthly", from: date, until: date }`
- UI choices: Ne · Týdně · Ob týden · Měsíčně.
- Events stay materialised; each points to its series by `seriesId`.

### 5.12 programItem (UI „bod“ of the „Osnova“)
`{ id: "i…", formatId, minutes: int ≥ 0, title?, personId?, personName?, note? }`
- `title` overrides the format name. `personId` overrides the leader taken from the format's lead role.
- A „Vlastní bod“ has `formatId: ''` and a `title`.
- `personName` is a snapshot written when the person's card is deleted.

### 5.13 assignment (a duty)
`{ id: "a…", roleId, personId, status, personName?, override?: { reason, by?: personId, at?: date } }`
- `status`: `proposed` „čeká na potvrzení“ (short „čeká“), `confirmed` „potvrzeno“, `declined` „nemůže“.
- Every new or replaced assignment starts as `proposed`. Replacing the person also deletes `override`.
- `override` is the „Vím o tom“ / „Výjimka“ reason („Proč to půjde“, max 120 characters).

### 5.14 format (UI „Formát“)
`{ id: "f…", name, minutes: 1–600, leadRoleId?, why?, how?, link?, needs?: [need], public?: true }`
- `why` „Proč to děláme“ · `how` „Jak to probíhá“ · `link` „K přečtení“ (must match `^https?://`).
- Public fields: name, minutes, why, how.

### 5.15 place (UI „Místo“)
`{ id: "l…", name, shared: boolean, partOf?: placeId, address?, lat?: number, lon?: number }`
- `shared` = „Vejde se sem víc setkání naráz“.
- `partOf` makes it a room in a building; one level only. A room inherits the building's address and coordinates
  (`resolvePlace`); the form stores none for rooms.
- `lat` and `lon` both or neither. The parser accepts „49.594, 18.010“ and Mapy.cz N/E forms; |lat| ≤ 90,
  |lon| ≤ 180.

### 5.16 availability (UI „Kdy nemůžu“ / „Kdy nemůže“)
`{ id: "v…", personId, from: date, to: date, reason?: string (≤ 80) }`. Whole days, both ends inclusive. Legacy
`note` is read as `reason`.

### 5.17 servingLimits (UI „Kolik toho zvládne“)
`{ id: <personId>, personId, maxPerMonth?: int, maxConsecutiveWeeks?: int, paused?: true }`. Stored only when it
differs from `settings.defaults`. `paused` = „Pauza od služeb“.

### 5.18 login (`access.json`)
`{ id: "k…", personId?, access, created: date, expires?: date, lookup, pub: { kty, n, e }, iv, ct, gh,
invitedBy?: personId }`
- `invite` logins cannot sign in to the app; `isExpired` when `expires < today`.
- Leaders manage member and invite logins; admins manage all.

### 5.19 References

| from | to |
|---|---|
| person.householdId | household |
| role.groupId | group (kind `team`) |
| role.combinableWith[] | role |
| groupMember.groupId / personId; `roles` keys | group / person; roles of the same group |
| eventType.placeIds / groupId / needs[].roleId / program[].formatId | place / group / role / format |
| event.typeId / seriesId / groupId / placeIds | eventType / series / group / place |
| event needs, assignments, program | role, person, format |
| format.leadRoleId, format.needs[].roleId | role |
| place.partOf | place |
| series.typeId | eventType |
| availability.personId, servingLimits.personId | person |
| settings.mainPlaceId | place |
| login.personId, login.invitedBy | person |

### 5.20 Cascades
- **Delete a role**: remove it from every `combinableWith`, skills, event and template needs, assignments, and
  formats (`leadRoleId`, needs).
- **Delete a group**: delete its roles (with the role cascade) and members; remove `groupId` from templates and
  events.
- **Delete a format**: remove it from every program.
- **Delete a template**: remove `typeId` from events and series.
- **Delete a place**: blocked while it has rooms or upcoming events („… teď smazat nejde“); otherwise remove it from
  events, templates and `mainPlaceId`.
- **Delete an event**: delete its image when nothing else uses it.
- **Delete a household**: remove `householdId` from its people.
- **Delete a person card**: see §6.8.

Cross-file operations are not atomic. Dangling `personId`s are tolerated and render as „Někdo smazaný“.

### 5.21 Invariants
Enforced by the demo test (`zvonec/test/demo.test.mjs`) and expected of all data:
- No unknown keys. Ids unique per collection; assignment and program-item ids unique across all events.
- Every reference resolves. `groupMember.id = groupId~personId`; its role keys belong to its group.
- Roles live only in `team` groups. `combinableWith` is symmetric.
- `event.start < event.end`; `availability.from ≤ to`; `servingLimits.id === personId`.
- Children have no phone or e-mail. Demo e-mails are fictional.

`validateData` (`lib/validate.js`) returns **warnings only**: a series `step` outside the three values; an invalid
`from` or `until`, or `until < from`; a series `typeId` to a missing template; `attendance` keys other than
`adults` / `children` or values that are not non-negative integers; `place.partOf` pointing to itself, to a missing
place or to a room; a household `address` that is not a string.

### 5.22 Form rules
- **Person**: first name required. A guest without consent keeps only the first name. The consent switch stores
  today as `consentDate`. A duplicate full name needs a second confirmation („Přidej přesto“). A child cannot have
  a phone or e-mail.
- **Limits** are integers. **Blockout** „Do“ is today or later; optionally the clashing duties become `declined` in
  the same save.
- **Role**: name required, count 1–10, window as in §5.6.
- **Template**: name required, `startTime` matches `^\d{1,2}:\d{2}$`, minutes integer 5–1440.
- **Format**: name required, link http(s). **Place**: name required.
- **Event**: title, day and start time required. Series `until` ≥ the start day.
- **Answers**: a member may change only the status of their own assignment; leaders may change any.

---

## 6. Domain logic

Everything here is pure functions in `docs/zvonec/lib/` over the in-memory data object, with `today` passed in.

### 6.1 Needs and fill
- **Full needs** (`needsOf`): `event.needs` merged with the program's needs. Each program item adds the format's
  `needs` plus `{ roleId: leadRoleId, count: 1 }`; an item with a hand-picked `personId` does not ask for the lead
  role. The same role is never added up: the larger count wins. Templates never copy program needs into `needs`.
- **`fillRatio`**: per need, `needed += count`, `filled += min(count, assignments of that role with a personId and
  status ≠ declined)`. A need for a deleted role is skipped unless the event's own needs list it. Returns
  `{ filled, needed, text: "12 z 14", complete }`.
- **`fillOf`** adds `missing = needed − filled`, `waiting` (proposed assignments with a person) and `confirmed`.
- `missingCount(roleId)` = need − non-declined assignments, never below 0.
- `slotsOf`: one slot per assignment (declined included) plus empty slots up to the count.

### 6.2 Conflicts (`lib/conflicts.js findConflicts(data, { today })`)
Conflict object: `{ key, code, severity: 'error' | 'warning' | 'info', eventId, eventIds, personId?, roleId?,
roleIds?, assignmentIds, overrideNote?, text }` (`text` in Czech).

- **Override**: an `error` that involves an assignment with `override.reason` becomes `info` and gets
  `overrideNote`.
- Sorted by severity, then event start.
- Per-person rules use assignments that are not declined, have a person, and belong to an event that is not
  cancelled. There is no date filter in the function; the UI and `check.mjs` hide conflicts of ended events.
- **Time window** of an assignment: the whole event, or the role's `window` slice. Intervals overlap only when one
  starts before the other ends; touching is fine.

| code | label | condition | severity |
|---|---|---|---|
| K1 | Dvakrát naráz | The same person has overlapping windows at two different events. | error |
| K2 | Dvě služby naráz | One event, two roles with overlapping windows, not combinable. Hint „Jednu z nich dej někomu jinému.“ unless overridden. | error |
| K3 | Nemá čas | An availability record intersects the days of the window. One conflict per record. | error |
| K4b | Zaučuje se | Level `learning`, and nobody else active in that role at the event is `trained`. | warning |
| K5 | Chybí lidi | Upcoming events only (daysUntil ≥ 0), one card per event and class. Essential gaps count when daysUntil ≤ 2 × `essentialDaysBefore`: error at ≤ `essentialDaysBefore`, warning before. Other gaps: warning at ≤ `openDaysBefore`. | error / warning |
| K6 | Nepotvrzeno | Upcoming event with daysUntil ≤ `unconfirmedDaysBefore`; one per `proposed` assignment. | warning |
| K7 | Moc služeb v měsíci | Distinct non-rehearsal events in a calendar month > the person's `maxPerMonth`. | warning |
| K8 | Neděle po sobě | Sunday `service` events in consecutive weeks; fires when the run reaches `maxConsecutiveWeeks` + 1. | warning |
| K9 | Místo je obsazené | Two non-cancelled events overlap and share a place id (rooms are separate places). | error; info when `place.shared` |
| K10 | Nikdo nehlídá děti | A household with a child: all its active adults serve at this event, none in a `childcare` role, and all their windows share a moment. | warning |
| K11 | Dítě ve službě pro dospělé | `role.adultsOnly` and the person is a child on `today`. | error |
| K12 | Málo dospělých u dětí | The event needs a childcare role, someone is assigned, and fewer than 2 distinct adults are in childcare roles. | warning |
| K13 | Je v archivu nebo má pauzu | The person is `former` or `paused`. | warning |
| K14 | Zrušené setkání | A cancelled event still has active assignments. Other per-event checks skip it. | info |
| K15 | Osnova přetéká | Upcoming event whose `programDuration` > its length. | warning |
| K16 | Problém v osnově | A program item with `personId`: person missing (warning), unavailable in the item's slice (error), former or paused (warning). | error / warning |
| K17 | Nikdo nevede | A program item without `personId` whose format's `leadRoleId` no longer exists, so nobody leads it. | warning |

K4 („Neumí“ / „není v týmu“) exists only as an info reason in the picker; `findConflicts` never emits it.
Short warning tags on a person in Kdo slouží: `WARNING_TAGS` in `one/ui/event-duties.js` („dvě služby naráz“,
„výjimka“, …). Severity words in the UI: „chyba / pozor / info“.

### 6.3 Limits and load (`lib/scheduling.js`)
- `limitsOf` = the person's `servingLimits` over `settings.defaults` over `{ 4, 3 }`.
- `isInactive` = former or paused. `monthCount` = distinct non-rehearsal events in the month.
  `sundayStreak` = consecutive Sunday services around a day.
- **`servingLoad(data, month)`** („Kdo kolik slouží“, Břemeno): rows for non-archived adults with a skill in a
  non-archived team, plus anyone serving that month. Row: `{ person, count, limit, sundaysInRow, maxSundays,
  paused, custom, over: count > limit, overSundays }`, sorted by `count / limit` descending.

### 6.4 Candidates and the picker
`candidates(data, eventId, roleId, { today, scope, includeInactive })`:
- Pool by `scope`: `skilled` (team members with any level in the role), `team` (the whole team), `all`
  (everyone). `former` never; paused only with `includeInactive`.
- Reasons: K4 info („není v týmu“, „v téhle roli zatím bez zkušeností“), K4b info („učí se“), K3 error („nemůže“),
  `declined` error (already declined this duty), K1 error („jinde: …“), `already` error („už tu je“), K2 error,
  K11 error („dítě“), K8 warning (streak ≥ max), K10 warning, K13 warning, K7 warning (count ≥ max, this event
  excluded).
- Sort: fewer errors → fewer warnings → has a level → trained before learning → lower `monthCount` → older
  `lastServed` in that role (never served first) → Czech-collated name.

Picker behaviour (One `pickFor`):
- The `team` pool, search across `all`. People already in this role are hidden.
- A candidate with a hard error other than `declined` needs an exception reason first; it is saved as
  `override: { reason, at, by }`.
- „Přesuň sem“ moves a person whose only obstacle is another role at the same event.
- „Přidej nového člověka „…““ creates `{ membership: { status: 'guest' }, needsReview: true }`, adds them to the
  team as `learning`, and assigns them.
- Every pick is `proposed`; the toast offers „Vrať“.

### 6.5 Auto-fill and „as last time“
**„Doplň volná místa“** (`fillOpenSlots(eventIds, { teams })`):
1. Works on a `structuredClone` draft; skips cancelled and past events (end < today).
2. For each full need (optionally only chosen teams), while non-declined assignments < count: take the first
   `skilled` candidate with no error, no warning and not learning; propose them.
3. Sheet „Návrh služeb“: the leader can untick proposals, then [Zapiš N služeb].
4. On write each proposal is re-checked (`missingCount > 0`, no duplicate). Undo removes them all.
5. Slots still empty are listed under „Volná místa“ with [Vyber].

`lib proposeRemaining` is the same algorithm but counts only assignments with a person.

**„Obsaď jako minule“** (`sameAsLastTime`): the previous non-cancelled event of the same series, else of the same
template. Copy its non-declined people into roles this event needs, up to the count; skip people who are inactive,
unavailable, or busy elsewhere in that window. New assignments are `proposed`.

### 6.6 Overviews
- `openSlots(days = 21)`: missing slots in upcoming non-cancelled events, essential first.
- `unconfirmedDuties(days = unconfirmedDaysBefore, groupIds)`: proposed duties of other people.
- Obsazení (`needsFor`, 28 days): open slots + waiting duties (not mine) + non-overridden errors, per event.
- Moje „waiting“: my own upcoming, non-cancelled, `proposed` duties.

### 6.7 Series (`lib/time.js recurrences`, `lib/events.js`)
- Steps: `weekly` +7 days; `biweekly` +14; `monthly` = the same nth weekday each month (`monthlyRule`: nth 1–4,
  or −1 = last; a 4th that is also the last counts as last).
- At most 120 occurrences. The first is included; nothing after `until`.
- **`addSeries`**: copies the draft per date with new ids, no assignments, program items with new ids and no
  `personId`, no `cancelled`. A series record and `seriesId` are created only for more than one event;
  `until` = the last event's day. The form defaults `until` to start + 3 months, snapped to the rule. Live summary:
  „Každou neděli do 28. 6. · 12 setkání“.
- **`updateSeries`** (answer „I N dalších“): copies `title, kind, typeId, placeIds, groupId, note, needs, public,
  description, image` to the following events; each keeps its day but takes the new time and length.
- **`extendSeries`** („Prodluž řadu“): continues the rule from the last event (copied without people or
  attendance), or from the template when no event is left; stores or updates the record.
- **`seriesFor`**: infers `{ …, inferred: true, step | null }` for older data with no record.
- `cancelEvent` / `deleteEvent` optionally apply to the following events.
- **`createFromType`**: start = date + `startTime`, end = start + `minutes`; copies places, needs, `groupId`, a
  boolean `public`, `description`, `image` and a copy of the program.

### 6.8 Program times
`programTimes`: items follow one another from `event.start`, each `max(0, minutes)` long. `programDuration` = the
sum. `itemLeaders` = the hand-picked person, else the active assignees of the format's `leadRoleId`. `itemName` =
`title`, else the format name, else „Bod“.

### 6.9 People: age, birthdays, archive, missing data
- `age(person, onDate)`: from a full date, or the year difference when only the year is known.
- Birthdays use full dates only; 29 Feb is celebrated on 28 Feb in non-leap years; former people are excluded.
  `upcomingBirthdays` groups 12 months by month with `isToday`, `thisWeek` (Mon–Sun) and `past`.
- **`archivePerson`** („Přesuň do archivu“): `membership = { status: 'former', since?, until: today, previous }`,
  delete `needsReview`, remove their assignments from events starting now or later, clear their `personId` from
  future program items, drop `leader` on their groupMembers (the records stay). Live mode also revokes their
  logins.
- **`restorePerson`** („Vrať z archivu“): status = `previous`, else `regular`. Released duties and leading do not
  come back.
- **`deletePersonKeepHistory`** („Smaž kartu“): past assignments and program items get `personName` = the full
  name; future duties are released; the card, groupMembers, availability and servingLimits are removed.
  `personOrSnapshot` returns `{ id, firstName, lastName?, deleted: true }`.
- **Overdue archive**: archived more than a year ago (`ARCHIVE_KEEP_YEARS = 1`) or without `until`. Lidé ⋯ offers
  „Smaž staré karty z archivu“ once such cards exist.
- Former people are excluded from filters and search, pickers and candidates, servingLoad, birthdays,
  missingData, group lists (`membersOf`, `leadersOf`, `peopleForRole`, `skillMatrix`) and the household block.
- **`missingData`** (never for former people), in order: `review` (needsReview) · `lastName` · `contact` (an adult
  with neither phone nor e-mail) · `consent` (an adult regular or guest whose card holds more than a name, without
  `consentDate`) · `household` (a child without a household).

### 6.10 Calendar export
`lib/ics.js` builds .ics files: „Moje služby“ (`sluzby-<jmeno>.ics`), „Celý kalendář“ (`kalendar-sboru.ics`), and
one public meeting on Pastva. No live subscriptions (that would publish names).

---

## 7. Information architecture and routes

### 7.1 Widths
| class | width | navigation | a detail opens as |
|---|---|---|---|
| phone | < 600 | tab bar at the bottom | a page; layers are bottom sheets |
| tablet | 600–1199 | rail 88 (600–899) or sidebar 248 (≥ 900, CSS only) | a page; layers are dialogs and popovers |
| desktop | ≥ 1200 | sidebar 248 | a **pane** beside the list |

JS re-renders when 600 or 1200 is crossed. Gutters 20 / 32 / 40; title top 16 / 32 / 40.

### 7.2 Navigation table (`one/ui/nav.js`)

| id | label | icon | route | min level | group | count badge |
|---|---|---|---|---|---|---|
| moje | Moje | home | `#moje` | member | main | duties waiting for my answer |
| obsazeni | Obsazení | check-circle | `#obsazeni` | leader | main | tasks of the next 4 weeks in my Filtr scope |
| kalendar | Kalendář | calendar | `#kalendar` | member | main | – |
| lide | Lidé | people | `#lide` | member | main | – |
| skupiny | Skupiny | teams | `#lide/skupiny` | member | main | – |
| sablony | Šablony | layers | `#sablony` | leader | Zdroje | – |
| formaty | Formáty | book | `#formaty` | leader | Zdroje | – |
| mista | Místa | pin | `#mista` | leader | Zdroje | – |

- **Phone tab bar** (64 + safe area): member [Moje][Kalendář][Lidé][person]; leader
  [Moje][Obsazení][Kalendář][Lidé][person]. Skupiny is the first row of Lidé; the Lidé tab is lit on Skupiny and
  navigates back to Lidé from there. The person tab shows the avatar + first name or nickname and opens the person
  menu. Badges at the icon's top right; an 8 px dot for waiting invites. Tapping the current tab scrolls to the
  top. The bar hides while the keyboard is up.
- **Rail** (600–899): „ck“ mark; cells 88 × 64 (icon 24 + label 13/500); a 32 × 1 divider before Zdroje; avatar
  40 at the foot opens the person menu as a popover.
- **Sidebar** (≥ 900, 248): wordmark (→ `#moje`); items M 44, r12, 3 apart, icon 20, label 15/500, count capsule
  at the end; group title „Zdroje“ 13/620 in `--ink-2`; foot 56 pinned (avatar 36, name 15/620, level word,
  invites dot) opens the person menu above it.
- **Current item**: `--ground` fill inside an inset 1 px `--edge` hairline, label 620, plus a detached 3 × 16
  `--mark` bar at the nav's left edge (sidebar, rail). On a phone the 56 × 32 icon niche takes the look. On
  person-menu pages the foot or avatar is current. `--pick` is reserved for selection in content.
- **Person menu** (`one/ui/me-menu.js`; phone bottom sheet, ≥ 600 popover 320, same contents):
  1. avatar row, meta „Můj účet · správce“ › `#ucet`;
  2. „Kdy nemůžu“ › with the next range as meta („24.–26. 10. · dovolená“);
  3. „Barvy“ + the three bullseyes (the menu stays open);
  4. **Zdroje** (phone only, leaders): Šablony · Formáty · Místa;
  5. **Správa** (leaders): Přístupy (pill „1 čeká“) · Nastavení sboru;
  6. „Veřejný web“ › „Pastva, jak ji vidí návštěvníci“;
  7. **Ukázka** (demo only): „Podívej se očima druhých“ · „Začni ukázku znovu“ · „Začni načisto“;
  8. „Odhlas se“ in `--no-ink`.
- On a phone, screens opened from the person menu get a top bar „‹ Zpět“ (history back, else `#moje`); Skupiny
  gets „‹ Lidé“.

### 7.3 Routes (hash, Czech slugs)

| route | screen | access |
|---|---|---|
| `#moje[/<eventId>]` | Moje | member |
| `#obsazeni[/<eventId>]` | Obsazení | leader |
| `#kalendar` | the remembered view | member |
| `#kalendar/seznam[/<eventId>]` | Seznam | member |
| `#kalendar/mesic/<YYYY-MM>[/<YYYY-MM-DD>]` | Měsíc | member |
| `#kalendar/rozpis/<YYYY-MM>[/<eventId>\|/bremeno]` | Rozpis (+ Břemeno, leaders) | member |
| `#setkani/<id>`, `#setkani/<id>/osnova` | Setkání page, Osnova page | member |
| `#lide[/<personId>]` | Lidé | member |
| `#lide/skupiny[/<groupId>[/<personId>]]` | Skupiny | member |
| `#lide/vypis[/<personId>]` | Podrobný výpis | leaders ≥ 900; anyone ≥ 1200 |
| `#lide/domacnost/<id>` | Domácnost | leader |
| `#sablony[/<id>]` | Šablony | leader |
| `#formaty[/<id>]`, `#mista[/<id>]` | Formáty, Místa | member (read-only) |
| `#pristupy`, `#nastaveni` | Přístupy, Nastavení sboru | leader |
| `#ucet`, `#kdy-nemuzu` | Můj účet, Kdy nemůžu | member |
| `#prihlaseni[/zalozit]`, `#pozvanka/<kód>` | sign-in, Nový Zvonec, invite | signed out |
| `#pastva[/<id>]` | public web | public |
| `#kit` | component specimen | leader |

Defaults: `#kalendar` opens the view last chosen in the switch (`zvonec-one-calendar-choice`); without a choice
Měsíc at ≥ 1200, Seznam below. `#lide` at ≥ 1200 opens Podrobný výpis unless „Ukaž jednoduchý seznam“ was chosen
(`zvonec-one-people-view`).

Redirects (old slugs keep working): `prehled|domu|vice` → `moje`; `nemuzu` → `kdy-nemuzu`; `program[/…]` →
`pastva`; `jak-se-schazime` → the Pastva anchor; `osoba/<id>` → `lide/<id>`; `tym|skupina/<id>` →
`lide/skupiny/<id>`; `tymy|skupiny|sluzby` → `lide/skupiny`; `lide/tabulka` → `lide/vypis`;
`lide/<clenove|pratele|hoste|deti|doplnit|narozeniny|archiv|…>` → `#lide` with that Filtr preset; `udalost/<id>` →
`setkani/<id>`; `porad|prubeh` → `osnova`; `upozorneni|kolize` → `#obsazeni` with Filtr „Něco nesedí“;
`rozpis[/m]` → `kalendar/rozpis/m`; `lide/bremeno` → Rozpis + Břemeno; `kalendar/<YYYY-MM>` → Měsíc;
`kalendar/tyden` → Seznam; `sablona/<id>`, `misto/<id>`, `format/<id>` → the plural routes;
`nastaveni/pristupy` → `pristupy`.

### 7.4 List and pane at ≥ 1200
- The frame fills the content area up to 1600: list track `clamp(400px, 100% − 32 − 480, 840px)`, pane track up to
  720, gap 32. With no pane open the list takes up to 840.
- Head rows A, B, C span the frame; the pane starts level with the content.
- Wide views (Měsíc grid, the Rozpis tables, Podrobný výpis with nobody open, Skupiny cards with nothing open) span
  both tracks.
- When the list track is under 440, the main action is icon-only.
- **Pane**: `--card`, r20, padding 24, `--lift-2`; sticky 24 under the window top while it fits, otherwise it
  scrolls with the page (never inside). Action row 44: „‹ Back“ only when drilled in; ⋯ then ✕ on the right.
  It opens only on a click. Clicking the open row, ✕ or Esc closes it. Changing only the pane keeps the list's
  scroll position.
- **Detail as a page** (< 1200, and deep links): sticky top bar 56 with „‹ <Parent>“ and ⋯; hairline once
  scrolled; column 720.

---

## 8. The UI system

Pixel-level rules live in `zvonec/design/one/CODEX.md`; tokens in `docs/zvonec/one/css/tokens.css`. A screen never
sets its own size, corner, weight, gap or colour: it uses a token or a kit component.

### 8.1 List screen head (`listScreen`)
Every band is present or absent per screen and role, never per state.
- **A**: TITLE ······ [⋯] [main action], min height 44.
  - The h1 is set in capitals by CSS (KALENDÁŘ, OBSAZENÍ, LIDÉ). Moje's greeting stays a sentence. Agrandir 40/44
    at ≥ 600; on a phone `clamp(22px, 6.4vw, 28px)` so the title and its buttons share one row.
  - ⋯ is a bare icon, aria-label „Další možnosti“, absent when empty.
  - The main action is primary M: icon-only 44 on a phone (the aria-label carries the words), icon 20 + label at
    ≥ 600. Order: ⋯ first; the main action ends at the edge.
  - Nothing ever sits in the h1 or between A and B: no chip, date, count or subtitle.
- **B** (12 under A): [⌕ Hledej … ✕] [Filtr ⁿ] on the left.
  - Search: always visible, labelled, soft tint, M 44, r12, icon inside left, ✕ clears; 320 wide at ≥ 600, the
    full row on a phone. Filters as you type; text kept per screen for the visit.
  - Filtr: soft tint, fixed 120, icon „sliders“ · „Filtr“ · a reserved count slot (capsule `--ink` on `--ground`,
    hidden at 0). aria-label „Filtr, zapnuto 2“.
  - While a filter is on, one quiet line under B: „Filtr: Slovo, Slovo · Zruš filtr“.
  - Kalendář's view switch (Seznam | Měsíc | Rozpis) is quiet words at B's right end (the chosen one on a soft
    tint). Where B is narrower than 720 it takes its own row.
- **C** (Měsíc, Rozpis only; 12 under B): [‹] [Říjen 2026] [›] ······ „Dnes“. Label 136 wide, 17/620. „Dnes“ is
  quiet words at the right end, hidden while today is on screen.
- **D** (content) starts 24 under the last control row.

### 8.2 Filtr layer
Bottom sheet on a phone, popover 360 at ≥ 600. Groups: h3 13/620 in `--ink-2`; chips (M 44 capsules, on = `--act`
fill, an 8 px hue dot for Účel) or switch rows. Choices apply at once. Phone foot: [Ukaž 12 setkání] (primary L,
live count) + [Zruš filtr] (only while something is on). Popover foot: [Zruš filtr]. Remembered per browser and
screen in `zvonec-one-filtr-<key>`. A default scope counts as a filter.

### 8.3 Empty states (`empty()`)
Arch well 88 with an icon, h2 20/620, one sentence, at most one quiet M action, 48 under the controls.
- Nothing yet: a per-screen title and sentence (see §9).
- Nothing found: „Nic tomu neodpovídá.“ / „Hledáš „…“.“ / [Vymaž hledání].
- Filtered empty: „S tímhle filtrem tu nic není.“ / „Filtr skrývá 12 setkání.“ / [Zruš filtr].
- Měsíc and Rozpis: one quiet line under the period line.
- A missing item: the well + „Možná ho někdo smazal, nebo je odkaz starý.“

### 8.4 Buttons, sizes, type
- **Three button kinds**: (1) the dark main action (`--act` / `--on-act`); (2) soft tint (`--tint`: quiet
  buttons, Filtr, „+ Přidej“); (3) bare icon (⋯, ✕, call, ‹ ›). Danger (`--no-solid`) only in confirms and
  destructive sheet buttons.
- **Heights**: S 36 (content actions, ≥ 600 only, hit area 44), M 44 (everything else), L 52 (the main action of a
  sheet or dialog foot, Můžu / Nemůžu, contact tiles, sign-in). On a phone S becomes M.
- **Radius follows height**: 10 / 12 / 14. Blocks 20 (pane, card, dialog, popover, menu, band, map). Phone sheet
  top 28. Values are capsules. Team mark 30 %. Date arch and empty well use the arch shape.
- **Weights**: labels 620 in every state; nav 500 (current 620); body 400. A state never changes the weight.
- **Type** ≥ 600: body 16/22, meta 14/20, control 15, h1 40/44, pane h1 34/36. Phone: 17 / 15 / 16, h1 34/36
  (list titles clamp as in §8.1).
- **Switch** 40 × 24 (`--switch-w`, `--switch-h`).

### 8.5 Gaps
8 between controls side by side · 12 between stacked control rows · 24 from the last control row to content ·
`--section-gap` 40 between sections · 12 from an h2 to its content · 3 between lit rows.

### 8.6 Rows (`row()`)
- Lead 40 (avatar, date arch 44 × 56, team mark, Účel mark, minutes block, pin), title 17/620 (16 at ≥ 600) +
  meta, exactly one trail item.
- Height 64 / 52 (single line) on a phone, 60 / 48 at ≥ 600.
- Hover: the whole row `--wash`, r12.
- Selected / open: `--pick` fill + a detached 3 × 16 `--mark` bar centred at the left edge; selected + hover =
  `--pick-hover`.
- The hairline belongs to the row below, inset to the text start, hidden beside a lit row.

### 8.7 Status words and marks
Always a symbol + a word, never colour alone.
- ✓ green disc „potvrzeno“ · ○ amber ring „čeká na potvrzení“ / „čeká na odpověď“ · ✕ red disc „nemůže“ (name
  struck).
- List marks: ○ 10 px amber ring = waits; ● red dot = a problem („něco nesedí“).
- **The meeting line** (Seznam, Měsíc's day list and popover) shows only the start time. Leaders get a **status tag**
  only where something is missing or waits: a soft capsule with the status ring and the words – [◔ chybí 1] on the
  error tint, [◔ 1 čeká] on the waiting tint, [◔ chybí 1 · 2 čekají] when both hold. A full meeting shows nothing.
  The tag sits in the trail from 600 up and under the words on a phone. The **status ring** has three parts:
  confirmed (green), waiting (amber), missing (red). Confirmed duties carry no tick. Obsazení keeps its to-do lines.

### 8.8 Colour
- Ink for text and links. Red (`--no-*`) only for problems. `--ink-accent` only for quiet links.
- One pink, used as itself: in Hlína a růžová it is the main action, counts, today disc and selection bar; in Krém
  a hlína only the selection tint (`--pick`, pink α .30; bar `--mark` = hlína).
- Účel hues (service rose, rehearsal blue, smallGroup teal, event plum; `--hue-fill` step 3, `--hue-mark` 11,
  `--hue-ink` 12) appear only on the Účel bar, month chips, mini-month dots, the Setkání band and tag, the Šablona
  mark and the Filtr Účel dots.
- Avatar and team hues: blue, green, plum, amber, teal (no rose).
- Status tokens: `--ok-*`, `--wait-*`, `--no-*`, `--info-*`.

| role | Krém a hlína | Hlína a růžová |
|---|---|---|
| ground | #fffaf6 | #3b2f2f |
| bar (nav chrome) | #f9e7dd | #2a2020 |
| card / overlay | #fffdfb | #3e3232 / #443636 |
| ink / ink-2 / ink-3 | #3b2f2f / #625252 / #70605f | #faebe6 / #dcc2c0 / #d5bfbe |
| act / on-act | #3b2f2f / #fffaf6 | #e6acac / #3b2f2f |
| feature (Moje card, Tvoje služba) | #fdf0ea | #433434 |

### 8.9 Layers (`one/ui/layers.js`, all mounted in `#layers`)

| kind | phone | ≥ 600 |
|---|---|---|
| sheet | bottom sheet: grabber, head 44 with h2 + ✕ „Zavři“, sticky foot | dialog S 400 / M 480 / L 640 |
| filter | bottom sheet | popover 360 |
| menu | action sheet titled by its object, rows 52 | popover 240–320, rows M 44 |
| popover | bottom sheet | popover 320 |
| confirm | sheet | dialog S 400 |

- Confirm: the question is the h2 („Chceš smazat …?“); secondary „Nech to být“; primary is danger.
- Depth ≤ 2 (form → date picker). A menu closes before a sheet opens. Each layer has its own scrim. Esc or a
  scrim tap closes the top layer.
- **Editing always happens in a layer, never inline. Destructive actions live only in ⋯.**
- **Toast**: max 2, 6 s, optional „Vrať“, ✕. Phone: centred above the tab bar; ≥ 600: bottom-left of the frame.

### 8.10 Downloads
Czech file names without diacritics: `sluzby-jana-novakova.ics`, `kalendar-sboru.ics`, `lide-2026-10-08.csv`,
`zvonec-2026-10-08.json`.

---

## 9. Screens

### 9.1 Moje `#moje[/<eventId>]` (everyone)
- A: „Ahoj, Radime“ (vocative of the nickname or first name; plain „Ahoj“ when unsure). No ⋯, no main action.
- Date line („Středa 7. října“).
- **Answer card** (`--feature`, r20), one waiting duty at a time: „Čeká na tvou odpověď“ + „1 ze 4“; date arch;
  role (a link to the meeting); „Setkání na pastvě · 10.00“; [Můžu] [Nemůžu] L 52, equal width.
  - When my Kdy nemůžu covers the day, Nemůžu is the dark button and a note reads „Ten den máš zapsáno: dovolená“.
  - Dots for 2–5 waiting duties; ← → or a swipe moves between them.
  - After an answer the next card slides in; toast „Díky, máš to potvrzené.“ / „Vedoucí uvidí, že nemůžeš.“ +
    Vrať.
  - Nothing waiting: one line „✓ Všechno máš zodpovězené.“
- **Tvoje další služby**: 6 rows (date arch, role, „event · time“; cancelled struck with pill „zrušeno“), then
  „Ukaž další N“.
- **Odmítnuté služby**: a quiet section. „Minulé služby ›“ opens a sheet „Minulé služby“ / „Poslední 3 měsíce“.
- No duties: „Zatím tu nemáš žádné služby.“ No card linked: info callout „Zvonec neví, která karta je tvoje.“
- **Obsazení** (leaders): one line linking to `#obsazeni` – „Obsazení ● chybí 1 · ● 1 problém · ○ 3 čekají ›“, or
  „✓ všechno vyřešené“ (counts in the Filtr scope of Obsazení).
- **Tvoje břemeno**: a `--feature` card – this month's duties as a big Agrandir number „3“ + „ze 4 služeb v říjnu“,
  one pip per allowed duty (filled = taken, amber = over the limit), a sentence („Ještě máš místo na 1 službu.“ ·
  „Tenhle měsíc máš plno.“ · „O 1 službu víc, než zvládneš.“ · „Máš pauzu od služeb. Zvonec tě do nich nenavrhne.“),
  then three small numbers: Sundays in a row („2 ze 3 · nedělí po sobě“), this year's past duties („18 · služeb
  letos“), the most frequent role („Kázání · nejčastěji“). Leaders: S „Kolik zvládnu“ → the limits sheet.
- **Kdy nemůžu**: my ranges (rows → Uprav · Smaž) and „+ Přidej“.
- Nothing about others: no meeting list of the week, no staffing blocks.
- **≥ 1200**, two columns: left the answer card, Tvoje další služby, Odmítnuté, Minulé služby; right the Obsazení line,
  Tvoje břemeno and Kdy nemůžu. A clicked duty replaces the right column as the pane; ✕ brings it back. Below 1200
  one column: answer card · Obsazení · Tvoje břemeno · Tvoje další služby · Odmítnuté · Kdy nemůžu · Minulé služby;
  a duty opens the meeting page („‹ Moje“).

### 9.2 Obsazení `#obsazeni[/<id>]` (leaders; `#ukoly` redirects)
A list of tasks for the next 28 days, by the kind of work (not a third calendar).
- A: „Obsazení“ · ⋯ (Vytiskni rozpis) · **„Doplň volná místa“** (icon-only on a phone).
- B: „Hledej úkol“ (role, meeting title, place, Účel, person, the problem's words) + Filtr: **Tým** (chips; default =
  the team I lead, or „Moje týmy“ when I lead several, so a leader starts at „Filtr 1“) · **Stav** (Chybí lidi · Čeká
  na odpověď · Něco nesedí, multi: which sections show).
- D: three sections, each only while it has something, each with its count:
  - **Chybí lidi**: a row per missing role – date arch, „2× Klávesy“, „Setkání na pastvě · ne 11. 10. 10.00“,
    [+ Doplň] (→ picker). The row opens the meeting (pane ≥ 1200, page below).
  - **Něco nesedí**: a row per non-overridden error – date arch, „Ondra má dvě služby naráz“, the meeting ›; the row
    opens the fix (the duty sheet; the meeting when no duty is involved).
  - **Čeká na odpověď**: lead „Klepni na jméno a zapiš odpověď za ně. Jedna SMS jim připomene všechny služby
    najednou.“; a row per person (not per duty) – avatar, name, „Zpěv · Setkání na pastvě · ne 11. 10.“ or „3 služby
    · nejbližší čt 8. 10.“; trail = SMS (or e-mail without a phone) with one text for all their duties + Zavolej. One
    duty: the row opens the duty sheet; more: a sheet titled by the person („3 služby čekají na odpověď“) with
    [Připomeň v SMS] [Zavolej] and a row per duty (→ duty sheet).
- End line: „Dál než 4 týdny dopředu: Rozpis ›“.
- Nothing left: „Všechno je vyřešené.“ / „Na příští 4 týdny nikde nikdo nechybí, všichni odpověděli a všechno sedí.“
  Filtered: „S tímhle filtrem tu nic není.“ / „Filtr skrývá 5 úkolů.“
- The nav count is the number of tasks in my Filtr scope („Zbývá vyřešit 5 věcí“).
- Reminder for several duties: „Ahoj, v rozpisu máš služby: Zpěv (Setkání na pastvě, ne 11. 10. v 10.00), Klávesy
  (…). Můžeš? Odpověz prosím ve Zvonci: <app URL>#moje“.

### 9.3 Kalendář (everyone)
- A: „Kalendář“ · ⋯ · [Přidej setkání] (leaders). ⋯ in every view: „Ukaž minulá setkání“ / „Skryj minulá setkání“
  (Seznam only, last 4 weeks) · „Stáhni do kalendáře“ → sheet „Kalendář v telefonu“ (Moje služby / Celý kalendář)
  · „Vytiskni rozpis…“ → dialog „Tisk rozpisu“ (month select; A4 landscape table; Filtr applies) · „Doplň volná
  místa“ (leaders) · „Ukaž, kdo kolik slouží“ (leaders) → Břemeno.
- B: „Hledej setkání“ (title, place, Účel, names of who serves; accent-insensitive: „kucer“ finds „Kučera“) +
  Filtr: **Účel** (hue dots) · **Tým** (multi) · **Jen moje služby** · **Ukaž i zrušená**. View switch at the
  right; only a click on it is remembered.
- **Seznam** `#kalendar/seznam`: one continuous list from today, 6 weeks at a time (a search looks 400 days
  ahead). Week subheads, one date arch per day, „Dnes“ / „Zítra“. A line: start time · Účel bar (3 px) · title ·
  place · „(ty) Kázání ○ čeká…“ when I serve · leaders' status tag where something is missing or waits (§8.7) ·
  „zrušeno“ pill. [Ukaž další týdny] at the end. A click opens the pane (≥ 1200) or the page („‹ Kalendář“). Empty: „Zatím tu nejsou žádná setkání.“ /
  „Tady uvidíš, co se chystá: neděle, zkoušky, skupinky i akce.“
- **Měsíc** `#kalendar/mesic/<m>[/<day>]`: the period line, then a form chosen by content width (container query at
  700).
  - Narrow: mini month (cells 44, up to 3 Účel dots, today = `--act` disc, chosen day = pick + bar) and the chosen
    day's list under it (subhead „Středa 7. října“; leaders get [Přidej setkání] for today or later; empty: „Na
    tenhle den nic není.“).
  - Wide: a full grid (po–ne; cells min-height 112; day number in a 28 arch). Chips 24: Účel bar, „10.00“ + title
    in at most 2 lines of whole words; mine = hue fill; cancelled = struck; max 3, then „+ N další“. A chip opens
    the Setkání **page** (never a pane). A day number, „+ N další“ or empty cell space opens the day popover
    („St 7. 10.“, the day's lines, leaders' foot [Přidej setkání]).
  - Empty month: „V říjnu tu nic není.“
- **Rozpis** `#kalendar/rozpis/<m>[/<id>]`: the classic church roster, spanning the whole frame (never a pane).
  Period line; legend „○ čeká na odpověď ● něco nesedí“ (leaders, when a mark appears). Then one table per kind of
  meeting of the month (same template, else same title; kinds that happen once share „Další setkání“), with an h2
  „Setkání na pastvě“ and meta „neděle · 10.00 · 4 setkání“.
  - A **column** per meeting: the day („ne 4. 10.“, today on the ink disc), the time (and the title in „Další
    setkání“), leaders' ◯ 14 z 15, „zrušeno“. The head is a link to the meeting page („‹ Rozpis“).
  - A **row** per role under its team's line („Chvály“); the role column is sticky.
  - A **cell**: one name per line (short names on a phone), „Ty“ on the pick tint, ○ / ● after a name (leaders);
    „+ Doplň“ (leaders, upcoming) or „chybí“ where someone is missing; „–“ where the meeting does not need the role.
  - Meetings share the width equally (role 120 + at least 144 each; phone 96 + 116). On a phone the table scrolls
    sideways inside its own wrapper (never the page) and the third column peeks in.
  - Past meetings in `--ink-2`. A name (leaders) → duty sheet; „Ty“ → my answer; „+ Doplň“ → picker. Filtr › Tým
    narrows the rows; the rest of Filtr and the search narrow the columns.
- **Břemeno** (dialog, `/bremeno`, leaders): „Kolik služeb má kdo v říjnu. Nahoře ti, kdo mají nejvíc.“ Rows:
  avatar, name, „3 z 4 · má pauzu · 3 neděle po sobě“, a load bar, „víc, než zvládne“ in amber.

### 9.4 Setkání (pane or page; `#setkani/<id>` is a page at every width)
Sections in order:
1. **Head**: Účel band 96 (generated arches in the hue, or the photo); tags (Účel · „na webu“ · „zrušeno“, h1
   struck); h1; facts with icons: ◷ „čt 8. 10. · 18.30–20.30“ · ⌖ place › (`#mista/<id>`) · ⟳ „Každý čtvrtek do
   28. 1. 2027“.
2. **Co nesedí** (leaders, upcoming, only when something is wrong): ● / ○ rows, a short phrase („Ondra má dvě
   služby naráz“) with the full sentence as meta. A tap opens the fix: the duty sheet, Osnova (K15, K16), Uprav
   setkání (K9), or for K14 „Dej vědět, že je zrušeno“ → „Chceš odebrat všechny ze služby?“
3. **Tvoje služba / Tvoje služby** (when I serve): waiting = a `--feature` card „Zpěv ○ čeká na tvou odpověď“ +
   [Můžu] [Nemůžu]; answered = rows „✓ potvrzeno“ / „nemůžeš“, › opens the „Moje odpověď“ sheet.
4. **Kdo slouží** + ring „6 z 6 · chybí 1 / 1 čeká“. One collapsed row per team (mark, name, names with ○ / ●,
   „+ Role“ slots for leaders, „5 z 5“ or „✓ všichni potvrdili“, ⌄). A click unfolds role → person → status word
   + warning tags. Empty role: „+ Doplň“ (leaders) or „nikdo“; 2+ empty slots: „Doplň volná místa“. No needs:
   „Na tohle setkání zatím nikoho nepotřebujeme.“ + Uprav.
   - **Duty sheet** (leaders, a click on a name): title = role, subtitle „day · event“; segmented „Odpověď“
     potvrzeno / čeká / nemůže („Když ti odpověď řekl osobně, zapiš ji tady.“); warnings with [Vyber jiného] /
     [Vím o tom] / [Uprav důvod] / [Zruš výjimku]; [Vyber jiného] [Zavolej] [Otevři kartu] [Odeber ze služby]
     (danger). Members open their own answer or the person's card.
5. **Osnova**: the first 4 points (time · name · leader, or „chybí vedoucí“); „Celá osnova · 8 bodů · 95 min ›“;
   leaders get „Uprav“ (or „+ Přidej“ when empty).
6. **O setkání**: description; „Pro tým“ note; address with ↗ to Mapy.cz. Leaders see „Popis pro web zatím chybí ·
   Doplň“ and the switch **„Ukaž na webu“** („Název, čas, místo, popis a obrázek uvidí každý. Jména ne.“).
   Turning it on asks for a description when missing, then asks about the series.

Leaders' ⋯: Uprav setkání · Uprav, kolik lidí je potřeba · Doplň volná místa (when something is missing) · Obsaď
jako minule · Prodluž řadu (series) · Zapiš, kolik lidí přišlo (after the start; Dospělí / Děti steppers) ·
Vytiskni · — · Zruš setkání / Obnov setkání · Smaž setkání. Members get no ⋯.

**Picker** (sheet titled by the role; subtitle „Teď: …“ · event · day): „Z týmu Chvály“ (who knows the role first,
meta „naposledy 13. 9.“ / „poprvé“), then „Ukaž i ostatní z týmu (N)“; „Nemůžou“ greyed with the reason („ten den
nemůže · dovolená“), picking one asks „Výjimka“ / „Proč to půjde“; „Přesuň sem“; „Hledej mezi všemi lidmi“;
„Přidej nového člověka „…““.

**Forms**: „Přidej setkání“ → sheet „Nové setkání“ (template rows + „Něco jiného / Bez šablony“) → the form (dialog
640): Název setkání · Den + Čas · Opakování (Ne · Týdně · Ob týden · Měsíčně) + Do kdy + the live rule · Kde
(chips) · „Další možnosti“: Účel, Pro koho, Popis pro web, Obrázek, Ukaž na webu, Pro tým. Submit „Přidej
setkání“. „Úprava setkání“ asks „Jen tohle setkání“ / „I N další“. „Prodloužení řady“.

**Osnova** `#setkani/<id>/osnova` (page at every width; top bar „‹ <meeting>“; ⋯ Vytiskni · Převezmi minulou
osnovu): a meta line (when, where); a sum bar „95 z 120 min · zbývá 25 min“ (amber when over: „o N min delší než
setkání“); points with time, title, „5 min · leader“, note. Leaders: drag handle, tap to edit (title, minutes,
„Kdo vede“, note), row ⋯ (Uprav bod · Ukaž formát · Posuň výš / níž · Odeber z osnovy), „+ Přidej bod“ (a Formát
or „Vlastní bod“), hint „Pořadí změníš tažením za úchyt. Bod upravíš klepnutím.“ Members read only.

### 9.5 Lidé `#lide` (everyone)
- A: „Lidé“ · ⋯ · [Nový člověk] (leaders). Leaders' ⋯: Přidej domácnost · Pozvi do Zvonce · — · Zkopíruj e-maily
  · Stáhni seznam · Ukaž podrobný výpis / Ukaž jednoduchý seznam (≥ 900) · Smaž staré karty z archivu (when due).
  Members' ⋯: Stáhni seznam (+ the view choice at ≥ 1200).
- B: „Hledej jméno“ (name, nickname, visible phone or e-mail; while searching, up to 3 matching groups appear
  above under „Skupiny“ / „Lidé“) + Filtr. Leaders: **Členství** (Členové · Přátelé · Hosté · Děti) · **Tým** ·
  **Chybí údaje** · **Narozeniny** (sorts by the next birthday; subheads „Do týdne“ / months / „Bez data
  narození“) · **Ukaž i archiv**. Members: Tým only.
- D: phone first row „Skupiny · 9 skupin ›“; leaders' quiet birthday line „Dnes slaví Eva …, do týdne ještě 2“ →
  Filtr Narozeniny; A–Z list with letter subheads. Row: avatar, name (nickname), call button (visible phone, not
  on my own row). Meta at ≥ 600: leaders „člen · Chvály, Technika“ + amber „chybí příjmení a kontakt“; members
  teams only. Foot „47 lidí“; an archive callout when needed.
- Empty: „Zatím tu nikdo není.“ / „Tady najdeš, jak se s kým spojit. Přidej první lidi, nebo jim pošli pozvánku.“
- **Podrobný výpis** `#lide/vypis`: sortable table Jméno, Členství*, Domácnost, Telefon, E-mail, Skupiny,
  Narozeniny*, Poslední služba* (* leaders). Ticks + bulk bar „3 vybraní lidé“ [Zkopíruj e-maily] [Přidej do
  skupiny] [Stáhni seznam] [Zruš výběr]. Spans the frame; compact beside an open pane.
- **Person detail** `#lide/<id>`: avatar 72; pills „ty“ / membership (leaders) / team pills; h1; birthday fact
  (leaders and self). Contact tiles [Zavolej] [SMS] [E-mail] L 52 (only those with data, never on my own card).
  Then: callouts (leaders: archive „Vrať z archivu“, missing data „Doplň“ / „Potvrď údaje“) · Co nesedí (leaders)
  · Příští služby · Kontakt [Uprav] („Kontakt vidí všichni / jen vedoucí.“) · Domácnost · Skupiny [+ Přidej] (skill
  pills; leaders' „Uprav“ → member sheet) · Kdy nemůže · Údaje [Uprav] (leaders: membership + since, birth,
  nickname, consent, „Nejvíc N služeb za měsíc · N nedělí po sobě“, access „Může se přihlásit · vedoucí“ /
  „Pozvánka platí do …“) · Poznámka (leaders).
  ⋯: Uprav · Uprav kontakt (self) · Nastav, kolik toho zvládne · Pozvi do Zvonce · Stáhni do kalendáře · Přesuň do
  archivu / Vrať z archivu · Smaž kartu.
- Sheets: „Nový člověk“ (Jméno, Příjmení, Telefon, E-mail, Členství Člen / Přítel / Host (default Host), Souhlasí
  se zpracováním údajů; Další možnosti: Přezdívka, Narození, Domácnost, „Telefon a e-mail smí vidět i ostatní“,
  Poznámka „Krátce. Nic o zdraví, penězích ani pastoraci.“, Chodí od; submit „Přidej člověka“; a duplicate
  callout) · „Jméno a údaje“ · „Kontakt“ / „Můj kontakt“ · „Kolik toho zvládne“ (two steppers + „Pauza od
  služeb“) · „Souhlas“ · „Domácnost“ · „Do které skupiny?“ · archive and delete confirms.
- **Domácnost** `#lide/domacnost/<id>` (drill-in, „‹ <person>“): house mark, address, section Lidé [+ Přidej].
  ⋯: Uprav · Přidej člověka · Smaž domácnost.

### 9.6 Skupiny `#lide/skupiny` (everyone)
- A: „Skupiny“ · [Nová skupina] (leaders). No ⋯.
- B: „Hledej skupinu“ (name, kind, description, role names) + Filtr: **Druh** (Týmy · Skupinky · Vedení) · **Jen
  moje** · **Ukaž i archiv** (leaders).
- D: subheads Týmy · Skupinky · Vedení (mine first). Below 900 rows: team mark, name, „9 lidí · vedou David Kučera
  a Radim Kovář“, pill „ty“. From 900 cards (auto-fill min 260: mark, name, meta, roles or description, up to 6
  stacked avatars); the open card gets pick + outline; at ≥ 1200 the cards span the frame while nothing is open.
  „V archivu“ stays a row list.
- **Group detail**: mark 56; pills kind („Tým“) · „ty“ · „v archivu“; h1; fact „9 lidí · vedou …“ (or „zatím bez
  vedoucího“ / „zatím bez předsedy“); description. **Role** (teams, leaders) [+ Přidej]: rows „umí A a B · učí se
  C“, amber note „Umí to jen jeden člověk“ / „Zatím to nikdo neumí“, a click opens the role sheet. **Lidé**
  [+ Přidej]: leaders first, meta „vede tým“ + skill pills, call button, „Ukaž všech N“ after 8; a person drills
  in inside the pane („‹ <group>“). **Příští služby / Příští setkání** (six weeks).
  ⋯: Uprav · Přidej člověka · Přesuň do archivu / Vrať z archivu · Smaž.
- **Group sheet** „Nová skupina“ / „Úprava skupiny“: Druh skupiny (Tým / Skupinka / Vedení with hints), Název,
  Popis, **„Kdo vede“** (the group's people as chips, leaders pressed; [Přidej vedoucího] picks anyone, who joins
  on save; hint „Vyber jednoho nebo víc lidí ze skupiny.“).
- **Member sheet** (title = person, subtitle = group): „Co umí“ per role (Neumí · Učí se · Umí); switch „Vede tým“
  / „Vede skupinku“ / „Předsedá“; danger „Odeber z týmu“.
- **Role sheet** „Nová role“ / „Úprava role“: Název, Kolik lidí („Na jedno setkání.“), „Bez toho to nepůjde“;
  Další možnosti: Jen pro dospělé · Je s dětmi · Jen část setkání (Od / Do minutes) · „Jde naráz s“.

### 9.7 Šablony `#sablony` (leaders)
- A: „Šablony“ · [Přidej šablonu]. B: „Hledej šablonu“ + Filtr: Účel · Jen na webu · Ukaž i archiv.
- Rows: Účel mark, name, „každou neděli · 10.00–12.00 · Sál“, pill „na webu“ / „v archivu“.
- Empty: „Zatím tu není žádná šablona.“ / „Nové setkání ze šablony dostane čas, místo, role i osnovu.“
- Detail: Účel mark; tags; facts (when · length; place › or „Místo zatím není vybrané.“; „pro skupinu …“ ›).
  Sections: **Kdo je potřeba** [Uprav] · **Osnova** [Uprav] · **Na webu** [Uprav] („Ukazuj nová setkání na
  webu“, popis, obrázek) · **Setkání v plánu** (count, next 5, „Řady“).
  ⋯: Uprav šablonu · Naplánuj setkání · Zkopíruj šablonu · Přesuň do archivu / Vrať z archivu · Smaž šablonu.
- Form „Nová šablona“: Název setkání, Účel, Den (Kdykoli / po–ne), time, Kde (place chips per building, „celá
  budova“), Pro koho.

### 9.8 Formáty `#formaty` (leaders edit; members read via links)
- A: „Formáty“ · [Přidej formát]. B: „Hledej formát“ only (no Filtr).
- Rows: minutes block („25 / min“), name, „vede role Projekce“, „na webu“. Nothing opens until clicked.
- Detail: Proč to děláme · Jak to probíhá · Kdo je potřeba · Kde se používá (Šablony links, leaders) · Na webu
  switch (leaders); facts: lead role, „K přečtení“ ↗. ⋯: Uprav formát · Smaž formát.
- Form: Název, Kolik minut, Kdo vede (role select), Proč to děláme, Jak to probíhá, Kdo je potřeba navíc, K
  přečtení, Ukaž na webu. Empty: „Zatím tu není žádný formát.“

### 9.9 Místa `#mista`
- A: „Místa“ · [Přidej místo]. B: „Hledej místo“ only.
- Rows: pin, name, address · „3 místnosti“; the main place first with pill „hlavní místo“.
- Detail: tags („hlavní místo“, „víc setkání naráz“); address + „Otevři v mapě ↗“; **Mapa** (OpenStreetMap frame,
  16:9); **Místnosti** (a room drills in, „‹ <building>“); **Kdy se tu scházíme** (next 5).
  ⋯: Uprav místo · Přidej místnost · Smaž místo.
- Form: Název, Adresa, Souřadnice, „Je to místnost v budově?“, „Vejde se sem víc setkání naráz“.

### 9.10 Přístupy `#pristupy` (leaders)
- A: „Přístupy“ · ⋯ (Ukaž, jak se lidé dostanou dovnitř → help sheet [Rozumím] · Vyměň klíč (admin)) · [Pozvi
  člověka]. B: „Hledej člověka“ + Filtr: Úroveň (Správce · Vedoucí · Člen) · Jen pozvánky.
- One column, no pane. Sections: „Pozvánky · 1 čeká“ (meta „platí do 19. 10.“ or red „Vypršela 21. 9.“) ·
  Správci · Vedoucí · Členové („to jsi ty · přístup od …“, level pill) · Přístupy bez karty („Smazaná karta“).
- A row opens a menu: Otevři kartu · Pošli pozvánku znovu · Změň přístup (admin) · Nastav nové heslo · Zruš
  pozvánku / Odeber přístup.
- Demo callout: „V ukázce se nikdo nepřihlašuje. Takhle by seznam vypadal v ostrém Zvonci.“
- Invite: sheet „Pozvánka do Zvonce“ → [Vytvoř pozvánku] → link sheet [Zkopíruj odkaz] / [Pošli] („Odkaz platí 14
  dní a jde použít jen jednou. Každá změna začne platit za pár minut. …“).

### 9.11 Nastavení sboru `#nastaveni` (leaders)
One 640 column of value blocks (r20 cards) with „label — value“ rows, each with an S „Uprav“ opening a dialog:
- **Sbor**: Název sboru, Hlavní místo, Adresa.
- **Pravidla**: Nejvíc služeb za měsíc; Nejvíc nedělí po sobě („I kráva potřebuje volnou neděli na pastvě.“).
- **Kdy Zvonec bučí**: Prázdná nezbytná role · Ostatní prázdná místa · Nepotvrzená služba, each „N dní předem“
  („Kolik dní před setkáním začne Zvonec upozorňovat. Dřív si toho nevšímá.“).
- **Děti**: Dospělý je od.
- **Záloha**: [Stáhni zálohu]; admin [Nahraj zálohu].

### 9.12 Kdy nemůžu `#kdy-nemuzu`
- A: „Kdy nemůžu“ · [Přidej]. Lead: „Zapiš si dny, kdy nemůžeš. V těch dnech tě Zvonec do služeb nenavrhne.“
- Rows „24.–26. 10. · dovolená“; a row opens a menu (Uprav · Smaž, with Vrať). Empty: „Zatím žádné dny.“
- Sheet „Nové dny, kdy nemůžu“: Od, Do, Důvod („Uvidí ho jen vedoucí.“). With clashing duties: switch „Odmítni i
  služby v těch dnech“ + their list.

### 9.13 Můj účet `#ucet`
Avatar 72, name, level word. **Moje karta** [Uprav] (phone, e-mail, „Říkají ti …“, switch „Telefon a e-mail smí
vidět i ostatní“ applied at once with Vrať) · **Přihlášení** [Změň heslo] → „Nové heslo“ (min 8 characters, twice)
· **Kalendář v telefonu** (.ics rows) · **Barvy** · [Odhlas se]. Demo: „Očima druhých“ sheet.

### 9.14 Sign-in, first run, invite
- No app chrome. Centred column, max 400; at ≥ 600 a card r20. Wordmark → h1 „Přihlášení“ → Jméno („Diakritika a
  velká písmena nevadí.“), Heslo (show/hide), „Pamatuj si mě“ („Na cizím počítači to vypni.“) → [Přihlas se] L 52
  → „Podívej se na Pastvu ›“. Foot „Ještě nemáš přístup? Požádej vedoucího o pozvánku.“ Error „Jméno nebo heslo
  nesedí. …“.
- Demo: „Tohle je ukázka. Přihlas se jako:“ + 3 people, and „Založ Zvonec pro svůj sbor ›“.
- Invite page „Pozvánka do Zvonce“ („Zve tě Radim Kovář. Vyplň svoje jméno a zvol si heslo.“): Jméno, Příjmení,
  Heslo, required switch „Souhlasím, že si sbor moje údaje zapíše“; Další možnosti: Telefon, E-mail, the directory
  switch, „S čím chceš pomáhat“ chips, Pamatuj si mě. Submit [Přijmi pozvánku]. Invalid or expired: one sentence +
  [Přihlas se].

---

## 10. Public web and public.json

### 10.1 public.json
Built by `lib/public.js buildPublic(data, { today, daysAhead: 120 })`, run by `zvonec/build-public.mjs` in the
data repo's `web.yml`:
```
{ v: 1, churchName, address, generated: today,
  events: [{ id, title, kind, start, end, description ('' if none), image: 'images/<name>' | null,
             places: [{ name, building?, address?, lat?, lon? }], cancelled?: true }],
  formats: [{ id, name, minutes, why, how }] }
```
- Events only when `public === true` and they reach into `[today − 1, today + 120]`, sorted by start, then id.
- `image` = the event's, else its template's, else null; unsafe names count as none. `publicImages()` lists the
  files copied to `site/images/`.
- Formats only when `public === true`.
- **No people, ever**: no names, assignments, notes, contacts.

### 10.2 Workflows in the data repo
- `web.yml` runs on pushes to `access.json`, `data/events.json`, `data/images/**`, `data/settings.json`, and daily.
  Its guard fails the run when anything from `data/` is on the site, `access.json` contains `firstName` or
  `lastName`, `public.json` contains any of `personId|assignments|firstName|lastName|email|phone`, or
  `site/images/` holds files `public.json` does not list.
- `check.yml` runs `zvonec/check.mjs data` on every `data/**` push and weekly. It exits 1 when an event that has not
  ended has an `error` conflict (GitHub then e-mails the repo owner). `validateData` problems are warnings.

### 10.3 Pastva `#pastva[/<id>]` (public screen)
- Reads only the public data, never `S.data`.
- Header 64: wordmark, [Přihlas se] (quiet). Signed in: a strip „Takhle to vidí návštěvníci · ← Vrať se do
  Zvonce“.
- Column 720: h1 „Pastva“, „Kdy a kde se potkáváme. Přijď, jak jsi.“
  - **Co bude**: public meetings by week as Seznam rows, no people; „Ukaž další N setkání“. Empty: „Teď nic
    nechystáme. Mrkni sem později.“
  - **Jak se scházíme** (anchor `jak-se-schazime`): public formats with the minutes block → a sheet with Proč /
    Jak.
  - **Kde nás najdeš**: address + map.
- A meeting: band, tag, title, when, where + map, „O setkání“, [Stáhni do kalendáře], and a callout when cancelled.

---

## 11. Notifications

Zvonec sends nothing by itself: GitHub cannot message people without an account.
- **„Připomeň“** builds a ready message. Obsazení's section „Čeká na odpověď“ (one text per person for all their
  duties) and the meeting's „○ N čeká“ open the reminders. Per person an `sms:` link (aria „Připomeň v SMS – <jméno>“), or
  without a phone a `mailto:` with subject „Služba ve Zvonci“ (aria „Připomeň e-mailem – <jméno>“), plus „Zavolej“.
  Body (`reminderText`): „Ahoj, v neděli 18. 10. máš v rozpisu službu: Kázání (Setkání na pastvě, 10.00). Můžeš?
  Odpověz prosím ve Zvonci: <app URL>#moje“; several duties: `reminderTextAll` (§9.2).
- **„Kdy Zvonec bučí“** (settings) sets how many days before a meeting each conflict starts to show (§6.2 K5, K6).
- **In-app signals**: nav counts (Moje: aria „N služby čekají na tvou odpověď“; Obsazení: „Zbývá vyřešit N věcí“),
  the invites dot / „1 čeká“, Co nesedí sections, ○ / ● marks, Obsazení to-do lines.
- **GitHub Actions** `check.yml` (§10.2).
- **Calendar**: .ics downloads only (§6.10).

---

## 12. Tests and acceptance

### 12.1 Tests (`node --test zvonec/test/*.test.mjs`)
- Unit tests for every pure function in `lib/`: needs and fill, each conflict code K1–K17 with its severity and
  the override, candidates and their sort, auto-fill, „as last time“, series (weekly, biweekly, monthly nth and
  last weekday, the 120 cap), program times, age and birthdays (29 Feb), archive / restore / delete with history,
  missing data, validation, merge (every rule in §4.4, both mass-deletion guards), commit messages, public.json
  (nothing personal leaks), access crypto (seal, unseal, lookup, reseal).
- The demo test checks every invariant in §5.21 on `createDemo()`.
- UI modules that can run in Node (routes, nav tables, text helpers) get tests too.

### 12.2 Acceptance
- No console errors and no CSP violations on any route, at widths 390, 768, 1024, 1280 and 1600, in both palettes.
- Every route in §7.3 renders for member, leader and admin as the access table says; members never see
  membership, birth dates, notes, consent or access of others.
- Every action is reachable by keyboard; every icon button has a Czech imperative aria-label; focus is visible.
- Every change saves (status capsule), survives a reload, and can be undone where §4.7 says.
- Two browsers editing different records of the same file both keep their changes (merge).
- `public.json` built from the demo contains no person data; the `web.yml` guard passes.
- Czech text passes a proofread (`kontrola-cestiny` skill), with no infinitive titles and no calques.

---

## 13. Build order

1. **Data layer**: `lib/store` (local store, GitHub store, normalize, merge, Sync), `lib/time.js`, entities and
   cascades, `lib/demo.js`, validate. Tests first.
2. **Domain logic**: needs and fill, conflicts K1–K17, scheduling, series, program, archive, missing data,
   public.json, ics. Tests.
3. **Access**: crypto, sign-in, remembered login, invite, first run, Přístupy.
4. **Shell and kit**: tokens and palettes, `h()`, layers, toast, rows, `listScreen`, Filtr, empty states, nav (tab
   bar, rail, sidebar, person menu), routes and redirects, pane, save line, undo.
5. **Screens** in this order: Setkání (with duty sheet, picker, Osnova), Kalendář (Seznam, Měsíc, Rozpis,
   Břemeno), Moje, Obsazení, Lidé (+ person, household, Podrobný výpis), Skupiny, Šablony, Formáty, Místa,
   Nastavení sboru, Kdy nemůžu, Můj účet, Pastva.
6. **Data repo workflows**: `build-public.mjs`, `check.mjs`, `web.yml`, `check.yml`.
7. **QA**: the acceptance list in §12.2, a Czech proofread, print styles.

---

## 14. Open decisions (do not build without the owner's answer)

- **Phone tab bar**: Moje · Kalendář · Lidé · Více (a „Více“ tab replacing the person tab and absorbing Obsazení for
  leaders) instead of today's bar.
- **Kalendář**: Měsíc opening the pane on a day click; Rozpis starting from today instead of the month's first day.
- **Members' Setkání detail** without numbers (no „6 z 6“).
- **One glossary** for „chybí / čeká / nesedí“ across all screens.
- **Households**: a household filter in Lidé, or a clickable Domácnost column in Podrobný výpis.
- **Rename the role „U dětí“ to „Péče o děti“** in the demo and in the live data.
- **Notifications centre**; renaming „Přidej setkání“ to „Nové setkání“ for the main action.
- **Real notifications** (SMS / e-mail / push) need a server or a third-party service; out of scope for a
  GitHub-only platform.
