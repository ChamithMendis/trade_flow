import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
}

/**
 * Only the JWT is persisted. The authenticated user is fetched from `/auth/me`
 * via TanStack Query, so it never goes stale in localStorage.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: null }),
    }),
    { name: 'tradeflow.auth' },
  ),
);
