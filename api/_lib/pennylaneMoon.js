/**
 * Client Pennylane — API individuelle v2 (dossier unique : MOON EXPERTISE).
 * Token dédié : PENNYLANE_MOON_TOKEN (côté serveur uniquement).
 *
 * Base : https://app.pennylane.com/api/external/v2  (PAS l'API firm)
 * Pagination : cursor + limit (les paramètres page/per_page sont refusés en v2).
 * Les formats de réponse (fiscal_years, trial_balance, ledger_entry_lines,
 * journals) sont identiques à l'API cabinet → les moteurs/normaliseurs existants
 * fonctionnent tels quels.
 */
const V2 = 'https://app.pennylane.com/api/external/v2';

function normalizeFiscalYear(fy) {
  const start = fy.start_date ?? fy.start ?? fy.from ?? null;
  const end = fy.finish ?? fy.end_date ?? fy.end ?? fy.to ?? null;
  const year = end ? String(end).slice(0, 4) : (start ? String(start).slice(0, 4) : '');
  return {
    id: fy.id ?? fy.fiscal_year_id ?? `${start}_${end}`,
    start, end,
    label: fy.label || (year ? `Exercice ${year}` : 'Exercice'),
    year, status: fy.status || null, raw: fy,
  };
}

export const MOON_ID = 'moon';
export const moonEnabled = () => Boolean(process.env.PENNYLANE_MOON_TOKEN);
export const moonCompany = () => ({ id: MOON_ID, name: 'MOON EXPERTISE', registrationNumber: null, raw: { source: 'v2' } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function token() {
  const t = process.env.PENNYLANE_MOON_TOKEN;
  if (!t) { const e = new Error('PENNYLANE_MOON_TOKEN manquant côté serveur.'); e.status = 500; e.code = 'NO_MOON_TOKEN'; throw e; }
  return t;
}

async function v2Fetch(path, { params, attempt = 0 } = {}) {
  const url = new URL(V2 + path);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' } });
  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    if (attempt < 6) {
      const ra = parseFloat(res.headers.get('retry-after') || '');
      await sleep(Number.isFinite(ra) ? ra * 1000 : Math.min(8000, 500 * 2 ** attempt));
      return v2Fetch(path, { params, attempt: attempt + 1 });
    }
  }
  if (!res.ok) {
    let body = ''; try { body = await res.text(); } catch { /* noop */ }
    const e = new Error(`Pennylane v2 ${res.status} sur ${path} : ${body.slice(0, 300)}`);
    e.status = res.status === 401 || res.status === 403 ? res.status : 502;
    throw e;
  }
  return res.json();
}

function items(p) {
  if (Array.isArray(p)) return p;
  if (p && Array.isArray(p.items)) return p.items;
  return [];
}

async function v2FetchAll(path, { params = {}, limit = 1000, max = 100000 } = {}) {
  const first = await v2Fetch(path, { params: { limit, ...params } });
  const out = [...items(first)];
  let cursor = first && first.has_more ? first.next_cursor : undefined;
  let guard = 0;
  while (cursor && out.length < max && guard < 1000) {
    const pg = await v2Fetch(path, { params: { limit, ...params, cursor } });
    out.push(...items(pg));
    cursor = pg && pg.has_more ? pg.next_cursor : undefined;
    guard += 1;
  }
  return out;
}

const dateFilter = (start, end) => JSON.stringify([
  { field: 'date', operator: 'gteq', value: start },
  { field: 'date', operator: 'lteq', value: end },
]);

export async function getFiscalYearsMoon() {
  const raw = await v2FetchAll('/fiscal_years', { limit: 100 });
  return raw.map(normalizeFiscalYear).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
}

export function getTrialBalanceMoon(periodStart, periodEnd, isAuxiliary = false) {
  return v2FetchAll('/trial_balance', { params: { period_start: periodStart, period_end: periodEnd, is_auxiliary: isAuxiliary }, limit: 1000 });
}

export function getLedgerEntryLinesMoon(periodStart, periodEnd) {
  return v2FetchAll('/ledger_entry_lines', { params: { filter: dateFilter(periodStart, periodEnd) }, limit: 100 });
}

export function getLedgerEntriesMoon(periodStart, periodEnd) {
  return v2FetchAll('/ledger_entries', { params: { filter: dateFilter(periodStart, periodEnd) }, limit: 100 });
}

export function getJournalsMoon() {
  return v2FetchAll('/journals', { limit: 100 });
}
