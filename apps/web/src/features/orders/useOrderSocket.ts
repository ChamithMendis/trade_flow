import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ORDER_EVENT_NAMES,
  WsEvent,
  type OrderDto,
  type OrderEventName,
  type OrderStatus,
} from '@tradeflow/shared-types';
import { getSocket } from '@/lib/socket';
import { useToastStore } from '@/stores/toastStore';
import { orderKeys } from './orders.api';
import { money } from './order.format';

/** The status a `['orders','list',<status>]` query is filtered by. */
function listStatus(key: readonly unknown[]): OrderStatus | 'ALL' | null {
  if (key[0] !== 'orders' || key[1] !== 'list') return null;
  return (key[2] as OrderStatus | 'ALL') ?? 'ALL';
}

/**
 * Writes an updated order into every cached list, respecting each list's status
 * filter: an order that moves NEW -> FILLED is removed from the "New" tab and
 * inserted into "Filled". No refetch involved.
 */
function patchLists(queryClient: QueryClient, order: OrderDto): void {
  const queries = queryClient.getQueryCache().findAll({ queryKey: orderKeys.all });

  for (const query of queries) {
    const status = listStatus(query.queryKey);
    if (status === null) continue;

    queryClient.setQueryData<OrderDto[]>(query.queryKey, (previous) => {
      if (!previous) return previous;

      const belongs = status === 'ALL' || status === order.status;
      const without = previous.filter((o) => o.id !== order.id);
      if (!belongs) return without;

      const existed = previous.some((o) => o.id === order.id);
      // Newest first, matching the API's ordering.
      return existed ? previous.map((o) => (o.id === order.id ? order : o)) : [order, ...without];
    });
  }
}

function toastFor(event: OrderEventName, order: OrderDto) {
  const label = `${order.side} ${order.quantity} ${order.symbol}`;

  switch (event) {
    case WsEvent.ORDER_FILLED:
      return { title: `Filled: ${label}`, tone: 'success' as const };
    case WsEvent.ORDER_REJECTED:
      return {
        title: `Rejected: ${label}`,
        detail: 'The exchange declined this order.',
        tone: 'error' as const,
      };
    case WsEvent.ORDER_CANCELLED:
      return { title: `Cancelled: ${label}`, tone: 'info' as const };
    case WsEvent.ORDER_PARTIALLY_FILLED:
      return {
        title: `Partial fill: ${label}`,
        detail: `${order.filledQuantity} of ${order.quantity} filled${
          order.price === null ? '' : ` · limit ${money.format(order.price)}`
        }`,
        tone: 'info' as const,
      };
    default:
      return null;
  }
}

/**
 * Subscribes to this trader's order events. The server only emits into the
 * user's private room, so nothing here needs to filter by owner.
 */
export function useOrderSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    const push = useToastStore.getState().push;

    const handlers = ORDER_EVENT_NAMES.map((event) => {
      const handler = (order: OrderDto) => {
        patchLists(queryClient, order);

        // Detail also carries executions and events, which the payload lacks —
        // patch what we know now, then refetch the rest.
        queryClient.setQueryData(orderKeys.detail(order.id), (previous: unknown) =>
          previous ? { ...previous, ...order } : previous,
        );
        void queryClient.invalidateQueries({ queryKey: orderKeys.detail(order.id) });

        const toast = toastFor(event, order);
        if (toast) push(toast);
      };

      socket.on(event, handler);
      return { event, handler } as const;
    });

    return () => {
      for (const { event, handler } of handlers) socket.off(event, handler);
    };
  }, [queryClient]);
}
