import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/store';
import { Icon, Modal } from '../ui';
import { AltasForm, NewOrdenForm } from '../AccionesGlobales';
import { contarTareasPendientes } from '../../data/crm.js';
import { CONTACTO } from '../../data/siteData';
import { contarCriticos } from '../../data/inventario';
import CentroNotificaciones from './CentroNotificaciones';
import BusquedaGlobal from './BusquedaGlobal';

// El detalle de la orden se carga solo cuando se abre desde una notificacion o
// desde el buscador: no engorda el bundle inicial de la plataforma.
const OrdenDetalle = lazy(() => import('../OrdenDetalle'));

// Shell de la plataforma: sidebar fijo por rol + topbar con las acciones
// globales. Reemplaza a la barra superior vieja (Shell de ui.jsx) y envuelve
// TODAS las rutas autenticadas.
//
// El menu es la unica fuente de navegacion: cada item apunta a una sub-ruta
// real (deep-linkeable) y el item activo se marca comparando la direccion.

// Slugs canonicos: /tecnico y /cliente (sin sub-ruta) muestran su pestana base.
const CANONICO = {
  '/tecnico': '/tecnico/mis-ordenes',
  '/cliente': '/cliente/rastreo',
};

const ACTIVAS = (o) => !['delivered', 'cancelled'].includes(o.estado);

// Contadores del menu: se calculan con los datos que ya tiene el store (sin
// pedidos extra a la API).
function contadores(data, user) {
  const ordenes = data.ordenes || [];
  const insumos = data.insumos || [];
  const porVencer = ordenes.filter((o) => {
    if (o.estado !== 'delivered' || !o.garantia?.vence) return false;
    const dias = Math.round((new Date(o.garantia.vence) - Date.now()) / 86400000);
    return dias >= 0 && dias <= 30;
  }).length;
  const mias = ordenes.filter((o) => o.tecnico_id === user?.id);
  const sinAsignar = ordenes.filter((o) => !o.tecnico_id && ['received', 'diagnosing'].includes(o.estado));
  const delCliente = ordenes.filter((o) => o.cliente_id === user?.id);
  return {
    activas: ordenes.filter(ACTIVAS).length,
    stockCritico: contarCriticos(insumos),
    porVencer,
    miasActivas: mias.filter(ACTIVAS).length,
    sinAsignar: sinAsignar.length,
    miasCerradas: mias.filter((o) => ['delivered', 'cancelled'].includes(o.estado)).length,
    cotizaciones: delCliente.filter((o) => o.estado === 'quoted').length,
    entregadas: delCliente.filter((o) => o.estado === 'delivered').length,
    garantias: delCliente.filter((o) => o.garantia).length,
    tareas: contarTareasPendientes(data.tareas),
  };
}

