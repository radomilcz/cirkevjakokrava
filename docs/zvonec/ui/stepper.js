// Number fields get − and + buttons instead of the browser's tiny spinner arrows.
// Every <input type="number"> that appears in the page is wrapped automatically, so screens
// keep creating plain number inputs. The buttons use stepDown/stepUp (min, max and step are
// respected) and fire the same input and change events as typing does.

function fire(input) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function stepButton(input, direction) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `stepper-btn ${direction > 0 ? 'up' : 'down'}`;
  button.tabIndex = -1;   // the keyboard already has arrow keys in the field itself
  button.setAttribute('aria-hidden', 'true');
  button.addEventListener('click', () => {
    if (input.disabled || input.readOnly) return;
    const before = input.value;
    if (input.value === '') input.value = input.min || '0';
    else if (direction > 0) input.stepUp(); else input.stepDown();
    if (input.value !== before) fire(input);
  });
  return button;
}

export function enhance(input) {
  if (input.dataset.stepper || input.closest('.stepper')) return;
  input.dataset.stepper = '1';
  if (!input.getAttribute('step') && /minutes/i.test(input.name)) input.step = '5';   // durations go by five minutes
  const wrap = document.createElement('span');
  wrap.className = 'stepper';
  input.replaceWith(wrap);
  wrap.append(stepButton(input, -1), input, stepButton(input, 1));
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches('input[type="number"]')) enhance(root);
  root.querySelectorAll('input[type="number"]').forEach(enhance);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
