// Zvonec One – the kit: the one import surface for screens.
//   import { h, listScreen, detail, detailHead, row, section, empty, layer, filterButton, periodLine, … } from './kit.js';
// core.js            drawn on the page: type, buttons, chips, segmented (views as links), identity, status, rows,
//                    section, facts, empty, time, month grid
// layers.js          layer.open() (sheet · filter · menu · popover · confirm), menuButton / openMenu (⋯), toast
// fields.js          field, text / select / date / time / stepper / switch / search, chips & segmented fields,
//                    disclosure, peoplePicker, passwordInput
// layout.js          isPhone / isTablet / isSplit / onLayoutChange, listScreen, page, detail, detailHead, toolbar,
//                    titleRow, topBar, periodLine
// filter.js          filterButton, filterState, setFilter, clearFilter, filterCount
// palette-choices.js paletteChoices (Krém a hlína · Hlína a růžová · Podle zařízení)
// lib/vocative.js    vocative('Jana') → 'Jano', welcome(name)
// API for the screen builders: scratchpad/one/F-API.md · living specimen: #kit.

export * from './core.js';
export * from './layers.js';
export * from './fields.js';
export * from './layout.js';
export * from './filter.js';
export * from '../lib/vocative.js';
export { paletteChoices, PALETTE_CHOICES } from './palette-choices.js';
