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

const BASE = 'https://app.pennylane.com/api/external/firm/v1';

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

/**
 * Appel bas niveau a l'API Pennylane, avec retry/backoff sur 429 (rate limit) et 5xx.
 */
async function plFetch(path, { params, attempt = 0 } = {}) {
  const token = getToken();
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

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
 * Recupere toutes les pages d'un endpoint paginate par cursor.
 */
async function plFetchAll(path, { params = {}, max = 50000 } = {}) {
  const out = [];
  let cursor = undefined;
  let guard = 0;
  do {
    const payload = await plFetch(path, { params: { limit: 1000, ...params, cursor } });
    const items = extractItems(payload);
    out.push(...items);
    cursor = payload && payload.has_more ? payload.next_cursor : undefined;
    guard += 1;
    if (out.length >= max || guard > 200) break;
  } while (cursor);
  return out;
}

// ── API haut niveau ──────────────────────────────────────────────

export async function listCompanies() {
  const raw = await plFetchAll('/companies');
  return raw.map(normalizeCompany);
}

export async function getFiscalYears(companyId) {
  const raw = await plFetchAll(`/companies/${companyId}/fiscal_years`);
  return raw.map(normalizeFiscalYear).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
}

export async function getTrialBalance(companyId, periodStart, periodEnd) {
  return plFetchAll(`/companies/${companyId}/trial_balance`, {
    params: { period_start: periodStart, period_end: periodEnd, is_auxiliary: false },
  });
}

export async function getLedgerEntries(companyId, periodStart, periodEnd) {
  // ledger_entries plafonne la pagination a 100 ; filtrage par date via `filter`
  const filter = JSON.stringify([
    { field: 'date', operator: 'gteq', value: periodStart },
    { field: 'date', operator: 'lteq', value: periodEnd },
  ]);
  return plFetchAll(`/companies/${companyId}/ledger_entries`, {
    params: { filter, limit: 100 },
  });
}

/** Lignes d'ecritures (debit/credit par compte) — base du P&L mensuel et du cashflow.
 *  Le filtrage par date passe par le parametre `filter` (syntaxe Pennylane v2),
 *  les params period_start/period_end etant ignores sur cet endpoint. */
export async function getLedgerEntryLines(companyId, periodStart, periodEnd) {
  const filter = JSON.stringify([
    { field: 'date', operator: 'gteq', value: periodStart },
    { field: 'date', operator: 'lteq', value: periodEnd },
  ]);
  return plFetchAll(`/companies/${companyId}/ledger_entry_lines`, {
    params: { filter, limit: 100 },
  });
}

/** Journaux (pour recuperer le code, ex 'AN' = a-nouveaux). */
export async function getJournals(companyId) {
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
    raw: fy,
  };
}
