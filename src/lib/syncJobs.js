/**
 * Synchronisation persistante : on confie le travail (fetch /api/report + /api/monthly)
 * à un Service Worker qui survit aux rechargements/fermetures de la page et écrit les
 * résultats dans IndexedDB (store 'syncjobs'). La page lit les jobs et applique les
 * résultats. Repli : si pas de Service Worker, on exécute en page (voir Workspace).
 */
import { REPORT_VERSION } from './syncStore';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';

let registration = null;

export function swSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export async function initSyncWorker(onMessage) {
  if (!swSupported()) return false;
  try {
    registration = await navigator.serviceWorker.register('/sw.js');
    if (onMessage) navigator.serviceWorker.addEventListener('message', (e) => onMessage(e.data));
    // Relancer un éventuel job resté en attente (reprise après fermeture/reload)
    poke();
    return true;
  } catch {
    return false;
  }
}

async function poke() {
  try {
    const reg = await navigator.serviceWorker.ready;
    (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'mv-sync-start' });
    if (reg && 'sync' in reg) { try { await reg.sync.register('mv-sync'); } catch { /* noop */ } }
  } catch { /* noop */ }
}

/** Met un job de synchro en file et déclenche le worker. */
export async function enqueueSync({ id, companyId, fyId, fy, reportUrl, monthlyUrl }) {
  const job = { id, companyId, fyId, fy, reportUrl, monthlyUrl, version: REPORT_VERSION, status: 'pending', createdAt: Date.now() };
  await idbPut('syncjobs', job, id);
  await poke();
  return job;
}

export async function getJob(id) { return idbGet('syncjobs', id); }
export async function getAllJobs() { return idbAll('syncjobs'); }
export async function clearJob(id) { return idbDelete('syncjobs', id); }
