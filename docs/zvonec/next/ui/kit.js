// Zvonec Next – the kit: the one import surface for screens.
//   import { h, screen, topBar, row, dateArch, button, openSheet, toast, … } from './kit.js';
// core.js     drawn on the page: type, buttons, choices, identity, status, rows, time, month grid
// sheet.js    layers: openSheet, formSheet, confirmSheet, menu (⋯), toast
// fields.js   field, text / select / date / time / stepper / switch / search, chips & segmented fields,
//             disclosure („Další možnosti“), peoplePicker
// layout.js   screen, topBar, period, screenHead, splitView, detailPane, placeholder, breakpoints
// icons.js    icon(name), statusSymbol(status), fillRing(filled, total)
// API reference: scratchpad/next/reports/kit.md · living specimen: #kit.

export * from './core.js';
export * from './sheet.js';
export * from './fields.js';
export * from './layout.js';

// the bullseye palette picker of the current Zvonec (its logic; the look comes from css/shell.css):
// paletteChoices() – the inline radio row (Více › Barvy) · palettePicker() – the menu button (rail foot)
export { paletteChoices, palettePicker } from '../../ui/palette-picker.js';
