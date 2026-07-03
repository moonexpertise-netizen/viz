import { requireAuth } from './_lib/auth.js';
import { kvEnabled, kvGet, kvSet, kvDel, kvSAdd, kvSRem, kvSMembers } from './_lib/account.js';

/**
 * Stockage serveur des exercices synchronisés (durable + multi-appareils).
 *   GET    /api/store?company_id=..              -> { enabled, entries: { [fyId]: entry } }
 *   POST   /api/store { company_id, fy_id, entry } -> enregistre un exercice
 *   DELETE /api/store?company_id=..&fy_id=..      -> supprime un exercice
 * Repli : si Vercel KV n'est pas configuré, renvoie enabled=false (le client
 * reste sur son cache navigateur, comportement inchangé).
 * On ne stocke que les agrégats (report + monthly sans le détail des lignes) ;
 * le détail des écritures reste en IndexedDB côté client.
 */
const entryKey = (c, fy) => `mvsync:${c}:${fy}`;
const idxKey = (c) => `mvsync:idx:${c}`;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  if (!kvEnabled()) { res.status(200).json({ enabled: false, entries: {} }); return; }

  const company = String(req.query.company_id || req.query.companyId || '');
  try {
    if (req.method === 'GET') {
      if (!company) { res.status(400).json({ error: 'company_id requis' }); return; }
      const fyIds = await kvSMembers(idxKey(company));
      const entries = {};
      await Promise.all(fyIds.map(async (fy) => {
        const raw = await kvGet(entryKey(company, fy));
        if (raw) { try { entries[fy] = JSON.parse(raw); } catch { /* ignore */ } }
      }));
      res.status(200).json({ enabled: true, entries });
      return;
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
      const { company_id, fy_id, entry } = body;
      if (!company_id || !fy_id || !entry) { res.status(400).json({ error: 'company_id, fy_id, entry requis' }); return; }
      await kvSet(entryKey(company_id, fy_id), JSON.stringify(entry));
      await kvSAdd(idxKey(company_id), fy_id);
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      const fy = String(req.query.fy_id || req.query.fyId || '');
      if (!company || !fy) { res.status(400).json({ error: 'company_id et fy_id requis' }); return; }
      await kvDel(entryKey(company, fy));
      await kvSRem(idxKey(company), fy);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    console.error('store:', e?.message || e);
    res.status(500).json({ error: 'Stockage serveur indisponible' });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
