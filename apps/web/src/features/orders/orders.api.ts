import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateOrderRequest,
  OrderDetailDto,
  OrderDto,
  OrderStatus,
} from '@tradeflow/shared-types';
import { api } from '@/lib/api';

export const orderKeys = {
  all: ['orders'] as const,
  list: (status?: OrderStatus) => ['orders', 'list', status ?? 'ALL'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

export function useOrders(status?: OrderStatus) {
  return useQuery({
    queryKey: orderKeys.list(status),
    queryFn: async () => {
      const { data } = await api.get<OrderDto[]>('/orders', {
        params: status ? { status } : undefined,
      });
      return data;
    },
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get<OrderDetailDto>(`/orders/${id}`);
      return data;
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateOrderRequest) => {
      const { data } = await api.post<OrderDto>('/orders', body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<OrderDto>(`/orders/${id}/cancel`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}
