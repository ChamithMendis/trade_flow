import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { MarketPage } from '@/pages/MarketPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout>
              <MarketPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
