import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';

type Props = {
  points: number[];
  positive: boolean;
};

export function Sparkline({ points, positive }: Props) {
  if (points.length < 2) {
    return <div className="h-8 w-24 text-xs text-slate-300">—</div>;
  }

  const data = points.map((price, index) => ({ index, price }));
  const stroke = positive ? '#16a34a' : '#dc2626';

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="price"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
