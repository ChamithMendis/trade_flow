import { Link } from 'react-router-dom';
import { OrderSide, isOpenOrderStatus, type OrderDto } from '@tradeflow/shared-types';
import { apiErrorMessage } from '@/lib/api';
import { useCancelOrder } from './orders.api';
import { money, dateTime } from './order.format';
import { StatusBadge } from './StatusBadge';

function FillBar({ filled, total }: { filled: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-700" style={{ width: `${percent}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-slate-500">
        {filled}/{total}
      </span>
    </div>
  );
}

export function OrdersTable({ orders }: { orders: OrderDto[] }) {
  const cancelOrder = useCancelOrder();

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No orders yet. Place one from the market page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cancelOrder.isError && (
        <p className="text-sm text-red-600">{apiErrorMessage(cancelOrder.error)}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Placed</th>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Limit</th>
              <th className="px-4 py-3 font-medium">Filled</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {dateTime.format(new Date(order.createdAt))}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/orders/${order.id}`}
                    className="font-semibold tracking-tight underline-offset-2 hover:underline"
                  >
                    {order.symbol}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      order.side === OrderSide.BUY
                        ? 'font-medium text-green-700'
                        : 'font-medium text-red-700'
                    }
                  >
                    {order.side}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{order.orderType}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {order.price === null ? '—' : money.format(order.price)}
                </td>
                <td className="px-4 py-3">
                  <FillBar filled={order.filledQuantity} total={order.quantity} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {isOpenOrderStatus(order.status) && (
                    <button
                      type="button"
                      onClick={() => cancelOrder.mutate(order.id)}
                      disabled={cancelOrder.isPending}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-red-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
