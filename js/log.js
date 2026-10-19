// Practice log: session records, best clean tempo per rudiment, daily totals
// and streak. DOM-free (the clock is injectable), so it is tested in Node.
//
// Stored under LOG_KEY as { sessions: [record], best: { [rudimentId]: { bpm, date } }, lastExport }.
// A record: { id, date (ISO start), rudiment, durationSec, minBpm, maxBpm, reps, cleanBpm?, routine? }.

import { readJSON, writeJSON } from './store.js';

export const LOG_KEY = 'rudiments.log.v1';
export const MIN_SESSION_SEC = 10; // shorter runs (a quick listen) are not logged
const MAX_SESSIONS = 5000;

export function emptyLog() {
  return { sessions: [], best: {}, lastExport: null };
}

// ---- dates -------------------------------------------------------------------

/** Local calendar day "YYYY-MM-DD" of a Date or ISO string. */
export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n, 12);
}

const isoOrNull = (v) => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

// ---- validation and storage --------------------------------------------------

function sanitizeSession(s) {
  if (!s || typeof s !== 'object') return null;
  const date = isoOrNull(s.date);
  if (!date || typeof s.rudiment !== 'string' || !s.rudiment) return null;
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const durationSec = num(s.durationSec);
  const minBpm = num(s.minBpm);
  const maxBpm = num(s.maxBpm);
  if (durationSec === null || minBpm === null || maxBpm === null) return null;
  const rec = {
    id: typeof s.id === 'string' && s.id ? s.id : `${Date.parse(date)}-${s.rudiment}`,
    date,
    rudiment: s.rudiment,
    durationSec,
    minBpm,
    maxBpm,
    reps: num(s.reps) ?? 0,
  };
  if (num(s.cleanBpm)) rec.cleanBpm = num(s.cleanBpm);
  if (typeof s.routine === 'string' && s.routine) rec.routine = s.routine.slice(0, 60);
  return rec;
}

function normalizeSessions(list) {
  const byId = new Map();
  for (const s of list) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SESSIONS);
}

/** Coerce stored or imported log data; bad entries are dropped, not repaired. */
export function sanitizeLog(raw) {
  const log = emptyLog();
  if (!raw || typeof raw !== 'object') return log;
  if (Array.isArray(raw.sessions)) log.sessions = normalizeSessions(raw.sessions.map(sanitizeSession).filter(Boolean));
  if (raw.best && typeof raw.best === 'object') {
    for (const [id, v] of Object.entries(raw.best)) {
      const date = isoOrNull(v?.date);
      if (date && Number.isFinite(v.bpm) && v.bpm > 0) log.best[id] = { bpm: Math.round(v.bpm), date };
    }
  }
  log.lastExport = isoOrNull(raw.lastExport);
  return log;
}

export function loadLog() {
  return sanitizeLog(readJSON(LOG_KEY, null));
}

export function saveLog(log) {
  return writeJSON(LOG_KEY, log);
}

// ---- changes -----------------------------------------------------------------

export function addSessions(log, records) {
  log.sessions = normalizeSessions([...log.sessions, ...records]);
  return log;
}

/** Record a clean tempo. Returns true if it is a new best for that rudiment. */
export function markClean(log, rudiment, bpm, date = new Date()) {
  const cur = log.best[rudiment];
  if (cur && cur.bpm >= bpm) return false;
  log.best[rudiment] = { bpm: Math.round(bpm), date: new Date(date).toISOString() };
  return true;
}

export function clearBest(log, rudiment) {
  delete log.best[rudiment];
  return log;
}

/** Union of two logs: sessions by id, the higher best tempo per rudiment. */
export function mergeLogs(a, b) {
  const out = emptyLog();
  out.sessions = normalizeSessions([...a.sessions, ...b.sessions]);
  out.best = { ...a.best };
  for (const [id, v] of Object.entries(b.best)) {
    if (!out.best[id] || v.bpm > out.best[id].bpm) out.best[id] = v;
  }
  const exports = [a.lastExport, b.lastExport].filter(Boolean).sort();
  out.lastExport = exports.at(-1) ?? null;
  return out;
}

// ---- statistics --------------------------------------------------------------

/** Seconds practised per local day: Map("YYYY-MM-DD" -> seconds). */
export function dailySeconds(sessions) {
  const days = new Map();
  for (const s of sessions) {
    const k = dayKey(s.date);
    days.set(k, (days.get(k) ?? 0) + s.durationSec);
  }
  return days;
}

/**
 * Consecutive days with practice, ending today, or ending yesterday if today
 * has none yet (the streak is still alive until the day is over).
 */
export function streak(sessions, now = new Date()) {
  const days = dailySeconds(sessions);
  let d = days.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

export function summary(log, now = new Date()) {
  const days = dailySeconds(log.sessions);
  let weekSec = 0;
  for (let i = 0; i < 7; i += 1) weekSec += days.get(dayKey(addDays(now, -i))) ?? 0;
  return {
    todaySec: days.get(dayKey(now)) ?? 0,
    weekSec,
    streak: streak(log.sessions, now),
    totalSec: log.sessions.reduce((s, x) => s + x.durationSec, 0),
    count: log.sessions.length,
  };
}

// ---- turning playback into records ---------------------------------------------

/**
 * Builds session records from the engine's visual events as they are heard.
 * A new record starts whenever the rudiment (or routine item) changes, so a
 * session where you switch rudiments logs one record per rudiment.
 */
export class SessionTracker {
  /**
   * @param {object} [o]
   * @param {() => Date} [o.now]
   * @param {string} [o.routine]  routine name to stamp on the records
   */
  constructor({ now = () => new Date(), routine } = {}) {
    this.now = now;
    this.routine = routine;
    this.cur = null;
    this.records = [];
  }

  /** Feed every visual event (count-in and end events are ignored). */
  add(ev) {
    if (ev.phase !== 'play') return;
    const key = `${ev.patternId}|${ev.item ?? ''}`;
    if (this.cur && this.cur.key !== key) this._close();
    if (!this.cur) {
      this.cur = {
        key, rudiment: ev.patternId, startedAt: this.now(),
        t0: ev.time, t1: ev.time, minBpm: Infinity, maxBpm: 0, reps: 0, cleanBpm: 0,
      };
    }
    const c = this.cur;
    c.t1 = ev.time + (ev.dur ?? 0);
    c.minBpm = Math.min(c.minBpm, ev.bpm);
    c.maxBpm = Math.max(c.maxBpm, ev.bpm);
    if (ev.step === 0) c.reps += 1;
  }

  /** Note a clean tempo on the record being played. */
  markClean(bpm) {
    if (this.cur) this.cur.cleanBpm = Math.max(this.cur.cleanBpm, Math.round(bpm));
  }

  /** Close the current record and hand over everything collected so far. */
  finish() {
    this._close();
    const out = this.records;
    this.records = [];
    return out;
  }

  _close() {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    const durationSec = Math.round(c.t1 - c.t0);
    if (durationSec < MIN_SESSION_SEC) return;
    const rec = {
      id: `${c.startedAt.getTime()}-${c.rudiment}`,
      date: c.startedAt.toISOString(),
      rudiment: c.rudiment,
      durationSec,
      minBpm: Math.round(c.minBpm),
      maxBpm: Math.round(c.maxBpm),
      reps: c.reps,
    };
    if (c.cleanBpm) rec.cleanBpm = c.cleanBpm;
    if (this.routine) rec.routine = this.routine;
    this.records.push(rec);
  }
}
