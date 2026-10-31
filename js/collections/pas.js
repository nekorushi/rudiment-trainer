// PAS additions: the 14 rudiments the Percussive Arts Society added to the
// NARD 26 in 1984 to make the 40 International Drum Rudiments. Together with
// the NARD collection this gives the full PAS 40 without listing 26 twice.
//
// Interpretation, consistent with the NARD collection: rolls are written open;
// diddles inside a sixteenth (six stroke roll, dragadiddle) are thirty-seconds;
// stroke rolls that end on the hand they started with alternate. The flam drag
// is in triplet feel (flam, sixteenth diddle, tap). The single stroke four and
// seven land with an accent on their last note. The multiple bounce roll is a
// buzz on every sixteenth.
//
// Ids are permanent and must not clash with other collections.

export const PAS = {
  id: 'pas',
  name: 'PAS additions',
  title: 'The 14 rudiments PAS added for the 40 International Drum Rudiments',
  families: ['Rolls', 'Diddles', 'Flams', 'Drags'],
  specs: [
    // ---- rolls ----
    { id: 'single-stroke-four', name: 'Single Stroke Four', family: 'Rolls', grid: 6, steps: 'r l r L . . l r l R . .' },
    { id: 'single-stroke-seven', name: 'Single Stroke Seven', family: 'Rolls', grid: 6,
      steps: 'r l r l r l R . . . . . l r l r l r L . . . . .' },
    { id: 'multiple-bounce-roll', name: 'Multiple Bounce Roll', family: 'Rolls', grid: 4,
      steps: 'r~ l~ r~ l~ r~ l~ r~ l~' },
    { id: 'triple-stroke-roll', name: 'Triple Stroke Roll', family: 'Rolls', grid: 6, steps: 'r r r l l l r r r l l l' },
    { id: 'six-stroke-roll', name: 'Six Stroke Roll', family: 'Rolls', grid: 8,
      steps: 'R . l l r r L . R . l l r r L .' },
    { id: 'seventeen-stroke-roll', name: 'Seventeen Stroke Roll', family: 'Rolls', grid: 4, bar: 5,
      steps: 'r r l l r r l l r r l l r r l l R . . . l l r r l l r r l l r r l l r r L . . .' },

    // ---- diddles ----
    { id: 'triple-paradiddle', name: 'Triple Paradiddle', family: 'Diddles', grid: 4,
      steps: 'R l r l r l r r L r l r l r l l' },
    { id: 'single-paradiddle-diddle', name: 'Single Paradiddle-diddle', family: 'Diddles', grid: 6,
      steps: 'R l r r l l R l r r l l' },

    // ---- flams ----
    { id: 'single-flammed-mill', name: 'Single Flammed Mill', family: 'Flams', grid: 4,
      steps: '(l)R r l r (r)L l r l' },
    { id: 'pataflafla', name: 'Pataflafla', family: 'Flams', grid: 4, steps: '(l)R l r (r)L (l)R l r (r)L' },
    { id: 'swiss-army-triplet', name: 'Swiss Army Triplet', family: 'Flams', grid: 3, steps: '(l)R r l (l)R r l' },
    { id: 'inverted-flam-tap', name: 'Inverted Flam Tap', family: 'Flams', grid: 4,
      steps: '(l)R l (r)L r (l)R l (r)L r' },
    { id: 'flam-drag', name: 'Flam Drag', family: 'Flams', grid: 6, steps: '(l)R . l l r . (r)L . r r l .' },

    // ---- drags ----
    { id: 'single-dragadiddle', name: 'Single Dragadiddle', family: 'Drags', grid: 8,
      steps: 'R r l . r . r . L l r . l . l .' },
  ],
};
