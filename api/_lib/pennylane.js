/**
 * Client Pennylane — Firm API (cabinet multi-clients)
 *
 * Base : https://app.pennylane.com/api/external/firm/v1
 * Auth : Bearer <PENNYLANE_FIRM_TOKEN>  (cote serveur uniquement)
 *
 * Endpoints utilises :
 *   GET /companies                                  -> liste des societes du cabinet
 *   GET /companies/{id}/fiscal_years                -> exercices d'une societe
 *   GET /companies/{id}/trial_balance               -> balance (par compte) sur une periode
 *   GET /companies/{id}/ledger_entries              -> ecritures (pour le mensuel / tresorerie)
 *
 * Pagination v2 : ?cursor=...&limit=...  ; reponse { items|..., has_more, next_cursor }
 */

import {
  MOON_ID, moonEnabled, moonCompany,
  getFiscalYearsMoon, getTrialBalanceMoon, getLedgerEntryLinesMoon, getLedgerEntriesMoon, getJournalsMoon,
} from './pennylaneMoon.js';
import { makeRateLimiter, monthSlices, dateFilter } from './plimiter.js';

const BASE = 'https://app.pennylane.com/api/external/firm/v1';
const isMoon = (id) => String(id) === MOON_ID;

function getToken() {
  const token = process.env.PENNYLANE_FIRM_TOKEN;
  if (!token) {
    const err = new Error('PENNYLANE_FIRM_TOKEN manquant cote serveur.');
    err.status = 500;
    err.code = 'NO_TOKEN';
    throw err;
  }
  return token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const firmLimiter = makeRateLimiter();

/**
 * Appel bas niveau a l'API Pennylane, via l'ordonnanceur, avec retry/backoff
 * sur 429 (garde-fou) et 5xx.
 */
async function plFetch(path, { params, attempt = 0 } = {}) {
  const token = getToken();
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const res = await firmLimiter.run(() => fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  }));
  firmLimiter.observe(res);

  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    if (attempt < 6) {
      const retryAfter = parseFloat(res.headers.get('retry-after') || '');
      const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt);
      await sleep(waitMs);
      return plFetch(path, { params, attempt: attempt + 1 });
    }
  }

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* noop */ }
    const err = new Error(`Pennylane ${res.status} sur ${path} : ${body.slice(0, 500)}`);
    err.status = res.status === 401 || res.status === 403 ? res.status : 502;
    err.pennylaneStatus = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Extrait le tableau d'items d'une reponse Pennylane, quel que soit le nom du champ.
 */
function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'companies', 'fiscal_years', 'ledger_entries', 'data', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  // Sinon : premier tableau trouve dans l'objet
  for (const v of Object.values(payload)) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * Recupere toutes les pages d'un endpoint, qu'il soit paginate par cursor
 * (has_more / next_cursor) ou par page (total_pages / current_page / per_page).
 */
async function plFetchAll(path, { params = {}, max = 100000 } = {}) {
  const first = await plFetch(path, { params: { limit: 1000, per_page: 100, ...params } });

  // Pagination par page (ex: /companies)
  if (first && typeof first === 'object' && first.total_pages !== undefined) {
    const out = [...extractItems(first)];
    const totalPages = first.total_pages || 1;
    let page = (first.current_page || 1) + 1;
    while (page <= totalPages && out.length < max) {
      const pg = await plFetch(path, { params: { per_page: 100, ...params, page } });
      out.push(...extractItems(pg));
      page += 1;
    }
    return out;
  }

  // Pagination par cursor (ex: trial_balance, ledger_entry_lines)
  const out = [...extractItems(first)];
  let cursor = first && first.has_more ? first.next_cursor : undefined;
  let guard = 0;
  while (cursor && out.length < max && guard < 500) {
    const payload = await plFetch(path, { params: { limit: 1000, ...params, cursor } });
    out.push(...extractItems(payload));
    cursor = payload && payload.has_more ? payload.next_cursor : undefined;
    guard += 1;
  }
  return out;
}

/**
 * Récupère toutes les pages d'un endpoint à curseur en découpant la période par
 * mois, chaque tranche ayant sa propre chaîne de curseurs — elles avancent en
 * parallèle sous le contrôle du rate limiter (le séquentiel pur laissait la
 * fenêtre de quota à moitié vide). Sonde d'abord une page pleine période :
 * si tout tient dedans, pas de fan-out. Dédoublonnage par id par sécurité.
 */
