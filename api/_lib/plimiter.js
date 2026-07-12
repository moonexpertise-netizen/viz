/**
 * Sémaphore de concurrence partagé pour l'API Pennylane. Mesuré en conditions
 * réelles : le rate limit (25/fenêtre) est réparti côté Pennylane sur plusieurs
 * backends — une concurrence élevée + retry court sur 429 donne ~20 req/s
 * effectifs, là où un budget-gating strict plafonnait à ~2,5 req/s. Les 429
 * résiduels sont retentés par l'appelant (retry-after ≈ 1 s, coût marginal).
 * Un limiteur par token (firm / moon) : les quotas sont indépendants.
 */
export function makeRateLimiter({ concurrency = 12 } = {}) {
  let inflight = 0;
  const queue = [];

  const pump = () => {
    while (queue.length && inflight < concurrency) {
      inflight += 1;
      const job = queue.shift();
      job().finally(() => { inflight -= 1; pump(); });
    }
  };

  return {
    /** Exécute fn() dès qu'un slot est libre ; fn doit renvoyer la Response fetch. */
    run(fn) {
      return new Promise((resolve, reject) => {
        queue.push(async () => {
          try { resolve(await fn()); } catch (e) { reject(e); }
        });
        pump();
      });
    },
    /** Conservé pour compat (plus de budget à recaler). */
    observe() { /* noop */ },
  };
}

/** Tranches mensuelles [start, end] (ISO) couvrant la période, bornées à celle-ci. */
export function monthSlices(periodStart, periodEnd) {
  const slices = [];
  let d = new Date(periodStart + 'T00:00:00Z');
  const stop = new Date(periodEnd + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(stop.getTime()) || d > stop) return [[periodStart, periodEnd]];
  while (d <= stop) {
    const a = d.toISOString().slice(0, 10);
    const eom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const b = (eom > stop ? stop : eom).toISOString().slice(0, 10);
    slices.push([a, b]);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return slices;
}

export const dateFilter = (start, end) => JSON.stringify([
  { field: 'date', operator: 'gteq', value: start },
  { field: 'date', operator: 'lteq', value: end },
]);
