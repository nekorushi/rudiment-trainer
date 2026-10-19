// The service worker precaches SHELL for offline use. A file missing from that
// list works online and breaks only offline on the iPad, so check it here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHELL_DIRS = ['js', 'css', 'icons'];
const SHELL_FILES = ['index.html', 'manifest.webmanifest'];

function readShell() {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(m, 'sw.js has a `const SHELL = [...]` list');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function walk(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    return d.isDirectory() ? walk(path) : [path.split(sep).join('/')];
  });
}

test('every app file is precached by the service worker', () => {
  const shell = new Set(readShell());
  const expected = [...SHELL_FILES, ...SHELL_DIRS.flatMap(walk)];
  const missing = expected.filter((f) => !shell.has(f));
  assert.deepEqual(missing, [], `add to SHELL in sw.js (and bump CACHE): ${missing.join(', ')}`);
});

test('every SHELL entry exists on disk', () => {
  const gone = readShell().filter((f) => f !== './' && !existsSync(join(ROOT, f)));
  assert.deepEqual(gone, [], `remove from SHELL in sw.js: ${gone.join(', ')}`);
});

test('every relative import in js/ points at a precached file', () => {
  const shell = new Set(readShell());
  const bad = [];
  for (const file of walk('js')) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const [, spec] of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+'(\.{1,2}\/[^']+)'/gm)) {
      const target = relative(ROOT, join(ROOT, file, '..', spec)).split(sep).join('/');
      if (!shell.has(target)) bad.push(`${file} -> ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});
