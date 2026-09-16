import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EstadoPill, Icon, fmtARS, fmtDate } from '../components/ui';
import { api } from '../store/api';

export default function CotizacionPublica() {
  const { orden_id } = useParams();
  const [search] = useSearchParams();
  const t = search.get('t') || '';
  const [orden, setOrden] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = () => {
    setError(null);
    setOrden(null);
    api(`/public/cotizacion/${encodeURIComponent(orden_id)}?t=${encodeURIComponent(t)}`)
      .then(setOrden)
      .catch((e) => setError(e.message));
  };

  useEffect(cargar, [orden_id, t]);

  const decidir = async (accion) => {
    setCargando(true);
    try {
      await api(`/ordenes/${orden_id}/cotizacion/${accion}?t=${encodeURIComponent(t)}`, { method: 'POST' });
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  if (!t) {
    return (
      <section className="sec">
        <div className="wrap center">
          <div className="empty"><div className="big"><Icon name="clipboard" size={40} /></div>Acceso restringido: usá el enlace que te envió el taller.</div>
          <Link to="/" className="btn">Volver al inicio</Link>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sec">
        <div className="wrap center">
          <div className="empty"><div className="big"><Icon name="clipboard" size={40} /></div>{error}</div>
          <Link to="/" className="btn">Volver al inicio</Link>
        </div>
      </section>
    );
  }

  if (!orden) {
    return (
      <section className="sec">
        <div className="wrap center">
          <div className="empty"><div className="big"><Icon name="clipboard" size={40} /></div>Cargando cotizacion...</div>
        </div>
      </section>
    );
  }

  const bateria = orden.bateria;
  const cliente = orden.cliente;
  const cot = orden.cotizacion;
  const yaDecidida = orden.estado_cotizacion === 'approved' || orden.estado_cotizacion === 'rejected' || orden.estado === 'approved' || orden.estado === 'cancelled';

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-bg"><img src="/img/slide00-drop.jpg" alt="" /></div>
        <div className="wrap">
          <h1>Cotizacion</h1>
          <div className="breadcrumb"><Link to="/">Home</Link> / Cotizacion {orden.id}</div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap" style={{ maxWidth: 720 }}>
          <div className="card" style={{ padding: 28 }}>
            <div className="row between">
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Orden</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--blue)' }}>{orden.id}</div>
              </div>
              <EstadoPill estado={orden.estado} />
            </div>

            <hr className="divider" />

            <div className="grid2">
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Cliente</div>
                <div style={{ fontWeight: 700 }}>{cliente?.nombre || '—'}</div>
                <div className="muted">{cliente?.email || ''}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Bateria</div>
                <div style={{ fontWeight: 700 }}>{orden.bateria_serie}</div>
                <div className="muted">{bateria ? `${bateria.tipo} · ${bateria.voltaje} · ${bateria.capacidad} Ah` : ''}</div>
              </div>
            </div>

            <div className="card" style={{ background: 'var(--bg-3)', marginTop: 18 }}>
              {!cot && <p className="muted">Sin detalle de cotizacion cargado.</p>}
              {cot && (
                <>
                  <ul className="ulist">
                    {(cot.servicios_costos || []).map((s, i) => (
                      <li key={i}><span>{s.nombre}</span><span className="mono">{fmtARS(s.monto)}</span></li>
                    ))}
                    {(cot.insumos || []).map((s, i) => (
                      <li key={i}><span>{s.nombre} x{s.cantidad}</span><span className="mono">{fmtARS(s.precio * s.cantidad)}</span></li>
                    ))}
                  </ul>
                  <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    <b style={{ fontSize: 15 }}>Total</b>
                    <b style={{ color: 'var(--amber)', fontSize: 22 }}>{fmtARS(cot.monto)}</b>
                  </div>
                </>
              )}
            </div>

            {orden.estado_cotizacion === 'rejected' || orden.estado === 'cancelled' ? (
              <div className="banner-red" style={{ marginTop: 18 }}><Icon name="x" size={15} /> Esta cotizacion fue rechazada / cancelada.</div>
            ) : yaDecidida ? (
              <div className="banner-green" style={{ marginTop: 18 }}><Icon name="check" size={15} /> Cotizacion aprobada. Tu bateria esta en proceso de reparacion.</div>
            ) : (
              <>
                <div className="banner-warn" style={{ marginTop: 18 }}>
                  <Icon name="info" size={15} /> Revisa el detalle y aproba o rechaza el servicio. No necesitas cuenta.
                </div>
                <div className="grid2 mt8" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <button className="btn primary lg" disabled={cargando} onClick={() => decidir('aprobar')}>
                    <Icon name="check" size={16} /> Aprobar cotizacion
                  </button>
                  <button className="btn danger lg" disabled={cargando} onClick={() => decidir('rechazar')}>
                    <Icon name="x" size={16} /> Rechazar
                  </button>
                </div>
              </>
            )}

            <div className="center mt24">
              <Link to={`/tracker/${orden.id}`} className="btn">Ver seguimiento de {orden.bateria_serie}</Link>
            </div>
            <div className="center muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              {orden.fecha_ingreso ? `Ingreso: ${fmtDate(orden.fecha_ingreso)}` : ''}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}