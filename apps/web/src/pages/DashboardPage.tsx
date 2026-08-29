import { useCurrentUser, useLogout } from '@/features/auth/auth.api';
import { Button } from '@/components/Button';

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">TradeFlow</span>
        <Button
          className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
          onClick={logout}
        >
          Sign out
        </Button>
      </header>

      <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Welcome, {user?.name}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Email</dt>
          <dd>{user?.email}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd>{user?.role}</dd>
        </dl>
        <p className="mt-6 text-sm text-slate-500">
          Market data, order entry and your portfolio arrive in the next phases.
        </p>
      </div>
    </div>
  );
}
