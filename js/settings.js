// Practice settings: defaults, valid ranges, persistence and the mapping to
// Sequencer options. DOM-free, so it is unit tested in Node.

import { readJSON, writeJSON } from './store.js';

export const STORE_KEY = 'rudiments.settings.v1';
export const BPM_MIN = 30;
export const BPM_MAX = 260;

export const DEFAULTS = {
  rudiment: 'single-stroke-roll',
  view: 'notation',
  bpm: 80,
  mode: 'loop',
  ocoHigh: 140,
  ocoCycles: 8,
  countIn: 4,
  sessionMin: 0,
  rampMode: 'off',
  rampInc: 4,
  rampEverySec: 30,
  rampEveryReps: 4,
  rampTarget: 120,
  clickOn: true,
  drumOn: true,
  subClick: false,
  clickLevel: 0.7,
  drumLevel: 0.85,
};

/** Numeric settings edited with a −/+ stepper: range, step size and display format. */
export const STEPPERS = {
  ocoHigh: { min: 40, max: 320, step: 5, fmt: (v) => `${v} BPM` },
  ocoCycles: { min: 2, max: 32, step: 1, fmt: (v) => `${v} reps` },
  rampInc: { min: 1, max: 20, step: 1, fmt: (v) => `${v} BPM` },
  rampEverySec: { min: 10, max: 300, step: 10, fmt: (v) => `${v} sec` },
  rampEveryReps: { min: 1, max: 32, step: 1, fmt: (v) => `${v} reps` },
  rampTarget: { min: 30, max: 320, step: 5, fmt: (v) => `${v} BPM` },
  sessionMin: { min: 0, max: 60, step: 1, fmt: (v) => (v ? `${v} min` : 'Off') },
};

const CHOICES = {
  view: ['notation', 'sticking'],
  mode: ['loop', 'oco'],
  rampMode: ['off', 'time', 'reps'],
  countIn: [0, 4, 8],
};

const RANGES = {
  bpm: { min: BPM_MIN, max: BPM_MAX },
  clickLevel: { min: 0, max: 1 },
  drumLevel: { min: 0, max: 1 },
  ...STEPPERS,
};

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Coerce stored (or imported) settings into valid ones. Unknown keys are
 * dropped; wrong types, unknown choices and non-finite numbers fall back to
 * the default; numbers are clamped into range.
 * @param {unknown} raw
 * @param {string[]} [rudimentIds]  known rudiment ids; an unknown one falls back to the first
 */
export function sanitizeSettings(raw, rudimentIds) {
  const s = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const [key, def] of Object.entries(DEFAULTS)) {
      const v = raw[key];
      if (typeof v !== typeof def) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      if (CHOICES[key] && !CHOICES[key].includes(v)) continue;
      s[key] = v;
    }
  }
  for (const [key, r] of Object.entries(RANGES)) s[key] = clamp(s[key], r.min, r.max);
  if (rudimentIds?.length && !rudimentIds.includes(s.rudiment)) s.rudiment = rudimentIds[0];
  return s;
}

export function loadSettings(rudimentIds) {
  return sanitizeSettings(readJSON(STORE_KEY, null), rudimentIds);
}

export function saveSettings(s) {
  return writeJSON(STORE_KEY, s);
}

/** Set one value in place, keeping dependent settings consistent. */
export function applySetting(s, key, value) {
  s[key] = value;
  // Open-close-open needs a top tempo above the base tempo.
  if (key === 'bpm' && s.mode === 'oco' && s.ocoHigh <= s.bpm) {
    s.ocoHigh = Math.min(STEPPERS.ocoHigh.max, s.bpm + 20);
  }
  return s;
}

/** Build Sequencer options from settings and the (parsed) pattern to play. */
export function toSeqOptions(s, pattern) {
  return {
    pattern,
    bpm: s.bpm,
    mode: s.mode,
    oco: { high: s.ocoHigh, cycles: s.ocoCycles },
    ramp: {
      mode: s.mode === 'loop' ? s.rampMode : 'off',
      inc: s.rampInc,
      every: s.rampMode === 'reps' ? s.rampEveryReps : s.rampEverySec,
      target: s.rampTarget,
    },
    countIn: s.countIn,
    durationSec: s.sessionMin * 60,
    subClick: s.subClick,
  };
}
