// Practice log drawer: totals and streak, best clean tempos, recent sessions,
// and JSON export/import.

import { el } from './dom.js';
import { summary } from '../log.js';

const RECENT = 50;

export class LogPanel {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {(id: string) => string} o.nameOf      rudiment display name
   * @param {() => void} o.onExport
   * @param {(file: File) => void} o.onImport
   * @param {(id: string) => void} o.onClearBest
   */
  constructor({ root, nameOf, onExport, onImport, onClearBest }) {
    Object.assign(this, { root, nameOf, onExport, onImport, onClearBest });
  }

  render(log, now = new Date()) {
    this.root.textContent = '';
    const s = summary(log, now);

    const stats = el('div', 'stats');
    for (const [value, label] of [
      [fmtMinutes(s.todaySec), 'today'],
      [String(s.streak), 'day streak'],
      [fmtMinutes(s.weekSec), 'last 7 days'],
    ]) {
      const box = el('div', 'stat');
      box.append(el('b', null, value), el('span', null, label));
      stats.append(box);
    }
    this.root.append(stats);

    // best clean tempo
    this.root.append(el('h3', 'panel-h', 'Best clean tempo'));
    const best = Object.entries(log.best).sort((a, b) => this.nameOf(a[0]).localeCompare(this.nameOf(b[0])));
    if (!best.length) {
      this.root.append(el('p', 'empty', 'While playing, tap “✓ Clean” when you can play the rudiment cleanly. The tempo is saved here.'));
    }
    for (const [id, b] of best) {
      const row = el('div', 'log-row');
      const x = el('button', 'icon-btn', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', `Clear best tempo for ${this.nameOf(id)}`);
      x.addEventListener('click', () => {
        if (confirm(`Clear the best tempo for ${this.nameOf(id)}?`)) this.onClearBest(id);
      });
      row.append(el('span', 'log-name', this.nameOf(id)), el('b', 'log-bpm', `${b.bpm} BPM`), el('small', 'log-date', fmtDay(b.date, now)), x);
      this.root.append(row);
    }

    // recent sessions
    this.root.append(el('h3', 'panel-h', 'Recent sessions'));
    const recent = log.sessions.slice(-RECENT).reverse();
    if (!recent.length) this.root.append(el('p', 'empty', 'Sessions of 10 seconds or longer show up here.'));
    for (const r of recent) {
      const row = el('div', 'log-row session');
      const range = r.minBpm === r.maxBpm ? `${r.minBpm}` : `${r.minBpm}–${r.maxBpm}`;
      const main = el('div', 'log-main');
      main.append(el('span', 'log-name', this.nameOf(r.rudiment)), el('small', 'log-date',
        `${fmtDay(r.date, now)} ${fmtClock(r.date)}${r.routine ? ` · ${r.routine}` : ''}`));
      const right = el('div', 'log-right');
      right.append(el('b', null, fmtDuration(r.durationSec)), el('small', null, `${range} BPM${r.cleanBpm ? ` · ✓ ${r.cleanBpm}` : ''}`));
      row.append(main, right);
      this.root.append(row);
    }
    if (log.sessions.length > RECENT) {
      this.root.append(el('p', 'hint', `Showing the latest ${RECENT} of ${log.sessions.length} sessions. The export has all of them.`));
    }

    // backup
    this.root.append(el('h3', 'panel-h', 'Backup'));
    this.root.append(el('p', 'hint', `${log.lastExport ? `Last export: ${fmtDay(log.lastExport, now)}.` : 'Never exported.'} Safari can clear this app's data, so export now and then and keep the file in Files. Importing adds to what is here; settings come from the file.`));
    const actions = el('div', 'panel-actions');
    const exp = el('button', 'chip primary', 'Export');
    exp.type = 'button';
    exp.addEventListener('click', () => this.onExport());
    const imp = el('button', 'chip', 'Import…');
    imp.type = 'button';
    const file = el('input');
    Object.assign(file, { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', () => {
      if (file.files?.[0]) this.onImport(file.files[0]);
      file.value = '';
    });
    imp.addEventListener('click', () => file.click());
    actions.append(exp, imp, file);
    this.root.append(actions);
  }
}

function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function fmtDuration(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function fmtDay(iso, now) {
  const d = new Date(iso);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

function fmtClock(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
