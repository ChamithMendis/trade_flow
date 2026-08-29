import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@tradeflow/shared-types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

async function postRegister(body: RegisterRequest): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', body);
  return data;
}

async function postLogin(body: LoginRequest): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', body);
  return data;
}

async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

function handleAuthSuccess(res: AuthResponse) {
  useAuthStore.getState().setToken(res.accessToken);
  queryClient.setQueryData(authKeys.me, res.user);
}

export function useRegister() {
  return useMutation({ mutationFn: postRegister, onSuccess: handleAuthSuccess });
}

export function useLogin() {
  return useMutation({ mutationFn: postLogin, onSuccess: handleAuthSuccess });
}

/** Resolves the current user from the token; disabled when logged out. */
export function useCurrentUser() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: authKeys.me,
    queryFn: getMe,
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogout() {
  return () => {
    useAuthStore.getState().clearToken();
    queryClient.clear();
  };
}
