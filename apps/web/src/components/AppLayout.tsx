import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useCurrentUser, useLogout } from '@/features/auth/auth.api';

const NAV = [
  { to: '/', label: 'Market', end: true },
  { to: '/orders', label: 'Orders', end: false },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold tracking-tight">TradeFlow</span>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-500 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
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
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
