import express from 'express';
import db from '../db.js';

const router = express.Router();

// Template PCG standard integre
const DEFAULT_TEMPLATE = {
  name: 'PCG Standard',
  sections: [
    { id: 'ventes', label: 'Ventes de marchandises et production vendue', type: 'produit', accountRanges: [{ from: '700', to: '719' }] },
    { id: 'production_stockee', label: 'Production stockee et immobilisee', type: 'produit', accountRanges: [{ from: '720', to: '729' }] },
    { id: 'subventions', label: "Subventions d'exploitation", type: 'produit', accountRanges: [{ from: '740', to: '749' }] },
    { id: 'autres_produits', label: "Autres produits d'exploitation", type: 'produit', accountRanges: [{ from: '730', to: '739' }, { from: '750', to: '759' }] },
    { id: 'achats', label: 'Achats de marchandises et matieres premieres', type: 'charge', accountRanges: [{ from: '600', to: '609' }] },
    { id: 'services_ext', label: 'Services exterieurs', type: 'charge', accountRanges: [{ from: '610', to: '629' }] },
    { id: 'impots', label: 'Impots et taxes', type: 'charge', accountRanges: [{ from: '630', to: '639' }] },
    { id: 'personnel', label: 'Charges de personnel', type: 'charge', accountRanges: [{ from: '640', to: '649' }] },
    { id: 'autres_charges', label: "Autres charges d'exploitation", type: 'charge', accountRanges: [{ from: '650', to: '659' }] },
    { id: 'dotations', label: 'Dotations aux amortissements et provisions', type: 'charge', accountRanges: [{ from: '680', to: '689' }] },
    { id: 'produits_financiers', label: 'Produits financiers', type: 'produit', accountRanges: [{ from: '760', to: '769' }] },
    { id: 'charges_financieres', label: 'Charges financieres', type: 'charge', accountRanges: [{ from: '660', to: '669' }] },
    { id: 'produits_exceptionnels', label: 'Produits exceptionnels', type: 'produit', accountRanges: [{ from: '770', to: '779' }] },
    { id: 'charges_exceptionnelles', label: 'Charges exceptionnelles', type: 'charge', accountRanges: [{ from: '670', to: '679' }] },
    { id: 'reprises', label: 'Reprises sur amortissements et provisions', type: 'produit', accountRanges: [{ from: '780', to: '799' }] },
    { id: 'impotsBenefices', label: "Impots sur les benefices", type: 'charge', accountRanges: [{ from: '690', to: '699' }] },
  ],
  subtotals: [
    { id: 'rex', label: "Resultat d'exploitation", formula: 'ventes + production_stockee + subventions + autres_produits - achats - services_ext - impots - personnel - autres_charges - dotations' },
    { id: 'rfin', label: 'Resultat financier', formula: 'produits_financiers - charges_financieres' },
    { id: 'rexc', label: 'Resultat exceptionnel', formula: 'produits_exceptionnels - charges_exceptionnelles + reprises' },
    { id: 'rnet', label: 'Resultat net', formula: 'rex + rfin + rexc - impotsBenefices' },
  ],
};

// Appliquer un template aux donnees brutes
const applyTemplateToAccounts = (config, accounts) => {
  const sectionResults = {};

  config.sections.forEach((section) => {
    const matching = accounts.filter((acc) =>
      section.accountRanges.some((range) => {
        const num = String(acc.accountNumber || '');
        return num >= range.from && num <= range.to + 'z';
      })
    );

    const totalN  = matching.reduce((s, a) => s + Math.abs(a.soldeN  || 0), 0);
    const totalN1 = matching.reduce((s, a) => s + Math.abs(a.soldeN1 || 0), 0);

    sectionResults[section.id] = {
      label: section.label,
      type:  section.type,
      soldeN:       Math.round(totalN  * 100) / 100,
      soldeN1:      Math.round(totalN1 * 100) / 100,
      variation:    Math.round((totalN - totalN1) * 100) / 100,
      variationPct: totalN1 !== 0 ? Math.round(((totalN - totalN1) / Math.abs(totalN1)) * 10000) / 100 : null,
      accounts: matching.map((a) => ({
        number: a.accountNumber,
        label:  a.accountLabel,
        soldeN:  Math.abs(a.soldeN  || 0),
        soldeN1: Math.abs(a.soldeN1 || 0),
      })),
    };
  });

  const subtotalResults = {};
  config.subtotals.forEach((sub) => {
    const tokens = sub.formula.split(/\s+/);
    let totalN = 0; let op = '+';
    for (const token of tokens) {
      if (token === '+' || token === '-') { op = token; }
      else {
        const val = sectionResults[token]?.soldeN ?? subtotalResults[token]?.value ?? 0;
        totalN = op === '+' ? totalN + val : totalN - val;
      }
    }
    subtotalResults[sub.id] = { label: sub.label, value: Math.round(totalN * 100) / 100 };
  });

  return { sections: sectionResults, subtotals: subtotalResults };
};

