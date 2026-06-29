import { initializeDatabase, initDb } from './src/db.js';
await initializeDatabase(); initDb();
import db from './src/db.js';

const balances = db.prepare('SELECT id FROM balances WHERE client_id = 1 ORDER BY fiscal_year ASC').all();
let mergedAM = {};
let allMonthsSet = new Set();
for (const bal of balances) {
  const r = db.prepare('SELECT data FROM reports WHERE balance_id = ? AND type = ?').get(bal.id, 'monthly');
  if (!r) continue;
  const m = JSON.parse(r.data);
  (m.months||[]).forEach(mo => allMonthsSet.add(mo));
  for (const [num, acc] of Object.entries(m.accountMonthly || {})) {
    if (!mergedAM[num]) mergedAM[num] = { label: acc.label, months: {}, total: 0 };
    for (const [mo, val] of Object.entries(acc.months || {})) {
      mergedAM[num].months[mo] = Math.round(((mergedAM[num].months[mo]||0) + val)*100)/100;
    }
    mergedAM[num].total = Math.round((mergedAM[num].total + (acc.total||0))*100)/100;
  }
}

const months = [...allMonthsSet].sort().filter(m => m >= '2024-11' && m <= '2025-12');
const round2 = (n) => Math.round(n * 100) / 100;

const SIG_ROOTS = {
  ca: ['70'], ventes_mch: ['707','7097'], cout_mch: ['607','6037','6097'],
  prod_vendue: ['700','701','702','703','704','705','706','708','7090','7091','7092','7093','7094','7095','7096','7098','7099'],
  prod_stockee: ['71'], prod_immo: ['72'],
  autres_conso: ['600','601','602','604','605','606','608','6030','6031','6032','6033','6034','6035','6036','6038','6039','6090','6091','6092','6093','6094','6095','6096','6098','6099'],
  conso_tiers: ['61','62'], subventions: ['74'], impots: ['63'], personnel: ['64'],
  reprises_expl: ['781'], dotations_expl: ['681'], subv_invest: ['747'],
  cession_immo: ['757'], vc_immo: ['657'],
  autres_prod: ['751','752','753','754','756','758','759'],
  autres_charges: ['651','652','653','654','656','658','659'],
  qp_commun_p: ['755'], qp_commun_c: ['655'],
  produits_fin: ['76','786'], charges_fin: ['66','686'],
  produits_except: ['77','787'], charges_except: ['67','687'],
  participation: ['691'], impots_benefices: ['690','692','693','694','695','696','697','698','699'],
};

// Calculer chaque ligne sur les mois filtres
const vals = {};
const matchCount = {};
for (const [key, roots] of Object.entries(SIG_ROOTS)) {
  let total = 0;
  for (const [num, acc] of Object.entries(mergedAM)) {
    if (roots.some(r => num.startsWith(r))) {
      const t = months.reduce((s, m) => s + (acc.months[m]||0), 0);
      total += t;
      if (!matchCount[num]) matchCount[num] = [];
      matchCount[num].push(key);
    }
  }
  vals[key] = round2(total);
  if (total !== 0) console.log(key + ': ' + round2(total));
}

// Subtotals
const marge_co = vals.ventes_mch - vals.cout_mch;
const marge = marge_co + vals.prod_vendue + vals.prod_stockee + vals.prod_immo - vals.autres_conso;
const va = marge - vals.conso_tiers + vals.subventions;
const ebitda = va - vals.impots - vals.personnel;
const rex = ebitda + vals.reprises_expl - vals.dotations_expl + vals.subv_invest + vals.cession_immo - vals.vc_immo + vals.autres_prod - vals.autres_charges + vals.qp_commun_p - vals.qp_commun_c;
const rcourant = rex + vals.produits_fin - vals.charges_fin;
const rnet = rcourant + vals.produits_except - vals.charges_except - vals.participation - vals.impots_benefices;

console.log('\n=> marge_co:', round2(marge_co));
console.log('=> marge:', round2(marge));
console.log('=> va:', round2(va));
console.log('=> ebitda:', round2(ebitda));
console.log('=> rex:', round2(rex));
console.log('=> rcourant:', round2(rcourant));
console.log('=> rnet:', round2(rnet));

// Doublons
const dups = Object.entries(matchCount).filter(([,v]) => v.length > 1);
if (dups.length) {
  console.log('\nDOUBLONS:');
  dups.forEach(([num, keys]) => console.log('  ' + num + ' -> ' + keys.join(', ')));
}

// Non matches
let pTot = 0, cTot = 0;
const unmatched = [];
for (const [num, acc] of Object.entries(mergedAM)) {
  if (num.charAt(0) !== '6' && num.charAt(0) !== '7') continue;
  const t = months.reduce((s, m) => s + (acc.months[m]||0), 0);
  if (num.charAt(0) === '7') pTot += t; else cTot += t;
  const isMatched = Object.values(SIG_ROOTS).some(roots => roots.some(r => num.startsWith(r)));
  if (!isMatched) unmatched.push(num + ' ' + acc.label + ' = ' + round2(t));
}

if (unmatched.length) { console.log('\nNON MATCHES:'); unmatched.forEach(u => console.log('  ' + u)); }

console.log('\nAttendu:', round2(pTot - cTot));
console.log('Ecart:', round2(rnet - round2(pTot - cTot)));
