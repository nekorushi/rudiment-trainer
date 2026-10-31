// Rudiment library: a registry of collections (NARD 26, PAS additions), each in its own
// module under js/collections/. A collection is
//   { id, name, title, families: [display order], specs: [rudiment spec] }
// and every rudiment gets `collection` set to its collection's id.
//
// Spec notation (one token per grid step, `grid` steps = one beat):
//   R L = accented stroke   r l = unaccented tap   . = rest
//   (l)R = flam   (ll)R = drag   R~ - - - = buzz roll held across the "-" steps
// For the staff, a note lasts until the next stroke (rests after a stroke just
// lengthen it), and `bar` sets beats per bar (default: 2 if the beat count is
// even, else all beats in one bar). Grids must be 1, 2, 3, 4, 6 or 8 so the
// notation can spell them (straight, triplet or sextuplet).
//
// Rudiment ids are global and permanent (the log and routines refer to them),
// so a new collection must not reuse an id from another one.

import { parsePattern } from './sequencer.js';
import { NARD } from './collections/nard.js';
import { PAS } from './collections/pas.js';

const SOURCES = [NARD, PAS];

/** Collection metadata in display order: { id, name, title, families }. */
export const COLLECTIONS = SOURCES.map(({ specs, ...meta }) => meta);

export const RUDIMENTS = SOURCES.flatMap((c) => c.specs.map((s) => parsePattern({ ...s, collection: c.id })));

export function getRudiment(id) {
  return RUDIMENTS.find((r) => r.id === id) ?? RUDIMENTS[0];
}

export function getCollection(id) {
  return COLLECTIONS.find((c) => c.id === id);
}

/** "NARD 26 · Rolls" */
export function groupLabel(r) {
  const c = getCollection(r.collection);
  return [c?.name, r.family].filter(Boolean).join(' · ');
}

/**
 * Rudiments grouped for lists and pickers, in display order:
 * [{ collection, families: [{ name, rudiments }] }]. Empty groups are left out.
 */
export function groupRudiments(rudiments = RUDIMENTS) {
  return COLLECTIONS.map((collection) => ({
    collection,
    families: collection.families
      .map((name) => ({ name, rudiments: rudiments.filter((r) => r.collection === collection.id && r.family === name) }))
      .filter((f) => f.rudiments.length),
  })).filter((g) => g.families.length);
}
