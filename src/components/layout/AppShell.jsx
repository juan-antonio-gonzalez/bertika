import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/store';
import { puedeVer } from '../../data/permisos';
import { Icon } from '../ui';
import { AltasForm, NewOrdenForm } from '../AccionesGlobales';
import { contarTareasPendientes } from '../../data/crm.js';
import { CONTACTO } from '../../data/siteData';
import { NUBE_URL } from '../../data/nube';
import { contarCriticos } from '../../data/inventario';
import CentroNotificaciones from './CentroNotificaciones';
import BusquedaGlobal from './BusquedaGlobal';

// El detalle de la orden se carga solo cuando se abre desde una notificacion o
// desde el buscador: no engorda el bundle inicial de la plataforma.
const OrdenDetalle = lazy(() => import('../OrdenDetalle'));

const leerMenuLS = (clave, porDefecto) => {
  try {
    const valor = JSON.parse(localStorage.getItem(clave) || 'null');
    return valor ?? porDefecto;
  } catch {
    return porDefecto;
  }
};

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
  // Sin cartera asignada: el tecnico ve todas las ordenes, no solo las suyas.
  const sinAsignar = ordenes.filter((o) => !o.tecnico_id && ['received', 'diagnosing'].includes(o.estado));
  const delCliente = ordenes.filter((o) => o.cliente_id === user?.id);
  return {
    activas: ordenes.filter(ACTIVAS).length,
    stockCritico: contarCriticos(insumos),
    porVencer,
    miasActivas: ordenes.filter(ACTIVAS).length,
    sinAsignar: sinAsignar.length,
    miasCerradas: ordenes.filter((o) => ['delivered', 'cancelled'].includes(o.estado)).length,
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
        { to: '/tecnico/mis-ordenes', label: 'Órdenes del taller', icon: 'battery', exact: true, contador: c.miasActivas, seccion: 'tablero' },
        { to: '/tecnico/sin-asignar', label: 'Sin asignar', icon: 'warn', contador: c.sinAsignar, seccion: 'tablero' },
        { to: '/tecnico/completadas', label: 'Completadas', icon: 'check', contador: c.miasCerradas, seccion: 'tablero' },
        { to: '/tecnico/tareas', label: 'Mis tareas', icon: 'clock', contador: c.tareas, seccion: 'tareas' },
      ] },
      { grupo: 'Sistema', items: [
        { to: '/settings', label: 'Mi cuenta', icon: 'gear' , seccion: 'mi_cuenta' },
      ] },
    ];
  }
  if (rol === 'cliente') {
    const items = [
      { to: '/cliente/rastreo', label: 'Rastrear batería', icon: 'battery', exact: true, seccion: 'mi_espacio' },
      { to: '/cliente/cotizaciones', label: 'Cotizaciones', icon: 'clipboard', contador: c.cotizaciones, seccion: 'mi_espacio' },
      { to: '/cliente/historial', label: 'Historial', icon: 'clock', contador: c.entregadas, seccion: 'mi_espacio' },
    ];
    if (esFlotilla) items.push({ to: '/cliente/flotilla', label: 'Flotilla', icon: 'building', seccion: 'mi_espacio' });
    items.push({ to: '/cliente/garantias', label: 'Garantías', icon: 'shield', contador: c.garantias, seccion: 'mi_espacio' });
    items.push({ to: '/cliente/agenda', label: 'Agendar visita', icon: 'calendar', seccion: 'mi_espacio' });
    return [
      { grupo: 'Mi espacio', items },
      { grupo: 'Sistema', items: [{ to: '/settings', label: 'Mi cuenta', icon: 'gear' }] , seccion: 'mi_cuenta' },
    ];
  }
  return [
    { grupo: 'Operación', items: [
      { to: '/hub', label: 'Tablero', icon: 'battery', exact: true, contador: c.activas , seccion: 'tablero' },
      { to: '/hub/dashboard', label: 'Dashboard', icon: 'gauge' , seccion: 'dashboard' },
      { to: '/hub/historial', label: 'Historial por serie', icon: 'search' , seccion: 'historial' },
    ] },
    { grupo: 'Comercial', items: [
      { to: '/hub/clientes', label: 'Clientes', icon: 'users' , seccion: 'clientes' },
      { to: '/hub/tareas', label: 'Tareas', icon: 'clock', contador: c.tareas , seccion: 'tareas' },
      { to: '/hub/whatsapp', label: 'WhatsApp', icon: 'mail' , seccion: 'whatsapp' },
      { to: '/hub/cotizador', label: 'Cotizador', icon: 'calculator' , seccion: 'cotizador' },
    ] },
    { grupo: 'Taller', items: [
      { to: '/hub/inventario', label: 'Inventario', icon: 'box', contador: c.stockCritico , seccion: 'inventario' },
      { to: '/hub/tecnicos', label: 'Técnicos', icon: 'users' , seccion: 'tecnicos' },
      { to: '/hub/flotillas', label: 'Flotillas', icon: 'building' , seccion: 'flotillas' },
      { to: '/hub/garantias', label: 'Garantías', icon: 'shield', contador: c.porVencer , seccion: 'garantias' },
      { to: '/hub/baja', label: 'Baja / reciclaje', icon: 'recycl' , seccion: 'baja' },
    ] },
    { grupo: 'Sistema', items: [
      { to: '/reportes', label: 'Reportes', icon: 'clipboard' , seccion: 'reportes' },
      { to: '/usuarios', label: 'Usuarios', icon: 'users' , seccion: 'usuarios' },
      { to: '/hub/papelera', label: 'Papelera', icon: 'recycl' , seccion: 'papelera' },
      { to: '/respaldos', label: 'Respaldos', icon: 'shield' , seccion: 'respaldos' },
      { to: '/sistema', label: 'Salud y auditoría', icon: 'gauge' , seccion: 'sistema' },
      { to: '/settings', label: 'Mi cuenta', icon: 'gear' , seccion: 'mi_cuenta' },
    ] },
  ];
}

