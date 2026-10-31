// Composition root: holds the app state (settings, log, routines), renders the
// practice screen and wires input to the Player and the drawers. Feature logic
// lives in the modules imported below.

import { RUDIMENTS, getRudiment, groupRudiments, groupLabel } from './rudiments.js';
import { RoutineSequence } from './sequencer.js';
import { BPM_MIN, BPM_MAX, clamp, loadSettings, saveSettings, applySetting, toSeqOptions } from './settings.js';
import { loadLog, saveLog, addSessions, markClean, clearBest, SessionTracker } from './log.js';
import { loadRoutines, saveRoutines, toRoutineOptions } from './routines.js';
import { makeBackup, readBackup, mergeBackup, backupFileName } from './backup.js';
import { Player } from './player.js';
import { $, $$ } from './ui/dom.js';
import { StickingView } from './ui/sticking.js';
import { NotationView } from './ui/notation.js';
import { renderLibrary, markLibrary } from './ui/library.js';
import { createDrawer } from './ui/drawer.js';
import { holdRepeat, bindControls, renderControls } from './ui/controls.js';
import { RoutinesPanel } from './ui/routines.js';
import { LogPanel } from './ui/logview.js';

const IDS = RUDIMENTS.map((r) => r.id);
const S = loadSettings(IDS);
let log = loadLog();
let routines = loadRoutines(IDS);

const views = { notation: new NotationView($('#notation')), sticking: new StickingView($('#sticking')) };
const view = () => views[S.view];
const player = new Player({ onEvent: handleEvent, onStop: handleStop });
const nameOf = (id) => RUDIMENTS.find((r) => r.id === id)?.name ?? id;

let tracker = null;  // SessionTracker for the current playback
let routine = null;  // the routine being played, or null in free practice
let lastPlay = null; // latest heard play event (for "Clean")
let lastSecond = -1;
let drawers = [];
let toastTimer = 0;

const routinesPanel = new RoutinesPanel({
  root: $('#routines'),
  rudiments: RUDIMENTS,
  groups: groupRudiments(),
  onPlay: playRoutine,
  onChange: (list) => {
    routines = list;
    saveRoutines(routines);
    routinesPanel.render(routines);
  },
});

const logPanel = new LogPanel({
  root: $('#log'),
  nameOf,
  onExport: exportBackup,
  onImport: importBackup,
  onClearBest: (id) => {
    clearBest(log, id);
    saveLog(log);
    logPanel.render(log);
  },
});

// ---- state changes -----------------------------------------------------------

function set(key, value) {
  if (key === 'view' && value !== S.view) view().clearHighlight();
  applySetting(S, key, value);
  saveSettings(S);
  render();
  player.setSound(S);
  player.update(toSeqOptions(S, getRudiment(S.rudiment))); // a routine only takes sub-click from this
}

// ---- rendering ---------------------------------------------------------------

function render() {
  const r = getRudiment(S.rudiment);
  // During a routine the header and tempo follow the routine (see showRoutineEvent).
  if (!routine) {
    $('#r-name').textContent = r.name;
    $('#r-family').textContent = groupLabel(r);
    $('#bpm-value').textContent = S.bpm;
  }
  $('#notation').hidden = S.view !== 'notation';
  $('#sticking').hidden = S.view !== 'sticking';
  $('#notation').setAttribute('aria-label', `${r.name}: ${r.notation}`);
  // While playing, the pattern view follows the engine (a new rudiment starts at the next rep).
  if (!player.playing && view().patternId !== r.id) view().show(r);

  $('#bpm-range').value = S.bpm;
  renderControls(document, S);

  const oco = S.mode === 'oco';
  const rampOn = !oco && S.rampMode !== 'off';
  $$('.only-oco').forEach((el) => { el.hidden = !oco; });
  $$('.only-ramp').forEach((el) => { el.hidden = !rampOn; });
  $$('.only-time').forEach((el) => { el.hidden = !(rampOn && S.rampMode === 'time'); });
  $$('.only-reps').forEach((el) => { el.hidden = !(rampOn && S.rampMode === 'reps'); });
  $('#ramp-card').classList.toggle('dim', oco);
  $$('#ramp-card [data-seg] button').forEach((b) => { b.disabled = oco; });

  $('#mode-hint').textContent = oco
    ? `Sweeps from ${S.bpm} up to ${S.ocoHigh} BPM and back down, once every ${S.ocoCycles} repetitions.`
    : 'Repeats the rudiment at a steady tempo.';
  $('#ramp-hint').textContent = oco
    ? 'The ramp only applies in Loop mode.'
    : rampOn
      ? `Starts at ${S.bpm} BPM and ${S.rampTarget >= S.bpm ? 'speeds up' : 'slows down'} toward ${S.rampTarget} BPM.`
      : '';
}

