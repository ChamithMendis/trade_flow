import { Link } from 'react-router-dom';
import { OrderSide, type PortfolioSummaryDto } from '@tradeflow/shared-types';
import { apiErrorMessage } from '@/lib/api';
import { dateTime, money } from '@/features/orders/order.format';
import { AllocationChart } from '@/features/portfolio/AllocationChart';
import { usePortfolio, useTransactions } from '@/features/portfolio/portfolio.api';
import { usePortfolioSocket } from '@/features/portfolio/usePortfolioSocket';

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${money.format(Math.abs(value))}`;
}

function pnlClass(value: number): string {
  if (value > 0) return 'text-green-700';
  if (value < 0) return 'text-red-700';
  return 'text-slate-600';
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular-nums ${tone ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function PositionsTable({ portfolio }: { portfolio: PortfolioSummaryDto }) {
  if (portfolio.positions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No holdings yet.{' '}
        <Link to="/" className="font-medium text-slate-900 underline">
          Place an order
        </Link>{' '}
        and it will appear here once it fills.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 text-right font-medium">Qty</th>
            <th className="px-4 py-3 text-right font-medium">Avg cost</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Cost basis</th>
            <th className="px-4 py-3 text-right font-medium">Market value</th>
            <th className="px-4 py-3 text-right font-medium">Unrealized P/L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {portfolio.positions.map((position) => (
            <tr key={position.instrumentId} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <span className="font-semibold tracking-tight">{position.symbol}</span>
                <span className="ml-2 text-xs text-slate-500">{position.instrumentName}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">{position.quantity}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {money.format(position.averagePrice)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {money.format(position.currentPrice)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                {money.format(position.costBasis)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {money.format(position.marketValue)}
              </td>
              <td
                className={`px-4 py-3 text-right font-mono tabular-nums ${pnlClass(position.unrealizedPnL)}`}
              >
                {signed(position.unrealizedPnL)}
                <span className="ml-1 text-xs">({position.unrealizedPnLPercent.toFixed(2)}%)</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTable() {
  const { data: transactions, isLoading } = useTransactions();

  if (isLoading) return <p className="text-sm text-slate-500">Loading transactions…</p>;
  if (!transactions || transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No executions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 font-medium">Side</th>
            <th className="px-4 py-3 text-right font-medium">Qty</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                {dateTime.format(new Date(transaction.executionTime))}
              </td>
              <td className="px-4 py-3 font-semibold tracking-tight">{transaction.symbol}</td>
              <td className="px-4 py-3">
                <span
                  className={
                    transaction.side === OrderSide.BUY
                      ? 'font-medium text-green-700'
                      : 'font-medium text-red-700'
                  }
                >
                  {transaction.side}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {transaction.quantity}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {money.format(transaction.executionPrice)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {money.format(transaction.value)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to={`/orders/${transaction.orderId}`}
                  className="text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  Order
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioPage() {
  const { data: portfolio, isLoading, isError, error } = usePortfolio();
  usePortfolioSocket();

  if (isLoading) return <p className="text-sm text-slate-500">Loading portfolio…</p>;
  if (isError) return <p className="text-sm text-red-600">{apiErrorMessage(error)}</p>;
  if (!portfolio) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cash, holdings and unrealized profit and loss, priced off the live market.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total value" value={money.format(portfolio.totalValue)} />
        <StatCard label="Available cash" value={money.format(portfolio.availableCash)} />
        <StatCard
          label="Holdings"
          value={money.format(portfolio.holdingsValue)}
          sub={`Cost basis ${money.format(portfolio.costBasis)}`}
        />
        <StatCard
          label="Unrealized P/L"
          value={signed(portfolio.unrealizedPnL)}
          sub={`${portfolio.unrealizedPnLPercent.toFixed(2)}% of cost basis`}
          tone={pnlClass(portfolio.unrealizedPnL)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Positions</h2>
          <PositionsTable portfolio={portfolio} />
        </div>
        <div className="lg:col-span-1">
          <AllocationChart portfolio={portfolio} />
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Transactions</h2>
        <TransactionsTable />
      </section>
    </div>
  );
}
