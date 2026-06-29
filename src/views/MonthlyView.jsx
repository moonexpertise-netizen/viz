import { useEffect, useState, useMemo } from 'react';
import { dataAPI } from '../services/api';
import EntryDetailModal from '../components/EntryDetailModal';

// Range slider thumb styles (can't do with Tailwind)
const sliderThumbCSS = `
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: white;
    border: 3px solid #f97316;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  input[type=range]::-moz-range-thumb {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: white;
    border: 3px solid #f97316;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
`;

// Copy table data to clipboard as tab-separated text
const copyToClipboard = (headers, rows) => {
  const headerLine = headers.join('\t');
  const dataLines = rows.map(r => r.join('\t'));
  const text = [headerLine, ...dataLines].join('\n');
  return navigator.clipboard.writeText(text);
};

// Download as CSV (semicolon-separated for French Excel)
const downloadCSV = (headers, rows, filename) => {
  const BOM = '\uFEFF';
  const sep = ';';
  const headerLine = headers.join(sep);
  const dataLines = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(sep));
  const csv = BOM + [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Build standalone interactive HTML table for P&L (SIG) export
const buildPLTableHTML = (sigData, columns, decimals, aggregateValues) => {
  const fmtVal = (n) => {
    if (n === 0) return '<span class="zero">-</span>';
    const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(decimals > 0 ? n : Math.round(n));
    return n < 0 ? `<span class="negative">${formatted}</span>` : formatted;
  };

  // Use individual months as columns (not aggregated) — the HTML JS handles aggregation
  const allMonths = columns.flatMap(c => c.months);

  let html = '<table><thead><tr><th>Poste</th>';
  allMonths.forEach(m => { const [y, mo] = m.split('-'); html += `<th data-month="${m}">${mo}/${y}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';

  const monthCell = (months, m) => {
    const v = months?.[m] || 0;
    return `<td data-month="${m}">${fmtVal(v)}</td>`;
  };
  const totalCell = (months, isPct) => {
    const mj = JSON.stringify(months || {}).replace(/"/g, '&quot;');
    const sum = allMonths.reduce((s, m) => s + (months?.[m] || 0), 0);
    const r = Math.round(sum * 100) / 100;
    return `<td data-total="1" data-months="${mj}" ${isPct ? 'class="pct-cell"' : ''}>${fmtVal(r)}${isPct ? '%' : ''}</td>`;
  };

  sigData.forEach(item => {
    if (item.type === 'info') {
      html += `<tr class="row-info" onclick="toggleGroup('${item.key}')">`;
      html += `<td><span class="chevron open" data-chevron="${item.key}">&#9654;</span>${item.label}</td>`;
      allMonths.forEach(m => { html += monthCell(item.months, m); });
      html += totalCell(item.months);
      html += `</tr>`;
      (item.accounts || []).forEach(acc => {
        const oNum = (acc.originalNumber || acc.number).replace(/'/g, "\\'");
        const oLabel = (acc.label || '').replace(/'/g, "\\'");
        html += `<tr class="row-account" data-parent="${item.key}">`;
        html += `<td><span class="acc-num">${acc.number}</span><span class="acc-label">${acc.label}</span></td>`;
        allMonths.forEach(m => { html += monthCell(acc.months, m); });
        html += totalCell(acc.months);
        html += `</tr>`;
      });
    } else if (item.type === 'subtotal') {
      html += `<tr class="row-subtotal"><td>${item.label}</td>`;
      allMonths.forEach(m => { html += monthCell(item.months, m); });
      html += totalCell(item.months);
      html += `</tr>`;
    } else if (item.type === 'pct') {
      html += `<tr class="row-pct"><td>&nbsp;&nbsp;&nbsp;&nbsp;${item.label}</td>`;
      allMonths.forEach(m => { const v = item.months?.[m] || 0; html += `<td data-month="${m}">${v === 0 ? '<span class="zero">-</span>' : (v < 0 ? '<span class="negative">' : '') + v.toFixed(1) + '%' + (v < 0 ? '</span>' : '')}</td>`; });
      html += totalCell(item.months, true);
      html += `</tr>`;
    } else if (item.type === 'line') {
      const hasAccounts = item.accounts && item.accounts.length > 0;
      const lineEmpty = allMonths.every(m => (item.months?.[m] || 0) === 0);
      html += `<tr class="row-line" ${lineEmpty ? 'data-empty="true"' : ''} ${hasAccounts ? `onclick="toggleGroup('${item.key}')"` : ''}>`;
      html += `<td>${hasAccounts ? `<span class="chevron open" data-chevron="${item.key}">&#9654;</span>` : '<span style="display:inline-block;width:20px"></span>'}${item.label}</td>`;
      allMonths.forEach(m => { html += monthCell(item.months, m); });
      html += totalCell(item.months);
      html += `</tr>`;
      if (hasAccounts) {
        item.accounts.forEach(acc => {
          const accEmpty = allMonths.every(m => (acc.months[m] || 0) === 0);
          const oNum = (acc.originalNumber || acc.number).replace(/'/g, "\\'");
          const oLabel = (acc.label || '').replace(/'/g, "\\'");
          html += `<tr class="row-account" data-parent="${item.key}" ${accEmpty ? 'data-empty="true"' : ''}>`;
          html += `<td><span class="acc-num">${acc.number}</span><span class="acc-label">${acc.label}</span></td>`;
          allMonths.forEach(m => { html += monthCell(acc.months, m); });
          html += totalCell(acc.months);
          html += `</tr>`;
        });
      }
    }
  });

  html += '</tbody></table>';
  return html;
};

// Build standalone interactive HTML table for Cash Flow export
const buildCFTableHTML = (rows, columns, decimals, aggregateValues) => {
  const OPERATIONAL_KEYS = ['encaissementsClients', 'decaissementsFournisseurs', 'salairesCharges', 'dettesFiscales', 'autresOperationnels'];
  const FINANCIAL_KEYS = ['emprunts', 'autresFinanciers'];

  const fmtVal = (n) => {
    if (n === 0) return '<span class="zero">-</span>';
    const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(decimals > 0 ? n : Math.round(n));
    return n < 0 ? `<span class="negative">${formatted}</span>` : formatted;
  };

  const allMonths = columns.flatMap(c => c.months);

  let html = '<table><thead><tr><th>Poste</th>';
  allMonths.forEach(m => { const [y, mo] = m.split('-'); html += `<th data-month="${m}">${mo}/${y}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';

  const monthCell = (months, m) => `<td data-month="${m}">${fmtVal(months?.[m] || 0)}</td>`;
  const totalCell = (months) => {
    const mj = JSON.stringify(months || {}).replace(/"/g, '&quot;');
    const sum = Math.round(allMonths.reduce((s, m) => s + (months?.[m] || 0), 0) * 100) / 100;
    return `<td data-total="1" data-months="${mj}">${fmtVal(sum)}</td>`;
  };

  rows.forEach(row => {
    let rowClass = 'row-line';
    if (row.isTotal) rowClass = 'row-cf-total';
    else if (row.isSubtotal && row.key === 'fluxOperationnel') rowClass = 'row-cf-subtotal-op';
    else if (row.isSubtotal && row.key === 'fluxFinancier') rowClass = 'row-cf-subtotal-fin';
    else if (row.isTreso) rowClass = 'row-cf-treso';
    else if (OPERATIONAL_KEYS.includes(row.key)) rowClass = 'row-cf-op';
    else if (FINANCIAL_KEYS.includes(row.key)) rowClass = 'row-cf-fin';
    else rowClass = 'row-cf-other';

    const expandable = !row.isTotal && !row.isSubtotal && !row.isTreso;
    const hasAccounts = row.accounts && row.accounts.length > 0;

    html += `<tr class="${rowClass}" ${expandable && hasAccounts ? `onclick="toggleGroup('${row.key}')"` : ''}>`;
    html += `<td>${expandable && hasAccounts ? `<span class="chevron open" data-chevron="${row.key}">&#9654;</span>` : ''}${row.label}</td>`;
    allMonths.forEach(m => { html += monthCell(row.months, m); });
    html += totalCell(row.months);
    html += `</tr>`;

    if (hasAccounts) {
      row.accounts.forEach(acc => {
        html += `<tr class="row-account" data-parent="${row.key}">`;
        html += `<td><span class="acc-num">${acc.number}</span><span class="acc-label">${acc.label}</span></td>`;
        allMonths.forEach(m => { html += monthCell(acc.months, m); });
        html += totalCell(acc.months);
        html += `</tr>`;
      });
    }
  });

  html += '</tbody></table>';
  return html;
};

// Export a standalone interactive HTML file with full interactivity
// Embeds raw monthly data as JSON so the HTML can recompute columns dynamically
const exportInteractiveHTML = (title, tableHTML, filename, rawData) => {
  const dataJSON = JSON.stringify(rawData || {}).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - MOON Insight</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b}
    .header{background:#1a223d;color:white;padding:16px 24px}
    .header h1{font-size:18px;font-weight:600}
    .header .subtitle{font-size:12px;color:#ced5ce;margin-top:2px}
    .toolbar{padding:10px 24px;background:white;border-bottom:1px solid #e2e8f0;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .toolbar .sep{width:1px;height:24px;background:#e2e8f0;margin:0 4px}
    .btn{padding:5px 12px;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;background:white;cursor:pointer;color:#64748b}
    .btn:hover{background:#f1f5f9;border-color:#cbd5e1}
    .btn.active{background:#1a223d;color:white;border-color:#1a223d}
    select.filter{padding:4px 8px;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;color:#475569;background:white}
    .container{padding:16px 24px;max-width:100%;overflow-x:auto}
    table{border-collapse:collapse;font-size:13px}
    th{background:#1e293b;color:white;padding:7px 10px;text-align:right;white-space:nowrap;font-size:11px;font-weight:600}
    th:first-child{text-align:left;position:sticky;left:0;z-index:10;min-width:280px}
    td{padding:5px 10px;white-space:nowrap;font-variant-numeric:tabular-nums}
    td:first-child{position:sticky;left:0;z-index:5;background:inherit}
    td:not(:first-child){text-align:right;font-family:'SF Mono',Consolas,monospace;font-size:12px}
    .row-line{border-bottom:1px solid #e2e8f0;background:white;cursor:pointer}
    .row-line:hover{background:#f0f9ff}
    .row-info{background:#f0f9ff;border-top:2px solid #7dd3fc;border-bottom:2px solid #7dd3fc;font-weight:600;color:#0c4a6e;cursor:pointer}
    .row-subtotal{background:#f1f5f9;font-weight:700;color:#1e293b;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}
    .row-pct{background:#fffbeb;font-style:italic;border-bottom:1px solid #fef3c7}
    .row-pct td{color:#92400e;font-size:11px}
    .row-account{background:#fafafa;border-bottom:1px solid #f1f5f9}
    .row-account td:first-child{padding-left:48px;font-size:12px}
    .row-account .acc-num{color:#94a3b8;font-family:monospace;font-size:11px;margin-right:8px}
    .row-account .acc-label{color:#475569}
    .row-cf-op{background:#f0fdf4;border-left:4px solid #4ade80;cursor:pointer}.row-cf-op:hover{background:#dcfce7}
    .row-cf-fin{background:#f0f9ff;border-left:4px solid #38bdf8;cursor:pointer}.row-cf-fin:hover{background:#e0f2fe}
    .row-cf-other{background:#f8fafc;border-left:4px solid #cbd5e1;cursor:pointer}.row-cf-other:hover{background:#f1f5f9}
    .row-cf-subtotal-op{background:#dcfce7;font-weight:600;border-top:1px solid #86efac;border-bottom:1px solid #86efac}
    .row-cf-subtotal-fin{background:#e0f2fe;font-weight:600;border-top:1px solid #7dd3fc;border-bottom:1px solid #7dd3fc}
    .row-cf-total{background:#1e293b;color:white;font-weight:700}
    .row-cf-treso{background:#fffbeb;font-style:italic;border-top:1px solid #fef3c7;border-bottom:1px solid #fef3c7}
    .negative{color:#dc2626}.row-cf-total .negative{color:#fca5a5}
    .zero{color:#d1d5db}
    .chevron{display:inline-block;width:16px;text-align:center;margin-right:4px;color:#94a3b8;transition:transform .2s;font-size:10px}
    .chevron.open{transform:rotate(90deg)}
    .hidden{display:none}
    .footer{padding:12px 24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:16px}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:center;justify-content:center}
    .modal{background:white;border-radius:12px;max-width:900px;width:95%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .modal-header{background:#1a223d;color:white;padding:14px 20px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center}
    .modal-header h2{font-size:15px;font-weight:600}
    .modal-close{background:rgba(255,255,255,.1);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px}
    .modal-body{flex:1;overflow:auto;padding:0}
    .modal-body table{width:100%}
    .modal-body td,.modal-body th{padding:4px 10px;font-size:12px}
    .modal-footer{padding:10px 20px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}
    @media print{.toolbar,.modal-overlay{display:none}.header{print-color-adjust:exact;-webkit-print-color-adjust:exact}td:first-child,th:first-child{position:static}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${title}</h1>
      <div class="subtitle">MOON Insight — Exporte le ${new Date().toLocaleDateString('fr-FR')}</div>
    </div>
  </div>
  <div class="toolbar" id="toolbar">
    <button class="btn" onclick="expandAll()">Tout deplier</button>
    <button class="btn" onclick="collapseAll()">Tout replier</button>
    <button class="btn" id="btnEmpty" onclick="toggleEmpty()">Masquer vides</button>
    <span class="sep"></span>
    <button class="btn active" id="btnM" onclick="setGranularity('M')">Mois</button>
    <button class="btn" id="btnT" onclick="setGranularity('T')">Trim.</button>
    <button class="btn" id="btnS" onclick="setGranularity('S')">Sem.</button>
    <button class="btn" id="btnA" onclick="setGranularity('A')">An</button>
    <button class="btn" id="btnE" onclick="setGranularity('E')">Exo</button>
    <span class="sep"></span>
    <span style="font-size:11px;color:#94a3b8">De :</span>
    <select class="filter" id="selFrom" onchange="applyFilter()"></select>
    <span style="font-size:11px;color:#94a3b8">&rarr;</span>
    <select class="filter" id="selTo" onchange="applyFilter()"></select>
    <span class="sep"></span>
    <button class="btn" onclick="window.print()">Imprimer</button>
  </div>
  <div class="container" id="tableContainer">
    ${tableHTML}
  </div>
  <div class="footer">Genere par MOON Insight</div>
  <script>
    var DATA = ${dataJSON};
    var allMonths = DATA.allMonths || [];
    var exercises = DATA.exercises || [];
    var currentFrom = allMonths[0] || '';
    var currentTo = allMonths[allMonths.length - 1] || '';
    var currentGranularity = 'M';

    // Populate period selects
    var selFrom = document.getElementById('selFrom');
    var selTo = document.getElementById('selTo');
    allMonths.forEach(function(m) {
      var parts = m.split('-');
      var label = parts[1] + '/' + parts[0];
      selFrom.innerHTML += '<option value="' + m + '">' + label + '</option>';
      selTo.innerHTML += '<option value="' + m + '">' + label + '</option>';
    });
    selFrom.value = currentFrom;
    selTo.value = currentTo;

    function fmtHTML(n, isPct) {
      if (n === 0) return '<span class="zero">-</span>';
      var s = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: isPct ? 1 : 0}).format(isPct ? n : Math.round(n));
      if (isPct) s += '%';
      return n < 0 ? '<span class="negative">' + s + '</span>' : s;
    }

    function getVisibleMonths() {
      return allMonths.filter(function(m) { return m >= currentFrom && m <= currentTo; });
    }

    function buildColumns(granularity) {
      var visible = getVisibleMonths();
      if (granularity === 'M') return visible.map(function(m) { return { key: m, label: m.split('-')[1]+'/'+m.split('-')[0], months: [m] }; });

      if (granularity === 'E' && exercises.length > 0) {
        var sorted = exercises.slice().sort(function(a,b) { return (a.period_start||'').localeCompare(b.period_start||''); });
        var groups = {};
        sorted.forEach(function(ex) { groups['exo_'+ex.fiscal_year] = { key: 'exo_'+ex.fiscal_year, label: 'Exo '+ex.fiscal_year, months: [] }; });
        visible.forEach(function(m) {
          for (var i = 0; i < sorted.length; i++) {
            var s = (sorted[i].period_start||'').substring(0,7), e = (sorted[i].period_end||'').substring(0,7);
            if (m >= s && m <= e) { groups['exo_'+sorted[i].fiscal_year].months.push(m); return; }
          }
        });
        return Object.values(groups).filter(function(g) { return g.months.length > 0; });
      }

      var groups = {};
      visible.forEach(function(m) {
        var parts = m.split('-'), y = parts[0], mo = parseInt(parts[1]);
        var key, label;
        if (granularity === 'T') { var q = Math.ceil(mo/3); key = y+'-T'+q; label = 'T'+q+' '+y; }
        else if (granularity === 'S') { var s = mo<=6?1:2; key = y+'-S'+s; label = 'S'+s+' '+y; }
        else { key = y; label = y; }
        if (!groups[key]) groups[key] = { key: key, label: label, months: [] };
        groups[key].months.push(m);
      });
      return Object.values(groups);
    }

    function setGranularity(g) {
      currentGranularity = g;
      ['M','T','S','A','E'].forEach(function(k) {
        var btn = document.getElementById('btn'+k);
        if (btn) btn.className = k === g ? 'btn active' : 'btn';
      });
      applyFilter();
    }

    function applyFilter() {
      currentFrom = selFrom.value;
      currentTo = selTo.value;
      var cols = buildColumns(currentGranularity);

      if (currentGranularity === 'M') {
        // Simple: show/hide individual month columns
        document.querySelectorAll('th[data-month]').forEach(function(th) {
          th.style.display = getVisibleMonths().includes(th.getAttribute('data-month')) ? '' : 'none';
        });
        document.querySelectorAll('td[data-month]').forEach(function(td) {
          td.style.display = getVisibleMonths().includes(td.getAttribute('data-month')) ? '' : 'none';
        });
        // Recalculate totals
        var vm = getVisibleMonths();
        document.querySelectorAll('td[data-total]').forEach(function(td) {
          var months = JSON.parse(td.getAttribute('data-months') || '{}');
          var sum = 0;
          vm.forEach(function(m) { sum += months[m] || 0; });
          sum = Math.round(sum * 100) / 100;
          td.innerHTML = fmtHTML(sum, td.classList.contains('pct-cell'));
        });
      } else {
        // Aggregated: hide all month columns, rebuild header + cells
        document.querySelectorAll('th[data-month]').forEach(function(th) { th.style.display = 'none'; });
        document.querySelectorAll('td[data-month]').forEach(function(td) { td.style.display = 'none'; });

        // Remove previous aggregated columns
        document.querySelectorAll('[data-agg]').forEach(function(el) { el.remove(); });

        // Add aggregated header columns before the Total th
        var headerRow = document.querySelector('thead tr');
        var totalTh = headerRow.querySelector('th:last-child');
        cols.forEach(function(col) {
          var th = document.createElement('th');
          th.setAttribute('data-agg', col.key);
          th.textContent = col.label;
          headerRow.insertBefore(th, totalTh);
        });

        // Add aggregated cells for each data row
        document.querySelectorAll('tbody tr').forEach(function(tr) {
          var totalTd = tr.querySelector('td[data-total]');
          if (!totalTd) return;
          var months = JSON.parse(totalTd.getAttribute('data-months') || '{}');

          cols.forEach(function(col) {
            var sum = 0;
            col.months.forEach(function(m) { sum += months[m] || 0; });
            sum = Math.round(sum * 100) / 100;
            var td = document.createElement('td');
            td.setAttribute('data-agg', col.key);
            td.style.textAlign = 'right';
            td.style.fontFamily = "'SF Mono',Consolas,monospace";
            td.style.fontSize = '12px';
            td.innerHTML = fmtHTML(sum, totalTd.classList.contains('pct-cell'));
            tr.insertBefore(td, totalTd);
          });

          // Recalculate total for visible period
          var vm = getVisibleMonths();
          var totalSum = 0;
          vm.forEach(function(m) { totalSum += months[m] || 0; });
          totalSum = Math.round(totalSum * 100) / 100;
          totalTd.innerHTML = fmtHTML(totalSum, totalTd.classList.contains('pct-cell'));
        });
      }
    }

    function toggleGroup(key) {
      var rows = document.querySelectorAll('[data-parent="' + key + '"]');
      var chevron = document.querySelector('[data-chevron="' + key + '"]');
      var isHidden = rows.length > 0 && rows[0].classList.contains('hidden');
      rows.forEach(function(r) { r.classList.toggle('hidden', !isHidden); });
      if (chevron) chevron.classList.toggle('open', isHidden);
    }
    function expandAll() {
      document.querySelectorAll('.row-account').forEach(function(r) { r.classList.remove('hidden'); });
      document.querySelectorAll('.chevron').forEach(function(c) { c.classList.add('open'); });
    }
    function collapseAll() {
      document.querySelectorAll('.row-account').forEach(function(r) { r.classList.add('hidden'); });
      document.querySelectorAll('.chevron').forEach(function(c) { c.classList.remove('open'); });
    }
    var emptyHidden = false;
    function toggleEmpty() {
      emptyHidden = !emptyHidden;
      document.getElementById('btnEmpty').textContent = emptyHidden ? 'Afficher vides' : 'Masquer vides';
      document.querySelectorAll('[data-empty="true"]').forEach(function(r) { r.style.display = emptyHidden ? 'none' : ''; });
    }
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const rawVal = (n) => (n === null || n === undefined ? '' : n === 0 ? 0 : Math.round(n));

const fmt = (n, decimals = '0') => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  if (decimals === 'k') {
    const k = n / 1000;
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(k);
  }
  const d = decimals === '2' ? 2 : 0;
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(d > 0 ? n : Math.round(n));
};

const fmtMonth = (m) => {
  const [y, mo] = m.split('-');
  return `${mo}/${y}`;
};

const formatMonthLabel = (m) => {
  const [y, mo] = m.split('-');
  return `${mo}/${y}`;
};

// Nettoyer le libelle Pennylane (retirer le suffixe TVA entre parentheses)
const cleanLabel = (label) => {
  return (label || '')
    .replace(/\s*\(TVA\s+\d+[.,]?\d*\s*%?\)\s*$/i, '')
    .replace(/\s*\(Pas de TVA\)\s*$/i, '')
    .replace(/\s*\(Intracom\)\s*$/i, '')
    .replace(/\s*\(Import\/Export\)\s*$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')  // Suffixe numero de compte ex: (6257)
    .replace(/\s*\([\d\s]+\)\s*$/i, '')  // Variantes avec espaces
    .trim()
    .toUpperCase();
};

// Detecter la racine commune d'un compte Pennylane
// Pattern: comptes longs (>=7 chars) qui finissent par un code TVA (0003, 0009, 0008, 0006, 0005, 0001, 0002)
const TVA_SUFFIXES = ['0003', '0009', '0008', '0006', '0005', '0002', '0001'];
const getCompactRoot = (num) => {
  if (num.length < 7) return null;
  for (const suffix of TVA_SUFFIXES) {
    if (num.endsWith(suffix) && num.length >= suffix.length + 3) {
      return num.substring(0, num.length - suffix.length);
    }
  }
  return null;
};

// Regrouper les comptes Pennylane par racine + compacter, puis normaliser
// Padding + majuscules + fusion des collisions (ex: 6063 et 6063000 -> meme padded)
const normalizeAccounts = (accountMonthly) => {
  if (!accountMonthly) return {};
  const round2 = (n) => Math.round(n * 100) / 100;
  const keys = Object.keys(accountMonthly);
  const maxLen = Math.max(...keys.map(k => k.length), 6);
  const normalized = {};
  for (const [num, acc] of Object.entries(accountMonthly)) {
    const paddedNum = num.padEnd(maxLen, '0');
    if (normalized[paddedNum]) {
      // Collision : fusionner les montants
      const existing = normalized[paddedNum];
      for (const [m, val] of Object.entries(acc.months || {})) {
        existing.months[m] = round2((existing.months[m] || 0) + val);
      }
      existing.total = round2(existing.total + (acc.total || 0));
      // Garder le numero original le plus court
      if (num.length < existing.originalNumber.length) existing.originalNumber = num;
    } else {
      normalized[paddedNum] = {
        ...acc,
        months: { ...(acc.months || {}) },
        originalNumber: num,
        label: (acc.label || '').toUpperCase(),
      };
    }
  }
  return normalized;
};

// SIG (Soldes Intermediaires de Gestion) — mapping PCG complet
// roots = prefixes de comptes (match via startsWith)
// sign: +1 = produit (credit-debit deja positif), -1 = charge (debit-credit deja positif, on soustrait)
const SIG_STRUCTURE = [
  // --- Ligne CA informative (tous les 70) ---
  { key: 'ca', label: "CHIFFRE D'AFFAIRES", roots: ['70'], sign: 1, type: 'info' },

  // --- Marge commerciale ---
  { key: 'ventes_mch', label: 'Ventes de marchandises', roots: ['707','7097'], sign: 1, type: 'line' },
  { key: 'cout_mch', label: "Cout d'achat des marchandises vendues", roots: ['607','6037','6097'], sign: -1, type: 'line' },
  { key: 'marge_co', label: 'MARGE COMMERCIALE', type: 'subtotal', formula: 'ventes_mch - cout_mch' },
  { key: 'marge_co_pct', label: '% Marge commerciale / CA', type: 'pct', ref: 'marge_co', base: 'ca' },

  // --- Production de l'exercice ---
  { key: 'prod_vendue', label: 'Production vendue', roots: ['700','701','702','703','704','705','706','708','7090','7091','7092','7093','7094','7095','7096','7098','7099'], sign: 1, type: 'line' },
  { key: 'prod_stockee', label: 'Production stockee / Destockage', roots: ['71'], sign: 1, type: 'line' },
  { key: 'prod_immo', label: 'Production immobilisee', roots: ['72'], sign: 1, type: 'line' },
  { key: 'production', label: 'PRODUCTION DE L\'EXERCICE', type: 'subtotal', sumOf: ['prod_vendue', 'prod_stockee', 'prod_immo'] },

  // --- Marge globale ---
  { key: 'autres_conso', label: 'Autres consommations', roots: ['600','601','602','604','605','606','608','6030','6031','6032','6033','6034','6035','6036','6038','6039','6090','6091','6092','6093','6094','6095','6096','6098','6099'], sign: -1, type: 'line' },
  { key: 'marge', label: 'MARGE GLOBALE', type: 'subtotal', formula: 'marge_co + prod_vendue + prod_stockee + prod_immo - autres_conso' },
  { key: 'marge_pct', label: '% Marge globale / CA', type: 'pct', ref: 'marge', base: 'ca' },

  // --- Valeur ajoutee ---
  { key: 'conso_tiers', label: "Autres consommations en provenance des tiers", roots: ['61','62'], sign: -1, type: 'line' },
  { key: 'subventions', label: "Subventions d'exploitation", roots: ['74'], sign: 1, type: 'line' },
  { key: 'va', label: 'VALEUR AJOUTEE', type: 'subtotal', formula: 'marge - conso_tiers + subventions' },
  { key: 'va_pct', label: '% Valeur ajoutee / CA', type: 'pct', ref: 'va', base: 'ca' },

  // --- EBE / EBITDA ---
  { key: 'impots', label: 'Impots, taxes et versements assimiles', roots: ['63'], sign: -1, type: 'line' },
  { key: 'personnel', label: 'Charges de personnel', roots: ['64'], sign: -1, type: 'line' },
  { key: 'ebitda', label: 'EBE / EBITDA', type: 'subtotal', formula: 'va - impots - personnel' },
  { key: 'ebitda_pct', label: '% EBE / CA', type: 'pct', ref: 'ebitda', base: 'ca' },

  // --- Resultat d'exploitation ---
  { key: 'reprises_expl', label: 'Reprises sur amort., deprec. et provisions', roots: ['781'], sign: 1, type: 'line' },
  { key: 'dotations_expl', label: 'Dotations aux amort., deprec. et provisions', roots: ['681'], sign: -1, type: 'line' },
  { key: 'subv_invest', label: 'Quote-part subventions investissement', roots: ['747'], sign: 1, type: 'line' },
  { key: 'cession_immo', label: "Produits des cessions d'immobilisations", roots: ['757'], sign: 1, type: 'line' },
  { key: 'vc_immo', label: "Valeurs comptables des immobilisations cedees", roots: ['657'], sign: -1, type: 'line' },
  { key: 'autres_prod', label: 'Autres produits', roots: ['751','752','753','754','756','758','759'], sign: 1, type: 'line' },
  { key: 'autres_charges', label: 'Autres charges', roots: ['651','652','653','654','656','658','659'], sign: -1, type: 'line' },
  { key: 'qp_commun_p', label: 'Quote-part resultat operations en commun (+)', roots: ['755'], sign: 1, type: 'line' },
  { key: 'qp_commun_c', label: 'Quote-part resultat operations en commun (-)', roots: ['655'], sign: -1, type: 'line' },
  { key: 'rex', label: "RESULTAT D'EXPLOITATION", type: 'subtotal', formula: 'ebitda + reprises_expl - dotations_expl + subv_invest + cession_immo - vc_immo + autres_prod - autres_charges + qp_commun_p - qp_commun_c' },
  { key: 'rex_pct', label: "% REX / CA", type: 'pct', ref: 'rex', base: 'ca' },

  // --- Resultat financier ---
  { key: 'produits_fin', label: 'Produits financiers', roots: ['76','786'], sign: 1, type: 'line' },
  { key: 'charges_fin', label: 'Charges financieres', roots: ['66','686'], sign: -1, type: 'line' },
  { key: 'rcourant', label: 'RESULTAT COURANT AVANT IMPOTS', type: 'subtotal', formula: 'rex + produits_fin - charges_fin' },

  // --- Resultat exceptionnel ---
  { key: 'produits_except', label: 'Produits exceptionnels', roots: ['77','787'], sign: 1, type: 'line' },
  { key: 'charges_except', label: 'Charges exceptionnelles', roots: ['67','687'], sign: -1, type: 'line' },

  // --- Resultat net ---
  { key: 'participation', label: 'Participation des salaries', roots: ['691'], sign: -1, type: 'line' },
  { key: 'impots_benefices', label: 'Impots sur les benefices', roots: ['690','692','693','694','695','696','697','698','699'], sign: -1, type: 'line' },
  { key: 'rnet', label: 'RESULTAT NET', type: 'subtotal', formula: 'rcourant + produits_except - charges_except - participation - impots_benefices' },
  { key: 'rnet_pct', label: '% Resultat net / CA', type: 'pct', ref: 'rnet', base: 'ca' },
];

function buildCategoryData(accounts, categories, months) {
  return categories.map((cat) => {
    const catAccounts = Object.entries(accounts)
      .filter(([, acc]) => cat.prefixes.includes(acc.prefix2))
      .sort((a, b) => a[0].localeCompare(b[0]));
    const monthTotals = {};
    months.forEach((m) => {
      monthTotals[m] = catAccounts.reduce((sum, [, acc]) => sum + (acc.months[m] || 0), 0);
    });
    const total = Object.values(monthTotals).reduce((s, v) => s + v, 0);
    return {
      ...cat,
      accounts: catAccounts.map(([num, acc]) => ({
        number: num,
        ...acc,
        total: months.reduce((s, m) => s + (acc.months[m] || 0), 0),
      })),
      months: monthTotals,
      total,
    };
  });
}

function computeSectionTotals(categoryData, months) {
  const monthTotals = {};
  months.forEach((m) => {
    monthTotals[m] = categoryData.reduce((sum, cat) => sum + (cat.months[m] || 0), 0);
  });
  const total = Object.values(monthTotals).reduce((s, v) => s + v, 0);
  return { months: monthTotals, total };
}

// SVG Icons
const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);

const exportBtnClass = "flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition shadow-sm";

// Amount cell component
function AmountCell({ value, decimals = 0, className = '' }) {
  const isNegative = value < 0;
  const isZero = value === 0;
  const display = fmt(value, decimals);
  return (
    <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] ${isNegative ? 'text-red-600' : ''} ${isZero ? 'text-gray-300' : ''} ${className}`}>
      {display}
    </td>
  );
}

// Category row (expandable)
function CategoryRow({ cat, months, expanded, onToggle, onClickMonth, onClickTotal, decimals = 0, catIndex = 0 }) {
  return (
    <tr className="bg-slate-50 border-l-4 border-l-sky-500 cursor-pointer hover:bg-slate-100/60 transition" onClick={onToggle}>
      <td className="py-1.5 px-3 font-semibold text-slate-800 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
        <span className={`inline-block w-5 text-center mr-1 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
          {cat.accounts.length > 0 ? '\u25B6' : ''}
        </span>
        {cat.label}
      </td>
      {months.map((m) => (
        <td key={m} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-slate-50 cursor-pointer hover:bg-sky-100/50 transition ${(cat.months[m] || 0) < 0 ? 'text-red-600' : (cat.months[m] || 0) === 0 ? 'text-gray-300' : ''}`}
          onClick={(e) => { e.stopPropagation(); onClickMonth && onClickMonth(m); }}
        >
          {fmt(cat.months[m], decimals)}
        </td>
      ))}
      <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-slate-50 cursor-pointer hover:bg-sky-100/50 transition ${(cat.total || 0) < 0 ? 'text-red-600' : (cat.total || 0) === 0 ? 'text-gray-300' : ''}`}
        onClick={(e) => { e.stopPropagation(); onClickTotal && onClickTotal(); }}
      >
        {fmt(cat.total, decimals)}
      </td>
    </tr>
  );
}

// Account row
function AccountRow({ account, months, onClickAccount, onClickCell, decimals = 0 }) {
  return (
    <tr className="bg-white hover:bg-sky-50/30 transition border-b border-slate-100">
      <td className="py-1.5 px-3 pl-12 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer" onClick={onClickAccount}>
        <span className="font-mono text-xs text-gray-400 mr-2">{account.number}</span>
        <span className="text-sm">{account.label}</span>
      </td>
      {months.map((m) => (
        <td
          key={m}
          className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-blue-100/50 transition ${(account.months[m] || 0) < 0 ? 'text-red-600' : ''} ${(account.months[m] || 0) === 0 ? 'text-gray-300' : ''}`}
          onClick={() => onClickCell(m)}
        >
          {fmt(account.months[m] || 0, decimals)}
        </td>
      ))}
      <td
        className="py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-blue-100/50 transition"
        onClick={onClickAccount}
      >
        {fmt(account.total, decimals)}
      </td>
    </tr>
  );
}

