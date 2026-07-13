/**
 * Export Excel (.xlsx) de la Vision périodique — mode Standard (plan personnalisé).
 * Reproduit l'arbre du site avec des FORMULES vivantes :
 *   compte (nombre) → sous-catégorie (SUM) → catégorie (SUM) → total (SUM, cumul/section)
 *   indicateurs (formule de ratio référençant les lignes)
 * + couleurs/graisses par niveau, négatifs en bordeaux, formats, gel des volets.
 *
 * On génère un vrai fichier (les formules ne passent pas par un copier-coller HTML).
 */
import ExcelJS from 'exceljs';
import { formulaToRPN, evalRPN } from './mapping';

const ARGB = {
  navy: 'FF01071B',
  navySoft: 'FF243044',
  white: 'FFFFFFFF',
  gold: 'FFA88962',
  goldSoft: 'FFECDFCA',
  cream: 'FFF6F1E9',
  ink: 'FF1B1B1F',
  gray: 'FF6B7280',
  neg: 'FF5C1717',       // négatifs sur fond clair : bordeaux
  negOnDark: 'FFF3A5A5', // négatifs sur fond navy (totaux) : rouge clair, lisible
  grid: 'FFE2E2E2',
};

const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

const NUM_FMT = '#,##0';
const BORDER = { top: { style: 'thin', color: { argb: ARGB.grid } }, left: { style: 'thin', color: { argb: ARGB.grid } }, bottom: { style: 'thin', color: { argb: ARGB.grid } }, right: { style: 'thin', color: { argb: ARGB.grid } } };
const fillOf = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const styleNum = (cell, isNeg, opts = {}) => {
  cell.numFmt = opts.fmt || NUM_FMT;
  cell.alignment = { horizontal: 'right' };
  cell.border = BORDER;
  if (opts.fill) cell.fill = fillOf(opts.fill);
  const onDark = opts.fill === ARGB.navy || opts.fill === ARGB.navySoft;
  const negColor = onDark ? ARGB.negOnDark : ARGB.neg;
  cell.font = { size: opts.size || 10, bold: !!opts.bold, italic: !!opts.italic, color: { argb: isNeg ? negColor : (opts.color || ARGB.ink) } };
};

/** Prépare la feuille (colonne A niveau masquée, B libellé, mois, Total) + en-tête. */
function initSheet(wb, title, columns, firstDataCol, totalColIdx, LABEL_COL) {
  const ws = wb.addWorksheet((title || 'Feuille').slice(0, 28));
  ws.views = [{ state: 'frozen', xSplit: LABEL_COL, ySplit: 1 }];
  ws.properties.outlineLevelRow = 4;
  ws.getColumn(1).width = 8; ws.getColumn(1).hidden = true;
  ws.getColumn(LABEL_COL).width = 42;
  for (let i = 0; i < columns.length; i++) ws.getColumn(firstDataCol + i).width = 12;
  ws.getColumn(totalColIdx).width = 13;
  const head = ws.getRow(1);
  head.getCell(1).value = 'Niveau';
  head.getCell(LABEL_COL).value = 'Poste';
  columns.forEach((c, i) => { head.getCell(firstDataCol + i).value = c.label; });
  head.getCell(totalColIdx).value = 'Total';
  head.eachCell((cell, col) => {
    cell.fill = fillOf(ARGB.navy);
    cell.font = { color: { argb: ARGB.white }, bold: true, size: 10 };
    cell.alignment = { horizontal: col === LABEL_COL ? 'left' : 'right', vertical: 'middle' };
    cell.border = BORDER;
  });
  head.height = 20;
  return ws;
}

async function downloadWorkbook(wb, title) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'export').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Regroupe une liste triée de numéros de ligne en plages « a:b » (colonne col). */
function toRanges(rowNums, col) {
  if (!rowNums.length) return '';
  const sorted = [...rowNums].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    parts.push(start === prev ? `${col}${start}` : `${col}${start}:${col}${prev}`);
    start = prev = sorted[i];
  }
  parts.push(start === prev ? `${col}${start}` : `${col}${start}:${col}${prev}`);
  return parts.join(',');
}

/**
 * @param {Object} p
 *   title, tree (customTree.tree), rowsById, columns [{key,label,months}], aggregateValues, plan (mapping.pl)
 */
