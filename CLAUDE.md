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

- Static vanilla ES modules on GitHub Pages, no build step. Strict CSP: no inline styles or
  scripts, DOM built with `h()`, never `innerHTML`.
- Personal data lives only in the private data repo, never in this public repo.
- Tests: `node --test zvonec/test/*.test.mjs`.
