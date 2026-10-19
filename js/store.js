// Failure-tolerant JSON storage on top of localStorage. iPad Safari can refuse
// or clear site data (private mode, quota, "Clear History and Website Data"),
// so every access is wrapped and callers always get a usable value back.
// Keys are versioned (`rudiments.<what>.v1`); bump the suffix on a breaking change.

/** Read and parse `key`, or return `fallback` if it is missing or unreadable. */
export function readJSON(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Serialize `value` under `key`. Returns false if the browser refused. */
export function writeJSON(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
