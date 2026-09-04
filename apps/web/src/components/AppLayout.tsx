import type { ReactNode } from 'react';
import { useCurrentUser, useLogout } from '@/features/auth/auth.api';

export function AppLayout({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">TradeFlow</span>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">{user?.name}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md px-3 py-1.5 text-slate-600 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
