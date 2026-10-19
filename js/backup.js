// JSON backup of everything the app stores (settings, practice log, routines).
// iPad Safari can clear site data, so the log drawer offers export and import.
// Importing merges: sessions and routines are added (same id = replaced),
// best tempos keep the higher value, settings are taken from the file.

import { sanitizeSettings } from './settings.js';
import { sanitizeLog, mergeLogs } from './log.js';
import { sanitizeRoutines, mergeRoutines } from './routines.js';

export const BACKUP_FORMAT = 'rudiment-trainer-backup';
export const BACKUP_VERSION = 1;

export function makeBackup({ settings, log, routines }, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    settings,
    log: { sessions: log.sessions, best: log.best },
    routines,
  };
}

export function backupFileName(now = new Date()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `rudiments-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/**
 * Parse and validate a backup (object or JSON text).
 * @throws {Error} if it is not a backup from this app
 */
export function readBackup(raw, rudimentIds) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
  }
  if (!data || data.format !== BACKUP_FORMAT) throw new Error('That file is not a Rudiment Trainer backup.');
  if (!(data.version <= BACKUP_VERSION)) throw new Error('That backup is from a newer version of the app.');
  return {
    settings: sanitizeSettings(data.settings, rudimentIds),
    log: sanitizeLog(data.log),
    routines: sanitizeRoutines(data.routines, rudimentIds),
  };
}

export function mergeBackup(current, incoming) {
  return {
    settings: incoming.settings,
    log: mergeLogs(current.log, incoming.log),
    routines: mergeRoutines(current.routines, incoming.routines),
  };
}
