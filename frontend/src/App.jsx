import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import SitePublico from './components/layout/SitePublico.jsx';

// o painel só é baixado por quem abre /admin
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={(
          <Suspense fallback={<p className="container" style={{ paddingBlock: 48 }}>Carregando painel…</p>}>
            <AdminApp />
          </Suspense>
        )}
      />
      <Route path="*" element={<SitePublico />} />
    </Routes>
  );
}
