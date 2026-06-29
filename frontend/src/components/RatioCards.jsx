export default function RatioCards({ bilan, pl, ratios }) {
  const cards = [
    {
      title: 'Current Ratio',
      value: ratios.liquidity.currentRatio,
      unit: '',
      icon: '💧',
      description: 'Higher is better',
    },
    {
      title: 'Equity Ratio',
      value: ratios.solvency.equityRatio,
      unit: '%',
      icon: '📊',
      description: 'Percentage of assets owned',
    },
    {
      title: 'Debt Ratio',
      value: ratios.solvency.debtRatio,
      unit: '%',
      icon: '💳',
      description: 'Percentage of assets financed by debt',
    },
    {
      title: 'Net Margin',
      value: ratios.profitability.netMargin,
      unit: '%',
      icon: '📈',
      description: 'Profit per dollar of revenue',
    },
    {
      title: 'ROI',
      value: ratios.profitability.roi,
      unit: '%',
      icon: '🎯',
      description: 'Return on Investment',
    },
    {
      title: 'Total Assets',
      value: `$${(bilan.summary.totalAssets / 1000).toFixed(1)}K`,
      unit: '',
      icon: '🏦',
      description: 'Total company assets',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, idx) => (
        <div key={idx} className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-gray-600 text-sm">{card.title}</p>
              <p className="text-3xl font-bold">
                {card.value}
                <span className="text-lg ml-1">{card.unit}</span>
              </p>
            </div>
            <span className="text-3xl">{card.icon}</span>
          </div>
          <p className="text-xs text-gray-500">{card.description}</p>
        </div>
      ))}
    </div>
  );
}