// Menu por rol. `exact` marca los items que no deben quedar activos en sus
// sub-rutas (por ejemplo el tablero, que es la raiz de /hub).
function menuDe(rol, c, esFlotilla) {
  if (rol === 'tecnico') {
    return [
      { grupo: 'Mi trabajo', items: [
        { to: '/tecnico/mis-ordenes', label: 'Mis órdenes', icon: 'battery', exact: true, contador: c.miasActivas },
        { to: '/tecnico/sin-asignar', label: 'Sin asignar', icon: 'warn', contador: c.sinAsignar },
        { to: '/tecnico/completadas', label: 'Completadas', icon: 'check', contador: c.miasCerradas },
        { to: '/tecnico/tareas', label: 'Mis tareas', icon: 'clock', contador: c.tareas },
      ] },
      { grupo: 'Sistema', items: [
        { to: '/settings', label: 'Mi cuenta', icon: 'gear' },
      ] },
    ];
  }
  if (rol === 'cliente') {
    const items = [
      { to: '/cliente/rastreo', label: 'Rastrear batería', icon: 'battery', exact: true },
      { to: '/cliente/cotizaciones', label: 'Cotizaciones', icon: 'clipboard', contador: c.cotizaciones },
      { to: '/cliente/historial', label: 'Historial', icon: 'clock', contador: c.entregadas },
    ];
    if (esFlotilla) items.push({ to: '/cliente/flotilla', label: 'Flotilla', icon: 'building' });
    items.push({ to: '/cliente/garantias', label: 'Garantías', icon: 'shield', contador: c.garantias });
    items.push({ to: '/cliente/agenda', label: 'Agendar visita', icon: 'calendar' });
    return [
      { grupo: 'Mi espacio', items },
      { grupo: 'Sistema', items: [{ to: '/settings', label: 'Mi cuenta', icon: 'gear' }] },
    ];
  }
  return [
    { grupo: 'Operación', items: [
      { to: '/hub', label: 'Tablero', icon: 'battery', exact: true, contador: c.activas },
      { to: '/hub/dashboard', label: 'Dashboard', icon: 'gauge' },
      { to: '/hub/historial', label: 'Historial por serie', icon: 'search' },
    ] },
    { grupo: 'Comercial', items: [
      { to: '/hub/clientes', label: 'Clientes', icon: 'users' },
      { to: '/hub/tareas', label: 'Tareas', icon: 'clock', contador: c.tareas },
      { to: '/hub/whatsapp', label: 'WhatsApp', icon: 'mail' },
      { to: '/hub/cotizador', label: 'Cotizador', icon: 'calculator' },
    ] },
    { grupo: 'Taller', items: [
      { to: '/hub/inventario', label: 'Inventario', icon: 'box', contador: c.stockCritico },
      { to: '/hub/tecnicos', label: 'Técnicos', icon: 'users' },
      { to: '/hub/flotillas', label: 'Flotillas', icon: 'building' },
      { to: '/hub/garantias', label: 'Garantías', icon: 'shield', contador: c.porVencer },
      { to: '/hub/baja', label: 'Baja / reciclaje', icon: 'recycl' },
    ] },
    { grupo: 'Sistema', items: [
      { to: '/reportes', label: 'Reportes', icon: 'clipboard' },
      { to: '/usuarios', label: 'Usuarios', icon: 'users' },
      { to: '/hub/papelera', label: 'Papelera', icon: 'recycl' },
      { to: '/settings', label: 'Mi cuenta', icon: 'gear' },
    ] },
  ];
}

// Titulos de las pantallas que no son un item del menu.
const TITULOS_SUELTOS = {
  '/home': ['Plataforma', 'Inicio'],
  '/tracker': ['Seguimiento', 'Orden en el taller'],
  '/cotizacion': ['Seguimiento', 'Cotización'],
};

function tituloDe(ruta, grupos) {
  for (const g of grupos) {
    for (const it of g.items) {
      // Los items `exact` (raices como /hub) no deben "ganarle" a sus sub-rutas.
      const coincide = it.exact ? ruta === it.to : ruta === it.to || ruta.startsWith(`${it.to}/`);
      if (coincide) return { grupo: g.grupo, label: it.label };
    }
  }
  for (const [base, [grupo, label]] of Object.entries(TITULOS_SUELTOS)) {
    if (ruta === base || ruta.startsWith(`${base}/`)) return { grupo, label };
  }
  return { grupo: 'Plataforma', label: 'Bertika' };
}

