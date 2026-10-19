// Composition root: holds the settings, renders the practice screen and wires
// input to the Player. Feature logic lives in the modules imported below.

import { RUDIMENTS, FAMILIES, getRudiment } from './rudiments.js';
import { BPM_MIN, BPM_MAX, clamp, loadSettings, saveSettings, applySetting, toSeqOptions } from './settings.js';
import { Player } from './player.js';
import { $, $$ } from './ui/dom.js';
import { StickingView } from './ui/sticking.js';
import { renderLibrary, markLibrary } from './ui/library.js';
import { createDrawer } from './ui/drawer.js';
import { holdRepeat, bindControls, renderControls } from './ui/controls.js';

const S = loadSettings(RUDIMENTS.map((r) => r.id));
const sticking = new StickingView($('#sticking'));
const player = new Player({ onEvent: handleEvent, onStop: handleStop });
let library = null;
let lastSecond = -1;

// ---- state changes -----------------------------------------------------------

function set(key, value) {
  applySetting(S, key, value);
  saveSettings(S);
  render();
  player.setSound(S);
  player.update(toSeqOptions(S, getRudiment(S.rudiment)));
}

// ---- rendering ---------------------------------------------------------------

function render() {
  const r = getRudiment(S.rudiment);
  $('#r-name').textContent = r.name;
  $('#r-family').textContent = r.family ?? '';
  // While playing, the sticking row follows the engine (a new rudiment starts at the next rep).
  if (!player.playing && sticking.patternId !== r.id) sticking.show(r);

  $('#bpm-value').textContent = S.bpm;
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
}

// ---- playback ----------------------------------------------------------------

async function togglePlay() {
  if (player.playing) {
    player.stop('Stopped');
    return;
  }
  if (player.starting) return;
  player.setSound(S);
  try {
    await player.start(toSeqOptions(S, getRudiment(S.rudiment)));
  } catch (err) {
    $('#live').textContent = `Couldn't start audio: ${err.message}`;
    return;
  }
  if (!player.playing) return;
  lastSecond = -1;
  setPlayUi(true);
  $('#live').textContent = S.countIn ? 'Count-in…' : 'Playing';
}

function handleStop(message) {
  setPlayUi(false);
  sticking.clearHighlight();
  $('#live').textContent = message;
  render();
}

function handleEvent(ev) {
  if (ev.phase === 'end') {
    finishSession(ev);
    return;
  }
  if (ev.click && ev.click.level !== 'sub') pulse();
  if (ev.phase === 'count') {
    $('#live').textContent = `Count-in  ${ev.countIndex + 1} / ${ev.countTotal}`;
    return;
  }
  if (ev.patternId !== sticking.patternId) sticking.show(getRudiment(ev.patternId));
  sticking.highlight(ev.step);

  const sec = Math.floor(ev.elapsed);
  if (sec !== lastSecond || ev.step === 0) {
    lastSecond = sec;
    const parts = [`${Math.round(ev.bpm)} BPM`, `Rep ${ev.cycle + 1}`, fmtTime(ev.elapsed)];
    if (S.sessionMin > 0) parts.push(`${fmtTime(Math.max(0, S.sessionMin * 60 - ev.elapsed))} left`);
    $('#live').textContent = parts.join('  ·  ');
  }
}

function finishSession(ev) {
  const lo = Math.round(ev.minBpm);
  const hi = Math.round(ev.maxBpm);
  const range = lo === hi ? `${lo} BPM` : `${lo}–${hi} BPM`;
  player.stop(`Session complete  ·  ${fmtTime(ev.elapsed)}  ·  ${range}  ·  ${ev.cycles} reps`);
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

// ---- input wiring ------------------------------------------------------------

function nudgeBpm(d) { set('bpm', clamp(S.bpm + d, BPM_MIN, BPM_MAX)); }

function wire() {
  holdRepeat($('#bpm-down'), () => nudgeBpm(-1));
  holdRepeat($('#bpm-up'), () => nudgeBpm(1));
  $('#bpm-range').addEventListener('input', (e) => set('bpm', clamp(Number(e.target.value), BPM_MIN, BPM_MAX)));
  $('#play').addEventListener('click', togglePlay);
  bindControls(document, () => S, set);

  library = createDrawer({
    drawer: $('#drawer'),
    scrim: $('#scrim'),
    opener: $('#open-library'),
    closer: $('#close-library'),
  });
  renderLibrary($('#library'), RUDIMENTS, FAMILIES, (id) => {
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
    else if (e.key === 'Escape') library.close();
  });
}

// ---- boot --------------------------------------------------------------------

wire();
render();
player.setSound(S);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}
