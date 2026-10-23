import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store/store';
import { api } from '../store/api';
import { EstadoPill, ProgressTracker, Icon, fmtFecha, fmtDate, Timeline } from '../components/ui';

function fmtCodigo(codigo) {
  const d = String(codigo || '').replace(/\D/g, '').slice(0, 16);
  if (!d) return '';
  return d.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

// Seguimiento publico de una orden.
//
// Esta pantalla se ve SIEMPRE como la ve el cliente, aunque haya una sesion
// abierta (admin, tecnico o cliente). Por eso:
//  - trae los datos SOLO del endpoint publico (`/public/ordenes/:codigo`), que
//    no devuelve datos internos (tecnico, montos, autor de cada evento...);
//  - no se muestra dentro del panel de la plataforma (no lleva AppShell);
//  - no usa las ordenes que el store tenga cargadas: esas son la fila interna
//    completa y no lo que debe ver un cliente.
export default function Tracker() {
  const { orden_id } = useParams();
  const user = useStore((s) => s.user);
  const [orden, setOrden] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // El codigo puede venir con guiones o solo digitos: se normaliza a 16.
  const codigo = String(orden_id || '').replace(/\D/g, '').slice(0, 16);

  useEffect(() => {
    let vigente = true;
    setOrden(null);
    setError('');
    if (codigo.length !== 16) {
      setCargando(false);
      setError('El código de seguimiento tiene 16 dígitos. Está en el comprobante que te dio el taller.');
      return () => { vigente = false; };
    }
    setCargando(true);
    api(`/public/ordenes/${encodeURIComponent(codigo)}`)
      .then((o) => {
        if (!vigente) return;
        setOrden(o);
        setCargando(false);
      })
      .catch((e) => {
        if (!vigente) return;
        setError(e.message || 'No se pudo buscar la orden');
        setCargando(false);
      });
    return () => { vigente = false; };
  }, [codigo]);

  if (cargando) {
    return (
      <div className="wrap page center">
        <div className="empty"><div className="big"><Icon name="battery" size={40} /></div>Cargando...</div>
      </div>
    );
  }

  if (!orden) {
    return (
      <div className="wrap page">
        <div className="center mb8">
          <div className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>
            <span className="logo"><Icon name="bolt" size={16} /></span>
            Bertika
          </div>
          <p className="muted" style={{ margin: 0 }}>Seguimiento público · sin necesidad de cuenta</p>
        </div>
        <div className="card mt16 center" style={{ maxWidth: 560, margin: '16px auto' }}>
          <div className="big" style={{ marginBottom: 8 }}><Icon name="warn" size={32} /></div>
          <h3 className="card-title" style={{ justifyContent: 'center' }}>No encontramos esa orden</h3>
          <p className="muted" style={{ fontSize: 13 }}>{error || 'Revisá el código del comprobante.'}</p>
          <Link to="/seguimiento" className="btn primary mt8"><Icon name="search" size={14} /> Buscar otro código</Link>
          <div style={{ marginTop: 10 }}>
            <Link to="/" className="btn sm ghost">Volver al inicio</Link>
          </div>
        </div>
      </div>
    );
  }

  const bateria = orden.bateria || null;
  const cliente = orden.cliente || null;
  const ultimoEv = Array.isArray(orden.eventos) ? orden.eventos[orden.eventos.length - 1] : null;

  return (
    <div className="wrap page">
      <div className="center mb8">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>
          <span className="logo"><Icon name="bolt" size={16} /></span>
          Bertika
        </div>
        <p className="muted" style={{ margin: 0 }}>Seguimiento público · sin necesidad de cuenta</p>
      </div>

      <div className="card mt16" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <span className="serie" style={{ fontWeight: 800, fontSize: 18 }}>{orden.bateria_serie}</span>
            <span className="chip" style={{ marginLeft: 8 }}>{bateria?.aplicacion || '—'}</span>
            <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              {bateria ? `${bateria.tipo} · ${bateria.voltaje} · ${bateria.capacidad}Ah · ${bateria.equipo}` : 'Tipo de equipo no especificado'}
            </div>
            {cliente && <div className="muted" style={{ fontSize: 12.5 }}>Cliente: {cliente}</div>}
            {orden.codigo && (
              <div className="chip" style={{ marginTop: 6, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(255,176,32,0.4)' }}>
                <Icon name="clipboard" size={12} /> Código de seguimiento: <span className="mono">{fmtCodigo(orden.codigo) || fmtCodigo(codigo)}</span>
              </div>
            )}
          </div>
          <EstadoPill estado={orden.estado} />
        </div>

        <ProgressTracker orden={orden} />

        <div className="grid2 mt16" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card" style={{ background: 'var(--bg-3)', padding: 12 }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Ultimo evento</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{ultimoEv?.detalle}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{fmtFecha(ultimoEv?.fecha)}</div>
          </div>
          <div className="card" style={{ background: 'var(--bg-3)', padding: 12 }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Hora estimada de entrega</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--amber)', marginTop: 4 }}>{fmtDate(orden.hora_entrega)}</div>
            {orden.estado === 'ready' && <div className="badge green" style={{ marginTop: 6 }}>Lista para recogida</div>}
            {orden.estado === 'delivered' && <div className="badge green" style={{ marginTop: 6 }}>Entregada</div>}
          </div>
        </div>

        <details style={{ marginTop: 14, borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
          <summary className="muted" style={{ fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Historial de eventos</summary>
          {/* Sin autor: quien hizo cada paso es informacion interna del taller. */}
          <div className="mt8"><Timeline eventos={orden.eventos} autor={false} /></div>
        </details>

        <div className="center mt24 row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/seguimiento" className="btn"><Icon name="search" size={14} /> Buscar otro código</Link>
          {user && <Link to="/home" className="btn sm"><Icon name="gear" size={13} /> Ir a la plataforma</Link>}
          <Link to="/" className="btn sm ghost"><Icon name="bolt" size={13} /> Ir al taller</Link>
        </div>
      </div>
    </div>
  );
}
