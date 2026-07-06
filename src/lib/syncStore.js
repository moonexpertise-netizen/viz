/**
 * Cache local des données synchronisées, par société et par exercice.
 * Évite de rappeler Pennylane à chaque navigation : on synchronise à la demande,
 * une fois par exercice (façon Finthesis « Suivi des imports »).
 *
 * Structure : localStorage["mv:sync:<companyId>"] = { [fyId]: entry }
 *   entry = { syncedAt, fy:{id,label,start,end,year}, report, monthly }
 */

import { storeAPI } from '../services/api';

const KEY = (companyId) => `mv:sync:${companyId}`;

// Version du calcul comptable. À incrémenter dès que le moteur change
// (bilan, SIG, cashflow…) : les caches d'une version antérieure sont alors
// considérés périmés et l'exercice repasse en « à resynchroniser ».
export const REPORT_VERSION = 6;

export function loadSync(companyId) {
  if (!companyId) return {};
  let all;
  try { all = JSON.parse(localStorage.getItem(KEY(companyId)) || '{}'); } catch { return {}; }
  // Ne garder que les entrées calculées avec la version courante du moteur
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (v && v.version === REPORT_VERSION) out[k] = v;
  }
  return out;
}

/** @returns {boolean} true si le cache local a bien été persisté (false = quota plein).
 *  Écrit aussi côté serveur (durable, multi-appareils) en tâche de fond. */
export function saveEntry(companyId, fyId, entry) {
  const stamped = { ...entry, version: REPORT_VERSION };
  const all = loadSync(companyId);
  all[fyId] = stamped;
  const ok = persist(companyId, all);
  // Serveur : best-effort (no-op si Vercel KV non configuré côté serveur)
  storeAPI.save(companyId, fyId, stamped).catch(() => { /* repli local */ });
  return ok;
}

export function removeEntry(companyId, fyId) {
  const all = loadSync(companyId);
  delete all[fyId];
  const ok = persist(companyId, all);
  storeAPI.remove(companyId, fyId).catch(() => { /* noop */ });
  return ok;
}

/**
 * Récupère les exercices stockés côté serveur, les fusionne dans le cache local
 * et renvoie la carte { [fyId]: entry } (version courante uniquement).
 * Renvoie null si le stockage serveur n'est pas actif ou en cas d'échec.
 */
export async function pullServer(companyId) {
  if (!companyId) return null;
  try {
    const { data } = await storeAPI.list(companyId);
    if (!data?.enabled) return null;
    const fromServer = {};
    for (const [fyId, v] of Object.entries(data.entries || {})) {
      if (v && v.version === REPORT_VERSION) fromServer[fyId] = v;
    }
    const combined = { ...loadSync(companyId), ...fromServer };
    persist(companyId, combined); // rafraîchit le cache local
    return combined;
  } catch { return null; }
}

function persist(companyId, all) {
  try {
    localStorage.setItem(KEY(companyId), JSON.stringify(all));
    return true;
  } catch (e) {
    // Quota dépassé : purger les caches des autres sociétés puis réessayer
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mv:sync:') && k !== KEY(companyId)) localStorage.removeItem(k);
      }
      localStorage.setItem(KEY(companyId), JSON.stringify(all));
      return true;
    } catch { return false; }
  }
}
