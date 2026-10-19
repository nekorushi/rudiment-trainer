// Declarative settings controls. Markup opts in with data attributes:
//   data-seg="key"      segmented radio group; each button's data-v is a value
//   data-stepper="key"  −/+ stepper (range and format from STEPPERS)
//   data-toggle="key"   checkbox
//   data-slider="key"   range input

import { $, $$ } from './dom.js';
import { STEPPERS, clamp } from '../settings.js';

/** Call fn on press, then keep repeating while the button is held. */
export function holdRepeat(button, fn) {
  let delay = 0;
  let interval = 0;
  const clear = () => { clearTimeout(delay); clearInterval(interval); };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    clear();
    fn();
    delay = setTimeout(() => { interval = setInterval(fn, 80); }, 420);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => button.addEventListener(t, clear));
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  });
}

/**
 * Wire every data-* control under root.
 * @param {ParentNode} root
 * @param {() => object} get              current settings
 * @param {(key: string, value: any) => void} set
 */
export function bindControls(root, get, set) {
  $$('[data-seg]', root).forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const raw = b.dataset.v;
      set(seg.dataset.seg, raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw);
    });
  });

  $$('[data-stepper]', root).forEach((el) => {
    const key = el.dataset.stepper;
    const cfg = STEPPERS[key];
    el.innerHTML = '<button type="button" aria-label="Decrease">−</button><output></output><button type="button" aria-label="Increase">+</button>';
    const [down, , up] = el.children;
    const bump = (d) => set(key, clamp(get()[key] + d * cfg.step, cfg.min, cfg.max));
    holdRepeat(down, () => bump(-1));
    holdRepeat(up, () => bump(1));
  });

  $$('[data-toggle]', root).forEach((el) => el.addEventListener('change', () => set(el.dataset.toggle, el.checked)));
  $$('[data-slider]', root).forEach((el) => el.addEventListener('input', () => set(el.dataset.slider, Number(el.value))));
}

/** Reflect settings into every data-* control under root. */
export function renderControls(root, s) {
  $$('[data-seg]', root).forEach((seg) => {
    const key = seg.dataset.seg;
    $$('button', seg).forEach((b) => b.setAttribute('aria-checked', String(String(s[key]) === b.dataset.v)));
  });
  $$('[data-stepper]', root).forEach((el) => {
    const key = el.dataset.stepper;
    $('output', el).textContent = STEPPERS[key].fmt(s[key]);
  });
  $$('[data-toggle]', root).forEach((el) => { el.checked = Boolean(s[el.dataset.toggle]); });
  $$('[data-slider]', root).forEach((el) => { el.value = s[el.dataset.slider]; });
}
