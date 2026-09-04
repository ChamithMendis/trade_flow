import { OrderStatus } from '@tradeflow/shared-types';

export const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

/** Tailwind classes per order status, so the badge reads at a glance. */
export const statusStyles: Record<OrderStatus, string> = {
  [OrderStatus.NEW]: 'bg-slate-100 text-slate-700',
  [OrderStatus.PROCESSING]: 'bg-blue-50 text-blue-700',
  [OrderStatus.PARTIALLY_FILLED]: 'bg-amber-50 text-amber-700',
  [OrderStatus.FILLED]: 'bg-green-50 text-green-700',
  [OrderStatus.REJECTED]: 'bg-red-50 text-red-700',
  [OrderStatus.CANCELLED]: 'bg-slate-100 text-slate-500',
};

export function StatusLabel(status: OrderStatus): string {
  return status.replace('_', ' ');
}
