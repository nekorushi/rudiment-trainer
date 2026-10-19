// Rudiment library. Stage 1 ships a small starter set to exercise the engine;
// stage 2 replaces this with the full list of 26 essential rudiments.
//
// Notation (one token per grid step, `grid` steps = one beat):
//   R L = accented stroke   r l = unaccented tap   . = rest
//   (l)R = flam   (ll)R = drag   R~ - - - = buzz roll held across the "-" steps

import { parsePattern } from './sequencer.js';

export const FAMILIES = ['Rolls', 'Diddles', 'Flams', 'Drags'];

const SPECS = [
  { id: 'single-stroke-roll', name: 'Single Stroke Roll', family: 'Rolls', grid: 4, steps: 'R L R L' },
  { id: 'double-stroke-open-roll', name: 'Double Stroke Open Roll', family: 'Rolls', grid: 4, steps: 'R R L L' },
  { id: 'buzz-roll', name: 'Buzz Roll (demo)', family: 'Rolls', grid: 4, steps: 'R~ - - - L~ - - -' },
  { id: 'single-paradiddle', name: 'Single Paradiddle', family: 'Diddles', grid: 4, steps: 'R l r r L r l l' },
  { id: 'flam', name: 'Flam', family: 'Flams', grid: 2, steps: '(l)R (r)L' },
  { id: 'drag', name: 'Drag (Ruff)', family: 'Drags', grid: 2, steps: '(ll)R . (rr)L .' },
];

export const RUDIMENTS = SPECS.map(parsePattern);

export function getRudiment(id) {
  return RUDIMENTS.find((r) => r.id === id) ?? RUDIMENTS[0];
}