export async function exportPeriodicXlsx({ title = 'Compte de résultat', tree = [], rowsById = {}, columns = [], aggregateValues, plan }) {
  const agg = (months) => (aggregateValues ? aggregateValues(months || {}) : (months || {}));
  const cval = (months, ck) => { const v = agg(months)[ck]; return Number.isFinite(v) ? v : 0; };
  const modeOf = (id) => (plan?.nodes || []).find((n) => n.id === id)?.mode || 'cumul';

  // Colonne A (masquée) = niveau hiérarchique ; colonne B = libellé (Poste) ; puis les mois.
  const LABEL_COL = 2;
  const LEVEL_OF = { total: 1, cat: 2, sub: 3, acct: 4, indicator: 1 };
  const nMonths = columns.length;
  const firstDataCol = 3;                      // C
  const lastMonthCol = firstDataCol + nMonths - 1;
  const totalColIdx = firstDataCol + nMonths; // colonne Total
  const monthColLetters = columns.map((_, i) => colLetter(firstDataCol + i));
  const totalColLetter = colLetter(totalColIdx);

  // ── Phase 1 : aplatir l'arbre en lignes, attribuer les n° de ligne, mémoriser les liens ──
  const items = [];        // { kind, label, level, node? , months? , leafRanges? , catRefs? , indicator? }
  const nodeRow = {};      // id (cat/total) ou 'catId/subId' → n° de ligne Excel
  const allCatRows = [];   // n° de ligne des catégories (pour totaux cumul)
  let sectionCatRows = []; // n° de ligne des catégories depuis le dernier total (section)

  let row = 2; // ligne 1 = en-tête
  for (const it of tree) {
    if (it.type === 'group') {
      const catRowNum = row;
      nodeRow[it.id] = catRowNum;
      const catItem = { kind: 'cat', label: it.label, level: 0, months: it.months, leafRows: [] };
      items.push(catItem); row++;
      for (const sub of it.subs || []) {
        nodeRow[`${it.id}/${sub.id}`] = row;
        const subItem = { kind: 'sub', label: sub.label, level: 1, months: sub.months, leafRows: [] };
        items.push(subItem); row++;
        for (const acc of sub.accounts || []) {
          items.push({ kind: 'acct', label: `${acc.originalNumber || acc.number} ${acc.label}`, level: 2, months: acc.months });
          subItem.leafRows.push(row); catItem.leafRows.push(row); row++;
        }
      }
      for (const acc of it.accounts || []) {
        items.push({ kind: 'acct', label: `${acc.originalNumber || acc.number} ${acc.label}`, level: 2, months: acc.months });
        catItem.leafRows.push(row); row++;
      }
      allCatRows.push(catRowNum); sectionCatRows.push(catRowNum);
    } else if (it.type === 'subtotal') {
      nodeRow[it.id] = row;
      const mode = modeOf(it.id);
      const refs = mode === 'section' ? [...sectionCatRows] : [...allCatRows];
      items.push({ kind: 'total', label: it.label, level: 0, months: it.months, catRefs: refs });
      sectionCatRows = [];
      row++;
    } else if (it.type === 'indicator') {
      items.push({ kind: 'indicator', label: it.label, level: 0, indicator: it });
      row++;
    }
  }

  // ── Phase 2 : écriture ──
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MoonViz';
  const ws = initSheet(wb, title, columns, firstDataCol, totalColIdx, LABEL_COL);
  const border = BORDER;
  const fill = fillOf;
  const numFmt = NUM_FMT;
  const setNum = styleNum;
  const monthSumFormula = (r) => (nMonths ? { formula: `SUM(${colLetter(firstDataCol)}${r}:${colLetter(lastMonthCol)}${r})` } : 0);

  items.forEach((it, idx) => {
    const r = idx + 2;
    const xr = ws.getRow(r);
    // Niveau hiérarchique (colonne A masquée) : 1=sous-total, 2=catégorie, 3=sous-cat, 4=compte.
    const nvc = xr.getCell(1);
    nvc.value = LEVEL_OF[it.kind] ?? '';
    nvc.alignment = { horizontal: 'center' };
    // Libellé
    const lc = xr.getCell(LABEL_COL);
    lc.value = it.label;
    lc.border = border;
    lc.alignment = { horizontal: 'left', indent: it.level, vertical: 'middle' };
    if (it.kind === 'cat') lc.font = { bold: true, size: 10, color: { argb: ARGB.ink } };
    else if (it.kind === 'total') lc.font = { bold: true, size: 10, color: { argb: ARGB.white } };
    else if (it.kind === 'sub') lc.font = { size: 10, color: { argb: ARGB.ink } };
    else if (it.kind === 'acct') lc.font = { size: 9, color: { argb: ARGB.gray } };
    else if (it.kind === 'indicator') lc.font = { size: 9, color: { argb: ARGB.ink } };

    // Fonds de ligne
    if (it.kind === 'total') { lc.fill = fill(ARGB.navy); }
    else if (it.kind === 'indicator') { lc.fill = fill(ARGB.goldSoft); }
    else if (it.kind === 'sub') { lc.fill = fill(ARGB.cream); }
    if (it.kind === 'cat') lc.border = { ...border, left: { style: 'medium', color: { argb: ARGB.gold } } };

    // Contour / niveau (outline Excel)
    if (it.level > 0) xr.outlineLevel = it.level;
    if (it.kind === 'indicator') xr.height = 15;

    // Cellules de données
    const rowFill = it.kind === 'total' ? ARGB.navy : it.kind === 'indicator' ? ARGB.goldSoft : it.kind === 'sub' ? ARGB.cream : null;
    const baseColor = it.kind === 'total' ? ARGB.white : it.kind === 'acct' ? ARGB.gray : ARGB.ink;

    if (it.kind === 'indicator') {
      const ind = it.indicator;
      const rpn = formulaToRPN(ind.formula);
      const fmt = ind.format === 'pct' ? '0.0%' : ind.format === 'ratio' ? '0.00' : numFmt;
      const totalRes = evalRPN(rpn, (id) => { const mm = rowsById[id] || {}; const a = agg(mm); return columns.reduce((s, c) => s + (a[c.key] || 0), 0); });
      columns.forEach((c, i) => {
        const cell = xr.getCell(firstDataCol + i);
        const raw = evalRPN(rpn, (id) => cval(rowsById[id] || {}, c.key));
        cell.value = { formula: excelFormulaFromTokens(ind.formula, monthColLetters[i], nodeRow, ind.format) };
        setNum(cell, ind.format !== 'pct' && raw !== null && raw < 0, { fmt, fill: rowFill, size: 9 });
      });
      const tcell = xr.getCell(totalColIdx);
      tcell.value = { formula: excelFormulaFromTokens(ind.formula, totalColLetter, nodeRow, ind.format) };
      setNum(tcell, ind.format !== 'pct' && totalRes !== null && totalRes < 0, { fmt, fill: rowFill, size: 9, bold: true });
      return;
    }

    // cat / sub / total / acct
    columns.forEach((c, i) => {
      const cell = xr.getCell(firstDataCol + i);
      const colL = monthColLetters[i];
      const v = cval(it.months, c.key);
      if (it.kind === 'acct') {
        cell.value = v;
      } else if (it.kind === 'sub' || it.kind === 'cat') {
        const rng = toRanges(it.leafRows || [], colL);
        cell.value = rng ? { formula: `SUM(${rng})` } : v;
      } else if (it.kind === 'total') {
        const refs = (it.catRefs || []).map((rn) => `${colL}${rn}`);
        cell.value = refs.length ? { formula: `SUM(${refs.join(',')})` } : v;
      }
      setNum(cell, v < 0, { fill: rowFill, bold: it.kind === 'cat' || it.kind === 'total', color: baseColor, size: it.kind === 'acct' ? 9 : 10 });
    });
    // Total = somme des mois
    const tcell = xr.getCell(totalColIdx);
    const tv = columns.reduce((s, c) => s + cval(it.months, c.key), 0);
    tcell.value = nMonths ? monthSumFormula(r) : tv;
    setNum(tcell, tv < 0, { fill: rowFill, bold: true, color: baseColor, size: it.kind === 'acct' ? 9 : 10 });
  });

  await downloadWorkbook(wb, title);
}

