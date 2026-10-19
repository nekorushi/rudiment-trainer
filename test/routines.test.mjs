import test from 'node:test';
import assert from 'node:assert/strict';
import { RUDIMENTS, getRudiment } from '../js/rudiments.js';
import { DEFAULTS } from '../js/settings.js';
import { emptyLog, addSessions, markClean } from '../js/log.js';
import {
  EXAMPLE_ROUTINES, sanitizeItem, sanitizeRoutine, sanitizeRoutines, mergeRoutines,
  routineMinutes, toRoutineOptions,
} from '../js/routines.js';
import { makeBackup, readBackup, mergeBackup, backupFileName, BACKUP_FORMAT } from '../js/backup.js';
import { RoutineSequence } from '../js/sequencer.js';

const IDS = RUDIMENTS.map((r) => r.id);

test('example routines are valid and use real rudiments', () => {
  const ok = sanitizeRoutines(EXAMPLE_ROUTINES, IDS);
  assert.deepEqual(ok, EXAMPLE_ROUTINES);
});

test('items are clamped and fixed up; unknown rudiments are dropped', () => {
  assert.equal(sanitizeItem({ rudiment: 'nope', bpm: 80 }, IDS), null);
  const it = sanitizeItem({ rudiment: 'flam', bpm: 999, minutes: 0, mode: 'disco', ocoHigh: 'x' }, IDS);
  assert.deepEqual(it, { rudiment: 'flam', bpm: 260, minutes: 1, mode: 'loop', ocoHigh: 290 });
  const oco = sanitizeItem({ rudiment: 'flam', bpm: 100, minutes: 3, mode: 'oco', ocoHigh: 90 }, IDS);
  assert.equal(oco.ocoHigh, 120, 'top tempo is kept above the base tempo');
});

test('routines need a playable item; names and ids get defaults', () => {
  assert.equal(sanitizeRoutine({ name: 'x', items: [{ rudiment: 'nope' }] }, IDS), null);
  const r = sanitizeRoutine({ name: '   ', items: [{ rudiment: 'ruff', bpm: 70, minutes: 4 }] }, IDS);
  assert.equal(r.name, 'Routine');
  assert.match(r.id, /^r-/);
  assert.equal(routineMinutes(r), 4);
  assert.deepEqual(sanitizeRoutines('nope', IDS), []);
});

test('merging routines: same id is replaced, others kept', () => {
  const a = [{ id: '1', name: 'A', items: [] }, { id: '2', name: 'B', items: [] }];
  const b = [{ id: '2', name: 'B2', items: [] }, { id: '3', name: 'C', items: [] }];
  assert.deepEqual(mergeRoutines(a, b).map((r) => r.name), ['A', 'B2', 'C']);
});

test('a routine becomes RoutineSequence options that play', () => {
  const [routine] = EXAMPLE_ROUTINES;
  const opts = toRoutineOptions(routine, { ...DEFAULTS, countIn: 4, ocoCycles: 6 }, getRudiment);
  assert.equal(opts.items.length, routine.items.length);
  assert.equal(opts.items[1].mode, 'oco');
  assert.deepEqual(opts.items[1].oco, { high: 120, cycles: 6 });
  assert.equal(opts.items[0].durationSec, 120);
  assert.equal(opts.items[0].pattern.id, 'single-stroke-roll');
  const seq = new RoutineSequence(opts);
  assert.equal(seq.next().phase, 'count');
});

test('backup round trip merges into existing data', () => {
  const log = emptyLog();
  addSessions(log, [{ id: 'a', date: '2026-01-01T10:00:00.000Z', rudiment: 'flam', durationSec: 60, minBpm: 80, maxBpm: 80, reps: 3 }]);
  markClean(log, 'flam', 100);
  const settings = { ...DEFAULTS, bpm: 111 };
  const routines = [{ id: 'mine', name: 'Mine', items: [{ rudiment: 'ruff', bpm: 70, minutes: 2, mode: 'loop', ocoHigh: 100 }] }];

  const file = JSON.stringify(makeBackup({ settings, log, routines }, new Date(2026, 0, 2)));
  const incoming = readBackup(file, IDS);
  assert.equal(incoming.settings.bpm, 111);

  const here = emptyLog();
  addSessions(here, [{ id: 'b', date: '2026-01-02T10:00:00.000Z', rudiment: 'ruff', durationSec: 60, minBpm: 70, maxBpm: 70, reps: 3 }]);
  markClean(here, 'flam', 120);
  const merged = mergeBackup({ settings: DEFAULTS, log: here, routines: EXAMPLE_ROUTINES }, incoming);
  assert.deepEqual(merged.log.sessions.map((s) => s.id), ['a', 'b']);
  assert.equal(merged.log.best.flam.bpm, 120, 'the higher best wins');
  assert.deepEqual(merged.routines.map((r) => r.id), ['example-warm-up', 'mine']);
  assert.equal(merged.settings.bpm, 111);
});

test('backups from elsewhere are refused with a clear message', () => {
  assert.throws(() => readBackup('{not json', IDS), /not valid JSON/);
  assert.throws(() => readBackup({ hello: 1 }, IDS), /not a Rudiment Trainer backup/);
  assert.throws(() => readBackup({ format: BACKUP_FORMAT, version: 99 }, IDS), /newer version/);
  assert.match(backupFileName(new Date(2026, 9, 5)), /^rudiments-backup-2026-10-05\.json$/);
});
