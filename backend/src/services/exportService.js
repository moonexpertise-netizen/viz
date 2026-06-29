import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

/**
 * Générer un rapport HTML
 */
const generateHTMLReport = (report, type, clientName, period) => {
  const { bilan, pl, ratios } = report;
  const data = type === 'bilan' ? bilan : pl;

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          .section { margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .summary { font-size: 18px; font-weight: bold; margin: 20px 0; }
          .positive { color: green; }
          .negative { color: red; }
          .section h2 { color: #555; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        </style>
      </head>
      <body>
        <h1>${type === 'bilan' ? 'Balance Sheet (Bilan)' : 'Income Statement (P&L)'}</h1>
        <p><strong>Client:</strong> ${clientName}</p>
        <p><strong>Period:</strong> ${period}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>

        <div class="section">
          <h2>Summary</h2>
          <div class="summary">
  `;

  if (type === 'bilan') {
    html += `
      <p>Total Assets: $${data.summary.totalAssets.toLocaleString()}</p>
      <p>Total Liabilities: $${data.summary.totalLiabilities.toLocaleString()}</p>
      <p class="${data.summary.difference >= 0 ? 'positive' : 'negative'}">
        Difference: $${data.summary.difference.toLocaleString()}
      </p>
    `;
  } else {
    html += `
      <p>Total Revenues: $${data.summary.totalRevenues.toLocaleString()}</p>
      <p>Total Expenses: $${data.summary.totalExpenses.toLocaleString()}</p>
      <p class="${data.summary.netResult >= 0 ? 'positive' : 'negative'}">
        Net Result: $${data.summary.netResult.toLocaleString()}
      </p>
      <p>Profit Margin: ${data.summary.profitMargin}%</p>
    `;
  }

  html += `
          </div>
        </div>

        <div class="section">
          <h2>Detailed Accounts</h2>
          <table>
            <tr>
              <th>Account Number</th>
              <th>Account Label</th>
              <th>Amount</th>
            </tr>
  `;

  if (type === 'bilan') {
    data.accounts.assets.forEach((acc) => {
      html += `<tr><td>${acc.number}</td><td>${acc.label}</td><td>$${acc.amount.toLocaleString()}</td></tr>`;
    });
    data.accounts.liabilities.forEach((acc) => {
      html += `<tr><td>${acc.number}</td><td>${acc.label}</td><td>$${Math.abs(acc.amount).toLocaleString()}</td></tr>`;
    });
  } else {
    data.accounts.revenues.forEach((acc) => {
      html += `<tr><td>${acc.number}</td><td>${acc.label}</td><td>$${acc.amount.toLocaleString()}</td></tr>`;
    });
    data.accounts.expenses.forEach((acc) => {
      html += `<tr><td>${acc.number}</td><td>${acc.label}</td><td>$${acc.amount.toLocaleString()}</td></tr>`;
    });
  }

  html += `
          </table>
        </div>
      </body>
    </html>
  `;

  return html;
};

/**
 * Exporter en PDF via Puppeteer
 */
export const exportToPDF = async (report, type, clientName, period) => {
  try {
    const html = generateHTMLReport(report, type, clientName, period);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(html);

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
    });

    await browser.close();

    return pdfBuffer;
  } catch (error) {
    throw new Error(`PDF export failed: ${error.message}`);
  }
};

/**
 * Exporter en Excel
 */
export const exportToExcel = async (report, type, clientName, period) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Header
    worksheet.merge('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = type === 'bilan' ? 'Balance Sheet' : 'Income Statement';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    worksheet.getCell('A3').value = `Client: ${clientName}`;
    worksheet.getCell('A4').value = `Period: ${period}`;
    worksheet.getCell('A5').value = `Generated: ${new Date().toLocaleDateString()}`;

    // Summary section
    worksheet.getCell('A7').value = 'Summary';
    worksheet.getCell('A7').font = { bold: true };

    const data = type === 'bilan' ? report.bilan : report.pl;
    let row = 8;

    Object.entries(data.summary).forEach(([key, value]) => {
      worksheet.getCell(`A${row}`).value = key;
      worksheet.getCell(`B${row}`).value = value;
      row++;
    });

    // Accounts section
    row += 2;
    worksheet.getCell(`A${row}`).value = 'Detailed Accounts';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;

    worksheet.getCell(`A${row}`).value = 'Account Number';
    worksheet.getCell(`B${row}`).value = 'Account Label';
    worksheet.getCell(`C${row}`).value = 'Amount';
    row++;

    if (type === 'bilan') {
      data.accounts.assets.forEach((acc) => {
        worksheet.getCell(`A${row}`).value = acc.number;
        worksheet.getCell(`B${row}`).value = acc.label;
        worksheet.getCell(`C${row}`).value = acc.amount;
        row++;
      });
      data.accounts.liabilities.forEach((acc) => {
        worksheet.getCell(`A${row}`).value = acc.number;
        worksheet.getCell(`B${row}`).value = acc.label;
        worksheet.getCell(`C${row}`).value = Math.abs(acc.amount);
        row++;
      });
    } else {
      data.accounts.revenues.forEach((acc) => {
        worksheet.getCell(`A${row}`).value = acc.number;
        worksheet.getCell(`B${row}`).value = acc.label;
        worksheet.getCell(`C${row}`).value = acc.amount;
        row++;
      });
      data.accounts.expenses.forEach((acc) => {
        worksheet.getCell(`A${row}`).value = acc.number;
        worksheet.getCell(`B${row}`).value = acc.label;
        worksheet.getCell(`C${row}`).value = acc.amount;
        row++;
      });
    }

    // Column widths
    worksheet.getColumn('A').width = 15;
    worksheet.getColumn('B').width = 30;
    worksheet.getColumn('C').width = 15;

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    throw new Error(`Excel export failed: ${error.message}`);
  }
};

/**
 * Exporter en HTML
 */
export const exportToHTML = async (report, type, clientName, period) => {
  return generateHTMLReport(report, type, clientName, period);
};
