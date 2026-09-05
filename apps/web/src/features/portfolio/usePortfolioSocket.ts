import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WsEvent } from '@tradeflow/shared-types';
import { getSocket } from '@/lib/socket';
import { portfolioKeys } from './portfolio.api';

/**
 * Refetches the portfolio when an execution settles. Unlike order events, the
 * payload here is just a signal — cash and positions are derived from live
 * prices, so there is nothing useful to patch in place.
 */
export function usePortfolioSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    const onUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    };

    socket.on(WsEvent.PORTFOLIO_UPDATED, onUpdated);
    return () => {
      socket.off(WsEvent.PORTFOLIO_UPDATED, onUpdated);
    };
  }, [queryClient]);
}
