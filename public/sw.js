/* MoonViz Service Worker — synchronisation persistante.
   Possède les fetch /api/report + /api/monthly, écrit les résultats dans IndexedDB
   (même base 'moonviz' v2, stores 'lines' + 'syncjobs') et notifie les pages.
   Survit aux rechargements/fermetures (message + Background Sync). */

const DB_NAME = 'moonviz';
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lines')) db.createObjectStore('lines');
      if (!db.objectStoreNames.contains('syncjobs')) db.createObjectStore('syncjobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function put(store, value, key) {
  return openDb().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}
function all(store) {
  return openDb().then((db) => new Promise((res) => {
    const out = [];
    const rq = db.transaction(store, 'readonly').objectStore(store).openCursor();
    rq.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else res(out); };
    rq.onerror = () => res(out);
  }));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function notify(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(msg));
}

async function processJob(job) {
  job.status = 'running'; job.startedAt = Date.now();
  await put('syncjobs', job, job.id);
  await notify({ type: 'mv-sync-progress', jobId: job.id, companyId: job.companyId, fyId: job.fyId });
  try {
    const [rep, mon] = await Promise.all([
      fetch(job.reportUrl, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('report ' + r.status)))),
      fetch(job.monthlyUrl, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('monthly ' + r.status)))),
    ]);
    const lines = mon.lines || [];
    const monthly = Object.assign({}, mon); delete monthly.lines;
    if (lines.length) await put('lines', { lines, version: job.version }, job.companyId + ':' + job.fyId);
    job.status = 'done'; job.report = rep; job.monthly = monthly; job.syncedAt = new Date().toISOString(); job.error = null;
    await put('syncjobs', job, job.id);
    await notify({ type: 'mv-sync-done', jobId: job.id, companyId: job.companyId, fyId: job.fyId });
  } catch (err) {
    job.status = 'error'; job.error = String((err && err.message) || err);
    await put('syncjobs', job, job.id);
    await notify({ type: 'mv-sync-error', jobId: job.id, companyId: job.companyId, fyId: job.fyId, error: job.error });
  }
}

let processing = false;
async function processPending() {
  if (processing) return;
  processing = true;
  try {
    const jobs = await all('syncjobs');
    for (const job of jobs) {
      if (!job) continue;
      const stale = job.status === 'running' && Date.now() - (job.startedAt || 0) > 120000;
      if (job.status === 'pending' || stale) await processJob(job);
    }
  } finally {
    processing = false;
  }
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'mv-sync-start') e.waitUntil(processPending());
});
self.addEventListener('sync', (e) => {
  if (e.tag === 'mv-sync') e.waitUntil(processPending());
});
