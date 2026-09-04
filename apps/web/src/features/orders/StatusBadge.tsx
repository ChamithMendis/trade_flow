import type { OrderStatus } from '@tradeflow/shared-types';
import { statusStyles } from './order.format';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyles[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
