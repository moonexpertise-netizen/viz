/**
 * Cache local du DÉTAIL des écritures (pour un drill-down instantané), dans IndexedDB.
 * Volumineux (parfois plusieurs Mo par exercice) -> IndexedDB plutôt que localStorage.
 * Clé : "<companyId>:<fyId>".
 */
import { REPORT_VERSION } from './syncStore';

const DB_NAME = 'moonviz';
const STORE = 'lines';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const keyOf = (companyId, fyId) => `${companyId}:${fyId}`;

export async function putLines(companyId, fyId, lines) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ lines, version: REPORT_VERSION }, keyOf(companyId, fyId));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IndexedDB indisponible : on ignore (repli API au clic) */ }
}

export async function getLines(companyId, fyId) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(keyOf(companyId, fyId));
      rq.onsuccess = () => resolve(rq.result && rq.result.version === REPORT_VERSION ? (rq.result.lines || []) : []);
      rq.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function getLinesForExercises(companyId, fyIds) {
  const arrays = await Promise.all((fyIds || []).map((id) => getLines(companyId, id)));
  return arrays.flat();
}
