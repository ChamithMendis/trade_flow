import { useQuery } from '@tanstack/react-query';
import type { InstrumentDto } from '@tradeflow/shared-types';
import { api } from '@/lib/api';

export const marketKeys = {
  instruments: ['market', 'instruments'] as const,
};

async function getInstruments(): Promise<InstrumentDto[]> {
  const { data } = await api.get<InstrumentDto[]>('/instruments');
  return data;
}

export function useInstruments() {
  return useQuery({
    queryKey: marketKeys.instruments,
    queryFn: getInstruments,
    // Prices arrive over the socket, so no polling is needed.
    staleTime: Infinity,
  });
}
