import { useEffect } from 'react';
import type { InstrumentDto } from '@tradeflow/shared-types';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { Sparkline } from './Sparkline';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

function ChangeBadge({ percent }: { percent: number | undefined }) {
  if (percent === undefined) {
    return <span className="text-slate-400">—</span>;
  }
  const positive = percent >= 0;
  return (
    <span className={positive ? 'text-green-600' : 'text-red-600'}>
      {positive ? '▲' : '▼'} {Math.abs(percent).toFixed(2)}%
    </span>
  );
}

export function InstrumentsTable({ instruments }: { instruments: InstrumentDto[] }) {
  const history = usePriceHistoryStore((s) => s.history);
  const lastChangePercent = usePriceHistoryStore((s) => s.lastChangePercent);
  const seed = usePriceHistoryStore((s) => s.seed);

  // Give each sparkline a starting point from the initial REST payload.
  useEffect(() => {
    for (const instrument of instruments) {
      seed(instrument.symbol, instrument.currentPrice);
    }
  }, [instruments, seed]);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Last tick</th>
            <th className="px-4 py-3 font-medium">Trend</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {instruments.map((instrument) => {
            const change = lastChangePercent[instrument.symbol];
            return (
              <tr key={instrument.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold tracking-tight">{instrument.symbol}</td>
                <td className="px-4 py-3 text-slate-600">{instrument.name}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {money.format(instrument.currentPrice)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  <ChangeBadge percent={change} />
                </td>
                <td className="px-4 py-3">
                  <Sparkline
                    points={history[instrument.symbol] ?? []}
                    positive={(change ?? 0) >= 0}
                  />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      instrument.status === 'ACTIVE'
                        ? 'rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700'
                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500'
                    }
                  >
                    {instrument.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
