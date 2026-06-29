import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportAPI, exportAPI } from '../services/api';
import PLChart from '../components/PLChart';
import RatioCards from '../components/RatioCards';

export default function PLView() {
  const { balanceId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [balanceId]);

  const fetchReport = async () => {
    try {
      const response = await reportAPI.getReports(balanceId);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      setExporting(true);
      const response = await exportAPI[`export${format.charAt(0).toUpperCase() + format.slice(1)}`](balanceId, 'pl');

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pl-${balanceId}.${format === 'excel' ? 'xlsx' : format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;

  if (!data) return <div className="min-h-screen bg-gray-50 p-8">Report not found</div>;

  const pl = data.reports.pl;
  const bilan = data.reports.bilan;

  // Calculate ratios
  const totalAssets = bilan.summary.totalAssets || 1;
  const totalEquity = bilan.details.liabilities.equity || 1;
  const totalRevenues = pl.summary.totalRevenues || 1;
  const ratios = {
    liquidity: {
      currentRatio: (bilan.details.assets.cash / (bilan.details.liabilities.debts || 1)).toFixed(2),
    },
    solvency: {
      equityRatio: ((totalEquity / totalAssets) * 100).toFixed(2),
      debtRatio: (((bilan.details.liabilities.debts || 0) / totalAssets) * 100).toFixed(2),
    },
    profitability: {
      netMargin: ((pl.summary.netResult / totalRevenues) * 100).toFixed(2),
      roi: ((pl.summary.netResult / totalAssets) * 100).toFixed(2),
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 hover:underline mb-4">
          ← Back to Dashboard
        </button>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Income Statement (P&L)</h1>
            <p className="text-gray-600">{data.balance.clientName} - Period: {data.balance.period}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
            >
              PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              Excel
            </button>
            <button
              onClick={() => handleExport('html')}
              disabled={exporting}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              HTML
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">Total Revenues</p>
            <p className="text-2xl font-bold text-green-600">${pl.summary.totalRevenues.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">Total Expenses</p>
            <p className="text-2xl font-bold text-red-600">${pl.summary.totalExpenses.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">Net Result</p>
            <p className={`text-2xl font-bold ${pl.summary.netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${pl.summary.netResult.toLocaleString()}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">Profit Margin</p>
            <p className="text-2xl font-bold text-blue-600">{pl.summary.profitMargin}%</p>
          </div>
        </div>

        {/* Charts */}
        <div className="mb-8">
          <PLChart pl={pl} />
        </div>

        {/* Revenues Table */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Revenues (Produits)</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Account Number</th>
                <th className="text-left py-2">Label</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pl.accounts.revenues.map((account) => (
                <tr key={account.number} className="border-b hover:bg-gray-50">
                  <td className="py-2">{account.number}</td>
                  <td className="py-2">{account.label}</td>
                  <td className="text-right py-2 text-green-600">${account.amount.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td colSpan="2" className="py-2">Total</td>
                <td className="text-right py-2">${pl.summary.totalRevenues.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Expenses Table */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Expenses (Charges)</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Account Number</th>
                <th className="text-left py-2">Label</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pl.accounts.expenses.map((account) => (
                <tr key={account.number} className="border-b hover:bg-gray-50">
                  <td className="py-2">{account.number}</td>
                  <td className="py-2">{account.label}</td>
                  <td className="text-right py-2 text-red-600">${account.amount.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td colSpan="2" className="py-2">Total</td>
                <td className="text-right py-2">${pl.summary.totalExpenses.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Ratios */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Financial Ratios</h2>
          <RatioCards bilan={bilan} pl={pl} ratios={ratios} />
        </div>
      </div>
    </div>
  );
}
