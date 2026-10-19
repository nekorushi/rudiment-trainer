// Routines: ordered practice lists, each item with its own rudiment, tempo,
// length and mode. Data model, validation, storage and the mapping to
// RoutineSequence options. DOM-free, tested in Node.
//
// Stored under ROUTINES_KEY as [{ id, name, items: [{ rudiment, bpm, minutes, mode, ocoHigh }] }].

import { readJSON, writeJSON } from './store.js';
import { clamp, BPM_MIN, BPM_MAX, STEPPERS } from './settings.js';

export const ROUTINES_KEY = 'rudiments.routines.v1';
export const MINUTES = { min: 1, max: 30 };
export const MAX_ITEMS = 40;

/** Shown until the first routine is saved, so there is something to try. */
export const EXAMPLE_ROUTINES = [
  {
    id: 'example-warm-up',
    name: 'Daily warm-up',
    items: [
      { rudiment: 'single-stroke-roll', bpm: 80, minutes: 2, mode: 'loop', ocoHigh: 120 },
      { rudiment: 'long-roll', bpm: 70, minutes: 2, mode: 'oco', ocoHigh: 120 },
      { rudiment: 'single-paradiddle', bpm: 80, minutes: 2, mode: 'loop', ocoHigh: 120 },
      { rudiment: 'flam-accent', bpm: 70, minutes: 2, mode: 'loop', ocoHigh: 110 },
    ],
  },
];

export function newId() {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const int = (v, fallback) => (Number.isFinite(v) ? Math.round(v) : fallback);

/** Coerce one item; null if its rudiment is unknown. */
export function sanitizeItem(raw, rudimentIds) {
  if (!raw || typeof raw !== 'object' || !rudimentIds.includes(raw.rudiment)) return null;
  const bpm = clamp(int(raw.bpm, 80), BPM_MIN, BPM_MAX);
  const mode = raw.mode === 'oco' ? 'oco' : 'loop';
  let ocoHigh = clamp(int(raw.ocoHigh, bpm + 30), STEPPERS.ocoHigh.min, STEPPERS.ocoHigh.max);
  if (ocoHigh <= bpm) ocoHigh = Math.min(STEPPERS.ocoHigh.max, bpm + 20);
  return { rudiment: raw.rudiment, bpm, minutes: clamp(int(raw.minutes, 2), MINUTES.min, MINUTES.max), mode, ocoHigh };
}

/** Coerce one routine; null if nothing playable is left in it. */
export function sanitizeRoutine(raw, rudimentIds) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return null;
  const items = raw.items.slice(0, MAX_ITEMS).map((it) => sanitizeItem(it, rudimentIds)).filter(Boolean);
  if (!items.length) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'Routine';
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : newId();
  return { id, name, items };
}

export function sanitizeRoutines(raw, rudimentIds) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const r of raw) {
    const ok = sanitizeRoutine(r, rudimentIds);
    if (ok) byId.set(ok.id, ok);
  }
  return [...byId.values()];
}

/** Saved routines, or the examples if none were ever saved. */
export function loadRoutines(rudimentIds) {
  const raw = readJSON(ROUTINES_KEY, null);
  return sanitizeRoutines(raw ?? structuredClone(EXAMPLE_ROUTINES), rudimentIds);
}

export function saveRoutines(list) {
  return writeJSON(ROUTINES_KEY, list);
}

/** Incoming routines replace ones with the same id; others are kept. */
export function mergeRoutines(current, incoming) {
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()];
}

export function routineMinutes(routine) {
  return routine.items.reduce((s, it) => s + it.minutes, 0);
}

/**
 * RoutineSequence options for a routine. Count-in, sub-click and the
 * open-close-open sweep length come from the practice settings.
 */
export function toRoutineOptions(routine, settings, getPattern) {
  return {
    countIn: settings.countIn,
    subClick: settings.subClick,
    items: routine.items.map((it) => ({
      pattern: getPattern(it.rudiment),
      bpm: it.bpm,
      mode: it.mode,
      oco: { high: it.ocoHigh, cycles: settings.ocoCycles },
      durationSec: it.minutes * 60,
    })),
  };
}
