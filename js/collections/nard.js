// NARD 26: the Standard 26 American Drum Rudiments (National Association of
// Rudimental Drummers, 1933; the second set of 13 was added later).
//
// Interpretation: stroke rolls are written open, with the diddles as
// sixteenths and the accented release on the next beat or offbeat. Rudiments
// that end on the hand they started with alternate (a right-lead and a
// left-lead half), so both hands get the same work.
//
// Ids are permanent: the practice log and routines refer to them.

export const NARD = {
  id: 'nard',
  name: 'NARD 26',
  title: 'Standard 26 American Drum Rudiments',
  families: ['Rolls', 'Diddles', 'Flams', 'Drags'],
  specs: [
    // ---- rolls ----
    { id: 'single-stroke-roll', name: 'Single Stroke Roll', family: 'Rolls', grid: 4, steps: 'r l r l r l r l' },
    { id: 'long-roll', name: 'Long Roll (Double Stroke)', family: 'Rolls', grid: 4, steps: 'r r l l r r l l' },
    { id: 'five-stroke-roll', name: 'Five Stroke Roll', family: 'Rolls', grid: 4,
      steps: 'r r l l R . . . l l r r L . . .' },
    { id: 'seven-stroke-roll', name: 'Seven Stroke Roll', family: 'Rolls', grid: 4, steps: 'l l r r l l R .' },
    { id: 'nine-stroke-roll', name: 'Nine Stroke Roll', family: 'Rolls', grid: 4, bar: 3,
      steps: 'r r l l r r l l R . . . l l r r l l r r L . . .' },
    { id: 'ten-stroke-roll', name: 'Ten Stroke Roll', family: 'Rolls', grid: 4, bar: 3,
      steps: 'r r l l r r l l R . L .' },
    { id: 'eleven-stroke-roll', name: 'Eleven Stroke Roll', family: 'Rolls', grid: 4, bar: 3,
      steps: 'r r l l r r l l r r L .' },
    { id: 'thirteen-stroke-roll', name: 'Thirteen Stroke Roll', family: 'Rolls', grid: 4, bar: 4,
      steps: 'r r l l r r l l r r l l R . . . l l r r l l r r l l r r L . . .' },
    { id: 'fifteen-stroke-roll', name: 'Fifteen Stroke Roll', family: 'Rolls', grid: 4, bar: 4,
      steps: 'r r l l r r l l r r l l r r L .' },

    // ---- diddles ----
    { id: 'single-paradiddle', name: 'Single Paradiddle', family: 'Diddles', grid: 4, steps: 'R l r r L r l l' },
    { id: 'double-paradiddle', name: 'Double Paradiddle', family: 'Diddles', grid: 6,
      steps: 'R l r l r r L r l r l l' },

    // ---- flams ----
    { id: 'flam', name: 'Flam', family: 'Flams', grid: 1, steps: '(l)R (r)L' },
    { id: 'flam-accent', name: 'Flam Accent', family: 'Flams', grid: 3, steps: '(l)R l r (r)L r l' },
    { id: 'flam-tap', name: 'Flam Tap', family: 'Flams', grid: 4, steps: '(l)R r (r)L l (l)R r (r)L l' },
    { id: 'flamacue', name: 'Flamacue', family: 'Flams', grid: 4, steps: '(l)r L r l (l)R . . .' },
    { id: 'flam-paradiddle', name: 'Flam Paradiddle', family: 'Flams', grid: 4, steps: '(l)R l r r (r)L r l l' },
    { id: 'flam-paradiddle-diddle', name: 'Flam Paradiddle-diddle', family: 'Flams', grid: 6,
      steps: '(l)R l r r l l (r)L r l l r r' },

    // ---- drags ----
    { id: 'ruff', name: 'Ruff (Drag)', family: 'Drags', grid: 1, steps: '(ll)R (rr)L' },
    { id: 'single-drag', name: 'Single Drag', family: 'Drags', grid: 2, steps: '(ll)r L (rr)l R' },
    { id: 'double-drag', name: 'Double Drag', family: 'Drags', grid: 4, steps: '(ll)r (ll)r L . (rr)l (rr)l R .' },
    { id: 'lesson-25', name: 'Lesson 25 (Ratatap)', family: 'Drags', grid: 4, steps: '(ll)r l R . (rr)l r L .' },
    { id: 'drag-paradiddle-1', name: 'Drag Paradiddle No. 1', family: 'Drags', grid: 4, bar: 3,
      steps: 'R . (ll)r l r r L . (rr)l r l l' },
    { id: 'drag-paradiddle-2', name: 'Drag Paradiddle No. 2', family: 'Drags', grid: 4,
      steps: 'R . (ll)r . (ll)r l r r L . (rr)l . (rr)l r l l' },
    { id: 'single-ratamacue', name: 'Single Ratamacue', family: 'Drags', grid: 6,
      steps: '(ll)r l r L . . (rr)l r l R . .' },
    { id: 'double-ratamacue', name: 'Double Ratamacue', family: 'Drags', grid: 6, bar: 3,
      steps: '(ll)r . . (ll)r l r L . . (rr)l . . (rr)l r l R . .' },
    { id: 'triple-ratamacue', name: 'Triple Ratamacue', family: 'Drags', grid: 6,
      steps: '(ll)r . . (ll)r . . (ll)r l r L . . (rr)l . . (rr)l . . (rr)l r l R . .' },
  ],
};