// Subtotal row
function SubtotalRow({ label, totals, months, decimals = 0, onClickMonth, onClickTotal }) {
  return (
    <tr className="bg-slate-200/70 font-bold text-slate-800 border-y border-slate-300">
      <td className="py-1.5 px-3 font-bold text-slate-800 sticky left-0 z-10 bg-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
        {label}
      </td>
      {months.map((m) => (
        <td key={m} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-bold bg-slate-200/70 ${(totals.months[m] || 0) < 0 ? 'text-red-600' : (totals.months[m] || 0) === 0 ? 'text-gray-300' : ''} ${onClickMonth ? 'cursor-pointer hover:bg-slate-300/50 transition' : ''}`}
          onClick={() => onClickMonth && onClickMonth(m)}
        >
          {fmt(totals.months[m], decimals)}
        </td>
      ))}
      <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-bold bg-slate-200/70 ${(totals.total || 0) < 0 ? 'text-red-600' : (totals.total || 0) === 0 ? 'text-gray-300' : ''} ${onClickTotal ? 'cursor-pointer hover:bg-slate-300/50 transition' : ''}`}
        onClick={() => onClickTotal && onClickTotal()}
      >
        {fmt(totals.total, decimals)}
      </td>
    </tr>
  );
}

// Custom tree node renderer for template-based P&L
function renderCustomTreeNodes(node, months, decimals, accountMonthly, expanded, toggle, setModal, clientId, balanceId, depth = 0) {
  const elements = [];

  if (node.type === 'category') {
    // Compute category totals from all child groups
    const allAccounts = [];
    (node.children || []).forEach((g) => {
      (g.accounts || []).forEach((num) => {
        const acc = Object.entries(accountMonthly).find(([k]) => k === num || k.startsWith(num));
        if (acc) allAccounts.push(acc);
      });
    });
    const monthTotals = {};
    months.forEach((m) => {
      monthTotals[m] = allAccounts.reduce((sum, [, a]) => sum + (a.months?.[m] || 0), 0);
    });
    const total = Object.values(monthTotals).reduce((s, v) => s + v, 0);
    const key = `custom_${node.id}`;
    const isExpanded = expanded[key];

    // Build comma-separated account numbers for this category
    const catAccountNumbers = allAccounts.map(([, a]) => a.originalNumber || a.number || '').filter(Boolean).join(',');

    elements.push(
      <tr key={key} className="bg-slate-50 border-l-4 border-l-sky-500 cursor-pointer hover:bg-slate-100/60 transition" onClick={() => toggle(key)}>
        <td className="py-1.5 px-3 font-semibold text-slate-800 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <span className={`inline-block w-5 text-center mr-1 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
            {(node.children || []).length > 0 ? '\u25B6' : ''}
          </span>
          {node.label}
        </td>
        {months.map((m) => (
          <td key={m} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-slate-50 cursor-pointer hover:bg-sky-100/50 transition ${monthTotals[m] < 0 ? 'text-red-600' : monthTotals[m] === 0 ? 'text-gray-300' : ''}`}
            onClick={(e) => { e.stopPropagation(); if (catAccountNumbers) setModal({ number: catAccountNumbers, label: node.label, from: m, to: m }); }}
          >
            {fmt(monthTotals[m], decimals)}
          </td>
        ))}
        <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-slate-50 cursor-pointer hover:bg-sky-100/50 transition ${total < 0 ? 'text-red-600' : total === 0 ? 'text-gray-300' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (catAccountNumbers) setModal({ number: catAccountNumbers, label: node.label }); }}
        >
          {fmt(total, decimals)}
        </td>
      </tr>
    );

    if (isExpanded) {
      (node.children || []).forEach((child) => {
        elements.push(...renderCustomTreeNodes(child, months, decimals, accountMonthly, expanded, toggle, setModal, clientId, balanceId, depth + 1));
      });
    }
  } else if (node.type === 'group') {
    const groupAccounts = (node.accounts || []).map((num) => {
      const entry = Object.entries(accountMonthly).find(([k]) => k === num || k.startsWith(num));
      return entry ? { number: entry[0], ...entry[1] } : null;
    }).filter(Boolean);

    const monthTotals = {};
    months.forEach((m) => {
      monthTotals[m] = groupAccounts.reduce((sum, a) => sum + (a.months?.[m] || 0), 0);
    });
    const total = Object.values(monthTotals).reduce((s, v) => s + v, 0);
    const key = `custom_${node.id}`;
    const isExpanded = expanded[key];
    const groupAccountNumbers = groupAccounts.map(a => a.originalNumber || a.number).filter(Boolean).join(',');

    elements.push(
      <tr key={key} className="bg-slate-50/80 border-l-4 border-slate-300 cursor-pointer hover:bg-slate-100/60 transition" onClick={() => toggle(key)}>
        <td className="py-1.5 px-3 font-medium text-slate-700 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <span className={`inline-block w-5 text-center mr-1 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
            {groupAccounts.length > 0 ? '\u25B6' : ''}
          </span>
          {node.label}
        </td>
        {months.map((m) => (
          <td key={m} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-100/50 transition ${monthTotals[m] < 0 ? 'text-red-600' : monthTotals[m] === 0 ? 'text-gray-300' : ''}`}
            onClick={(e) => { e.stopPropagation(); if (groupAccountNumbers) setModal({ number: groupAccountNumbers, label: node.label, from: m, to: m }); }}
          >
            {fmt(monthTotals[m], decimals)}
          </td>
        ))}
        <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-100/50 transition ${total < 0 ? 'text-red-600' : total === 0 ? 'text-gray-300' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (groupAccountNumbers) setModal({ number: groupAccountNumbers, label: node.label }); }}
        >
          {fmt(total, decimals)}
        </td>
      </tr>
    );

    if (isExpanded) {
      groupAccounts.forEach((acc) => {
        const accTotal = months.reduce((s, m) => s + (acc.months?.[m] || 0), 0);
        elements.push(
          <tr key={`${key}_${acc.number}`} className="bg-white hover:bg-sky-50/30 transition border-b border-slate-100">
            <td className="py-1.5 px-3 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer" style={{ paddingLeft: `${28 + depth * 16}px` }}
              onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label })}
            >
              <span className="font-mono text-xs text-gray-400 mr-2">{acc.number}</span>
              <span className="text-sm">{acc.label}</span>
            </td>
            {months.map((m) => {
              const val = acc.months?.[m] || 0;
              return (
                <td key={m} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-blue-100/50 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                  onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label, from: m, to: m })}
                >
                  {fmt(val, decimals)}
                </td>
              );
            })}
            <td className="py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-blue-100/50 transition"
              onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label })}
            >
              {fmt(accTotal, decimals)}
            </td>
          </tr>
        );
      });
    }
  } else if (node.type === 'subtotal') {
    // Compute subtotal by summing the categories referenced in sumOf
    const sumOfIds = node.sumOf || [];
    // Find all accounts in the referenced categories
    const referencedAccounts = [];
    const findAccounts = (nodes) => {
      nodes.forEach((n) => {
        if (n.type === 'category' && sumOfIds.includes(n.id)) {
          (n.children || []).forEach((g) => {
            (g.accounts || []).forEach((num) => {
              const entry = Object.entries(accountMonthly).find(([k]) => k === num || k.startsWith(num));
              if (entry) referencedAccounts.push(entry);
            });
          });
        }
      });
    };
    // We need tree context - pass via node._treeRef
    if (node._treeNodes) findAccounts(node._treeNodes);

    const monthTotals = {};
    months.forEach((m) => {
      monthTotals[m] = referencedAccounts.reduce((sum, [, a]) => sum + (a.months?.[m] || 0), 0);
    });
    const total = Object.values(monthTotals).reduce((s, v) => s + v, 0);

    // Build comma-separated account numbers for subtotal click
    const subtotalAccountNumbers = referencedAccounts.map(([k, a]) => a.originalNumber || k).filter(Boolean).join(',');

    elements.push(
      <tr key={`custom_${node.id}`} className="bg-slate-200/70 font-bold text-slate-800 border-y border-slate-300">
        <td className="py-1.5 px-3 font-bold text-slate-800 sticky left-0 z-10 bg-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
          {node.label}
        </td>
        {months.map((m) => (
          <td key={m} className={`py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap min-w-[90px] font-bold bg-slate-200/70 cursor-pointer hover:bg-slate-300/50 transition ${monthTotals[m] < 0 ? 'text-red-600' : monthTotals[m] === 0 ? 'text-gray-300' : ''}`}
            onClick={() => { if (subtotalAccountNumbers) setModal({ number: subtotalAccountNumbers, label: node.label, from: m, to: m }); }}
          >
            {fmt(monthTotals[m], decimals)}
          </td>
        ))}
        <td className={`py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap min-w-[90px] font-bold bg-slate-200/70 cursor-pointer hover:bg-slate-300/50 transition ${total < 0 ? 'text-red-600' : total === 0 ? 'text-gray-300' : ''}`}
          onClick={() => { if (subtotalAccountNumbers) setModal({ number: subtotalAccountNumbers, label: node.label }); }}
        >
          {fmt(total, decimals)}
        </td>
      </tr>
    );
  }

  return elements;
}

// P&L Tab
function PLTab({ monthly, months, columns, aggregateValues, balanceId, clientId, decimals = 0, customTree = null, exercises = [], cachedLines = null }) {
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const accountMonthly = normalizeAccounts(monthly.accountMonthly || {});

  // DEBUG: log months received
  console.log('[PLTab] months received:', months.length, months[0], '->', months[months.length-1]);

  // Build SIG data: for each line, find matching accounts; for each subtotal, compute from formula
  const sigData = useMemo(() => {
    const nodeValues = {}; // key → { months: {}, total, accounts: [] }
    const round2 = (n) => Math.round(n * 100) / 100;

    return SIG_STRUCTURE.map((item) => {
      if (item.type === 'info' || item.type === 'line') {
        // Find matching accounts via roots (startsWith match)
        const catAccounts = Object.entries(accountMonthly)
          .filter(([num]) => {
            const originalNum = accountMonthly[num]?.originalNumber || num;
            return item.roots.some(root => originalNum.startsWith(root) || num.startsWith(root));
          })
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([num, acc]) => ({ number: num, originalNumber: acc.originalNumber || num, label: acc.label, months: acc.months, total: acc.total }));

        const monthTotals = {};
        months.forEach(m => {
          monthTotals[m] = round2(catAccounts.reduce((s, a) => s + (a.months[m] || 0), 0));
        });
        // Total = somme sur les mois filtres (pas a.total qui couvre tous les exercices)
        const total = round2(Object.values(monthTotals).reduce((s, v) => s + v, 0));

        nodeValues[item.key] = { months: monthTotals, total };
        return { ...item, accounts: catAccounts, months: monthTotals, total };
      }

      if (item.type === 'subtotal') {
        const subMonths = {};
        months.forEach(m => { subMonths[m] = 0; });
        let subTotal = 0;

        if (item.sumOf) {
          months.forEach(m => {
            subMonths[m] = round2(item.sumOf.reduce((s, ref) => s + (nodeValues[ref]?.months[m] || 0), 0));
          });
          subTotal = round2(item.sumOf.reduce((s, ref) => s + (nodeValues[ref]?.total || 0), 0));
        } else if (item.formula) {
          const tokens = item.formula.split(/\s+/);
          let op = '+';
          for (const token of tokens) {
            if (token === '+' || token === '-') { op = token; continue; }
            const ref = nodeValues[token];
            if (!ref) continue;
            const sign = op === '+' ? 1 : -1;
            months.forEach(m => { subMonths[m] = round2(subMonths[m] + sign * (ref.months[m] || 0)); });
            subTotal = round2(subTotal + sign * ref.total);
          }
        }

        nodeValues[item.key] = { months: subMonths, total: subTotal };
        return { ...item, months: subMonths, total: subTotal, accounts: [] };
      }

      if (item.type === 'pct') {
        const refNode = nodeValues[item.ref];
        const baseNode = nodeValues[item.base];
        const pctMonths = {};
        months.forEach(m => {
          const baseVal = baseNode?.months[m] || 0;
          pctMonths[m] = baseVal !== 0 ? round2((refNode?.months[m] || 0) / baseVal * 100) : 0;
        });
        const baseTotal = baseNode?.total || 0;
        const pctTotal = baseTotal !== 0 ? round2((refNode?.total || 0) / baseTotal * 100) : 0;
        return { ...item, months: pctMonths, total: pctTotal };
      }
      return item;
    });
  }, [accountMonthly, months]);

  // DEBUG
  const rnetItem = sigData.find(s => s.key === 'rnet');
  if (rnetItem) console.log('[PLTab] RNET total:', rnetItem.total, 'months keys:', Object.keys(rnetItem.months).length);
  const caItem = sigData.find(s => s.key === 'ca');
  const prodItem = sigData.find(s => s.key === 'prod_vendue');
  const consoItem = sigData.find(s => s.key === 'autres_conso');
  const margeItem = sigData.find(s => s.key === 'marge');
  const ebitdaItem = sigData.find(s => s.key === 'ebitda');
  const isItem = sigData.find(s => s.key === 'impots_benefices');
  console.log('[PLTab] CA:', caItem?.total, 'ProdVendue:', prodItem?.total, 'Conso:', consoItem?.total, 'Marge:', margeItem?.total, 'EBITDA:', ebitdaItem?.total, 'IS:', isItem?.total);

  // Check: sum all P&L accounts on filtered months
  let dbgP = 0, dbgC = 0;
  const missingC = [];
  for (const [num, acc] of Object.entries(accountMonthly)) {
    if (num.charAt(0) !== '6' && num.charAt(0) !== '7') continue;
    let t = 0;
    months.forEach(m => { t += (acc.months[m] || 0); });
    if (num.charAt(0) === '7') dbgP += t; else dbgC += t;
  }
  console.log('[PLTab] Brut P:', Math.round(dbgP*100)/100, 'C:', Math.round(dbgC*100)/100, 'R:', Math.round((dbgP-dbgC)*100)/100);
  console.log('[PLTab] Nb comptes accountMonthly:', Object.keys(accountMonthly).length);
  // Lister les comptes 6 avec leur total sur les mois filtres
  const chargesList = [];
  for (const [num, acc] of Object.entries(accountMonthly)) {
    if (num.charAt(0) !== '6') continue;
    let t = 0;
    months.forEach(m => { t += (acc.months[m] || 0); });
    chargesList.push(num + '=' + Math.round(t*100)/100);
  }
  console.log('[PLTab] Charges:', chargesList.join(', '));

  // Check BEFORE normalize
  let rawP = 0, rawC = 0;
  for (const [num, acc] of Object.entries(monthly.accountMonthly || {})) {
    if (num.charAt(0) !== '6' && num.charAt(0) !== '7') continue;
    let t = 0;
    months.forEach(m => { t += (acc.months?.[m] || 0); });
    if (num.charAt(0) === '7') rawP += t; else rawC += t;
  }
  console.log('[PLTab] AVANT normalize: P:', Math.round(rawP*100)/100, 'C:', Math.round(rawC*100)/100, 'R:', Math.round((rawP-rawC)*100)/100);

  const buildPLExportData = () => {
    const headers = ['Poste', ...months.map(fmtMonth), 'Total'];
    const rows = [];
    sigData.forEach(item => {
      rows.push([item.label, ...months.map(m => rawVal(item.months?.[m])), rawVal(item.total)]);
      if (item.accounts?.length > 0) {
        item.accounts.forEach(acc => {
          rows.push([`  ${acc.number} ${acc.label}`, ...months.map(m => rawVal(acc.months[m] || 0)), rawVal(acc.total)]);
        });
      }
    });
    return { headers, rows };
  };

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Helper to get comma-separated account numbers for a line item
  const getLineAccounts = (item) => (item.accounts || []).map(a => a.originalNumber || a.number).join(',');

  // Helper to get all accounts for a subtotal (recursively collect from referenced lines)
  const getSubtotalAccounts = (item) => {
    const collectAccounts = (key) => {
      const line = sigData.find(s => s.key === key);
      if (!line) return [];
      if (line.type === 'line') return (line.accounts || []).map(a => a.originalNumber || a.number);
      if (line.type === 'subtotal') {
        const refs = line.sumOf || (line.formula ? line.formula.split(/\s+/).filter(t => t !== '+' && t !== '-') : []);
        return refs.flatMap(ref => collectAccounts(ref));
      }
      return [];
    };

    const refs = item.sumOf || (item.formula ? item.formula.split(/\s+/).filter(t => t !== '+' && t !== '-') : []);
    return [...new Set(refs.flatMap(ref => collectAccounts(ref)))].join(',');
  };

  const expandAll = () => {
    const allKeys = {};
    sigData.forEach(item => {
      if (item.type === 'line' && item.accounts?.length > 0) {
        allKeys[`sig_${item.key}`] = true;
      }
    });
    setExpanded(allKeys);
  };

  const collapseAll = () => setExpanded({});

  // Coherence check: find P&L accounts not matched by any SIG line
  const unmatchedAccounts = useMemo(() => {
    const matchedNums = new Set();
    sigData.forEach(item => {
      if (item.type === 'line') {
        (item.accounts || []).forEach(a => matchedNums.add(a.number));
      }
    });
    return Object.keys(accountMonthly).filter(n => !matchedNums.has(n));
  }, [accountMonthly, sigData]);

  const renderSection = (categories, sectionKey) =>
    categories.map((cat, catIdx) => {
      const key = `${sectionKey}_${cat.key}`;
      const isExpanded = expanded[key];
      const catAccounts = getCategoryAccounts(cat);
      return [
        <CategoryRow
          key={key}
          cat={cat}
          months={months}
          expanded={isExpanded}
          onToggle={() => toggle(key)}
          decimals={decimals}
          catIndex={catIdx}
          onClickMonth={(m) => { if (catAccounts) setModal({ number: catAccounts, label: cat.label, from: m, to: m }); }}
          onClickTotal={() => { if (catAccounts) setModal({ number: catAccounts, label: cat.label }); }}
        />,
        ...(isExpanded
          ? cat.accounts.map((acc) => (
              <AccountRow
                key={acc.number}
                account={acc}
                months={months}
                decimals={decimals}
                onClickAccount={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label })}
                onClickCell={(month) => setModal({ number: acc.originalNumber || acc.number, label: acc.label, from: month, to: month })}
              />
            ))
          : []),
      ];
    }).flat();

  return (
    <>
      {/* Coherence check banner for custom template */}
      {customTree && customTree.unassigned && customTree.unassigned.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">{customTree.unassigned.length} compte(s) non affecte(s)</p>
            <p className="text-xs text-amber-600">{customTree.unassigned.map(a => typeof a === 'object' ? a.number : a).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Coherence check banner for PCG standard */}
      {!customTree && unmatchedAccounts.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">{unmatchedAccounts.length} compte(s) non affecte(s)</p>
            <p className="text-xs text-amber-600">{unmatchedAccounts.join(', ')}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { const d = buildPLExportData(); copyToClipboard(d.headers, d.rows).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }} className={exportBtnClass}>
            {copied ? <><CheckIcon /> Copie</> : <><CopyIcon /> Copier</>}
          </button>
          <button onClick={() => { const d = buildPLExportData(); downloadCSV(d.headers, d.rows, 'pl_mensuel.csv'); }} className={exportBtnClass}>
            <DownloadIcon /> CSV
          </button>
          <button onClick={() => { const tbl = buildPLTableHTML(sigData, columns || [], decimals, aggregateValues); exportInteractiveHTML('Compte de Resultat (SIG)', tbl, 'pl_sig.html', { allMonths: months, exercises }); }} className={exportBtnClass}>
            <DownloadIcon /> HTML
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmpty(!showEmpty)} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1">
            {showEmpty ? 'Masquer lignes vides' : 'Afficher lignes vides'}
          </button>
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            Tout deplier
          </button>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            Tout replier
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white text-xs">
              <th className="py-2 px-3 text-left font-semibold sticky left-0 bg-slate-800 z-20 min-w-[280px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                Poste
              </th>
              {(columns || []).map((col) => (
                <th key={col.key} className="py-2 px-3 text-right font-semibold whitespace-nowrap min-w-[90px]">
                  {col.label}
                </th>
              ))}
              <th className="py-2 px-3 text-right font-bold whitespace-nowrap min-w-[110px] bg-slate-900">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {(customTree ? customTree.tree : sigData).map((item) => {
              const cols = columns || [];
              const itemMonths = item.months || {};
              const aggItem = aggregateValues ? aggregateValues(itemMonths) : itemMonths;
              const itemTotal = cols.reduce((s, c) => s + (aggItem?.[c.key] || 0), 0);

              // Hide empty line items (but always show subtotals and pct)
              if (!showEmpty && (item.type === 'line' || item.type === 'group')) {
                const isEmpty = cols.every(c => (aggItem?.[c.key] || 0) === 0);
                if (isEmpty) return null;
              }

              // Group row (custom template) — same as line but accounts are already objects
              if (item.type === 'group' && customTree) {
                const key = `sig_${item.id || item.key}`;
                const isExpanded = expanded[key];
                const accs = item.accounts || [];
                const hasAccounts = accs.length > 0;
                const accountNumbers = accs.map(a => a.number).join(',');
                const visibleAccounts = hasAccounts ? accs.filter(acc => {
                  if (showEmpty) return true;
                  const aggAcc = aggregateValues ? aggregateValues(acc.months || {}) : (acc.months || {});
                  return cols.some(c => (aggAcc?.[c.key] || 0) !== 0);
                }) : [];

                return [
                  <tr key={key} className={`border-b border-slate-100 ${hasAccounts ? 'cursor-pointer hover:bg-slate-50 transition' : ''}`}
                    onClick={() => hasAccounts && toggle(key)}>
                    <td className="py-1.5 px-3 sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
                      {hasAccounts && <span className={`inline-block w-5 text-center mr-1 text-gray-400 transition-transform duration-200 text-xs ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>}
                      {!hasAccounts && <span className="inline-block w-5 mr-1" />}
                      <span className="text-sm text-slate-700">{item.label}</span>
                    </td>
                    {cols.map(col => {
                      const val = aggItem?.[col.key] || 0;
                      const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                      return (
                        <td key={col.key} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-50/50 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                          onClick={(e) => { e.stopPropagation(); if (accountNumbers) setModal({ number: accountNumbers, label: item.label, ...fromTo }); }}>
                          {fmt(val, decimals)}
                        </td>
                      );
                    })}
                    <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-50/50 transition ${itemTotal < 0 ? 'text-red-600' : itemTotal === 0 ? 'text-gray-300' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (accountNumbers) setModal({ number: accountNumbers, label: item.label }); }}>
                      {fmt(itemTotal, decimals)}
                    </td>
                  </tr>,
                  ...(isExpanded ? visibleAccounts.map(acc => {
                    const aggAcc = aggregateValues ? aggregateValues(acc.months || {}) : (acc.months || {});
                    const accTotal = cols.reduce((s, c) => s + (aggAcc?.[c.key] || 0), 0);
                    return (
                      <tr key={`${key}_${acc.number}`} className="bg-slate-50/50 hover:bg-sky-50/30 transition border-b border-slate-100">
                        <td className="py-1 px-3 pl-12 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer"
                          onClick={() => setModal({ number: acc.number, label: acc.label })}>
                          <span className="font-mono text-xs text-gray-400 mr-2">{acc.number}</span>
                          <span className="text-xs text-gray-600">{acc.label}</span>
                        </td>
                        {cols.map(col => {
                          const val = aggAcc?.[col.key] || 0;
                          const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                          return (
                            <td key={col.key} className={`py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-100/50 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                              onClick={() => setModal({ number: acc.number, label: acc.label, ...fromTo })}>
                              {fmt(val, decimals)}
                            </td>
                          );
                        })}
                        <td className="py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px]">{fmt(accTotal, decimals)}</td>
                      </tr>
                    );
                  }) : []),
                ];
              }

              // Info row (CA informative en tete) — expandable avec detail des comptes
              if (item.type === 'info') {
                const lineAccounts = getLineAccounts(item);
                const key = `sig_${item.key}`;
                const isExpanded = expanded[key];
                const hasAccounts = item.accounts && item.accounts.length > 0;
                const visibleAccounts = hasAccounts ? item.accounts.filter(acc => {
                  if (showEmpty) return true;
                  const aggAcc = aggregateValues ? aggregateValues(acc.months) : acc.months;
                  return (columns || []).some(c => (aggAcc?.[c.key] || 0) !== 0);
                }) : [];

                return [
                  <tr key={key} className="bg-sky-50 border-y border-sky-200 cursor-pointer hover:bg-sky-100/50 transition" onClick={() => hasAccounts && toggle(key)}>
                    <td className="py-2 px-3 font-semibold text-sky-900 sticky left-0 z-10 bg-sky-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
                      {hasAccounts && (
                        <span className={`inline-block w-5 text-center mr-1 text-sky-400 transition-transform duration-200 text-xs ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
                      )}
                      {item.label}
                    </td>
                    {cols.map((col) => {
                      const val = aggItem?.[col.key] || 0;
                      const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                      return (
                        <td key={col.key} className={`py-2 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-sky-50 cursor-pointer hover:bg-sky-100 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : 'text-sky-900'}`}
                          onClick={(e) => { e.stopPropagation(); if (lineAccounts) setModal({ number: lineAccounts, label: item.label, ...fromTo }); }}
                        >
                          {fmt(val, decimals)}
                        </td>
                      );
                    })}
                    <td className={`py-2 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-sky-50 cursor-pointer hover:bg-sky-100 transition ${itemTotal < 0 ? 'text-red-600' : itemTotal === 0 ? 'text-gray-300' : 'text-sky-900'}`}
                      onClick={(e) => { e.stopPropagation(); if (lineAccounts) setModal({ number: lineAccounts, label: item.label }); }}
                    >
                      {fmt(itemTotal, decimals)}
                    </td>
                  </tr>,
                  ...(isExpanded ? visibleAccounts.map((acc) => {
                    const aggAcc = aggregateValues ? aggregateValues(acc.months) : acc.months;
                    const accTotal = cols.reduce((s, c) => s + (aggAcc?.[c.key] || 0), 0);
                    return (
                      <tr key={`${key}_${acc.number}`} className="bg-sky-50/30 hover:bg-sky-50/60 transition border-b border-sky-100">
                        <td className="py-1 px-3 pl-12 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer"
                          onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label })}
                        >
                          <span className="font-mono text-xs text-gray-400 mr-2">{acc.number}</span>
                          <span className="text-xs text-gray-600">{acc.label}</span>
                        </td>
                        {cols.map((col) => {
                          const val = aggAcc?.[col.key] || 0;
                          const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                          return (
                            <td key={col.key} className={`py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-100/50 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                              onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label, ...fromTo })}
                            >
                              {fmt(val, decimals)}
                            </td>
                          );
                        })}
                        <td className="py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px]">
                          {fmt(accTotal, decimals)}
                        </td>
                      </tr>
                    );
                  }) : []),
                ];
              }

              // Percentage row
              if (item.type === 'pct') {
                // Recompute pct from aggregated ref/base values (not from pre-computed pct)
                const refItem = sigData.find(s => s.key === item.ref);
                const baseItem = sigData.find(s => s.key === item.base);
                const aggRef = aggregateValues ? aggregateValues(refItem?.months || {}) : (refItem?.months || {});
                const aggBase = aggregateValues ? aggregateValues(baseItem?.months || {}) : (baseItem?.months || {});
                // Total = sum ref / sum base on visible months only
                const refTotalVisible = cols.reduce((s, c) => s + (aggRef?.[c.key] || 0), 0);
                const baseTotalVisible = cols.reduce((s, c) => s + (aggBase?.[c.key] || 0), 0);
                const pctTotal = baseTotalVisible !== 0 ? Math.round(refTotalVisible / baseTotalVisible * 1000) / 10 : 0;

                return (
                  <tr key={item.key} className="border-b border-amber-100 bg-amber-50/60">
                    <td className="py-1 px-3 sticky left-0 z-10 bg-amber-50/60 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
                      <span className="inline-block w-5 mr-1" />
                      <span className="text-xs italic text-amber-700">{item.label}</span>
                    </td>
                    {cols.map((col) => {
                      const baseVal = aggBase?.[col.key] || 0;
                      const refVal = aggRef?.[col.key] || 0;
                      const pct = baseVal !== 0 ? Math.round(refVal / baseVal * 1000) / 10 : 0;
                      return (
                        <td key={col.key} className={`py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px] italic bg-amber-50/60 ${pct < 0 ? 'text-red-500' : pct === 0 ? 'text-gray-300' : 'text-amber-700'}`}>
                          {pct === 0 ? '-' : `${pct.toFixed(1)}%`}
                        </td>
                      );
                    })}
                    <td className={`py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px] italic bg-amber-50/60 ${pctTotal < 0 ? 'text-red-500' : pctTotal === 0 ? 'text-gray-300' : 'text-amber-700'}`}>
                      {pctTotal === 0 ? '-' : `${pctTotal.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              }

              if (item.type === 'subtotal') {
                const accs = getSubtotalAccounts(item);
                const bgClass = 'bg-slate-100 font-semibold border-y border-slate-200';
                const stickyBg = 'bg-slate-100';
                const textClass = 'text-slate-800';
                return (
                  <tr key={item.key} className={bgClass}>
                    <td className={`py-2 px-3 font-bold ${textClass} sticky left-0 z-10 ${stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap`}>
                      {item.label}
                    </td>
                    {cols.map((col) => {
                      const val = aggItem?.[col.key] || 0;
                      const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                      return (
                        <td key={col.key} className={`py-2 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-bold ${stickyBg} cursor-pointer hover:opacity-80 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                          onClick={() => { if (accs) setModal({ number: accs, label: item.label, ...fromTo }); }}
                        >
                          {fmt(val, decimals)}
                        </td>
                      );
                    })}
                    <td className={`py-2 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] font-bold ${stickyBg} cursor-pointer hover:opacity-80 transition ${itemTotal < 0 ? 'text-red-600' : itemTotal === 0 ? 'text-gray-300' : ''}`}
                      onClick={() => { if (accs) setModal({ number: accs, label: item.label }); }}
                    >
                      {fmt(itemTotal, decimals)}
                    </td>
                  </tr>
                );
              }

              // Line item
              const key = `sig_${item.key}`;
              const isExpanded = expanded[key];
              const lineAccounts = getLineAccounts(item);
              const hasAccounts = item.accounts && item.accounts.length > 0;
              return [
                <tr key={key} className={`border-b border-slate-100 ${hasAccounts ? 'cursor-pointer hover:bg-slate-50 transition' : ''}`}
                  onClick={() => hasAccounts && toggle(key)}
                >
                  <td className="py-1.5 px-3 sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
                    {hasAccounts && (
                      <span className={`inline-block w-5 text-center mr-1 text-gray-400 transition-transform duration-200 text-xs ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
                    )}
                    {!hasAccounts && <span className="inline-block w-5 mr-1" />}
                    <span className={`text-sm ${item.sign === 1 ? 'text-slate-700' : 'text-slate-600'}`}>{item.label}</span>
                  </td>
                  {cols.map((col) => {
                    const val = aggItem?.[col.key] || 0;
                    const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                    return (
                      <td key={col.key} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-50/50 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                        onClick={(e) => { e.stopPropagation(); if (lineAccounts) setModal({ number: lineAccounts, label: item.label, ...fromTo }); }}
                      >
                        {fmt(val, decimals)}
                      </td>
                    );
                  })}
                  <td className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-50/50 transition ${itemTotal < 0 ? 'text-red-600' : itemTotal === 0 ? 'text-gray-300' : ''}`}
                    onClick={(e) => { e.stopPropagation(); if (lineAccounts) setModal({ number: lineAccounts, label: item.label }); }}
                  >
                    {fmt(itemTotal, decimals)}
                  </td>
                </tr>,
                ...(isExpanded ? item.accounts.filter(acc => {
                  if (showEmpty) return true;
                  const agg = aggregateValues ? aggregateValues(acc.months) : acc.months;
                  return (columns || []).some(c => (agg?.[c.key] || 0) !== 0);
                }).map((acc) => {
                  const aggAcc = aggregateValues ? aggregateValues(acc.months) : acc.months;
                  const accTotal = cols.reduce((s, c) => s + (aggAcc?.[c.key] || 0), 0);
                  return (
                    <tr key={`${key}_${acc.number}`} className="bg-slate-50/50 hover:bg-sky-50/30 transition border-b border-slate-100">
                      <td className="py-1 px-3 pl-12 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer"
                        onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label })}
                      >
                        <span className="font-mono text-xs text-gray-400 mr-2">{acc.number}</span>
                        <span className="text-xs text-gray-600">{acc.label}</span>
                      </td>
                      {cols.map((col) => {
                        const val = aggAcc?.[col.key] || 0;
                        const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                        return (
                          <td key={col.key} className={`py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-sky-100/50 transition ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                            onClick={() => setModal({ number: acc.originalNumber || acc.number, label: acc.label, ...fromTo })}
                          >
                            {fmt(val, decimals)}
                          </td>
                        );
                      })}
                      <td className="py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px]">
                        {fmt(accTotal, decimals)}
                      </td>
                    </tr>
                  );
                }) : []),
              ];
            }).flat()}
            {/* Custom template: unassigned accounts */}
            {customTree && customTree.unassigned && customTree.unassigned.length > 0 && (
              <>
                <tr className="bg-amber-50 border-y border-amber-200">
                  <td colSpan={(columns || []).length + 2} className="py-2 px-3 text-xs font-semibold text-amber-800 sticky left-0 bg-amber-50 z-10">
                    NON AFFECTES ({customTree.unassigned.length} comptes)
                  </td>
                </tr>
                {customTree.unassigned.map(acc => {
                  const aggAcc = aggregateValues ? aggregateValues(acc.months || {}) : (acc.months || {});
                  const accTotal = (columns || []).reduce((s, c) => s + (aggAcc?.[c.key] || 0), 0);
                  if (!showEmpty && accTotal === 0 && (columns || []).every(c => (aggAcc?.[c.key] || 0) === 0)) return null;
                  return (
                    <tr key={`unassigned_${acc.number}`} className="bg-amber-50/30 border-b border-amber-100">
                      <td className="py-1 px-3 pl-6 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer"
                        onClick={() => setModal({ number: acc.number, label: acc.label })}>
                        <span className="font-mono text-xs text-amber-600 mr-2">{acc.number}</span>
                        <span className="text-xs text-amber-800">{acc.label}</span>
                      </td>
                      {(columns || []).map(col => {
                        const val = aggAcc?.[col.key] || 0;
                        return <td key={col.key} className={`py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px] ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}>{fmt(val, decimals)}</td>;
                      })}
                      <td className="py-1 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap min-w-[90px]">{fmt(accTotal, decimals)}</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <EntryDetailModal
          balanceId={clientId ? undefined : balanceId}
          clientId={clientId}
          accountNumber={modal.number}
          accountLabel={modal.label}
          from={modal.from || months[0]}
          to={modal.to || months[months.length - 1]}
          cachedLines={cachedLines}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// Cash Flow Detail Modal
function CashFlowDetailModal({ balanceId, clientId, category, categoryLabel, account, month, from, to, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fromM = month || from;
  const toM = month || to;
  const periodLabel = month ? `${month.split('-')[1]}/${month.split('-')[0]}` : 'Toutes periodes';

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        setLoading(true);
        const res = await dataAPI.cashflowEntries({
          company_id: balanceId || clientId,
          category,
          account: account || undefined,
          from: fromM || undefined,
          to: toM || undefined,
        });
        setEntries(res.data.entries || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEntries();
  }, [balanceId, clientId, category, account, fromM, toM]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const fmtAmt = (n) => {
    if (!n) return '-';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  };

  const filtered = search.trim()
    ? entries.filter(e => (e.label || '').toLowerCase().includes(search.toLowerCase()) || (e.counterpart || '').toLowerCase().includes(search.toLowerCase()))
    : entries;

  const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-[950px] max-h-[85vh] flex flex-col mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="bg-navy rounded-t-xl px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">{categoryLabel}</h2>
            <p className="text-sm text-sage">{periodLabel}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg leading-none transition">&times;</button>
        </div>
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 bg-white" />
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucune ecriture</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b-2 border-slate-200 text-gray-500 text-xs uppercase tracking-wider z-10">
                <tr>
                  <th className="text-left py-2 px-2 w-[90px]">Date</th>
                  <th className="text-left py-2 px-2">Libelle</th>
                  <th className="text-left py-2 px-2">Contrepartie</th>
                  <th className="text-right py-2 px-2">Montant</th>
                  <th className="text-center py-2 px-2">Journal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr key={i} className={`border-b border-slate-100 hover:bg-blue-50/50 transition ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">{e.date}</td>
                    <td className="py-1.5 px-2">{e.label}</td>
                    <td className="py-1.5 px-2 text-xs text-gray-500">{e.counterpart}</td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums font-medium ${e.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtAmt(e.amount)}</td>
                    <td className="py-1.5 px-2 text-center"><span className="bg-slate-100 text-gray-600 text-xs font-mono px-2 py-0.5 rounded">{e.journalCode}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
          <span className="text-xs text-gray-400">{filtered.length} mouvement{filtered.length !== 1 ? 's' : ''}</span>
          <span className={`font-mono tabular-nums text-sm font-bold ${totalAmount < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtAmt(totalAmount)}</span>
        </div>
      </div>
    </div>
  );
}

// Cash Flow Tab
function CashFlowTab({ cashflow, months, columns, aggregateValues, balanceId, clientId, decimals = 0, exercises = [] }) {
  const rows = cashflow.rows || [];

  // Trésorerie d'ouverture/clôture = soldes progressifs : on ne somme JAMAIS.
  // Ouverture d'une période = solde du 1er mois ; clôture = solde du dernier mois.
  const tresoPick = (row, monthList) => {
    if (!monthList || !monthList.length) return 0;
    const s = [...monthList].sort();
    const m = row.key === 'tresorerieOuverture' ? s[0] : s[s.length - 1];
    return row.months?.[m] || 0;
  };
  const cellValue = (row, col) => (row.isTreso ? tresoPick(row, col.months) : ((aggregateValues ? aggregateValues(row.months) : row.months)?.[col.key] || 0));
  const totalValue = (row, cols) => (row.isTreso ? tresoPick(row, months) : cols.reduce((s, c) => s + (cellValue(row, c) || 0), 0));
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const expandAll = () => {
    const allKeys = {};
    rows.forEach(row => { if (!row.isTotal && !row.isSubtotal && !row.isTreso) allKeys[row.key] = true; });
    setExpanded(allKeys);
  };

  const collapseAll = () => setExpanded({});

  const buildCFExportData = () => {
    const cols = columns || [];
    const headers = ['Poste', ...cols.map(c => c.label), 'Total'];
    const exportRows = [];
    rows.forEach((row) => {
      const rowTotal = totalValue(row, cols);
      exportRows.push([row.label, ...cols.map(c => rawVal(cellValue(row, c))), rawVal(rowTotal)]);
      if (row.accounts) {
        row.accounts.forEach((acc) => {
          const aggAcc = aggregateValues ? aggregateValues(acc.months) : acc.months;
          const accTotal = cols.reduce((s, c) => s + (aggAcc?.[c.key] || 0), 0);
          exportRows.push([`  ${acc.number} ${acc.label}`, ...cols.map(c => rawVal(aggAcc?.[c.key] || 0)), rawVal(accTotal)]);
        });
      }
    });
    return { headers, rows: exportRows };
  };

  const OPERATIONAL_KEYS = ['encaissementsClients', 'decaissementsFournisseurs', 'salairesCharges', 'dettesFiscales', 'autresOperationnels'];
  const FINANCIAL_KEYS = ['emprunts', 'autresFinanciers'];

  const getRowColor = (row) => {
    if (row.isTotal) return { row: 'bg-slate-800 text-white font-bold', sticky: 'bg-slate-800', text: 'text-white' };
    if (row.isSubtotal && row.key === 'fluxOperationnel') return { row: 'bg-emerald-100/80 font-semibold border-y border-emerald-200', sticky: 'bg-emerald-100', text: '' };
    if (row.isSubtotal && row.key === 'fluxFinancier') return { row: 'bg-sky-100/80 font-semibold border-y border-sky-200', sticky: 'bg-sky-100', text: '' };
    if (row.isTreso) return { row: 'bg-amber-50/80 italic border-y border-amber-200', sticky: 'bg-amber-50', text: '' };
    if (OPERATIONAL_KEYS.includes(row.key)) return { row: 'bg-emerald-50/50 border-l-4 border-emerald-400 hover:bg-emerald-50', sticky: 'bg-white', text: '' };
    if (FINANCIAL_KEYS.includes(row.key)) return { row: 'bg-sky-50/50 border-l-4 border-sky-400 hover:bg-sky-50', sticky: 'bg-white', text: '' };
    return { row: 'bg-slate-50/50 border-l-4 border-slate-300 hover:bg-slate-50', sticky: 'bg-white', text: '' };
  };

  const getAccountRowColor = (parentKey) => {
    if (OPERATIONAL_KEYS.includes(parentKey)) return { row: 'bg-emerald-50/20 border-l-4 border-emerald-400 hover:bg-emerald-50/40', sticky: 'bg-white' };
    if (FINANCIAL_KEYS.includes(parentKey)) return { row: 'bg-sky-50/20 border-l-4 border-sky-400 hover:bg-sky-50/40', sticky: 'bg-white' };
    return { row: 'bg-slate-50/20 border-l-4 border-slate-300 hover:bg-slate-50/40', sticky: 'bg-white' };
  };

  const hasAccounts = (row) => row.accounts && row.accounts.length > 0;
  const isExpandable = (row) => !row.isTotal && !row.isSubtotal && !row.isTreso;

  // Normaliser les numeros de comptes
  const maxLen = Math.max(
    ...rows.flatMap(r => (r.accounts || []).map(a => a.number.length)),
    6
  );

  // Check if a CF row is empty (all column values are 0)
  const isCFRowEmpty = (row) => {
    if (row.isTotal || row.isSubtotal || row.isTreso) return false;
    const cols = columns || [];
    const agg = aggregateValues ? aggregateValues(row.months) : row.months;
    return cols.every(c => (agg?.[c.key] || 0) === 0);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { const d = buildCFExportData(); copyToClipboard(d.headers, d.rows).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }} className={exportBtnClass}>
            {copied ? <><CheckIcon /> Copie</> : <><CopyIcon /> Copier</>}
          </button>
          <button onClick={() => { const d = buildCFExportData(); downloadCSV(d.headers, d.rows, 'cashflow_mensuel.csv'); }} className={exportBtnClass}>
            <DownloadIcon /> CSV
          </button>
          <button onClick={() => { const tbl = buildCFTableHTML(rows, columns || [], decimals, aggregateValues); exportInteractiveHTML('Tableau de Tresorerie', tbl, 'tresorerie.html', { allMonths: months, exercises }); }} className={exportBtnClass}>
            <DownloadIcon /> HTML
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmpty(!showEmpty)} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1">
            {showEmpty ? 'Masquer lignes vides' : 'Afficher lignes vides'}
          </button>
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            Tout deplier
          </button>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            Tout replier
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white text-xs">
              <th className="py-2 px-3 text-left font-semibold sticky left-0 bg-slate-800 z-20 min-w-[280px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                Poste
              </th>
              {(columns || []).map((col) => (
                <th key={col.key} className="py-2 px-3 text-right font-semibold whitespace-nowrap min-w-[90px]">
                  {col.label}
                </th>
              ))}
              <th className="py-2 px-3 text-right font-bold whitespace-nowrap min-w-[110px] bg-slate-900">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (!showEmpty && isCFRowEmpty(row)) return null;

              const cols = columns || [];
              const colors = getRowColor(row);
              const expandable = isExpandable(row);
              const isExpanded = expanded[row.key];
              const aggRow = aggregateValues ? aggregateValues(row.months) : row.months;
              const rowTotal = totalValue(row, cols);
              const rowElements = [];

              // Category row
              rowElements.push(
                <tr key={row.key} className={`${colors.row} ${expandable ? 'cursor-pointer' : ''}`} onClick={() => expandable && toggle(row.key)}>
                  <td className={`py-1.5 px-3 sticky left-0 z-10 whitespace-nowrap ${colors.sticky} ${colors.text} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                    {expandable && hasAccounts(row) && (
                      <span className={`inline-block w-5 text-center mr-1 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        {'\u25B6'}
                      </span>
                    )}
                    {row.label}
                  </td>
                  {cols.map((col) => {
                    const val = cellValue(row, col);
                    return (
                      <td key={col.key} className={`py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap min-w-[90px] ${
                        row.isTotal ? (val >= 0 ? 'text-green-300' : 'text-red-400')
                        : val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''
                      }`}>
                        {fmt(val, decimals)}
                      </td>
                    );
                  })}
                  <td className={`py-1.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap min-w-[90px] ${
                    row.isTotal ? (rowTotal >= 0 ? 'text-green-300' : 'text-red-400')
                    : rowTotal < 0 ? 'text-red-600' : rowTotal === 0 ? 'text-gray-300' : ''
                  }`}>
                    {fmt(rowTotal, decimals)}
                  </td>
                </tr>
              );

              // Account detail rows (when expanded)
              if (isExpanded && row.accounts) {
                const accColors = getAccountRowColor(row.key);
                const visibleAccounts = row.accounts.filter(acc => {
                  if (showEmpty) return true;
                  const agg = aggregateValues ? aggregateValues(acc.months) : acc.months;
                  return cols.some(c => (agg?.[c.key] || 0) !== 0);
                });
                visibleAccounts.forEach((acc) => {
                  const paddedNum = /^\d+$/.test(acc.number) ? acc.number.padEnd(maxLen, '0') : acc.number;
                  const aggAcc = aggregateValues ? aggregateValues(acc.months) : acc.months;
                  const accTotal = cols.reduce((s, c) => s + (aggAcc?.[c.key] || 0), 0);
                  rowElements.push(
                    <tr key={`${row.key}_${acc.number}`} className={`${accColors.row} transition border-b border-slate-100`}>
                      <td className={`py-1.5 px-3 pl-12 sticky left-0 ${accColors.sticky} z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap cursor-pointer`}
                        onClick={() => setModal({ category: row.key, label: row.label + ' — ' + acc.label, account: acc.number })}
                      >
                        <span className="font-mono text-xs text-gray-400 mr-2">{paddedNum}</span>
                        <span className="text-sm">{acc.label}</span>
                      </td>
                      {cols.map((col) => {
                        const val = aggAcc?.[col.key] || 0;
                        const fromTo = col.months.length === 1 ? { from: col.months[0], to: col.months[0] } : { from: col.months[0], to: col.months[col.months.length - 1] };
                        return (
                          <td key={col.key} className={`py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px] cursor-pointer hover:bg-blue-100/50 ${val < 0 ? 'text-red-600' : val === 0 ? 'text-gray-300' : ''}`}
                            onClick={() => setModal({ category: row.key, label: row.label + ' — ' + acc.label, account: acc.number, month: fromTo.from })}
                          >
                            {fmt(val, decimals)}
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-3 text-right font-mono text-sm tabular-nums whitespace-nowrap min-w-[90px]">
                        {fmt(accTotal, decimals)}
                      </td>
                    </tr>
                  );
                });
              }

              return rowElements;
            }).flat()}
          </tbody>
        </table>
      </div>

      {modal && (
        <CashFlowDetailModal
          balanceId={clientId ? undefined : balanceId}
          clientId={clientId}
          category={modal.category}
          categoryLabel={modal.label}
          account={modal.account}
          month={modal.month}
          from={months[0]}
          to={months[months.length - 1]}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

export default function MonthlyView({ companyId, data, loading = false }) {
  const clientId = companyId;
  const balanceId = undefined;
  const navigate = () => {};
  const error = null;

  // Persister les preferences utilisateur dans localStorage
  const storageKey = `moon_prefs_${clientId || 'default'}`;
  const savedPrefs = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
  }, [storageKey]);

  const [activeTab, setActiveTab] = useState(savedPrefs.activeTab || 'pl');
  const [decimals, setDecimals] = useState(savedPrefs.decimals || '0');
  const [granularity, setGranularity] = useState(savedPrefs.granularity || 'M');

  // Templates desactives (PCG standard uniquement pour l'instant)
  const templates = [];
  const selectedTemplate = 'default';
  const setSelectedTemplate = () => {};
  const customPLData = null;

  // Period filter state
  const [fromMonth, setFromMonth] = useState(savedPrefs.fromMonth || '');
  const [toMonth, setToMonth] = useState(savedPrefs.toMonth || '');

  // Sauvegarder les preferences a chaque changement
  useEffect(() => {
    const prefs = { activeTab, decimals, granularity, fromMonth, toMonth };
    try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch {}
  }, [activeTab, decimals, granularity, fromMonth, toMonth, storageKey]);

  const isClientMode = true;

  // Derive data based on mode
  const monthly = isClientMode ? data?.monthly : data?.reports?.monthly;
  const monthlyCashflow = isClientMode ? data?.monthlyCashflow : data?.reports?.monthly_cashflow;
  const allMonths = useMemo(() => monthly?.months || monthlyCashflow?.months || [], [monthly, monthlyCashflow]);

  // Initialize period filter (respect saved prefs if valid)
  useEffect(() => {
    if (allMonths.length === 0) return;
    if (!fromMonth || !allMonths.includes(fromMonth)) {
      setFromMonth(allMonths[0]);
    }
    if (!toMonth || !allMonths.includes(toMonth)) {
      setToMonth(allMonths[allMonths.length - 1]);
    }
  }, [allMonths]);

  // Visible months based on filter
  const visibleMonths = useMemo(() => {
    if (!fromMonth || !toMonth) return allMonths;
    return allMonths.filter(m => m >= fromMonth && m <= toMonth);
  }, [allMonths, fromMonth, toMonth]);

  // Determine fiscal year start month from exercises data
  const fiscalStartMonth = useMemo(() => {
    const exercises = isClientMode ? data?.exercises : [];
    if (exercises && exercises.length > 0) {
      // Use period_start of the first exercise to determine fiscal start month
      const first = exercises[0];
      if (first.period_start) {
        const parts = first.period_start.split('-');
        if (parts.length >= 2) return parseInt(parts[1]); // month number 1-12
      }
    }
    return 1; // Default: January
  }, [data, isClientMode]);

  // Aggregate months by granularity
  const aggregatedColumns = useMemo(() => {
    if (granularity === 'M') {
      return visibleMonths.map(m => ({ key: m, label: fmtMonth(m), months: [m] }));
    }

    // For Exo mode: group by real FEC period dates (period_start → period_end)
    if (granularity === 'E') {
      const exercises = isClientMode ? data?.exercises : null;
      if (exercises && exercises.length > 0) {
        // Sort exercises by period_start
        const sorted = [...exercises].sort((a, b) => (a.period_start || '').localeCompare(b.period_start || ''));
        const groups = {};
        sorted.forEach(ex => {
          const key = `exo_${ex.fiscal_year}`;
          const startLabel = ex.period_start ? `${ex.period_start.substring(8,10)}/${ex.period_start.substring(5,7)}/${ex.period_start.substring(0,4)}` : '';
          const endLabel = ex.period_end ? `${ex.period_end.substring(8,10)}/${ex.period_end.substring(5,7)}/${ex.period_end.substring(0,4)}` : '';
          groups[key] = { key, label: `Exo ${ex.fiscal_year}`, months: [] };
        });
        // Assign each month to the exercise whose period_start/end covers it
        visibleMonths.forEach(m => {
          let assigned = false;
          for (const ex of sorted) {
            const startMonth = ex.period_start ? ex.period_start.substring(0, 7) : `${ex.fiscal_year}-01`;
            const endMonth = ex.period_end ? ex.period_end.substring(0, 7) : `${ex.fiscal_year}-12`;
            if (m >= startMonth && m <= endMonth) {
              const key = `exo_${ex.fiscal_year}`;
              if (groups[key]) { groups[key].months.push(m); assigned = true; break; }
            }
          }
          if (!assigned) {
            const key = 'exo_other';
            if (!groups[key]) groups[key] = { key, label: 'Autre', months: [] };
            groups[key].months.push(m);
          }
        });
        return Object.values(groups).filter(g => g.months.length > 0);
      }
    }

    // T, S, A modes — group by calendar periods
    const groups = {};
    visibleMonths.forEach(m => {
      const [y, mo] = m.split('-');
      const moNum = parseInt(mo);

      let groupKey, groupLabel;

      if (granularity === 'T') {
        const q = Math.ceil(moNum / 3);
        groupKey = `${y}-T${q}`;
        groupLabel = `T${q} ${y}`;
      } else if (granularity === 'S') {
        const s = moNum <= 6 ? 1 : 2;
        groupKey = `${y}-S${s}`;
        groupLabel = `S${s} ${y}`;
      } else { // A
        groupKey = y;
        groupLabel = y;
      }

      if (!groups[groupKey]) groups[groupKey] = { key: groupKey, label: groupLabel, months: [] };
      groups[groupKey].months.push(m);
    });

    return Object.values(groups);
  }, [visibleMonths, granularity, fiscalStartMonth, data, isClientMode]);

  // Helper: aggregate a monthly-values object { '2025-01': 100, ... } into aggregated columns
  // Returns { columnKey: summedValue }
  const aggregateValues = (monthValues) => {
    const result = {};
    aggregatedColumns.forEach(col => {
      result[col.key] = col.months.reduce((s, m) => s + (monthValues?.[m] || 0), 0);
      result[col.key] = Math.round(result[col.key] * 100) / 100;
    });
    return result;
  };

  // Column keys for display (used instead of raw months in tabs)
  const displayColumns = aggregatedColumns;

  // Determine balanceId to use for entry details
  const effectiveBalanceId = useMemo(() => {
    if (balanceId) return balanceId;
    if (isClientMode && data?.exercises?.length > 0) {
      // Use the most recent exercise's balanceId
      return data.exercises[data.exercises.length - 1].id || data.exercises[0].id;
    }
    return null;
  }, [balanceId, isClientMode, data]);

  const hasMonthly = monthly && allMonths.length > 0;
  const hasCashflow = monthlyCashflow && monthlyCashflow.rows && allMonths.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy mx-auto mb-4"></div>
          <p className="font-display text-navy text-lg">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <button onClick={() => navigate(isClientMode ? '/dashboard' : `/analyse/${balanceId}`)} className="px-4 py-2 bg-navy text-white rounded-lg">
            Retour
          </button>
        </div>
      </div>
    );
  }

  if (!hasMonthly && !hasCashflow) {
    return (
      <div className="min-h-screen bg-cream">
        <header className="bg-navy text-white">
          <div className="max-w-full mx-auto px-6 py-6">
            <button onClick={() => navigate(isClientMode ? '/dashboard' : `/analyse/${balanceId}`)} className="text-sage hover:text-white text-sm mb-3 block transition">
              &larr; Retour
            </button>
            <h1 className="font-display text-3xl font-light tracking-wide text-white">Analyse mensuelle</h1>
          </div>
        </header>
        <div className="max-w-full mx-auto px-6 py-12">
          <div className="card-moon p-12 text-center">
            <p className="text-gray-500 text-lg">Donnees mensuelles non disponibles</p>
            <p className="text-gray-400 text-sm mt-2">Cette fonctionnalite necessite un import FEC avec des ecritures datees.</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    ...(hasMonthly ? [{ id: 'pl', label: 'Compte de Resultat' }] : []),
    ...(hasCashflow ? [{ id: 'cashflow', label: 'Tresorerie' }] : []),
  ];

  // Ensure active tab is valid
  if (!tabs.find((t) => t.id === activeTab) && tabs.length > 0) {
    setActiveTab(tabs[0].id);
  }

  const clientName = isClientMode ? data?.client?.name : null;
  const periodLabel = isClientMode
    ? (data?.exercises?.length > 0 ? `${data.exercises.length} exercice${data.exercises.length > 1 ? 's' : ''}` : '')
    : data?.balance?.period;

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: sliderThumbCSS }} />

      {/* Tabs + toolbar bar */}
      <nav className="bg-white border-b border-slate-200 rounded-t-lg">
        <div className="max-w-full mx-auto px-6">
          <div className="flex items-center justify-between py-2">
            {/* Tab pills */}
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${
                    activeTab === tab.id
                      ? 'bg-navy text-white'
                      : 'text-gray-500 hover:bg-slate-100 hover:text-navy'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Decimal toggle + granularity */}
            <div className="flex items-center gap-3">
              {/* Granularity toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {[{ k: 'M', l: 'Mois' }, { k: 'T', l: 'Trim.' }, { k: 'S', l: 'Sem.' }, { k: 'A', l: 'An' }, { k: 'E', l: 'Exo' }].map(g => (
                  <button key={g.k} onClick={() => setGranularity(g.k)}
                    className={`px-2 py-1 text-xs rounded transition ${granularity === g.k ? 'bg-navy text-white font-medium' : 'text-gray-500 hover:text-navy'}`}
                  >{g.l}</button>
                ))}
              </div>
              {/* Format toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {[{ k: '0', l: '€' }, { k: '2', l: '0,00' }, { k: 'k', l: 'k€' }].map(f => (
                  <button key={f.k} onClick={() => setDecimals(f.k)}
                    className={`px-2 py-1 text-xs rounded transition ${decimals === f.k ? 'bg-navy text-white font-medium' : 'text-gray-500 hover:text-navy'}`}
                  >{f.l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Period range slider — style Finthesis */}
      {allMonths.length > 1 && (() => {
        const fromIdx = Math.max(0, allMonths.indexOf(fromMonth));
        const toIdx = Math.max(0, allMonths.indexOf(toMonth));
        // Detect year boundaries for timeline labels
        const years = [...new Set(allMonths.map(m => m.split('-')[0]))];
        const yearPositions = years.map(y => {
          const firstIdx = allMonths.findIndex(m => m.startsWith(y));
          const lastIdx = allMonths.length - 1 - [...allMonths].reverse().findIndex(m => m.startsWith(y));
          return { year: y, startPct: (firstIdx / (allMonths.length - 1)) * 100, endPct: (lastIdx / (allMonths.length - 1)) * 100 };
        });

        return (
          <div className="bg-white border-b border-slate-100 px-6 py-4">
            <div className="max-w-3xl mx-auto">
              {/* Exercise quick-select buttons */}
              {isClientMode && data?.exercises?.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => { setFromMonth(allMonths[0]); setToMonth(allMonths[allMonths.length-1]); }}
                    className="px-3 py-1 text-xs rounded-full border border-slate-300 text-gray-600 hover:bg-slate-100 hover:border-slate-400 transition">
                    Toutes periodes
                  </button>
                  {data.exercises.map(ex => {
                    const start = ex.period_start ? ex.period_start.substring(0,7) : '';
                    const end = ex.period_end ? ex.period_end.substring(0,7) : '';
                    const isActive = fromMonth === start && toMonth === end;
                    return (
                      <button key={ex.id} onClick={() => { if (start && end) { setFromMonth(start); setToMonth(end); } }}
                        className={`px-3 py-1 text-xs rounded-full border transition ${isActive ? 'bg-navy text-white border-navy' : 'border-slate-300 text-gray-600 hover:bg-slate-100 hover:border-slate-400'}`}>
                        Exercice {ex.fiscal_year}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Labels */}
              <div className="flex items-center justify-between mb-2">
                <select value={fromMonth} onChange={e => {
                  const v = e.target.value;
                  if (v > toMonth) { setFromMonth(toMonth); setToMonth(v); } else { setFromMonth(v); }
                }} className="text-xs font-medium text-gray-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-400">
                  {allMonths.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
                </select>
                <select value={toMonth} onChange={e => {
                  const v = e.target.value;
                  if (v < fromMonth) { setToMonth(fromMonth); setFromMonth(v); } else { setToMonth(v); }
                }} className="text-xs font-medium text-gray-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-400">
                  {allMonths.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
                </select>
              </div>

              {/* Visual bar — click on a segment to set range boundary */}
              <div className="relative h-3 flex items-center rounded-full overflow-hidden bg-slate-200 cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const idx = Math.round(pct * (allMonths.length - 1));
                  const m = allMonths[Math.max(0, Math.min(idx, allMonths.length - 1))];
                  // Click left half of active range → move from, right half → move to
                  const fromI = allMonths.indexOf(fromMonth);
                  const toI = allMonths.indexOf(toMonth);
                  const mid = (fromI + toI) / 2;
                  if (idx <= mid) { setFromMonth(m); if (m > toMonth) setToMonth(m); }
                  else { setToMonth(m); if (m < fromMonth) setFromMonth(m); }
                }}
              >
                <div
                  className="absolute h-full bg-orange-400 rounded-full transition-all duration-150"
                  style={{
                    left: `${(fromIdx / (allMonths.length - 1)) * 100}%`,
                    right: `${100 - (toIdx / (allMonths.length - 1)) * 100}%`,
                  }}
                />
              </div>

              {/* Year timeline below */}
              <div className="relative h-5 mt-1">
                {yearPositions.map(({ year, startPct, endPct }) => (
                  <div
                    key={year}
                    className="absolute top-0 flex items-center justify-center"
                    style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
                  >
                    <div className="w-full border-t border-slate-300 relative">
                      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 bg-white px-2 text-xs text-gray-400">{year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Content */}
      <main className="max-w-full mx-auto px-6 py-6">
        <div className="card-moon p-5">
          {activeTab === 'pl' && hasMonthly && (
            <PLTab monthly={monthly} months={visibleMonths} columns={displayColumns} aggregateValues={aggregateValues} balanceId={effectiveBalanceId} clientId={isClientMode ? clientId : undefined} decimals={decimals} customTree={customPLData} exercises={data?.exercises || []} cachedLines={data?.lines || null} />
          )}
          {activeTab === 'cashflow' && hasCashflow && (
            <CashFlowTab cashflow={monthlyCashflow} months={visibleMonths} columns={displayColumns} aggregateValues={aggregateValues} balanceId={effectiveBalanceId} clientId={isClientMode ? clientId : undefined} decimals={decimals} exercises={data?.exercises || []} />
          )}
        </div>
      </main>
    </div>
  );
}
