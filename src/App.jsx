import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toast, Shell } from './components/ui';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import Chatbot from './components/Chatbot';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore } from './store/store';

// Code splitting: solo la landing viaja en el bundle inicial. Cada ruta se
// descarga cuando se visita (el panel del Hub, el QR y el cotizador pesan y no
// hacen falta para ver el sitio publico).
import Landing from './pages/Landing';
const Auth = lazy(() => import('./pages/Auth'));
const Home = lazy(() => import('./pages/Home'));
const Hub = lazy(() => import('./pages/Hub'));
const Tecnico = lazy(() => import('./pages/Tecnico'));
const Cliente = lazy(() => import('./pages/Cliente'));
const Tracker = lazy(() => import('./pages/Tracker'));
const Settings = lazy(() => import('./pages/Settings'));
const Productos = lazy(() => import('./pages/Productos'));
const Empresa = lazy(() => import('./pages/Empresa'));
const Servicios = lazy(() => import('./pages/Servicios'));
const Ecologica = lazy(() => import('./pages/Ecologica'));
const ComoLlegar = lazy(() => import('./pages/ComoLlegar'));
const Contacto = lazy(() => import('./pages/Contacto'));
const Seguimiento = lazy(() => import('./pages/Seguimiento'));
const Cotizador = lazy(() => import('./pages/Cotizador'));
const CotizacionPublica = lazy(() => import('./pages/CotizacionPublica'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
import WhatsAppFloat from './components/WhatsAppFloat';

function CargandoRuta() {
  return (
    <div className="wrap page center" style={{ minHeight: '50vh', placeContent: 'center' }}>
      <span className="logo" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
        <span className="spinner" />
      </span>
      <p className="muted">Cargando...</p>
    </div>
  );
}

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
      <ErrorBoundary>
      <Suspense fallback={<CargandoRuta />}>
      <Routes>
        {/* Sitio público */}
        <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
        <Route path="/empresa" element={<PublicLayout><Empresa /></PublicLayout>} />
        <Route path="/productos" element={<PublicLayout><Productos /></PublicLayout>} />
        <Route path="/servicios" element={<PublicLayout><Servicios /></PublicLayout>} />
        <Route path="/politica-ecologica" element={<PublicLayout><Ecologica /></PublicLayout>} />
        <Route path="/como-llegar" element={<PublicLayout><ComoLlegar /></PublicLayout>} />
        <Route path="/contacto" element={<PublicLayout><Contacto /></PublicLayout>} />
        {/* Pantalla completa propia: entra sin scroll, sin el header/footer del sitio */}
        <Route path="/cotizador" element={<Cotizador />} />
        <Route path="/seguimiento" element={<PublicLayout><Seguimiento /></PublicLayout>} />
        <Route path="/cotizacion/:orden_id" element={<PublicLayout><CotizacionPublica /></PublicLayout>} />
        <Route path="/plataforma" element={<PublicLayout><Plataforma /></PublicLayout>} />

        {/* Acceso */}
        <Route path="/auth" element={<PublicLayout><Auth /></PublicLayout>} />

        {/* Plataforma */}
        <Route path="/home" element={<AppLayout><Protected><Home /></Protected></AppLayout>} />
        <Route path="/hub" element={<AppLayout><RequireRol rol="admin"><Hub /></RequireRol></AppLayout>} />
        <Route path="/tecnico" element={<AppLayout><RequireRol rol="tecnico"><Tecnico /></RequireRol></AppLayout>} />
        <Route path="/cliente" element={<AppLayout><RequireRol rol="cliente"><Cliente /></RequireRol></AppLayout>} />
        <Route path="/tracker/:orden_id" element={<AppLayout><Tracker /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Protected><Settings /></Protected></AppLayout>} />
        <Route path="/reportes" element={<AppLayout><RequireRol rol="admin"><Reportes /></RequireRol></AppLayout>} />
        <Route path="/usuarios" element={<AppLayout><RequireRol rol="admin"><Usuarios /></RequireRol></AppLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}