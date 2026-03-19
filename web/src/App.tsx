import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProvidersPage } from '@/pages/ProvidersPage';
import { MappingsPage } from '@/pages/MappingsPage';
import { LogsPage } from '@/pages/LogsPage';

function App() {
  const { isAuthenticated, loadBootstrap } = useAuthStore();

  useEffect(() => {
    // Try to load bootstrap on mount to check auth status
    loadBootstrap();
  }, [loadBootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/"
          element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<DashboardPage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="mappings" element={<MappingsPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
