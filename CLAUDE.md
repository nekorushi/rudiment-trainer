# Rudiment Trainer: project notes for Claude Code

Personal drum-rudiments practice PWA for the owner's iPad. Installed via Safari "Add to Home Screen" from GitHub Pages, never published to the App Store. Vanilla HTML/CSS/JS, ES modules, **no build step and no runtime dependencies**. Keep it that way.

## Decisions already made (from the brainstorm)

- **Purpose:** practice tool first (metronome + play-along), not a reference book.
- **Content:** rudiments come in collections, one module each under `js/collections/` (`nard.js` = the 26 standard NARD rudiments, `pas.js` = the 14 PAS additions; together the PAS 40), registered in `js/rudiments.js` (`COLLECTIONS`, `groupRudiments`). The library drawer and routine picker group by collection, then family. NARD: Stroke rolls use the open form (diddles as sixteenths); rudiments that end on their starting hand have a right-lead and a left-lead half. Ids are global across collections and permanent: the practice log and routines are keyed by them (tested unique).
- **Display per rudiment:** sticking letters (R/L), standard notation as **custom SVG** (no VexFlow), animated playhead synced to the audio, audio playback.
- **Audio:** Web Audio **synthesis** only (no sample files). Accents, taps and grace notes at different volumes. No stereo panning.
- **Playback:** continuous loop, open-close-open, count-in, timed session. All four exist.
- **Tempo ramp:** both by timer (every N sec) and by repetitions.
- **Routines:** ordered list, each item with its own rudiment, BPM, duration and mode; the app steps through them.
- **Practice log:** best clean tempo per rudiment, session history (date, rudiment, duration, BPM range), daily time and streak, plus JSON export/import (iPad Safari can clear site data).
- **UI:** one practice screen with drawers (rudiment list, routines, log), dark and high contrast, responsive for portrait and landscape.
- **Hosting:** GitHub Pages (HTTPS needed for the service worker).

## Status

- **Stage 1 DONE:** sequencer, audio engine, shell UI, loop/OCO/count-in/timed/ramp, PWA + offline. 19 unit tests pass, plus a jsdom UI smoke test (not in the repo).
- **Pre-stage-2 groundwork DONE:** git repo, `app.js` split into modules (see layout below), settings sanitizing, sw.js install bypasses the HTTP cache, test that SHELL covers every file. 27 tests.
- **Stage 2 DONE:** all 26 rudiments; `js/notation.js` (pure layout: rhythm spelling, beams, tuplets, line wrapping, step positions) and `js/ui/notation.js` (SVG view + playhead from `ev.step`); Notation/Sticking toggle (`view` setting). 66 tests. Notation grids are limited to 1, 2, 3, 4, 6, 8 (tested).
- **Stage 3 DONE:** routines (`RoutineSequence` in `sequencer.js` chains items on one clock, each after its own count-in; `routines.js` model; editor in the Routines drawer; tempo/mode controls locked while a routine plays), practice log (`log.js`: `SessionTracker` builds records from heard events, one per rudiment or routine item, min 10 s; best clean tempo from the "✓ Clean" button; daily totals and streak), JSON backup (`backup.js`: export via share sheet or download, import merges). 85 tests.
- **Next:** publish to GitHub Pages; check sound, timing and feel on the iPad.

## Architecture rules

- Module layout: `js/` top level is logic, `js/ui/` is DOM views. Pure and Node-tested: `sequencer.js` (timing), `settings.js` (defaults, ranges, `sanitizeSettings`, `toSeqOptions`), `store.js` (try/catch JSON storage), `log.js`, `routines.js`, `backup.js`. `player.js` owns the `DrumEngine` plus rAF polling, wake lock and stop-on-hidden; the UI only talks to it. `app.js` is the composition root only; new features go in their own module, not in `app.js`.
- Pattern views (`NotationView`, `StickingView`) share one interface: `show(pattern)`, `highlight(step)`, `clearHighlight()`, `patternId`. The SVG view only draws what `layoutPattern` returns; put any notation logic in `js/notation.js`, with tests.
- `js/sequencer.js` is **pure** (no DOM, no Web Audio) and fully unit tested. Put timing logic there, with tests.
- `DrumEngine.start()` / `Player.start()` take a tick source (anything with `next()` and `update()`: `Sequencer`, `RoutineSequence`) or plain Sequencer options. A running `RoutineSequence` only accepts sound-level updates (sub-click).
- `js/audio.js` schedules on the audio clock with a look-ahead (150 ms, pumped every 25 ms from a Worker timer, setInterval fallback). Never schedule sounds from `setTimeout` or `requestAnimationFrame`.
- The UI only learns what is playing from `engine.pollVisual()` events (each has `step`, `cycle`, `bpm`, `elapsed`, `dur`, `patternId`, `phase`; routine events add `item`, `itemCount`). Use these to drive the notation playhead; do not compute positions separately.
- Pattern changes apply at the next repetition boundary. Grace notes are scheduled *before* the main stroke by `graceGap()`; keep total pre-offset under the look-ahead (tested).
- Settings persist in `localStorage` under `rudiments.settings.v1`. All storage goes through `store.js` (`readJSON`/`writeJSON`, already try/catch). Keys: `rudiments.settings.v1`, `rudiments.log.v1`, `rudiments.routines.v1` (missing = the example routine is shown). Anything loaded or imported passes through a sanitizer (`sanitizeSettings`, `sanitizeLog`, `sanitizeRoutines`); new stores get versioned keys `rudiments.<what>.v1` and must be added to `backup.js`.
- iOS: audio must be unlocked from a user gesture (done in `DrumEngine.unlock`); playback stops when the page is hidden.
- When shipping changes, bump `CACHE` in `sw.js` and add any new files to its `SHELL` list. `test/shell.test.mjs` fails if a file under `js/`, `css/` or `icons/` is missing from `SHELL` (it can't check the `CACHE` bump).

## Commands

```sh
npm test                      # node --test test/*.test.mjs
python3 -m http.server 8080   # local preview (service worker works on localhost)
python3 make_icons.py         # regenerate icons (Pillow)
```

## Testing gotchas

- Real audio can't be verified in CI; the engine test uses a fake `AudioContext` (`autoPump: false`, advance `currentTime` manually).
- Final check of feel and timing must be done on the actual iPad.
