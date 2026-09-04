import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WsEvent, type InstrumentDto, type PriceUpdatePayload } from '@tradeflow/shared-types';
import { getSocket } from '@/lib/socket';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { marketKeys } from './market.api';

/** Connection status is external state, so React subscribes to it directly. */
function subscribeToStatus(onChange: () => void): () => void {
  const socket = getSocket();
  socket.on('connect', onChange);
  socket.on('disconnect', onChange);
  return () => {
    socket.off('connect', onChange);
    socket.off('disconnect', onChange);
  };
}

/**
 * Subscribes to `market.price.updated` and writes each tick straight into the
 * TanStack Query cache, so the instruments table re-renders without refetching.
 */
export function useMarketSocket(): { connected: boolean } {
  const queryClient = useQueryClient();
  const connected = useSyncExternalStore(
    subscribeToStatus,
    () => getSocket().connected,
    () => false,
  );

  useEffect(() => {
    const socket = getSocket();
    const pushPrice = usePriceHistoryStore.getState().push;

    const onPrice = (payload: PriceUpdatePayload) => {
      queryClient.setQueryData<InstrumentDto[]>(marketKeys.instruments, (previous) =>
        previous?.map((instrument) =>
          instrument.symbol === payload.symbol
            ? { ...instrument, currentPrice: payload.price, updatedAt: payload.at }
            : instrument,
        ),
      );
      pushPrice(payload.symbol, payload.price, payload.changePercent);
    };

    socket.on(WsEvent.MARKET_PRICE_UPDATED, onPrice);
    return () => {
      socket.off(WsEvent.MARKET_PRICE_UPDATED, onPrice);
    };
  }, [queryClient]);

  return { connected };
}
