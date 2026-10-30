# Rules for this repository

## Language

- **Everything about development is in English**: identifiers (variables, functions, classes,
  modules), file and folder names (except product names such as `zvonec`), CSS classes and custom
  properties, data keys and stored enum values, code comments, tests, workflow names, commit
  messages, pull request titles and descriptions.
- **Everything people read is in Czech**: UI text, URL slugs people see or share (`#kalendar`,
  `#pozvanka/…`), downloaded file names, commit messages the app itself writes into the data repo,
  user guides (`zvonec/README.md`), website content in `src/obsah/`.
- Zvonec speaks in one kind voice in tykání, and its controls follow Czech app conventions:
  - Controls (buttons, menu items, action links, switches, checkboxes, aria-labels of icon buttons) are infinitives
    („Přidat setkání“, „Uložit“, „Přihlásit se“, „Zobrazit na webu“). Cancel is „Zrušit“, undo „Vrátit zpět“, share „Sdílet“.
  - Sentences, hints and error messages talk to the reader in tykání; an instruction inside a sentence stays in the
    imperative („Doplň jméno.“, „Vyber den.“).
  - Page, section and dialog titles are nouns („Přihlášení“, „Nové setkání“).
  - Standard written Czech: no jokes in warnings, „lidé“ not „lidi“, a non-breaking space inside dates („18. 10.“).
- Czech text must be natural Czech (check with the `kontrola-cestiny` skill), no calques.

## Zvonec (`docs/zvonec/`, `zvonec/`)

- Static vanilla ES modules, no build step. Strict CSP: no inline styles or scripts, DOM built
  with `h()`, never `innerHTML`.
- The church's live Zvonec (https://zvonec.cirkevjakokrava.cz) runs on the server in
  `znackarna/zvonec` (Payload + Postgres), which takes the frontend from this repo
  (`/api/zvonec/version` shows the commit). GitHub Pages serves only the demo
  (manifest.cirkevjakokrava.cz/zvonec/). The old GitHub mode (`church-data`) is retired; `bank.yml` in `church-finance` runs until the server takes over the bank downloads.
- Personal data lives only on the server, never in this public repo, `public.json` or tests other
  than the fictional demo. Every new field or file a member must not see needs a rule in the
  server's `policy.ts` and a test there.
- Develop the frontend in demo mode; there is no local database. Server changes go to
  `znackarna/zvonec` with tests, following its README and CLAUDE.md.
- Tests: `node --test zvonec/test/*.test.mjs`.