// GET /api/templates
router.get('/', (req, res) => {
  try {
    const userId = req.user.userId;
    const templates = db.prepare('SELECT id, name, is_default, created_at FROM pl_templates WHERE user_id = ?').all(userId);
    res.json({ templates: [{ id: 'default', name: 'PCG Standard', is_default: 1, builtin: true }, ...templates] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/templates/:id
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'default') return res.json({ template: { id: 'default', name: 'PCG Standard', config: DEFAULT_TEMPLATE, builtin: true } });

    const template = db.prepare('SELECT id, name, config, is_default FROM pl_templates WHERE id = ? AND user_id = ?').get(id, req.user.userId);
    if (!template) return res.status(404).json({ error: 'Template introuvable' });
    res.json({ template: { ...template, config: JSON.parse(template.config) } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/templates
router.post('/', (req, res) => {
  try {
    const { name, config } = req.body;
    if (!name || !config) return res.status(400).json({ error: 'name et config requis' });
    const result = db.prepare('INSERT INTO pl_templates (user_id, name, config) VALUES (?, ?, ?)').run(req.user.userId, name, JSON.stringify(config));
    res.status(201).json({ template: { id: result.lastInsertRowid, name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/templates/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'default') return res.status(400).json({ error: 'Impossible de modifier le template par defaut' });
    const { name, config } = req.body;
    db.prepare('UPDATE pl_templates SET name = ?, config = ? WHERE id = ? AND user_id = ?').run(name, JSON.stringify(config), id, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'default') return res.status(400).json({ error: 'Impossible de supprimer le template par defaut' });
    db.prepare('DELETE FROM pl_templates WHERE id = ? AND user_id = ?').run(id, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/templates/apply
router.post('/apply', (req, res) => {
  try {
    const { templateId, balanceId } = req.body;
    const userId = req.user.userId;

    let config;
    if (templateId === 'default') {
      config = DEFAULT_TEMPLATE;
    } else {
      const tpl = db.prepare('SELECT config FROM pl_templates WHERE id = ? AND user_id = ?').get(templateId, userId);
      if (!tpl) return res.status(404).json({ error: 'Template introuvable' });
      config = JSON.parse(tpl.config);
    }

    const bal = db.prepare(`SELECT b.raw_data FROM balances b JOIN clients c ON b.client_id=c.id WHERE b.id=? AND c.user_id=?`).get(balanceId, userId);
    if (!bal) return res.status(404).json({ error: 'Balance introuvable' });

    const accounts = JSON.parse(bal.raw_data);
    const result   = applyTemplateToAccounts(config, accounts);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert old sections+subtotals format to tree format
const convertSectionsToTree = (config) => {
  const tree = (config.sections || []).map(s => ({
    id: s.id,
    label: s.label,
    type: 'group',
    accountClass: s.type,
    accountRanges: s.accountRanges,
  }));
  if (config.subtotals) {
    config.subtotals.forEach(st => {
      tree.push({ id: st.id, label: st.label, type: 'subtotal', formula: st.formula });
    });
  }
  return tree;
};

// Apply a template tree to merged monthly data
function applyTreeToMonthly(tree, accountMonthly, months) {
  const assigned = new Set();
  const round2 = (n) => Math.round(n * 100) / 100;

  // Map to store computed node values for subtotal references
  const nodeValues = {};

  function processNode(node) {
    if (node.type === 'group') {
      // Find matching accounts
      const accounts = [];
      for (const [accNum, accData] of Object.entries(accountMonthly)) {
        const match = (node.accounts && node.accounts.some(a => accNum.startsWith(a) || a.startsWith(accNum))) ||
          (node.accountRanges && node.accountRanges.some(r => accNum >= r.from && accNum <= r.to + 'z'));
        if (match && !assigned.has(accNum)) {
          assigned.add(accNum);
          accounts.push({ number: accNum, label: (accData.label || '').toUpperCase(), months: accData.months, total: accData.total });
        }
      }

      // Compute group totals (net: produits class 7 positive, charges class 6 positive)
      const groupMonths = {};
      months.forEach(m => {
        groupMonths[m] = round2(accounts.reduce((s, a) => s + (a.months[m] || 0), 0));
      });
      const groupTotal = round2(accounts.reduce((s, a) => s + a.total, 0));

      nodeValues[node.id] = { months: groupMonths, total: groupTotal };

      return { ...node, months: groupMonths, total: groupTotal, accounts };
    }

    if (node.type === 'category') {
      const children = (node.children || []).map(child => processNode(child));
      const catMonths = {};
      months.forEach(m => {
        catMonths[m] = round2(children.reduce((s, c) => s + (c.months?.[m] || 0), 0));
      });
      const catTotal = round2(children.reduce((s, c) => s + (c.total || 0), 0));

      nodeValues[node.id] = { months: catMonths, total: catTotal };

      return { ...node, months: catMonths, total: catTotal, children };
    }

    if (node.type === 'subtotal') {
      const subMonths = {};
      let subTotal = 0;

      if (node.sumOf) {
        // Sum of referenced nodes
        months.forEach(m => {
          subMonths[m] = round2(node.sumOf.reduce((s, refId) => s + (nodeValues[refId]?.months[m] || 0), 0));
        });
        subTotal = round2(node.sumOf.reduce((s, refId) => s + (nodeValues[refId]?.total || 0), 0));
      } else if (node.formula) {
        // Parse formula: "nodeA - nodeB + nodeC"
        const tokens = node.formula.split(/\s+/);
        months.forEach(m => { subMonths[m] = 0; });
        let op = '+';
        for (const token of tokens) {
          if (token === '+' || token === '-') { op = token; continue; }
          const ref = nodeValues[token];
          if (!ref) continue;
          months.forEach(m => {
            subMonths[m] = round2(subMonths[m] + (op === '+' ? 1 : -1) * (ref.months[m] || 0));
          });
          subTotal = round2(subTotal + (op === '+' ? 1 : -1) * ref.total);
        }
      }

      nodeValues[node.id] = { months: subMonths, total: subTotal };

      return { ...node, months: subMonths, total: subTotal };
    }

    return node;
  }

  const processedTree = tree.map(node => processNode(node));

  // Find unassigned accounts (class 6 and 7 only — P&L relevant)
  const unassigned = Object.entries(accountMonthly)
    .filter(([accNum]) => !assigned.has(accNum) && (accNum.charAt(0) === '6' || accNum.charAt(0) === '7'))
    .map(([accNum, accData]) => ({ number: accNum, label: (accData.label || '').toUpperCase(), months: accData.months, total: accData.total }))
    .sort((a, b) => a.number.localeCompare(b.number));

  return { months, tree: processedTree, unassigned };
}

// POST /api/templates/apply-monthly
router.post('/apply-monthly', async (req, res) => {
  try {
    const { templateId, clientId } = req.body;
    const userId = req.user.userId;

    // Verify client ownership
    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(403).json({ error: 'Client not found' });

    // Load template config
    let config;
    if (!templateId || templateId === 'default') {
      config = DEFAULT_TEMPLATE;
    } else {
      const tplStmt = db.prepare('SELECT config FROM pl_templates WHERE id = ? AND user_id = ?');
      const tpl = tplStmt.get(templateId, userId);
      if (!tpl) return res.status(404).json({ error: 'Template not found' });
      config = JSON.parse(tpl.config);
    }

    // Determine tree: use tree format if present, otherwise convert old sections format
    let templateTree;
    if (config.tree) {
      templateTree = config.tree;
    } else {
      templateTree = convertSectionsToTree(config);
    }

    // Load all balances for the client
    const balancesStmt = db.prepare('SELECT id FROM balances WHERE client_id = ?');
    const balances = balancesStmt.all(clientId);

    // Load and merge all monthly reports
    let mergedAccountMonthly = {};
    let allMonths = new Set();

    for (const bal of balances) {
      const reportStmt = db.prepare('SELECT data FROM reports WHERE balance_id = ? AND type = ?');
      const monthlyReport = reportStmt.get(bal.id, 'monthly');
      if (!monthlyReport) continue;
      const monthly = JSON.parse(monthlyReport.data);

      (monthly.months || []).forEach(m => allMonths.add(m));

      for (const [accNum, accData] of Object.entries(monthly.accountMonthly || {})) {
        if (!mergedAccountMonthly[accNum]) {
          mergedAccountMonthly[accNum] = {
            label: (accData.label || '').toUpperCase(),
            accountClass: accData.accountClass || accNum.charAt(0),
            prefix2: accData.prefix2 || accNum.substring(0, 2),
            months: {},
            total: 0,
          };
        }
        for (const [month, amount] of Object.entries(accData.months || {})) {
          mergedAccountMonthly[accNum].months[month] =
            Math.round(((mergedAccountMonthly[accNum].months[month] || 0) + amount) * 100) / 100;
        }
        mergedAccountMonthly[accNum].total = Math.round(
          Object.values(mergedAccountMonthly[accNum].months).reduce((s, v) => s + v, 0) * 100
        ) / 100;
        // Keep the longer (more descriptive) label
        if (accData.label && accData.label.length > (mergedAccountMonthly[accNum].label || '').length) {
          mergedAccountMonthly[accNum].label = (accData.label || '').toUpperCase();
        }
      }
    }

    const months = Array.from(allMonths).sort();

    const result = applyTreeToMonthly(templateTree, mergedAccountMonthly, months);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { DEFAULT_TEMPLATE };
export default router;
