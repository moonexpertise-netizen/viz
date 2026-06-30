/**
 * Cache local du DÉTAIL des écritures (drill-down instantané), dans IndexedDB
 * (store 'lines'). Clé : "<companyId>:<fyId>".
 */
import { REPORT_VERSION } from './syncStore';
import { idbGet, idbPut } from './idb';

const keyOf = (companyId, fyId) => `${companyId}:${fyId}`;

export async function putLines(companyId, fyId, lines) {
  try { await idbPut('lines', { lines, version: REPORT_VERSION }, keyOf(companyId, fyId)); } catch { /* noop */ }
}

export async function getLines(companyId, fyId) {
  try {
    const rec = await idbGet('lines', keyOf(companyId, fyId));
    return rec && rec.version === REPORT_VERSION ? (rec.lines || []) : [];
  } catch { return []; }
}

export async function getLinesForExercises(companyId, fyIds) {
  const arrays = await Promise.all((fyIds || []).map((id) => getLines(companyId, id)));
  return arrays.flat();
}
