# Rudiment Trainer

A drum-rudiment practice app for iPad (and any browser), built as an installable web app (PWA). No build step, no dependencies, works offline once installed.

**Stage 1:** audio engine, metronome, tempo control, loop and open-close-open modes, count-in, timed sessions, tempo ramping (timer or reps), dark responsive UI, offline support.

**Stage 2:** all 26 standard (NARD) rudiments, drawn as standard notation (SVG) with sticking and a playhead that follows the audio. A Notation / Sticking switch shows big sticking letters instead.

**Collections:** NARD 26 and the 14 PAS additions (together the PAS 40 International Drum Rudiments), each its own section in the library.

**Stage 3:** routines (an ordered list of rudiments, each with its own tempo, length and mode, played back to back), a practice log (session history, best clean tempo per rudiment via the ✓ Clean button, daily time and streak), and JSON export/import of everything.

## Run it locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers (offline mode) work on `localhost` and on HTTPS, but **not** on a plain `http://192.168.x.x` address, so test on the iPad via the hosted version below.

## Put it on your iPad (GitHub Pages)

1. Create a new GitHub repository and upload everything in this folder (keep the folder structure).
2. Repo **Settings → Pages**, set the source to the `main` branch, root folder.
3. After a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.
4. On the iPad open that URL in **Safari**, tap **Share → Add to Home Screen**. It then launches full-screen like a native app and works offline.

A free GitHub account makes a public repo; the app contains nothing private. Updates: push new files, then open the app twice (the first launch fetches the update in the background, the second runs it).

## Tests

```sh
npm test      # sequencer + engine tests (Node 20+), no install needed
```

## Layout

```
index.html            UI skeleton
css/styles.css        dark, responsive styles
js/sequencer.js       pure timing logic (patterns, tempo ramp, open-close-open, count-in)
js/audio.js           Web Audio engine: look-ahead scheduler, synthesized click and snare
js/player.js          playback controller: engine, frame polling, wake lock, stop when hidden
js/settings.js        settings defaults, ranges, validation, mapping to sequencer options
js/store.js           failure-tolerant localStorage JSON helpers
js/log.js             practice log: session records, best tempo, streak
js/routines.js        routines: model, validation, mapping to playback
js/backup.js          JSON export/import (merge)
js/rudiments.js       rudiment library: registry of collections, grouping
js/collections/       one module per collection (nard.js: the 26 standard rudiments, pas.js: the 14 PAS additions)
js/notation.js        pure notation layout: rhythm spelling, beams, tuplets, line wrapping
js/ui/                DOM views: SVG staff, sticking row, library list, drawers, routines editor, log, settings controls
js/app.js             composition root: state, rendering, input wiring
sw.js, manifest.webmanifest, icons/   PWA / offline
test/                 unit tests
make_icons.py         regenerates the PNG icons (Pillow)
```

## Rudiment notation

One token per grid step; `grid` steps make one beat (1 = quarters, 2 = eighths, 3 = triplets, 4 = sixteenths, 6 = sextuplets, 8 = thirty-seconds; the staff can't draw other grids). A pattern must fill whole beats. On the staff a stroke lasts until the next one, so `R . . .` is a quarter note. Optional `bar` sets beats per bar (default 2 for an even number of beats, otherwise one bar).

| Token | Meaning |
|---|---|
| `R` `L` | accented stroke, right / left hand |
| `r` `l` | unaccented tap |
| `.` | rest |
| `(l)R` | flam: soft grace note before the stroke |
| `(ll)R` | drag: two grace notes |
| `R~ - - -` | buzz (press) roll held across the `-` steps |

Example: single paradiddle = `{ id: 'single-paradiddle', grid: 4, steps: 'R l r r L r l l' }`

## iPad notes

- Audio only starts after a tap (iOS rule), so the first Start press unlocks it.
- The screen stays awake while playing (Wake Lock). Playback stops if you switch apps, to avoid timing drift.
- If sound is missing, check the iPad isn't muted in Control Center.
- Back up from **Log → Export** now and then: the share sheet offers **Save to Files**. If Safari ever clears the app's data, **Log → Import…** brings it back (it merges, so importing twice does no harm).
