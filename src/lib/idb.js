/**
 * Accès IndexedDB partagé (page). La base 'moonviz' contient :
 *  - 'lines'    : détail des écritures (drill-down)
 *  - 'syncjobs' : jobs de synchronisation persistante (gérés par le Service Worker)
 * Le Service Worker (public/sw.js) ouvre la MÊME base/version/stores.
 */
const DB_NAME = 'moonviz';
const DB_VERSION = 2;
let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lines')) db.createObjectStore('lines');
      if (!db.objectStoreNames.contains('syncjobs')) db.createObjectStore('syncjobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbPut(store, value, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet(store, key) {
  const db = await openDb();
  return new Promise((resolve) => {
    const rq = db.transaction(store, 'readonly').objectStore(store).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => resolve(undefined);
  });
}

export async function idbDelete(store, key) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

export async function idbAll(store) {
  const db = await openDb();
  return new Promise((resolve) => {
    const out = [];
    const rq = db.transaction(store, 'readonly').objectStore(store).openCursor();
    rq.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
    rq.onerror = () => resolve(out);
  });
}
