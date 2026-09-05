import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { PortfolioSummaryDto } from '@tradeflow/shared-types';
import { money } from '@/features/orders/order.format';

const SLICE_COLORS = ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1'];
const CASH_COLOR = '#bbf7d0';

export function AllocationChart({ portfolio }: { portfolio: PortfolioSummaryDto }) {
  const data = [
    ...portfolio.positions.map((position) => ({
      name: position.symbol,
      value: position.marketValue,
    })),
    { name: 'Cash', value: portfolio.availableCash },
  ].filter((slice) => slice.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Allocation</h2>
      <div className="mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {data.map((slice, index) => (
                <Cell
                  key={slice.name}
                  fill={
                    slice.name === 'Cash' ? CASH_COLOR : SLICE_COLORS[index % SLICE_COLORS.length]
                  }
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) =>
                typeof value === 'number' ? money.format(value) : String(value)
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {data.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  slice.name === 'Cash' ? CASH_COLOR : SLICE_COLORS[index % SLICE_COLORS.length],
              }}
            />
            {slice.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