function setPlayUi(on) {
  const btn = $('#play');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'Stop' : 'Start';
  $('#clean').hidden = !on;
  document.body.classList.toggle('locked', on && Boolean(routine));
  $('#routine-banner').hidden = !(on && routine);
}

function toast(message) {
  $('#toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 3500);
}

// ---- playback ----------------------------------------------------------------

async function startPlayback(source, routineToPlay = null) {
  player.setSound(S);
  routine = routineToPlay;
  tracker = new SessionTracker({ routine: routineToPlay?.name });
  try {
    await player.start(source);
  } catch (err) {
    routine = null;
    tracker = null;
    $('#live').textContent = `Couldn't start audio: ${err.message}`;
    return;
  }
  if (!player.playing) return;
  lastSecond = -1;
  lastPlay = null;
  setPlayUi(true);
  $('#live').textContent = S.countIn ? 'Count-in…' : 'Playing';
}

async function togglePlay() {
  if (player.playing) {
    player.stop('Stopped');
    return;
  }
  if (player.starting) return;
  await startPlayback(toSeqOptions(S, getRudiment(S.rudiment)));
}

async function playRoutine(r) {
  closeDrawers();
  if (player.starting) return;
  if (player.playing) player.stop('Stopped');
  await startPlayback(new RoutineSequence(toRoutineOptions(r, S, getRudiment)), r);
}

function handleStop(message) {
  const records = tracker?.finish() ?? [];
  tracker = null;
  routine = null;
  lastPlay = null;
  if (records.length) {
    addSessions(log, records);
    saveLog(log);
    logPanel.render(log);
  }
  setPlayUi(false);
  view().clearHighlight();
  $('#live').textContent = records.length ? `${message}  ·  saved to log` : message;
  render();
}

function handleEvent(ev) {
  tracker?.add(ev);
  if (ev.phase === 'end') {
    finishSession(ev);
    return;
  }
  if (ev.click && ev.click.level !== 'sub') pulse();
  if (routine) showRoutineEvent(ev);
  if (ev.phase === 'count') {
    lastPlay = null;
    const next = routine ? `${nameOf(ev.patternId)} at ${Math.round(ev.bpm)} BPM  ·  ` : '';
    $('#live').textContent = `${next}Count-in  ${ev.countIndex + 1} / ${ev.countTotal}`;
    return;
  }
  lastPlay = ev;
  const v = view();
  if (ev.patternId !== v.patternId) v.show(getRudiment(ev.patternId));
  v.highlight(ev.step);

  const sec = Math.floor(ev.elapsed);
  if (sec !== lastSecond || ev.step === 0) {
    lastSecond = sec;
    const parts = [`${Math.round(ev.bpm)} BPM`, `Rep ${ev.cycle + 1}`, fmtTime(ev.elapsed)];
    const total = routine ? routine.items[ev.item].minutes * 60 : S.sessionMin * 60;
    if (total > 0) parts.push(`${fmtTime(Math.max(0, total - ev.elapsed))} left`);
    $('#live').textContent = parts.join('  ·  ');
  }
}

/** Routine playback: header, tempo and banner follow the item being played. */
function showRoutineEvent(ev) {
  const r = getRudiment(ev.patternId);
  const v = view();
  if (r.id !== v.patternId) v.show(r);
  $('#r-name').textContent = r.name;
  $('#r-family').textContent = groupLabel(r);
  $('#bpm-value').textContent = Math.round(ev.bpm);
  const next = routine.items[ev.item + 1];
  $('#routine-banner').textContent =
    `${routine.name}  ·  ${ev.item + 1} / ${ev.itemCount}${next ? `  ·  next: ${nameOf(next.rudiment)}` : ''}`;
}

function finishSession(ev) {
  if (ev.routine) {
    player.stop(`Routine complete  ·  ${fmtTime(ev.elapsed)}  ·  ${ev.itemCount} rudiments`);
    return;
  }
  const lo = Math.round(ev.minBpm);
  const hi = Math.round(ev.maxBpm);
  const range = lo === hi ? `${lo} BPM` : `${lo}–${hi} BPM`;
  player.stop(`Session complete  ·  ${fmtTime(ev.elapsed)}  ·  ${range}  ·  ${ev.cycles} reps`);
}

/** "✓ Clean": save the tempo being played as clean for the rudiment being played. */
function markCleanNow() {
  if (!lastPlay) {
    toast('Wait until the count-in is over');
    return;
  }
  const id = lastPlay.patternId;
  const bpm = Math.round(lastPlay.bpm);
  const prev = log.best[id]?.bpm;
  const isBest = markClean(log, id, bpm);
  tracker?.markClean(bpm);
  saveLog(log);
  logPanel.render(log);
  toast(isBest ? `✓ ${bpm} BPM  ·  new best for ${nameOf(id)}` : `✓ Clean at ${bpm} BPM  ·  best is ${prev}`);
}

function pulse() {
  const el = $('#bpm-value');
  if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'ease-out' });
}

function fmtTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- backup ------------------------------------------------------------------

async function exportBackup() {
  const name = backupFileName();
  const file = new File([JSON.stringify(makeBackup({ settings: S, log, routines }), null, 2)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      // iPad: the share sheet offers "Save to Files".
      await navigator.share({ files: [file], title: 'Rudiment Trainer backup' });
    } else {
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast(`Export failed: ${err.message}`);
    return;
  }
  log.lastExport = new Date().toISOString();
  saveLog(log);
  logPanel.render(log);
  toast('Backup exported');
}

async function importBackup(file) {
  let incoming;
  try {
    incoming = readBackup(await file.text(), IDS);
  } catch (err) {
    alert(err.message);
    return;
  }
  const bests = Object.keys(incoming.log.best).length;
  const ok = confirm(
    `Import ${incoming.log.sessions.length} sessions, ${bests} best tempos and ${incoming.routines.length} routines?\n\n`
    + 'They are added to what is already here. Your settings are replaced by the ones in the backup.',
  );
  if (!ok) return;
  if (player.playing) player.stop('Stopped');
  const merged = mergeBackup({ settings: S, log, routines }, incoming);
  Object.assign(S, merged.settings);
  saveSettings(S);
  log = merged.log;
  saveLog(log);
  routines = merged.routines;
  saveRoutines(routines);
  logPanel.render(log);
  routinesPanel.render(routines);
  markLibrary($('#library'), S.rudiment);
  player.setSound(S);
  render();
  toast('Backup imported');
}

// ---- input wiring ------------------------------------------------------------

function nudgeBpm(d) {
  if (routine) return; // routine items own their tempo
  set('bpm', clamp(S.bpm + d, BPM_MIN, BPM_MAX));
}

function closeDrawers() {
  drawers.forEach((d) => d.close());
}

function wire() {
  holdRepeat($('#bpm-down'), () => nudgeBpm(-1));
  holdRepeat($('#bpm-up'), () => nudgeBpm(1));
  $('#bpm-range').addEventListener('input', (e) => set('bpm', clamp(Number(e.target.value), BPM_MIN, BPM_MAX)));
  $('#play').addEventListener('click', togglePlay);
  $('#clean').addEventListener('click', markCleanNow);
  bindControls(document, () => S, set);

  const drawer = (name, onOpen) => createDrawer({
    drawer: $(name === 'library' ? '#drawer' : `#${name}-drawer`),
    scrim: $('#scrim'),
    opener: $(`#open-${name}`),
    closer: $(`#close-${name}`),
    onOpen: () => {
      drawers.forEach((d) => d.close()); // one drawer at a time
      onOpen?.();
    },
  });
  const library = drawer('library');
  drawers = [library, drawer('routines'), drawer('log', () => logPanel.render(log))];

  renderLibrary($('#library'), groupRudiments(), (id) => {
    set('rudiment', id);
    markLibrary($('#library'), id);
    library.close();
  });
  markLibrary($('#library'), S.rudiment);

  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, button, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nudgeBpm(e.shiftKey ? 5 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeBpm(e.shiftKey ? -5 : -1); }
    else if (e.key === 'Escape') closeDrawers();
  });
}

// ---- boot --------------------------------------------------------------------

wire();
render();
routinesPanel.render(routines);
logPanel.render(log);
player.setSound(S);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}
