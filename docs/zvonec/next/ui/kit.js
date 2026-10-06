// Zvonec Next – the kit: the one import surface for screens.
//   import { h, screen, topBar, row, dateArch, button, openSheet, toast, … } from './kit.js';
// core.js     drawn on the page: type, buttons, choices, identity, status, rows, time, month grid
// sheet.js    layers: openSheet, formSheet, confirmSheet, menu (⋯), toast
// fields.js   field, text / select / date / time / stepper / switch / search, chips & segmented fields,
//             disclosure („Další možnosti“), peoplePicker, passwordInput (with the eye)
// layout.js   screen (+ the tab head of Domů · Kalendář · Lidé · Více), formFoot, topBar, period, screenHead,
//             splitView, detailPane, breakpoints
// vocative.js vocative('Jana') → 'Jano', welcome(name) → „Vítej, Jano.“
// icons.js    icon(name), statusSymbol(status), fillRing(filled, total)
// API reference: scratchpad/next/reports/kit.md · living specimen: #kit.

export * from './core.js';
export * from './sheet.js';
export * from './fields.js';
export * from './layout.js';
export * from './vocative.js';

// the bullseye palette picker of the current Zvonec (its logic; the look comes from css/shell.css):
// paletteChoices() – the inline radio row (Více › Barvy) · palettePicker() – the menu button (rail foot)
export { paletteChoices, palettePicker } from '../../ui/palette-picker.js';
