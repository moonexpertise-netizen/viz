/**
 * Cache serveur (Vercel KV) des lignes d'écritures NORMALISÉES, par tranche
 * mensuelle, validé par empreinte de balance — c'est lui qui rend la synchro
 * incrémentale : on ne re-télécharge de Pennylane que les mois dont la balance
 * a changé depuis la dernière synchro (écritures ajoutées/modifiées/supprimées
 * ⇒ les totaux débits/crédits d'au moins un compte du mois bougent).
 *
 * - Empreinte d'exercice : digest de la balance complète (déjà téléchargée par
 *   l'appelant) → si identique à la dernière synchro, AUCUN appel Pennylane
 *   pour les lignes, tout vient du cache.
 * - Sinon : une balance par mois (requêtes légères, en parallèle) localise les
 *   mois modifiés ; seuls ceux-là sont re-téléchargés (lignes + écritures).
 * - Sans KV configuré : repli = téléchargement direct (parallélisé par mois).
 *
 * Le cache stocke la sortie d'allLines (lignes fusionnées avec les libellés /
 * pièces des écritures) : les moteurs et le client consomment ce format tel quel.
 * Limite connue : une modification de libellé/pièce SANS impact sur les montants
 * n'invalide pas l'empreinte (les chiffres restent justes ; le libellé se met à
 * jour à la prochaine modification comptable du mois).
 */
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { kvEnabled, kvGet, kvSetEx } from './account.js';
import { getLedgerEntryLines, getLedgerEntries, getTrialBalance } from './pennylane.js';
import { monthSlices } from './plimiter.js';
import { allLines } from './entriesEngine.js';

const CACHE_V = 'v1';
const TTL = 60 * 60 * 24 * 120; // 120 jours, rafraîchi à chaque synchro
const metaKey = (cid, ps, pe) => `mvled:${CACHE_V}:meta:${cid}:${ps}:${pe}`;
const blobKey = (cid, a, b) => `mvled:${CACHE_V}:${cid}:${a}:${b}`;

const toNum = (v) => {
  const f = parseFloat(String(v ?? '0').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(f) ? f : 0;
};

/** Empreinte d'une balance : insensible à l'ordre, canonique sur les montants. */
export function tbDigest(items) {
  const rows = (items || []).map((it) => {
    const num = String(it.number ?? it.formatted_number ?? '').trim();
    return `${num}|${toNum(it.debits ?? it.debit).toFixed(2)}|${toNum(it.credits ?? it.credit).toFixed(2)}`;
  }).sort();
  return createHash('sha1').update(rows.join('\n')).digest('hex');
}

async function fetchSlice(cid, a, b, journals) {
  const [lines, entries] = await Promise.all([
    getLedgerEntryLines(cid, a, b),
    getLedgerEntries(cid, a, b),
  ]);
  return allLines(lines, entries, journals);
}

const unpack = (raw) => {
  try { return JSON.parse(gunzipSync(Buffer.from(raw, 'base64')).toString('utf8')); } catch { return null; }
};
const pack = (lines) => gzipSync(JSON.stringify(lines)).toString('base64');

/**
 * Lignes normalisées de la période, depuis le cache KV quand il est valide.
 * @param {Array|Function} tbItems  balance complète de la période (déjà
 *   téléchargée), ou fonction async la fournissant (appelée seulement si utile)
 * @returns {{ lines: Array, cache: 'off'|'hit'|'update'|'miss' }}
 */
export async function getNormalizedLines(cid, periodStart, periodEnd, journals, tbItems) {
  const slices = monthSlices(periodStart, periodEnd);

  // Période non bornée (drill-down sans from/to) : pas de découpage, fetch direct.
  if (slices.length > 24) {
    const lines = await fetchSlice(cid, periodStart, periodEnd, journals);
    return { lines, cache: 'off' };
  }

  if (!kvEnabled()) {
    const parts = await Promise.all(slices.map(([a, b]) => fetchSlice(cid, a, b, journals)));
    return { lines: parts.flat(), cache: 'off' };
  }

  const fyDigest = tbDigest(typeof tbItems === 'function' ? await tbItems() : tbItems);
  let meta = null;
  try { meta = JSON.parse((await kvGet(metaKey(cid, periodStart, periodEnd))) || 'null'); } catch { meta = null; }
  if (meta && meta.v !== CACHE_V) meta = null;

  const loadBlob = async ([a, b]) => {
    const raw = await kvGet(blobKey(cid, a, b)).catch(() => null);
    return raw ? unpack(raw) : null;
  };
  const saveBlob = ([a, b], lines) =>
    kvSetEx(blobKey(cid, a, b), pack(lines), TTL).catch(() => { /* trop gros / KV KO : refetch la prochaine fois */ });

  // ── Exercice inchangé depuis la dernière synchro : tout depuis le cache ──
  if (meta && meta.fyDigest === fyDigest) {
    const parts = await Promise.all(slices.map(async (s) => {
      const blob = await loadBlob(s);
      if (blob) return blob;
      const fresh = await fetchSlice(cid, s[0], s[1], journals); // blob expiré/perdu
      saveBlob(s, fresh);
      return fresh;
    }));
    return { lines: parts.flat(), cache: 'hit' };
  }

  // ── Exercice modifié (ou 1re synchro) : localiser les mois qui ont bougé ──
  const known = meta?.months || {};
  const haveHistory = Object.keys(known).length > 0;
  const months = {};
  let refetched = 0;

  const parts = await Promise.all(slices.map(async (s) => {
    const key = `${s[0]}:${s[1]}`;
    // Balance du mois (légère) → empreinte comparée à celle de la dernière synchro
    const tbM = await getTrialBalance(cid, s[0], s[1]);
    const digest = tbDigest(tbM);
    months[key] = digest;
    if (haveHistory && known[key] === digest) {
      const blob = await loadBlob(s);
      if (blob) return blob;
    }
    refetched += 1;
    const fresh = await fetchSlice(cid, s[0], s[1], journals);
    saveBlob(s, fresh);
    return fresh;
  }));

  kvSetEx(metaKey(cid, periodStart, periodEnd), JSON.stringify({ v: CACHE_V, fyDigest, months, at: new Date().toISOString() }), TTL)
    .catch(() => { /* noop */ });

  return { lines: parts.flat(), cache: haveHistory ? 'update' : 'miss', refetched };
}
