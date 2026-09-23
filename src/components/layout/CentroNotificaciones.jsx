import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../store/api';
import { useStore } from '../../store/store';
import { Icon } from '../ui';

// Centro de notificaciones: la campana de la topbar abre un panel con las
// novedades del usuario (la API ya las filtra por rol: admin ve todas, el
// tecnico las de sus ordenes y el cliente las de las suyas).
//
// Al abrir el panel se marcan como leidas con POST /notificaciones/leidas, que
// NO recibe body: el backend resuelve el filtro por usuario en el servidor.

// Iconos por canal. Van locales para no tocar el mapa compartido de ui.jsx.
const TRAZO = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const ICONO_CANAL = {
  whatsapp: <svg width="15" height="15" viewBox="0 0 24 24" {...TRAZO}><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z" /><path d="M8.5 9.5c0 3 2 5 5 5" /></svg>,
  email: <svg width="15" height="15" viewBox="0 0 24 24" {...TRAZO}><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,6 12,13 2,6" /></svg>,
  otro: <svg width="15" height="15" viewBox="0 0 24 24" {...TRAZO}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
};

// Canal normalizado a las claves del mapa de iconos.
export function canalDe(canal) {
  const c = String(canal || '').toLowerCase();
  if (c.includes('whats')) return 'whatsapp';
  if (c.includes('mail') || c.includes('correo')) return 'email';
  return 'otro';
}

// Fecha relativa corta: "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 4 días".
export function fechaRelativa(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const dif = Date.now() - fecha.getTime();
  if (dif < 60000) return 'ahora';
  const min = Math.floor(dif / 60000);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - dia.getTime()) / 86400000);
  if (dias === 0) return `hace ${horas} h`;
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export default function CentroNotificaciones({ onAbrirOrden }) {
  const notificaciones = useStore((s) => s.data.notificaciones);
  const ordenes = useStore((s) => s.data.ordenes);
  const sync = useStore((s) => s.sync);
  const toastShow = useStore((s) => s.toastShow);
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [nuevas, setNuevas] = useState([]); // ids que estaban sin leer al abrir
  const caja = useRef(null);

  const lista = useMemo(() => {
    const arr = Array.isArray(notificaciones) ? [...notificaciones] : [];
    // Mas nuevas primero; si falta la fecha, se mantiene el orden que vino.
    return arr.sort((a, b) => new Date(b?.fecha || 0) - new Date(a?.fecha || 0)).slice(0, 40);
  }, [notificaciones]);

  const noLeidas = (Array.isArray(notificaciones) ? notificaciones : []).filter((n) => !n.leida).length;

  // El panel se cierra al cambiar de pantalla.
  useEffect(() => { setAbierto(false); }, [pathname]);

  // Se cierra con Escape y al hacer clic afuera.
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAbierto(false); };
    const onDown = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [abierto]);

  const marcarLeidas = async () => {
    if (!noLeidas) return;
    setNuevas(lista.filter((n) => !n.leida).map((n) => n.id));
    try {
      await api('/notificaciones/leidas', { method: 'POST' });
      await sync();
    } catch (e) {
      toastShow(e.message || 'No se pudieron marcar como leídas', 'error');
    }
  };

  const alternar = () => {
    const proximo = !abierto;
    setAbierto(proximo);
    if (proximo) marcarLeidas();
  };

  // Borrar una sola notificación (antes solo se podían borrar todas juntas).
  const borrar = async (n) => {
    try {
      await api(`/notificaciones/${n.id}`, { method: 'DELETE' });
      await sync();
    } catch (e) {
      toastShow(e.message || 'No se pudo borrar la notificación', 'error');
    }
  };

  const verOrden = (n) => {
    setAbierto(false);
    if (n?.orden_id) onAbrirOrden?.(n.orden_id);
  };

  const ordenDe = (id) => (Array.isArray(ordenes) ? ordenes.find((o) => o.id === id) : null);

  return (
    <div className="bell-wrap" ref={caja}>
      <button
        className={`shell-bell${noLeidas ? ' on' : ''}`}
        aria-label={`Notificaciones${noLeidas ? `: ${noLeidas} sin leer` : ''}`}
        aria-expanded={abierto}
        title={noLeidas ? `${noLeidas} sin leer` : 'Sin novedades'}
        onClick={alternar}
      >
        <Icon name="bell" size={16} />
        {noLeidas > 0 && <span className="shell-bell-n">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>

      {abierto && (
        <div className="bell-panel" role="dialog" aria-label="Notificaciones">
          <div className="bell-head">
            <b>Notificaciones</b>
            <span className="muted" style={{ fontSize: 12 }}>{noLeidas ? `${noLeidas} sin leer` : 'Al día'}</span>
          </div>

          {lista.length === 0 ? (
            <div className="bell-empty">
              <Icon name="bell" size={22} />
              <div>No tenés notificaciones</div>
              <span className="muted" style={{ fontSize: 12 }}>Cuando pase algo en el taller, lo vas a ver acá.</span>
            </div>
          ) : (
            <div className="bell-lista">
              {lista.map((n) => {
                const orden = ordenDe(n.orden_id);
                const canal = canalDe(n.canal);
                return (
                  <div key={n.id} className="bell-fila">
                    <button
                      className={`bell-item${n.leida ? '' : ' new'}${n.orden_id ? '' : ' sin-link'}`}
                      onClick={n.orden_id ? () => verOrden(n) : undefined}
                    >
                      <span className={`bell-ic ${canal}`}>{ICONO_CANAL[canal]}</span>
                      <span className="bell-txt">
                        <span className="bell-msg">{n.mensaje || 'Novedad'}</span>
                        <span className="bell-sub">
                          {orden ? `${orden.id} · ${orden.bateria_serie}` : (n.canal || 'Sistema')}
                          {n.fecha ? ` · ${fechaRelativa(n.fecha)}` : ''}
                        </span>
                      </span>
                      {nuevas.includes(n.id) && <span className="bell-dot" title="Nueva" />}
                    </button>
                    <button className="bell-x" title="Borrar notificación" onClick={() => borrar(n)}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bell-pie">Se marcan como leídas al abrir el panel</div>
        </div>
      )}
    </div>
  );
}
