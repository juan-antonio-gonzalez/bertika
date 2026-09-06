import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore, SEED_VERSION } from '../store/store';
import { ESTADO_LABEL, STATUS_STEP_INDEX, TRACKER_STEPS } from '../data/seed';

/* ---------------- Icons (energy/electric themed) ---------------- */
const S = {
  bolt: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" /></svg>,
  battery: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="16" height="9" rx="2" /><line x1="22" y1="11" x2="22" y2="14" /><line x1="6" y1="11" x2="6" y2="14" /></svg>,
  volt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>,
  gauge: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14l3.5-4.5" /><path d="M4 17a8 8 0 1 1 16 0" /><circle cx="12" cy="17" r="1" fill="currentColor" /></svg>,
  tools: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3.4 3.4-3-3 3.4-3.4z" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  warn: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  recycl: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L7 9" /><path d="M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7L13.6 5.3" /><path d="M9 3l2-1 3 4" /><path d="M5 15l1-3-3-1" /></svg>,
  users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  box: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" /></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>,
  gear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  logout: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  clipboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>,
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  truck: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  factory: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M4 20V8l6 4V8l6 4V4h4v16" /></svg>,
  ship: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 21a2 2 0 0 1 1.41-1.83L22 15l-3 4-2 2-1-1-1 1-1-1-1 1-1-1-1 1-1-1-1 1H2z" /><path d="M2 21v-6m0 0 7-2-7-4m0 0V5h5l2 3 3-2 2 2" /></svg>,
  train: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="14" rx="2" /><path d="M4 11h16" /><circle cx="8" cy="19" r="2" /><circle cx="16" cy="19" r="2" /><path d="M8 21 6 24M16 21l2 3" /></svg>,
  car: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11 7 6a2 2 0 0 1 1.9-1h6.2A2 2 0 0 1 17 6l2 5" /><path d="M5 11h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="16.5" cy="18" r="1.5" /></svg>,
  droplet: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" /></svg>,
  flame: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>,
  user: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  info: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  building: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></svg>,
};

export const Icon = ({ name, size = 16, style }) => (
  <span style={{ display: 'inline-flex', width: size + 2, height: size + 2, ...style }}>{S[name] || S.bolt}</span>
);

export function AppIcon({ type, size = 16 }) {
  const map = {
    Automotriz: 'car',
    Autoelevador: RampIcon(size),
    Ferroviario: 'train',
    'Industrial/UPS': 'building',
    Marino: 'ship',
  };
  return <Icon name={map[type] || 'bolt'} size={size} />;
}

export function RampIcon(size) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18 21 6M3 18h18V9" />
      <path d="M6 18l7-6" />
    </svg>
  );
}

export function EstadoPill({ estado }) {
  const map = {
    received: ['amber', 'Recibida'],
    diagnosing: ['blue', 'Diagnostico'],
    quoted: ['amber', 'Cotizada'],
    approved: ['amber', 'Aprobada'],
    in_repair: ['orange', 'En reparacion'],
    testing: ['blue', 'Prueba final'],
    ready: ['green', 'Lista'],
    delivered: ['gray', 'Entregada'],
    cancelled: ['red', 'Cancelada'],
  };
  const [cls, label] = map[estado] || ['gray', estado];
  const ic = {
    received: 'battery', diagnosing: 'volt', quoted: 'clipboard', approved: 'check',
    in_repair: 'tools', testing: 'gauge', ready: 'check', delivered: 'truck', cancelled: 'x',
  }[estado];
  return (
    <span className={`badge ${cls}`}>
      <Icon name={ic} size={12} />
      {label}
    </span>
  );
}

export function EstadoStepIndex(estado) {
  return STATUS_STEP_INDEX[estado] ?? 0;
}

