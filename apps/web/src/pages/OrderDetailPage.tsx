import { Link, useParams } from 'react-router-dom';
import { OrderSide, OrderType, isOpenOrderStatus } from '@tradeflow/shared-types';
import { apiErrorMessage } from '@/lib/api';
import { useCancelOrder, useOrder } from '@/features/orders/orders.api';
import { dateTime, money } from '@/features/orders/order.format';
import { StatusBadge } from '@/features/orders/StatusBadge';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data: order, isLoading, isError, error } = useOrder(id);
  const cancelOrder = useCancelOrder();

  if (isLoading) return <p className="text-sm text-slate-500">Loading order…</p>;
  if (isError) return <p className="text-sm text-red-600">{apiErrorMessage(error)}</p>;
  if (!order) return null;

  const notional = order.executions.reduce(
    (total, execution) => total + execution.quantity * execution.executionPrice,
    0,
  );
  const averageFill = order.filledQuantity > 0 ? notional / order.filledQuantity : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/orders" className="text-sm text-slate-500 hover:text-slate-900">
          ← Orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {order.side} {order.quantity} {order.symbol}
          </h1>
          <StatusBadge status={order.status} />
          {isOpenOrderStatus(order.status) && (
            <button
              type="button"
              onClick={() => cancelOrder.mutate(order.id)}
              disabled={cancelOrder.isPending}
              className="rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-red-700 disabled:opacity-50"
            >
              Cancel order
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">{order.instrumentName}</p>
        {cancelOrder.isError && (
          <p className="mt-2 text-sm text-red-600">{apiErrorMessage(cancelOrder.error)}</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4">
        <Field label="Side">
          <span className={order.side === OrderSide.BUY ? 'text-green-700' : 'text-red-700'}>
            {order.side}
          </span>
        </Field>
        <Field label="Type">{order.orderType}</Field>
        <Field label="Limit price">
          {order.orderType === OrderType.LIMIT && order.price !== null
            ? money.format(order.price)
            : '—'}
        </Field>
        <Field label="Average fill">{averageFill === null ? '—' : money.format(averageFill)}</Field>
        <Field label="Filled">
          {order.filledQuantity} / {order.quantity}
        </Field>
        <Field label="Notional filled">{money.format(notional)}</Field>
        <Field label="Placed">{dateTime.format(new Date(order.createdAt))}</Field>
        <Field label="Last update">{dateTime.format(new Date(order.updatedAt))}</Field>
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Executions</h2>
        {order.executions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No executions yet. The exchange simulator fills orders in Phase 5.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.executions.map((execution) => (
                  <tr key={execution.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {dateTime.format(new Date(execution.executionTime))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {execution.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {money.format(execution.executionPrice)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {execution.executionReference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">History</h2>
        <ol className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {order.events.map((event, index) => (
            <li
              key={event.id}
              className={`flex items-baseline gap-4 px-4 py-3 text-sm ${
                index > 0 ? 'border-t border-slate-100' : ''
              }`}
            >
              <span className="w-44 shrink-0 text-slate-500">
                {dateTime.format(new Date(event.createdAt))}
              </span>
              <span className="font-medium">{event.eventType.replace('_', ' ')}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