async function plFetchAllByMonth(path, periodStart, periodEnd, { limit = 100 } = {}) {
  const slices = monthSlices(periodStart, periodEnd);
  // Période d'un seul mois (pas de fan-out utile) ou non bornée (ex 1900→2999,
  // le fan-out exploserait) : pagination classique.
  if (slices.length <= 1 || slices.length > 24) {
    return plFetchAll(path, { params: { filter: dateFilter(periodStart, periodEnd), limit } });
  }

  const first = await plFetch(path, { params: { filter: dateFilter(periodStart, periodEnd), limit } });
  const firstItems = extractItems(first);
  if (!first || !first.has_more) return firstItems;

  const parts = await Promise.all(slices.map(([a, b]) =>
    plFetchAll(path, { params: { filter: dateFilter(a, b), limit } })));
  const seen = new Set();
  const out = [];
  for (const it of parts.flat()) {
    const id = it?.id ?? JSON.stringify(it);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

// ── API haut niveau ──────────────────────────────────────────────

export async function listCompanies() {
  const raw = await plFetchAll('/companies');
  const companies = raw.map(normalizeCompany);
  // Dossier MOON EXPERTISE (token dédié, API individuelle v2) ajouté en tête.
  if (moonEnabled() && !companies.some((c) => isMoon(c.id))) companies.unshift(moonCompany());
  return companies;
}

export async function getFiscalYears(companyId) {
  if (isMoon(companyId)) return getFiscalYearsMoon();
  const raw = await plFetchAll(`/companies/${companyId}/fiscal_years`);
  return raw.map(normalizeFiscalYear).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
}

export async function getTrialBalance(companyId, periodStart, periodEnd, isAuxiliary = false) {
  if (isMoon(companyId)) return getTrialBalanceMoon(periodStart, periodEnd, isAuxiliary);
  return plFetchAll(`/companies/${companyId}/trial_balance`, {
    params: { period_start: periodStart, period_end: periodEnd, is_auxiliary: isAuxiliary },
  });
}

export async function getLedgerEntries(companyId, periodStart, periodEnd) {
  if (isMoon(companyId)) return getLedgerEntriesMoon(periodStart, periodEnd);
  // ledger_entries plafonne la pagination a 100 ; filtrage par date via `filter`
  return plFetchAllByMonth(`/companies/${companyId}/ledger_entries`, periodStart, periodEnd);
}

/** Lignes d'ecritures (debit/credit par compte) — base du P&L mensuel et du cashflow.
 *  Le filtrage par date passe par le parametre `filter` (syntaxe Pennylane v2),
 *  les params period_start/period_end etant ignores sur cet endpoint. */
export async function getLedgerEntryLines(companyId, periodStart, periodEnd) {
  if (isMoon(companyId)) return getLedgerEntryLinesMoon(periodStart, periodEnd);
  return plFetchAllByMonth(`/companies/${companyId}/ledger_entry_lines`, periodStart, periodEnd);
}

/** Journaux (pour recuperer le code, ex 'AN' = a-nouveaux). */
export async function getJournals(companyId) {
  if (isMoon(companyId)) return getJournalsMoon();
  const raw = await plFetchAll(`/companies/${companyId}/journals`, { params: { limit: 100 } });
  return raw;
}

// ── Normalisation des formes de reponse (champs variables selon versions) ──

function normalizeCompany(c) {
  return {
    id: c.id ?? c.company_id ?? c.source_id,
    name: c.name ?? c.company_name ?? c.label ?? c.legal_name ?? `Societe ${c.id ?? ''}`,
    registrationNumber: c.registration_number ?? c.reg_no ?? c.siren ?? c.siret ?? null,
    raw: c,
  };
}

function normalizeFiscalYear(fy) {
  const start = fy.start_date ?? fy.start ?? fy.from ?? fy.begin_at ?? null;
  const end = fy.finish ?? fy.end_date ?? fy.end ?? fy.to ?? fy.finish_at ?? fy.closure_date ?? null;
  const year = end ? String(end).slice(0, 4) : (start ? String(start).slice(0, 4) : '');
  return {
    id: fy.id ?? fy.fiscal_year_id ?? `${start}_${end}`,
    start,
    end,
    label: fy.label || (year ? `Exercice ${year}` : 'Exercice'),
    year,
    status: fy.status || null, // 'closed' | 'frozen' | 'open'
    raw: fy,
  };
}
