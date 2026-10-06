# Rules for this repository

## Language

- **Everything about development is in English**: identifiers (variables, functions, classes,
  modules), file and folder names (except product names such as `zvonec`), CSS classes and custom
  properties, data keys and stored enum values, code comments, tests, workflow names, commit
  messages, pull request titles and descriptions.
- **Everything people read is in Czech**: UI text, URL slugs people see or share (`#kalendar`,
  `#pozvanka/…`), downloaded file names, commit messages the app itself writes into the data repo,
  user guides (`zvonec/README.md`), website content in `src/obsah/`.
- Zvonec speaks in one kind voice in tykání: actions (buttons, menu items, action links, aria-labels of icon buttons) are imperative 2nd person singular („Přidej setkání“, „Ulož“, „Přihlas se“); page, section and dialog titles are nouns, never infinitives („Přihlášení“, „Nové setkání“).
- Czech text must be natural Czech (check with the `kontrola-cestiny` skill), no calques.

## Zvonec (`docs/zvonec/`, `zvonec/`)

- Static vanilla ES modules on GitHub Pages, no build step. Strict CSP: no inline styles or
  scripts, DOM built with `h()`, never `innerHTML`.
- Personal data lives only in the private data repo, never in this public repo.
- Tests: `node --test zvonec/test/*.test.mjs`.
