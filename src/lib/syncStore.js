/**
 * Cache local des données synchronisées, par société et par exercice.
 * Évite de rappeler Pennylane à chaque navigation : on synchronise à la demande,
 * une fois par exercice (façon Finthesis « Suivi des imports »).
 *
 * Structure : localStorage["mv:sync:<companyId>"] = { [fyId]: entry }
 *   entry = { syncedAt, fy:{id,label,start,end,year}, report, monthly }
 */

const KEY = (companyId) => `mv:sync:${companyId}`;

export function loadSync(companyId) {
  if (!companyId) return {};
  try { return JSON.parse(localStorage.getItem(KEY(companyId)) || '{}'); } catch { return {}; }
}

export function saveEntry(companyId, fyId, entry) {
  const all = loadSync(companyId);
  all[fyId] = entry;
  persist(companyId, all);
}

export function removeEntry(companyId, fyId) {
  const all = loadSync(companyId);
  delete all[fyId];
  persist(companyId, all);
}

function persist(companyId, all) {
  try {
    localStorage.setItem(KEY(companyId), JSON.stringify(all));
  } catch (e) {
    // Quota dépassé : purger les caches des autres sociétés puis réessayer
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mv:sync:') && k !== KEY(companyId)) localStorage.removeItem(k);
      }
      localStorage.setItem(KEY(companyId), JSON.stringify(all));
    } catch { /* on abandonne silencieusement */ }
  }
}
