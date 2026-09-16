import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toast, Shell } from './components/ui';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import Chatbot from './components/Chatbot';
import { useStore } from './store/store';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Hub from './pages/Hub';
import Tecnico from './pages/Tecnico';
import Cliente from './pages/Cliente';
import Tracker from './pages/Tracker';
import Settings from './pages/Settings';
import Productos from './pages/Productos';
import Empresa from './pages/Empresa';
import Servicios from './pages/Servicios';
import Ecologica from './pages/Ecologica';
import ComoLlegar from './pages/ComoLlegar';
import Contacto from './pages/Contacto';
import Seguimiento from './pages/Seguimiento';
import Cotizador from './pages/Cotizador';
import CotizacionPublica from './pages/CotizacionPublica';
import Reportes from './pages/Reportes';
import WhatsAppFloat from './components/WhatsAppFloat';

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

function PublicLayout({ children }) {
  const { pathname } = useLocation();
  const ocultarChatbot = pathname.startsWith('/cotizador') || pathname.startsWith('/plataforma');
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
      {!ocultarChatbot && <Chatbot />}
      <WhatsAppFloat />
    </>
  );
}

function AppLayout({ children }) {
  return (
    <>
      <Shell />
      {children}
    </>
  );
}

function Plataforma() {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/auth" replace />;
  const dest = user.rol === 'admin' ? '/hub' : user.rol === 'tecnico' ? '/tecnico' : '/cliente';
  return <Navigate to={dest} replace />;
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const boot = useStore((s) => s.boot);

  useEffect(() => {
    boot();
  }, [boot]);

  if (!ready) {
    return (
      <div className="wrap page center" style={{ minHeight: '60vh', placeContent: 'center' }}>
        <span className="logo" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
          <span className="spinner" />
        </span>
        <p className="muted">Bertika · cargando...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toast />
      <Routes>
        {/* Sitio público */}
        <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
        <Route path="/empresa" element={<PublicLayout><Empresa /></PublicLayout>} />
        <Route path="/productos" element={<PublicLayout><Productos /></PublicLayout>} />
        <Route path="/servicios" element={<PublicLayout><Servicios /></PublicLayout>} />
        <Route path="/politica-ecologica" element={<PublicLayout><Ecologica /></PublicLayout>} />
        <Route path="/como-llegar" element={<PublicLayout><ComoLlegar /></PublicLayout>} />
        <Route path="/contacto" element={<PublicLayout><Contacto /></PublicLayout>} />
        <Route path="/cotizador" element={<PublicLayout><Cotizador /></PublicLayout>} />
        <Route path="/seguimiento" element={<PublicLayout><Seguimiento /></PublicLayout>} />
        <Route path="/cotizacion/:orden_id" element={<PublicLayout><CotizacionPublica /></PublicLayout>} />
        <Route path="/plataforma" element={<PublicLayout><Plataforma /></PublicLayout>} />

        {/* Acceso */}
        <Route path="/auth" element={<Auth />} />

        {/* Plataforma */}
        <Route path="/home" element={<AppLayout><Protected><Home /></Protected></AppLayout>} />
        <Route path="/hub" element={<AppLayout><RequireRol rol="admin"><Hub /></RequireRol></AppLayout>} />
        <Route path="/tecnico" element={<AppLayout><RequireRol rol="tecnico"><Tecnico /></RequireRol></AppLayout>} />
        <Route path="/cliente" element={<AppLayout><RequireRol rol="cliente"><Cliente /></RequireRol></AppLayout>} />
        <Route path="/tracker/:orden_id" element={<AppLayout><Tracker /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Protected><Settings /></Protected></AppLayout>} />
        <Route path="/reportes" element={<AppLayout><RequireRol rol="admin"><Reportes /></RequireRol></AppLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}