export default function AppShell({ children }) {
  const user = useStore((s) => s.user);
  const data = useStore((s) => s.data);
  const logout = useStore((s) => s.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false); // drawer en movil
  const [nueva, setNueva] = useState(false);
  const [altas, setAltas] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const [ordenAbierta, setOrdenAbierta] = useState(null);

  const ruta = CANONICO[location.pathname] || location.pathname;
  const esAdmin = user?.rol === 'admin';
  const esFlotilla = data.clientes?.find((c) => c.id === user?.id)?.tipo === 'flotilla_corporativa';
  const c = useMemo(() => contadores(data, user), [data, user]);
  // Sin sesion (el tracker publico entra por aca): menu minimo, sin acciones.
  const grupos = useMemo(() => (user ? menuDe(user.rol, c, esFlotilla) : [
    { grupo: 'Bertika', items: [
      { to: '/', label: 'Sitio', icon: 'home', exact: true },
      { to: '/seguimiento', label: 'Seguimiento', icon: 'search' },
      { to: '/auth', label: 'Acceso', icon: 'user' },
    ] },
  ]), [user, c, esFlotilla]);
  const { grupo, label } = tituloDe(ruta, grupos);

  // El drawer se cierra al cambiar de pantalla y con Escape.
  useEffect(() => { setAbierto(false); }, [location.pathname]);
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  const esActivo = (it) => (it.exact ? ruta === it.to : ruta === it.to || ruta.startsWith(`${it.to}/`));

  // Atajo global Ctrl+K / Cmd+K. No se dispara mientras se escribe en un campo
  // (ahi el atajo se lo deja al navegador) ni en el propio buscador.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 'k') return;
      const t = e.target;
      const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (escribiendo) return;
      e.preventDefault();
      setBuscar((v) => !v);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Abre el detalle de una orden desde la campana o desde el buscador.
  const abrirOrden = (ordenId) => {
    const orden = data.ordenes?.find((o) => o.id === ordenId);
    if (!orden) return;
    setOrdenAbierta(orden);
  };

  const salir = () => { logout(); navigate('/'); };

  return (
    <div className="shell-app">
      <aside className={`shell-side${abierto ? ' open' : ''}`}>
        <div className="shell-brand">
          <Link to="/home" className="brand">
            <span className="logo"><Icon name="bolt" size={20} /></span>
            <span className="shell-brand-t">
              BERTIKA<sup>®</sup>
              <small>Energia bajo control</small>
            </span>
          </Link>
          <button className="shell-side-x" aria-label="Cerrar menú" onClick={() => setAbierto(false)}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <nav className="shell-nav">
          {grupos.map((g) => (
            <div className="shell-grupo" key={g.grupo}>
              <div className="shell-grupo-t">{g.grupo}</div>
              {g.items.map((it) => (
                <Link key={it.to} to={it.to} className={`shell-item${esActivo(it) ? ' on' : ''}`}>
                  <Icon name={it.icon} size={15} />
                  <span className="shell-item-l">{it.label}</span>
                  {it.contador > 0 && <span className="shell-count">{it.contador}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="shell-pie">
          <a className="shell-ayuda" href={CONTACTO.telHrefSoporte}>
            <Icon name="info" size={14} /> Soporte {CONTACTO.telefonoSoporte}
          </a>
          {user ? (
            <div className="shell-user">
              <span className="avatar">{user.nombre?.slice(0, 1) || 'U'}</span>
              <span className="grow">
                <div className="uname">{user.nombre || user.rol}</div>
                <div className="urole">{user.rol}</div>
              </span>
              <button className="btn icon sm" title="Salir" aria-label="Salir" onClick={salir}>
                <Icon name="logout" size={15} />
              </button>
            </div>
          ) : (
            <Link className="btn primary block" to="/auth"><Icon name="user" size={14} /> Acceso</Link>
          )}
        </div>
      </aside>

      {abierto && <div className="shell-back" onClick={() => setAbierto(false)} />}

      <div className="shell-main">
        <header className="shell-top">
          <button className="shell-burger" aria-label="Abrir menú" onClick={() => setAbierto(true)}>
            <span /><span /><span />
          </button>
          <div className="shell-crumb">
            <span className="shell-crumb-g">{grupo}</span>
            <h1 className="shell-title">{label}</h1>
          </div>
          <div className="shell-acciones">
            {esAdmin && (
              <>
                <button className="btn primary sm" onClick={() => setNueva(true)}><Icon name="plus" size={14} /> Nueva orden</button>
                <button className="btn sm" onClick={() => setAltas(true)}><Icon name="users" size={14} /> Altas</button>
              </>
            )}
            {user && (
              <>
                <button
                  className="shell-lupa"
                  aria-label="Buscar"
                  title="Buscar (Ctrl+K)"
                  onClick={() => setBuscar(true)}
                >
                  <Icon name="search" size={16} />
                </button>
                <CentroNotificaciones onAbrirOrden={abrirOrden} />
              </>
            )}
          </div>
        </header>

        <div className="shell-body">{children}</div>
      </div>

      {nueva && (
        <Modal title="Crear orden manual" sub="Registra el ingreso de la bateria al taller" onClose={() => setNueva(false)}>
          <NewOrdenForm onClose={() => setNueva(false)} />
        </Modal>
      )}
      {altas && (
        <Modal title="Altas administrativas" sub="Da de alta clientes, tecnicos e insumos del taller" onClose={() => setAltas(false)}>
          <AltasForm onClose={() => setAltas(false)} />
        </Modal>
      )}

      {/* Busqueda global (Ctrl+K) y detalle de orden abierto desde avisos. */}
      <BusquedaGlobal abierto={buscar} onClose={() => setBuscar(false)} onAbrirOrden={abrirOrden} />
      {ordenAbierta && (
        <Suspense fallback={null}>
          <OrdenDetalle
            orden={ordenAbierta}
            role={user?.rol || 'admin'}
            onClose={() => setOrdenAbierta(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
