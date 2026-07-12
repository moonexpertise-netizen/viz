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
  neg: 'FF5C1717',
  grid: 'FFE2E2E2',
};

const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

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

  const nMonths = columns.length;
  const firstDataCol = 2;                     // B
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
  const ws = wb.addWorksheet(title.slice(0, 28) || 'Feuille');
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  ws.properties.outlineLevelRow = 2;

  // Largeurs
  ws.getColumn(1).width = 42;
  for (let i = 0; i < nMonths; i++) ws.getColumn(firstDataCol + i).width = 12;
  ws.getColumn(totalColIdx).width = 13;

  const border = { top: { style: 'thin', color: { argb: ARGB.grid } }, left: { style: 'thin', color: { argb: ARGB.grid } }, bottom: { style: 'thin', color: { argb: ARGB.grid } }, right: { style: 'thin', color: { argb: ARGB.grid } } };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  // En-tête
  const head = ws.getRow(1);
  head.getCell(1).value = 'Poste';
  columns.forEach((c, i) => { head.getCell(firstDataCol + i).value = c.label; });
  head.getCell(totalColIdx).value = 'Total';
  head.eachCell((cell, col) => {
    cell.fill = fill(ARGB.navy);
    cell.font = { color: { argb: ARGB.white }, bold: true, size: 10 };
    cell.alignment = { horizontal: col === 1 ? 'left' : 'right', vertical: 'middle' };
    cell.border = border;
  });
  head.height = 20;

  const numFmt = '#,##0';
  const setNum = (cell, isNeg, opts = {}) => {
    cell.numFmt = opts.fmt || numFmt;
    cell.alignment = { horizontal: 'right' };
    cell.border = border;
    if (opts.fill) cell.fill = fill(opts.fill);
    cell.font = { size: opts.size || 10, bold: !!opts.bold, italic: !!opts.italic, color: { argb: isNeg ? ARGB.neg : (opts.color || ARGB.ink) } };
  };
  const monthSumFormula = (r) => (nMonths ? { formula: `SUM(${colLetter(firstDataCol)}${r}:${colLetter(lastMonthCol)}${r})` } : 0);

  items.forEach((it, idx) => {
    const r = idx + 2;
    const xr = ws.getRow(r);
    // Libellé
    const lc = xr.getCell(1);
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

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'export').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