/* ---------------- Progress tracker ---------------- */
export function ProgressTracker({ orden, ordenesAnteriores }) {
  const eventos = orden.eventos || [];
  const pasoFechas = {};
  for (const ev of eventos) {
    const idx = {
      ingreso: 'received',
      diagnostico: 'diagnosing',
      cotizacion: 'quoted',
      aprobada: 'approved',
      reparacion: 'in_repair',
      prueba_iniciada: 'testing',
      prueba_aprobada: 'ready',
      entregada: 'delivered',
    }[ev.tipo];
    if (idx && !pasoFechas[idx]) pasoFechas[idx] = ev.fecha;
  }
  const currentIdx = STATUS_STEP_INDEX[orden.estado];
  const hist = ordenesAnteriores || [];
  void currentIdx;
  return (
    <div className="tracker">
      {TRACKER_STEPS.map((step, i) => {
        const done = (pasoFechas[step.key] || i <= currentIdx) && orden.estado !== 'cancelled';
        const date = pasoFechas[step.key] || (i === 0 && orden.fecha_ingreso);
        const pasoHist = hist.filter((o) => o.bateria_serie === orden.bateria_serie).length;
        void pasoHist;
        return (
          <div key={step.key} className={`tstep ${done ? 'done' : ''}`}>
            <div className="ic"><Icon name={done ? 'check' : 'bolt'} size={14} /></div>
            <div className="tl" />
            <div className="label">{step.label}</div>
            <div className="date">{date ? fmtDate(date) : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Toast ---------------- */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const hide = useStore((s) => s.toastHide);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => hide(), 3400);
    return () => clearTimeout(t);
  }, [toast, hide]);
  if (!toast) return null;
  const ics = { ok: 'check', error: 'x', warn: 'warn' };
  return (
    <div className="toast-wrap">
      <div key={toast.id} className={`toast ${toast.tipo}`}>
        <span className="t-ic"><Icon name={ics[toast.tipo]} size={18} /></span>
        {toast.msg}
      </div>
    </div>
  );
}

/* ---------------- App shell / navbar ---------------- */
export function Shell() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const reset = useStore((s) => s.reset);
  const toastShow = useStore((s) => s.toastShow);
  const location = useLocation();
  const navigate = useNavigate();

  const isAuth = location.pathname === '/auth';
  const onLanding = location.pathname === '/';

  if (isAuth) return null;

  const resetDemo = () => {
    reset();
    toastShow('Demo restablecida al estado inicial', 'ok');
    navigate('/');
  };

  const dest = (rol) => ({ admin: '/hub', tecnico: '/tecnico', cliente: '/cliente' }[rol]);

  return (
    <header className="shell">
      <div className="shell-inner">
        <Link to="/" className="brand">
          <span className="logo"><Icon name="bolt" size={20} /></span>
          <span>
            Vertika
            <small>Energia bajo control</small>
          </span>
        </Link>
        <nav className="nav">
          {!user ? (
            <>
              {!onLanding && <Link to="/"><Icon name="home" size={14} />Inicio</Link>}
              <Link to="/auth"><Icon name="user" size={14} />Acceso</Link>
            </>
          ) : (
            <>
              <Link to={dest(user.rol)} className={location.pathname.startsWith(dest(user.rol)) ? 'active' : ''}>
                {user.rol === 'admin' ? 'Hub' : user.rol === 'tecnico' ? 'Operativo' : 'Mi espacio'}
              </Link>
              {user.rol === 'admin' && <Link to="/hub" className={location.pathname === '/hub' ? 'active' : ''}>Panel</Link>}
              <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}><Icon name="gear" size={14} />Ajustes</Link>
              <button onClick={resetDemo} title="Restablecer datos demo (v{SEED_VERSION})"><Icon name="refresh" size={14} />Reset demo</button>
              <button onClick={() => { logout(); navigate('/'); }}><Icon name="logout" size={14} />Salir</button>
              <span className="userchip" style={{ marginLeft: 4 }}>
                <span className="avatar">{user.nombre?.slice(0, 1) || 'U'}</span>
                <span>
                  <div className="uname">{user.nombre || user.rol}</div>
                  <div className="urole">{user.rol}</div>
                </span>
              </span>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ title, sub, onClose, children }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between mb16">
          <div>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="btn icon sm" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- OrderCard (kanban / list) ---------------- */
export function OrdenCard({ orden, onOpen }) {
  const cliente = useStore((s) => s.data.clientes.find((c) => c.id === orden.cliente_id));
  const tecnico = useStore((s) => s.data.tecnicos.find((t) => t.id === orden.tecnico_id));
  const bateria = useStore((s) => s.data.baterias.find((b) => b.numero_serie === orden.bateria_serie));
  const esCritico = orden.prueba_final?.estado === 'failed';
  return (
    <div className="kcard" onClick={() => onOpen && onOpen(orden)}>
      <div className="row between">
        <span className="serie"><Icon name={bateria ? appIconName(bateria.aplicacion) : 'battery'} size={13} />{orden.bateria_serie}</span>
        <EstadoPill estado={orden.estado} />
      </div>
      {esCritico && (
        <div style={{ marginTop: 8 }} className="alerta">
          Prueba final fallida: requiere reproceso
        </div>
      )}
      <div className="meta">
        <span>{bateria ? `${bateria.tipo} ${bateria.voltaje} ${bateria.capacidad}Ah` : ''}</span>
        <span>{cliente?.nombre || '—'}</span>
        {tecnico && <span>Tecnico: {tecnico.nombre}</span>}
        <span>Ingreso: {fmtDate(orden.fecha_ingreso)}</span>
      </div>
      <div className="foot">
        {orden.cotizacion?.monto ? <span className="monto">${orden.cotizacion.monto.toLocaleString('es-MX')} MXN</span> : <span />}
        <span className="muted" style={{ fontSize: 11 }}>{fmtTiempo(orden.fecha_ingreso)}</span>
      </div>
    </div>
  );
}

export function appIconName(aplicacion) {
  return { Automotriz: 'car', Autoelevador: 'truck', Ferroviario: 'train', 'Industrial/UPS': 'building', Marino: 'ship' }[aplicacion] || 'battery';
}

/* ---------------- Escudo de estadidad: formatters ---------------- */
export function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return (same ? 'Hoy ' : '') + d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtFecha(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtTiempo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return 'ahora';
  const h = diff / 3600000;
  if (h < 1) return `hace ${Math.round(diff / 60000)}m`;
  if (h < 24) return `hace ${Math.round(h)}h`;
  return `hace ${Math.round(h / 24)}d`;
}

export function fmtMXN(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX');
}

export function estLabel(key) {
  return ESTADO_LABEL[key] || key;
}

/* ---------------- Modal estado orden bonus: timeline ---------------- */
export function Timeline({ eventos }) {
  if (!eventos) return null;
  const tipos = {
    ingreso: ['battery', 'amber'], diagnostico: ['volt', 'blue'], cotizacion: ['clipboard', 'amber'],
    aprobada: ['check', 'green'], reparacion: ['tools', 'orange'], insumo: ['box', 'amber'],
    prueba_iniciada: ['gauge', 'blue'], prueba_aprobada: ['check', 'green'], prueba_fallida: ['x', 'red'],
    reparacion_completada: ['check', 'green'], entregada: ['truck', 'green'], cancelada: ['x', 'red'],
    asignacion: ['users', 'blue'], baja: ['recycl', 'red'],
  };
  return (
    <div className="col" style={{ gap: 0 }}>
      {[...(eventos || [])].reverse().map((ev, i) => {
        const [ic, color] = tipos[ev.tipo] || ['info', 'amber'];
        return (
          <div key={ev.id} className="row" style={{ alignItems: 'flex-start', padding: '9px 0', borderBottom: i < eventos.length - 1 ? '1px solid var(--line-soft)' : 'none', gap: 10 }}>
            <span className="chip" style={{ color: `var(--${color})`, fontSize: 12 }}><Icon name={ic} size={13} /></span>
            <div className="grow">
              <div style={{ fontSize: 13 }}>{ev.detalle}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{fmtFecha(ev.fecha)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Boton reset (standalone) ---------------- */
export function ResetDemoBtn({ compact }) {
  const reset = useStore((s) => s.reset);
  const toastShow = useStore((s) => s.toastShow);
  const navigate = useNavigate();
  return (
    <button
      className={`btn danger sm ${compact ? '' : ''}`}
      onClick={() => { reset(); toastShow('Demo restablecida', 'ok'); navigate('/'); }}
      title={`Restablecer datos demo (v${SEED_VERSION})`}
    >
      <Icon name="refresh" size={13} />
      Restablecer demo
    </button>
  );
}