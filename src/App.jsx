import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toast, Shell } from './components/ui';
import { useStore } from './store/store';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Hub from './pages/Hub';
import Tecnico from './pages/Tecnico';
import Cliente from './pages/Cliente';
import Tracker from './pages/Tracker';
import Settings from './pages/Settings';

function Protected({ children }) {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

function RequireRol({ rol, children }) {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/auth" replace />;
  if (user.rol !== rol) return <Navigate to="/home" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
      <Toast />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/home" element={<Protected><Home /></Protected>} />
        <Route path="/hub" element={<RequireRol rol="admin"><Hub /></RequireRol>} />
        <Route path="/tecnico" element={<RequireRol rol="tecnico"><Tecnico /></RequireRol>} />
        <Route path="/cliente" element={<RequireRol rol="cliente"><Cliente /></RequireRol>} />
        <Route path="/tracker/:orden_id" element={<Tracker />} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}