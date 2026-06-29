import { LineChart, Line, ResponsiveContainer } from 'recharts';

/**
 * Mini sparkline sans axes pour affichage inline de tendances
 * @param {{ data: number[], color?: string, width?: number, height?: number }} props
 */
export default function Sparkline({ data = [], color = '#1a223d', width = 100, height = 30 }) {
  if (!data || data.length < 2) return <span className="text-xs text-gray-400">—</span>;
  const chartData = data.map((value, index) => ({ index, value }));
  return (
    <div style={{ width, height, display: 'inline-block' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
