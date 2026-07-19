import { requireAuth, validCompanyId, validFyId } from './_lib/auth.js';
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

const mapKey = (c) => `mvmap:${c}`;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  if (!kvEnabled()) { res.status(200).json({ enabled: false, entries: {} }); return; }

  const company = String(req.query.company_id || req.query.companyId || '');
  const kind = String(req.query.kind || (typeof req.body === 'object' && req.body?.kind) || '');

  // Les identifiants servent de clés KV : on refuse tout format inattendu.
  if (company && !validCompanyId(company)) { res.status(400).json({ error: 'Identifiant de société invalide.' }); return; }

  // ── Mapping personnalisé (affectation des comptes) ──
  if (kind === 'mapping') {
    try {
      if (req.method === 'GET') {
        if (!company) { res.status(400).json({ error: 'company_id requis' }); return; }
        const raw = await kvGet(mapKey(company));
        res.status(200).json({ enabled: true, mapping: raw ? JSON.parse(raw) : null });
        return;
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        if (!body.company_id || !body.mapping) { res.status(400).json({ error: 'company_id et mapping requis' }); return; }
        if (!validCompanyId(String(body.company_id))) { res.status(400).json({ error: 'Identifiant de société invalide.' }); return; }
        await kvSet(mapKey(body.company_id), JSON.stringify(body.mapping));
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'DELETE') {
        if (!company) { res.status(400).json({ error: 'company_id requis' }); return; }
        await kvDel(mapKey(company));
        res.status(200).json({ ok: true });
        return;
      }
      res.status(405).json({ error: 'Méthode non autorisée' });
    } catch (e) {
      console.error('store mapping:', e?.message || e);
      res.status(500).json({ error: 'Stockage serveur indisponible' });
    }
    return;
  }

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
      if (!validCompanyId(String(company_id)) || !validFyId(String(fy_id))) { res.status(400).json({ error: 'Identifiant invalide.' }); return; }
      await kvSet(entryKey(company_id, fy_id), JSON.stringify(entry));
      await kvSAdd(idxKey(company_id), fy_id);
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      const fy = String(req.query.fy_id || req.query.fyId || '');
      if (!company || !fy) { res.status(400).json({ error: 'company_id et fy_id requis' }); return; }
      if (!validFyId(fy)) { res.status(400).json({ error: 'Identifiant d\'exercice invalide.' }); return; }
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
