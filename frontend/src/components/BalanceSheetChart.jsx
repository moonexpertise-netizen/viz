import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function BalanceSheetChart({ bilan }) {
  const chartData = [
    {
      name: 'Balance Sheet',
      Assets: bilan.summary.totalAssets,
      Liabilities: bilan.summary.totalLiabilities,
    },
  ];

  const categoryData = [
    {
      name: 'Immobilizations',
      Assets: bilan.details.assets.immobilizations,
      Liabilities: 0,
    },
    {
      name: 'Stocks',
      Assets: bilan.details.assets.stocks,
      Liabilities: 0,
    },
    {
      name: 'Receivables',
      Assets: bilan.details.assets.receivables,
      Liabilities: 0,
    },
    {
      name: 'Cash',
      Assets: bilan.details.assets.cash,
      Liabilities: 0,
    },
    {
      name: 'Equity',
      Assets: 0,
      Liabilities: bilan.details.liabilities.equity,
    },
    {
      name: 'Debts',
      Assets: 0,
      Liabilities: bilan.details.liabilities.debts,
    },
  ].filter((item) => item.Assets > 0 || item.Liabilities > 0);

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-bold mb-4">Total Balance</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="Assets" fill="#3b82f6" />
            <Bar dataKey="Liabilities" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-bold mb-4">Balance by Category</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={categoryData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="Assets" fill="#3b82f6" />
            <Bar dataKey="Liabilities" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