// Titulos de las pantallas que no son un item del menu.
const TITULOS_SUELTOS = {
  '/home': ['Plataforma', 'Inicio'],
  '/listas': ['Listas', 'Listas'],
  '/tracker': ['Seguimiento', 'Orden en el taller'],
  '/cotizacion': ['Seguimiento', 'Cotización'],
};

// Deja solo las secciones que el usuario tiene habilitadas por sus permisos.
function filtrarMenu(grupos, usuario) {
  return grupos
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.seccion || puedeVer(usuario, it.seccion)) }))
    .filter((g) => g.items.length > 0);
}

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
  const [gruposCerrados, setGruposCerrados] = useState(() => leerMenuLS('bertika-menu-grupos', {}));
  const [favoritos, setFavoritos] = useState(() => leerMenuLS('bertika-menu-favs', []));
  const [recientes, setRecientes] = useState(() => leerMenuLS('bertika-menu-recientes', []));
  const [qMenu, setQMenu] = useState('');

  const ruta = CANONICO[location.pathname] || location.pathname;
  const esAdmin = user?.rol === 'admin';
  const esFlotilla = data.clientes?.find((c) => c.id === user?.id)?.tipo === 'flotilla_corporativa';
  const c = useMemo(() => contadores(data, user), [data, user]);
  // Sin sesion (el tracker publico entra por aca): menu minimo, sin acciones.
  const grupos = useMemo(() => (user ? (() => {
      const propios = filtrarMenu(menuDe(user.rol, c, esFlotilla), user);
      if (user.rol !== 'tecnico') return propios;
      // Un tecnico tambien ve las secciones del taller que el admin le habilito
      // por permisos (inventario, clientes, whatsapp...), sin repetir las suyas.
      const yaEstan = new Set(propios.flatMap((g) => g.items.map((i) => i.seccion)));
      const extra = filtrarMenu(menuDe('admin', c, esFlotilla), user)
        .map((g) => ({ ...g, items: g.items.filter((i) => !yaEstan.has(i.seccion)) }))
        .filter((g) => g.items.length > 0);
      return [...propios, ...extra];
    })() : [
    { grupo: 'Bertika', items: [
      { to: '/', label: 'Sitio', icon: 'home', exact: true },
      { to: '/seguimiento', label: 'Seguimiento', icon: 'search' },
      { to: '/auth', label: 'Acceso', icon: 'user' },
    ] },
  ]), [user, c, esFlotilla]);
  // Áreas y listas visibles: el menú se arma con lo que devuelve /estado
  // según la categoría. Para el admin vienen todas.
  const gruposConAreas = useMemo(() => {
    const areas = data.areas || [];
    if (!user || user.rol === 'cliente' || !areas.length) return grupos;
    const grupoListas = {
      grupo: 'Listas',
      items: areas.map((a) => ({
        to: `/listas/${a.slug}`,
        label: a.nombre,
        icon: a.icono || 'clipboard',
        subitems: (a.listas || []).map((l) => ({
          to: `/listas/${a.slug}/${l.id}`,
          label: l.nombre,
          icon: l.icono || 'clipboard',
        })),
      })),
    };
    // Antes de Sistema: las áreas son trabajo diario; Configuración queda al final.
    const indiceSistema = grupos.findIndex((g) => g.grupo === 'Sistema');
    if (indiceSistema < 0) return [...grupos, grupoListas];
    const salida = [...grupos];
    salida.splice(indiceSistema, 0, grupoListas);
    return salida;
  }, [grupos, data.areas, user]);

  useEffect(() => { localStorage.setItem('bertika-menu-grupos', JSON.stringify(gruposCerrados)); }, [gruposCerrados]);
  useEffect(() => { localStorage.setItem('bertika-menu-favs', JSON.stringify(favoritos)); }, [favoritos]);
  useEffect(() => { localStorage.setItem('bertika-menu-recientes', JSON.stringify(recientes)); }, [recientes]);

  const itemsMenu = useMemo(() => {
    const salida = [];
    for (const g of gruposConAreas) {
      for (const it of g.items) {
        salida.push({ ...it, _grupo: g.grupo });
        for (const sub of it.subitems || []) salida.push({ ...sub, _grupo: g.grupo, _padre: it.label });
      }
    }
    return salida;
  }, [gruposConAreas]);

  useEffect(() => {
    if (!user) return;
    const item = itemsMenu.find((i) => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(`${i.to}/`)));
    if (!item) return;
    setRecientes((prev) => {
      const siguiente = [item.to, ...prev.filter((x) => x !== item.to)].slice(0, 5);
      localStorage.setItem('bertika-menu-recientes', JSON.stringify(siguiente));
      return siguiente;
    });
  }, [location.pathname, user, itemsMenu]);

  const toggleGrupo = (nombre) => setGruposCerrados((prev) => ({ ...prev, [nombre]: !prev[nombre] }));
  const toggleFavorito = (to) => setFavoritos((prev) => (prev.includes(to) ? prev.filter((x) => x !== to) : [...prev, to]));
  const itemsFavoritos = favoritos.map((to) => itemsMenu.find((i) => i.to === to)).filter(Boolean);
  const itemsRecientes = recientes.map((to) => itemsMenu.find((i) => i.to === to)).filter(Boolean);
  const gruposFiltrados = useMemo(() => {
    const q = qMenu.trim().toLowerCase();
    if (!q) return gruposConAreas;
    return gruposConAreas.map((g) => {
      const items = g.items.map((it) => {
        const coincidePadre = String(it.label || '').toLowerCase().includes(q);
        const subitems = (it.subitems || []).filter((sub) => String(sub.label || '').toLowerCase().includes(q));
        if (!coincidePadre && subitems.length === 0) return null;
        return { ...it, subitems: coincidePadre ? it.subitems : subitems };
      }).filter(Boolean);
      return { ...g, items };
    }).filter((g) => g.items.length > 0);
  }, [gruposConAreas, qMenu]);

  const renderItemMenu = (it, prefijo) => (
    <div key={`${prefijo}-${it.to}`}>
      <div className="shell-item-wrap">
        <Link to={it.to} className={`shell-item${esActivo(it) ? ' on' : ''}`}>
          <Icon name={it.icon} size={15} />
          <span className="shell-item-l">{it.label}</span>
          {it.contador > 0 && <span className="shell-count">{it.contador}</span>}
        </Link>
        <button
          type="button"
          className={`shell-fav${favoritos.includes(it.to) ? ' on' : ''}`}
          onClick={() => toggleFavorito(it.to)}
          title={favoritos.includes(it.to) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          aria-label={favoritos.includes(it.to) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          ★
        </button>
      </div>
      {it.subitems?.length > 0 && (
        <div className="shell-subitems">
          {it.subitems.map((sub) => (
            <Link key={sub.to} to={sub.to} className={`shell-subitem${ruta === sub.to ? ' on' : ''}`}>
              <Icon name={sub.icon} size={12} />
              <span>{sub.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
  const { grupo, label } = tituloDe(ruta, gruposConAreas);

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
          <div className="shell-menu-search">
            <Icon name="search" size={14} />
            <input
              value={qMenu}
              onChange={(e) => setQMenu(e.target.value)}
              placeholder="Buscar en el menú..."
              aria-label="Buscar en el menú"
            />
            {qMenu && <button type="button" onClick={() => setQMenu('')} aria-label="Limpiar búsqueda">✕</button>}
          </div>

          {!qMenu && itemsFavoritos.length > 0 && (
            <div className="shell-grupo shell-grupo-fav">
              <div className="shell-grupo-t">Favoritos</div>
              {itemsFavoritos.map((it) => renderItemMenu(it, 'fav'))}
            </div>
          )}

          {!qMenu && itemsRecientes.length > 0 && (
            <div className="shell-grupo">
              <div className="shell-grupo-t">Recientes</div>
              {itemsRecientes.map((it) => renderItemMenu(it, 'rec'))}
            </div>
          )}

          {gruposFiltrados.map((g) => {
            const cerrado = !qMenu && Boolean(gruposCerrados[g.grupo]);
            return (
              <div className="shell-grupo" key={g.grupo}>
                <button
                  type="button"
                  className={`shell-grupo-t${cerrado ? ' closed' : ''}`}
                  onClick={() => toggleGrupo(g.grupo)}
                  aria-expanded={!cerrado}
                  title={cerrado ? `Mostrar ${g.grupo}` : `Ocultar ${g.grupo}`}
                >
                  <span>{g.grupo}</span>
                  <span className="shell-chevron">{cerrado ? '+' : '−'}</span>
                </button>
                {!cerrado && g.items.map((it) => renderItemMenu(it, g.grupo))}
              </div>
            );
          })}

          {qMenu && gruposFiltrados.length === 0 && (
            <div className="shell-menu-empty">No hay opciones para “{qMenu}”.</div>
          )}
          {/* Acceso directo a la nube de archivos (OpenCloud). Es un enlace
              externo: no suma una seccion de permisos porque los permisos
              reales los aplica OpenCloud con el usuario de cada persona. */}
          {user && user.rol !== 'cliente' && (
            <div className="shell-grupo">
              <div className="shell-grupo-t">Archivos</div>
              <a
                className="shell-item"
                href={NUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir la nube de archivos en una pestaña nueva"
              >
                <Icon name="folder" size={15} />
                <span className="shell-item-l">Nube de archivos</span>
                <Icon name="external" size={12} style={{ marginLeft: 'auto', opacity: 0.65 }} />
              </a>
            </div>
          )}
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
          <div id="shell-page-head" className="shell-page-head" />
          <div className="shell-acciones">
            <div id="shell-page-actions" className="shell-page-actions" />
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

      {nueva && <NewOrdenForm onClose={() => setNueva(false)} />}
      {altas && <AltasForm onClose={() => setAltas(false)} />}

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
