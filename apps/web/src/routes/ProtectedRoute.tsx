import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/auth.api';
import { useAuthStore } from '@/stores/authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const { isLoading, isError } = useCurrentUser();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  // Token present but /auth/me failed (expired/invalid) — the interceptor already
  // cleared it; bounce to login.
  if (isError) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
