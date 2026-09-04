import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { MarketPage } from '@/pages/MarketPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

function Private({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <Private>
            <MarketPage />
          </Private>
        }
      />
      <Route
        path="/orders"
        element={
          <Private>
            <OrdersPage />
          </Private>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <Private>
            <OrderDetailPage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
