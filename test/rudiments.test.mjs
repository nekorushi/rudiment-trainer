import test from 'node:test';
import assert from 'node:assert/strict';
import { RUDIMENTS, COLLECTIONS, getCollection, groupRudiments, groupLabel } from '../js/rudiments.js';
import { Sequencer } from '../js/sequencer.js';
import { BPM_MAX } from '../js/settings.js';

test('rudiment ids are unique across collections; each rudiment belongs to a known collection and family', () => {
  assert.equal(new Set(RUDIMENTS.map((r) => r.id)).size, RUDIMENTS.length);
  assert.equal(new Set(COLLECTIONS.map((c) => c.id)).size, COLLECTIONS.length);
  for (const r of RUDIMENTS) {
    const c = getCollection(r.collection);
    assert.ok(c, `${r.id}: collection ${r.collection}`);
    assert.ok(c.families.includes(r.family), `${r.id}: family ${r.family}`);
    assert.match(r.id, /^[a-z0-9-]+$/);
  }
});

test('NARD 26 plus the 14 PAS additions make the PAS 40', () => {
  assert.deepEqual(COLLECTIONS.map((c) => c.id), ['nard', 'pas']);
  assert.equal(RUDIMENTS.filter((r) => r.collection === 'nard').length, 26);
  assert.equal(RUDIMENTS.filter((r) => r.collection === 'pas').length, 14);
});

test('grouping lists every rudiment once, collection by collection, family by family', () => {
  const groups = groupRudiments();
  const listed = groups.flatMap((g) => g.families.flatMap((f) => f.rudiments.map((r) => r.id)));
  assert.deepEqual([...listed].sort(), RUDIMENTS.map((r) => r.id).sort());
  assert.deepEqual(groups[0].families.map((f) => f.name), ['Rolls', 'Diddles', 'Flams', 'Drags']);
  assert.equal(groupLabel(RUDIMENTS[0]), 'NARD 26 · Rolls');
});

test('every rudiment uses a grid and bar length the notation can draw', () => {
  for (const r of RUDIMENTS) {
    assert.ok([1, 2, 3, 4, 6, 8].includes(r.grid), `${r.id}: grid ${r.grid}`);
    if (r.bar !== undefined) assert.equal(r.beats % r.bar, 0, `${r.id}: ${r.beats} beats in bars of ${r.bar}`);
  }
});

test('rudiments start with a stroke and both hands play', () => {
  for (const r of RUDIMENTS) {
    assert.equal(r.steps[0].kind, 'note', `${r.id} starts on a stroke`);
    const hands = new Set(r.steps.filter((s) => s.kind === 'note').map((s) => s.hand));
    assert.deepEqual([...hands].sort(), ['L', 'R'], r.id);
  }
});

test('stroke rolls have the number of strokes in their name', () => {
  const counts = { five: 5, six: 6, seven: 7, nine: 9, ten: 10, eleven: 11, thirteen: 13, fifteen: 15, seventeen: 17 };
  for (const [word, n] of Object.entries(counts)) {
    const r = RUDIMENTS.find((x) => x.id === `${word}-stroke-roll`);
    const notes = r.steps.filter((s) => s.kind === 'note').length;
    assert.ok(notes === n || notes === 2 * n, `${r.id}: ${notes} strokes`);
  }
});

test('grace notes never land before the previous stroke, even at top tempo', () => {
  for (const r of RUDIMENTS) {
    // Two repetitions so the wrap-around from the last step to the first is checked too.
    const seq = new Sequencer({ pattern: r, bpm: BPM_MAX });
    let lastMain = -Infinity;
    for (let i = 0; i < r.steps.length * 2; i += 1) {
      const ev = seq.next();
      for (const n of ev.notes) {
        const t = ev.time + n.offset;
        if (n.kind === 'grace') assert.ok(t > lastMain + 1e-6, `${r.id} step ${ev.step}: grace overlaps previous stroke`);
      }
      const main = ev.notes.find((n) => n.kind !== 'grace');
      if (main) lastMain = ev.time;
    }
  }
});