/**
 * Export Excel du tableau de TRÉSORERIE — harmonisé avec le compte de résultat.
 * Structure plate : rubriques (SUM des comptes), sous-totaux/total (SUM des
 * rubriques de la section / de tout), trésorerie d'ouverture/clôture (soldes).
 * @param {Object} p  title, rows (cashflow.rows), columns, aggregateValues
 */
export async function exportCashflowXlsx({ title = 'Trésorerie', rows = [], columns = [], aggregateValues }) {
  const agg = (m) => (aggregateValues ? aggregateValues(m || {}) : (m || {}));
  const cval = (m, ck) => { const v = agg(m)[ck]; return Number.isFinite(v) ? v : 0; };
  const tresoPick = (rw, monthList) => { if (!monthList || !monthList.length) return 0; const s = [...monthList].sort(); const mk = rw.key === 'tresorerieOuverture' ? s[0] : s[s.length - 1]; return rw.months?.[mk] || 0; };
  const cellVal = (rw, col) => (rw.isTreso ? tresoPick(rw, col.months) : cval(rw.months, col.key));
  const allMonths = columns.flatMap((c) => c.months);

  const LABEL_COL = 2;
  const nMonths = columns.length;
  const firstDataCol = 3;
  const lastMonthCol = firstDataCol + nMonths - 1;
  const totalColIdx = firstDataCol + nMonths;
  const monthColLetters = columns.map((_, i) => colLetter(firstDataCol + i));

  // ── Aplatir (rubrique → comptes ; totaux ; trésorerie) ──
  const items = [];
  const maxLen = Math.max(6, ...rows.flatMap((r) => (r.accounts || []).map((a) => String(a.number).length)));
  for (const rw of rows) {
    const empty = !rw.isTotal && !rw.isSubtotal && !rw.isTreso && columns.every((c) => cellVal(rw, c) === 0) && !(rw.accounts || []).length;
    if (empty) continue;
    if (rw.isTreso) { items.push({ kind: 'treso', label: rw.label, row: rw }); continue; }
    if (rw.isTotal || rw.isSubtotal) { items.push({ kind: 'total', label: rw.label, row: rw }); continue; }
    const catItem = { kind: 'cat', label: rw.label, row: rw, leafRows: [] };
    items.push(catItem);
    for (const acc of rw.accounts || []) {
      items.push({ kind: 'acct', label: `${/^\d+$/.test(acc.number) ? String(acc.number).padEnd(maxLen, '0') : acc.number} ${acc.label}`, months: acc.months });
      catItem.leafRows.push(0); // rempli ci-dessous
    }
  }
  // Numéros de ligne réels (ligne 1 = en-tête → item idx 0 = ligne 2).
  items.forEach((it, idx) => { it._rowNum = idx + 2; });
  // Rattache chaque compte à sa catégorie (le plus récent 'cat' rencontré) pour leafRows.
  { let cur = null; for (const it of items) { if (it.kind === 'cat') { cur = it; cur.leafRows = []; } else if (it.kind === 'acct' && cur) cur.leafRows.push(it._rowNum); } }
  { let sec = []; const all = []; for (const it of items) { if (it.kind === 'cat') { all.push(it._rowNum); sec.push(it._rowNum); } else if (it.kind === 'total') { it.catRefs = it.row.isTotal ? [...all] : [...sec]; sec = []; } } }

  const LEVEL_OF = { total: 1, cat: 2, acct: 4, treso: 1 };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MoonViz';
  const ws = initSheet(wb, title, columns, firstDataCol, totalColIdx, LABEL_COL);
  const monthSum = (r) => (nMonths ? { formula: `SUM(${colLetter(firstDataCol)}${r}:${colLetter(lastMonthCol)}${r})` } : 0);

  items.forEach((it, idx) => {
    const r = idx + 2;
    const xr = ws.getRow(r);
    // Niveau (col A masquée)
    const nvc = xr.getCell(1); nvc.value = LEVEL_OF[it.kind] ?? ''; nvc.alignment = { horizontal: 'center' };
    // Libellé
    const lc = xr.getCell(LABEL_COL);
    lc.value = it.label; lc.border = BORDER; lc.alignment = { horizontal: 'left', indent: it.kind === 'acct' ? 1 : 0, vertical: 'middle' };
    if (it.kind === 'cat') { lc.font = { bold: true, size: 10, color: { argb: ARGB.ink } }; lc.border = { ...BORDER, left: { style: 'medium', color: { argb: ARGB.gold } } }; }
    else if (it.kind === 'total') { lc.font = { bold: true, size: 10, color: { argb: ARGB.white } }; lc.fill = fillOf(ARGB.navy); }
    else if (it.kind === 'treso') { lc.font = { bold: true, size: 10, color: { argb: ARGB.ink } }; lc.fill = fillOf(ARGB.goldSoft); }
    else { lc.font = { size: 9, color: { argb: ARGB.gray } }; }
    if (it.kind === 'acct') xr.outlineLevel = 1;

    const rowFill = it.kind === 'total' ? ARGB.navy : it.kind === 'treso' ? ARGB.goldSoft : null;
    const baseColor = it.kind === 'total' ? ARGB.white : it.kind === 'acct' ? ARGB.gray : ARGB.ink;

    columns.forEach((c, i) => {
      const cell = xr.getCell(firstDataCol + i);
      const colL = monthColLetters[i];
      const v = it.kind === 'treso' ? tresoPick(it.row, c.months) : cval(it.months || it.row?.months, c.key);
      if (it.kind === 'acct') cell.value = v;
      else if (it.kind === 'cat') { const rng = toRanges(it.leafRows || [], colL); cell.value = rng ? { formula: `SUM(${rng})` } : v; }
      else if (it.kind === 'total') { const refs = (it.catRefs || []).map((rn) => `${colL}${rn}`); cell.value = refs.length ? { formula: `SUM(${refs.join(',')})` } : v; }
      else cell.value = v; // treso : solde
      styleNum(cell, v < 0, { fill: rowFill, bold: it.kind === 'total' || it.kind === 'cat' || it.kind === 'treso', color: baseColor, size: it.kind === 'acct' ? 9 : 10 });
    });
    // Total : somme des mois, SAUF trésorerie (solde d'ouverture 1er mois / clôture dernier mois)
    const tcell = xr.getCell(totalColIdx);
    if (it.kind === 'treso') { tcell.value = tresoPick(it.row, allMonths); styleNum(tcell, tresoPick(it.row, allMonths) < 0, { fill: rowFill, bold: true, color: baseColor }); }
    else { const tv = columns.reduce((s, c) => s + (it.kind === 'acct' ? cval(it.months, c.key) : cval(it.months || it.row?.months, c.key)), 0); tcell.value = nMonths ? monthSum(r) : tv; styleNum(tcell, tv < 0, { fill: rowFill, bold: true, color: baseColor, size: it.kind === 'acct' ? 9 : 10 }); }
  });

  await downloadWorkbook(wb, title);
}

