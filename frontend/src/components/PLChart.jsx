import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function PLChart({ pl }) {
  const summaryData = [
    {
      name: 'P&L Statement',
      Revenues: pl.summary.totalRevenues,
      Expenses: pl.summary.totalExpenses,
      'Net Result': pl.summary.netResult,
    },
  ];

  const categoryData = [
    {
      name: 'Sales Revenue',
      amount: pl.details.revenues.salesRevenue,
      type: 'Revenue',
    },
    {
      name: 'Other Revenue',
      amount: pl.details.revenues.otherRevenue,
      type: 'Revenue',
    },
    {
      name: 'Financial Revenue',
      amount: pl.details.revenues.financialRevenue,
      type: 'Revenue',
    },
    {
      name: 'Operating Expenses',
      amount: -pl.details.expenses.operatingExpenses,
      type: 'Expense',
    },
    {
      name: 'Financial Expenses',
      amount: -pl.details.expenses.financialExpenses,
      type: 'Expense',
    },
    {
      name: 'Tax Expenses',
      amount: -pl.details.expenses.taxExpenses,
      type: 'Expense',
    },
  ].filter((item) => item.amount !== 0);

  const comparisonData = [
    {
      name: 'Revenue vs Expenses',
      Revenues: pl.summary.totalRevenues,
      Expenses: pl.summary.totalExpenses,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-bold mb-4">P&L Summary</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={summaryData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="Revenues" fill="#10b981" />
            <Bar dataKey="Expenses" fill="#ef4444" />
            <Bar dataKey="Net Result" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-bold mb-4">Revenue vs Expenses</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="Revenues" fill="#10b981" />
            <Bar dataKey="Expenses" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-bold mb-4">Revenue and Expense Breakdown</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={categoryData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="amount" fill="#6366f1" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
