import { useState } from 'react';
import { OrderStatus } from '@tradeflow/shared-types';
import { apiErrorMessage } from '@/lib/api';
import { useOrders } from '@/features/orders/orders.api';
import { OrdersTable } from '@/features/orders/OrdersTable';

const TABS: { label: string; status?: OrderStatus }[] = [
  { label: 'All' },
  { label: 'New', status: OrderStatus.NEW },
  { label: 'Partially filled', status: OrderStatus.PARTIALLY_FILLED },
  { label: 'Filled', status: OrderStatus.FILLED },
  { label: 'Rejected', status: OrderStatus.REJECTED },
  { label: 'Cancelled', status: OrderStatus.CANCELLED },
];

export function OrdersPage() {
  const [active, setActive] = useState(0);
  const { data: orders, isLoading, isError, error } = useOrders(TABS[active].status);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every order you have placed, with its execution progress.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(index)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              index === active
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading orders…</p>}
      {isError && <p className="text-sm text-red-600">{apiErrorMessage(error)}</p>}
      {orders && <OrdersTable orders={orders} />}
    </div>
  );
}