/**
 * Export Excel du détail des écritures (drill-down d'un compte).
 * Table plate : Date · Libellé · Débit · Crédit · Solde · Journal, avec des
 * VRAIS nombres (2 décimales), le solde cumulé en formule, dates réelles, et une
 * ligne de totaux. Mise en forme cohérente avec le reste (en-tête navy, etc.).
 * @param {Object} p  title, accountLabel, periodLabel, entries [{date,label,debit,credit,solde,journalCode}]
 */
export async function exportEntriesXlsx({ title = 'Écritures', accountLabel = '', periodLabel = '', entries = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MoonViz';
  const ws = wb.addWorksheet('Écritures');
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const NUM2 = '#,##0.00';
  ws.getColumn(1).width = 12;  // Date
  ws.getColumn(2).width = 52;  // Libellé
  ws.getColumn(3).width = 14;  // Débit
  ws.getColumn(4).width = 14;  // Crédit
  ws.getColumn(5).width = 15;  // Solde
  ws.getColumn(6).width = 11;  // Journal

  // En-tête
  const head = ws.getRow(1);
  ['Date', 'Libellé', 'Débit', 'Crédit', 'Solde', 'Journal'].forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.fill = fillOf(ARGB.navy);
    cell.font = { color: { argb: ARGB.white }, bold: true, size: 10 };
    cell.alignment = { horizontal: i >= 2 && i <= 4 ? 'right' : i === 5 ? 'center' : 'left', vertical: 'middle' };
    cell.border = BORDER;
  });
  head.height = 20;

  // Convertit « JJ/MM/AAAA » en Date réelle (sinon renvoie la chaîne telle quelle).
  const toDate = (s) => {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : (s || '');
  };

  let totDebit = 0, totCredit = 0;
  entries.forEach((e, i) => {
    const r = ws.getRow(i + 2);
    const zebra = i % 2 === 1 ? ARGB.cream : ARGB.white;
    totDebit += e.debit || 0; totCredit += e.credit || 0;

    const dc = r.getCell(1);
    dc.value = toDate(e.date);
    if (dc.value instanceof Date) dc.numFmt = 'dd/mm/yyyy';
    dc.font = { size: 10, color: { argb: ARGB.gray } };
    dc.alignment = { horizontal: 'left' };
    dc.fill = fillOf(zebra); dc.border = BORDER;

    const lc = r.getCell(2);
    lc.value = e.label || '';
    lc.font = { size: 10, color: { argb: ARGB.ink } };
    lc.alignment = { horizontal: 'left', wrapText: false };
    lc.fill = fillOf(zebra); lc.border = BORDER;

    // Débit / Crédit : vrais nombres, cellule vide si zéro (comme le « - » du site).
    const dbc = r.getCell(3);
    if (e.debit) dbc.value = e.debit;
    styleNum(dbc, false, { fmt: NUM2, fill: zebra });
    const crc = r.getCell(4);
    if (e.credit) crc.value = e.credit;
    styleNum(crc, false, { fmt: NUM2, fill: zebra });

    // Solde cumulé : formule vivante (solde précédent + débit − crédit).
    const sc = r.getCell(5);
    sc.value = i === 0 ? { formula: `C2-D2` } : { formula: `E${i + 1}+C${i + 2}-D${i + 2}` };
    styleNum(sc, (e.solde || 0) < 0, { fmt: NUM2, fill: zebra, bold: true });

    const jc = r.getCell(6);
    jc.value = e.journalCode || '';
    jc.font = { size: 9, color: { argb: ARGB.gray } };
    jc.alignment = { horizontal: 'center' };
    jc.fill = fillOf(zebra); jc.border = BORDER;
  });

  // Ligne de totaux
  const n = entries.length;
  const tr = ws.getRow(n + 2);
  const tl = tr.getCell(1);
  tl.value = 'Total';
  tl.font = { bold: true, size: 10, color: { argb: ARGB.white } };
  tl.fill = fillOf(ARGB.navy); tl.border = BORDER; tl.alignment = { horizontal: 'left' };
  const emptyLabel = tr.getCell(2);
  emptyLabel.fill = fillOf(ARGB.navy); emptyLabel.border = BORDER;
  const td = tr.getCell(3);
  td.value = n ? { formula: `SUM(C2:C${n + 1})` } : 0;
  styleNum(td, false, { fmt: NUM2, fill: ARGB.navy, bold: true, color: ARGB.white });
  const tc = tr.getCell(4);
  tc.value = n ? { formula: `SUM(D2:D${n + 1})` } : 0;
  styleNum(tc, false, { fmt: NUM2, fill: ARGB.navy, bold: true, color: ARGB.white });
  const ts = tr.getCell(5);
  ts.value = n ? { formula: `C${n + 2}-D${n + 2}` } : 0;
  styleNum(ts, (totDebit - totCredit) < 0, { fmt: NUM2, fill: ARGB.navy, bold: true, color: ARGB.white });
  const tj = tr.getCell(6);
  tj.fill = fillOf(ARGB.navy); tj.border = BORDER;

  const fname = [title, accountLabel, periodLabel].filter(Boolean).join(' ');
  await downloadWorkbook(wb, fname);
}

/** Traduit les tokens d'un indicateur en formule Excel pour une colonne donnée.
 *  Format % : on affiche un ratio (mb/ca) que le format de cellule met en %. */
function excelFormulaFromTokens(formula, colL, nodeRow, format) {
  let out = '';
  for (const tk of formula || []) {
    if (tk.t === 'ref') { const r = nodeRow[tk.id]; out += r ? `${colL}${r}` : '0'; }
    else if (tk.t === 'const') out += Number(tk.v) || 0;
    else if (tk.t === 'op') out += ({ '+': '+', '-': '-', '*': '*', '/': '/' })[tk.v] || '+';
    else if (tk.t === 'lp') out += '(';
    else if (tk.t === 'rp') out += ')';
  }
  if (!out) return '0';
  return `IFERROR(${out},"")`;
}
