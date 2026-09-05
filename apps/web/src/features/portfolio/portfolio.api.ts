import { useQuery } from '@tanstack/react-query';
import type { PortfolioSummaryDto, TransactionDto } from '@tradeflow/shared-types';
import { api } from '@/lib/api';

export const portfolioKeys = {
  all: ['portfolio'] as const,
  summary: ['portfolio', 'summary'] as const,
  transactions: ['portfolio', 'transactions'] as const,
};

export function usePortfolio() {
  return useQuery({
    queryKey: portfolioKeys.summary,
    queryFn: async () => {
      const { data } = await api.get<PortfolioSummaryDto>('/portfolio');
      return data;
    },
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: portfolioKeys.transactions,
    queryFn: async () => {
      const { data } = await api.get<TransactionDto[]>('/portfolio/transactions');
      return data;
    },
  });
}
