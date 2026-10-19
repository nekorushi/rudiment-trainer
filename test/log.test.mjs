import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLog, dayKey, sanitizeLog, addSessions, markClean, clearBest, mergeLogs,
  dailySeconds, streak, summary, SessionTracker, MIN_SESSION_SEC,
} from '../js/log.js';

// Local-time dates at noon, so day keys don't depend on the test machine's time zone.
const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
const rec = (date, rudiment = 'flam', durationSec = 300, extra = {}) => ({
  id: `${date.getTime()}-${rudiment}`, date: date.toISOString(), rudiment, durationSec, minBpm: 80, maxBpm: 90, reps: 10, ...extra,
});

test('day keys use the local calendar day', () => {
  assert.equal(dayKey(day(2026, 3, 9)), '2026-03-09');
  assert.equal(dayKey(day(2026, 12, 31, 23)), '2026-12-31');
});

test('sanitizing drops broken sessions and best entries, sorts and dedupes', () => {
  const a = rec(day(2026, 1, 2));
  const b = rec(day(2026, 1, 1));
  const log = sanitizeLog({
    sessions: [a, b, a, { rudiment: 'x' }, { ...a, id: 'bad-date', date: 'nope' }, null, { ...b, id: 'neg', durationSec: -5 }],
    best: { flam: { bpm: 96.4, date: day(2026, 1, 1).toISOString() }, ruff: { bpm: 'fast' }, tap: null },
    lastExport: 'yesterday-ish',
  });
  assert.deepEqual(log.sessions.map((s) => s.id), [b.id, a.id]);
  assert.deepEqual(Object.keys(log.best), ['flam']);
  assert.equal(log.best.flam.bpm, 96);
  assert.equal(log.lastExport, null);
  assert.deepEqual(sanitizeLog('garbage'), emptyLog());
});

test('best tempo only goes up, and can be cleared', () => {
  const log = emptyLog();
  assert.equal(markClean(log, 'flam', 90, day(2026, 1, 1)), true);
  assert.equal(markClean(log, 'flam', 85), false);
  assert.equal(markClean(log, 'flam', 90), false);
  assert.equal(markClean(log, 'flam', 100, day(2026, 1, 3)), true);
  assert.equal(log.best.flam.bpm, 100);
  clearBest(log, 'flam');
  assert.equal(log.best.flam, undefined);
});

test('merging logs unions sessions and keeps the higher best', () => {
  const a = emptyLog();
  const b = emptyLog();
  addSessions(a, [rec(day(2026, 1, 1)), rec(day(2026, 1, 2))]);
  addSessions(b, [rec(day(2026, 1, 2)), rec(day(2026, 1, 3))]);
  markClean(a, 'flam', 100);
  markClean(b, 'flam', 90);
  markClean(b, 'ruff', 70);
  const m = mergeLogs(a, b);
  assert.equal(m.sessions.length, 3);
  assert.equal(m.best.flam.bpm, 100);
  assert.equal(m.best.ruff.bpm, 70);
});

test('daily totals, streak and summary', () => {
  const now = day(2026, 5, 10, 18);
  const sessions = [
    rec(day(2026, 5, 3), 'flam', 600),       // a week ago: outside the streak and the 7-day window
    rec(day(2026, 5, 7), 'flam', 300),
    rec(day(2026, 5, 8), 'flam', 300),
    rec(day(2026, 5, 9, 9), 'flam', 120),
    rec(day(2026, 5, 9, 20), 'ruff', 180),
  ];
  assert.equal(dailySeconds(sessions).get('2026-05-09'), 300);
  assert.equal(streak(sessions, now), 3, 'nothing today yet: the streak runs through yesterday');
  assert.equal(streak([...sessions, rec(day(2026, 5, 10, 8))], now), 4);
  assert.equal(streak(sessions, day(2026, 5, 11)), 0, 'a missed day ends it');
  assert.equal(streak([], now), 0);

  const s = summary({ sessions }, now);
  assert.equal(s.todaySec, 0);
  assert.equal(s.weekSec, 900);
  assert.equal(s.totalSec, 1500);
  assert.equal(s.count, 5);
});

// ---- tracker -------------------------------------------------------------------

function play(time, patternId, { bpm = 120, step = 0, dur = 0.5, item } = {}) {
  return { phase: 'play', time, dur, bpm, step, patternId, item };
}

test('the tracker turns heard events into one record per rudiment', () => {
  let clock = day(2026, 2, 1, 10);
  const tracker = new SessionTracker({ now: () => clock });
  tracker.add({ phase: 'count', time: 0, bpm: 120 });
  for (let i = 0; i < 40; i += 1) tracker.add(play(1 + i * 0.5, 'flam', { bpm: 100 + i, step: i % 2 }));
  tracker.markClean(130.6);
  clock = day(2026, 2, 1, 10, 30);
  for (let i = 0; i < 30; i += 1) tracker.add(play(21 + i * 0.5, 'ruff', { step: i % 4 }));
  const recs = tracker.finish();

  assert.equal(recs.length, 2);
  const [flam, ruff] = recs;
  assert.equal(flam.rudiment, 'flam');
  assert.equal(flam.durationSec, 20);
  assert.equal(flam.minBpm, 100);
  assert.equal(flam.maxBpm, 139);
  assert.equal(flam.reps, 20);
  assert.equal(flam.cleanBpm, 131);
  assert.equal(flam.date, day(2026, 2, 1, 10).toISOString());
  assert.equal(ruff.durationSec, 15);
  assert.equal(ruff.cleanBpm, undefined);
  assert.deepEqual(tracker.finish(), [], 'finish hands records over once');
});

test('short runs are not logged, and routine items are separate records', () => {
  const t = new SessionTracker({ routine: 'Warm-up' });
  t.add(play(0, 'flam', { dur: MIN_SESSION_SEC - 2 }));
  assert.deepEqual(t.finish(), []);

  for (let i = 0; i < 30; i += 1) t.add(play(i, 'flam', { item: 0, dur: 1 }));
  for (let i = 30; i < 60; i += 1) t.add(play(i, 'flam', { item: 1, dur: 1 }));
  const recs = t.finish();
  assert.equal(recs.length, 2, 'same rudiment twice in a routine: two records');
  assert.ok(recs.every((r) => r.routine === 'Warm-up' && r.durationSec === 30));
});
