import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon, fmtARS, fmtFecha } from '../components/ui';
import { api } from '../store/api';

export default function CotizacionVenta() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState('');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [hecho, setHecho] = useState('');

  const cargar = async () => {
    try { setData(await api(`/public/cotizacion-venta/${token}`, { publico: true })); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { cargar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const decidir = async (estado) => {
    setBusy(true); setError('');
    try {
      await api(`/public/cotizacion-venta/${token}`, { method: 'POST', body: { decision: estado, motivo }, publico: true });
      setHecho(estado); setData((d) => d ? { ...d, cotizacion: { ...d.cotizacion, estado } } : d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !data) return <div className="wrap page center" style={{ minHeight: '60vh' }}><p className="banner-red">{error}</p></div>;
  if (!data) return <div className="wrap page center" style={{ minHeight: '60vh' }}><span className="spinner" /></div>;

  const q = data.cotizacion;
  const cerrada = ['aceptada', 'rechazada', 'vencida'].includes(q.estado) || hecho;
  return (
    <div className="wrap page" style={{ maxWidth: 820 }}>
      <div className="card">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>Cotización Bertika</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 24 }}>{data.oportunidad?.titulo || 'Propuesta comercial'}</h1>
            <p className="muted" style={{ margin: '4px 0 0' }}>{data.cliente?.nombre || data.oportunidad?.prospecto_nombre || ''}</p>
          </div>
          <span className={`badge ${q.estado === 'aceptada' ? 'green' : q.estado === 'rechazada' ? 'red' : 'amber'}`}>{q.estado}</span>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Versión {q.version} · {fmtFecha(q.creado_en)} · Validez {q.validez_dias} días</p>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Desc.</th><th className="num">Total</th></tr></thead>
            <tbody>{data.items.map((it, i) => <tr key={i}><td>{it.descripcion}</td><td className="num">{it.cantidad}</td><td className="num">{fmtARS(it.precio_unitario)}</td><td className="num">{fmtARS(it.descuento)}</td><td className="num"><b>{fmtARS(it.total)}</b></td></tr>)}</tbody>
          </table>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 4, marginTop: 12 }}>
          <div className="muted">Subtotal: {fmtARS(q.subtotal)}</div>
          {Number(q.descuento) > 0 && <div className="muted">Descuento: -{fmtARS(q.descuento)}</div>}
          {Number(q.iva_pct) > 0 && <div className="muted">IVA {q.iva_pct}%</div>}
          <div style={{ fontSize: 22, fontWeight: 800 }}>Total: {fmtARS(q.total)}</div>
        </div>
        {!cerrada ? (
          <div className="card" style={{ marginTop: 16, background: 'var(--bg-3)' }}>
            <div className="card-title"><Icon name="check" size={14} /> ¿Avanzamos?</div>
            <p className="muted" style={{ fontSize: 12.5 }}>Si aceptás, el equipo comercial pasa la oportunidad a ganada y coordina el ingreso al taller.</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary" disabled={busy} onClick={() => decidir('aceptada')}><Icon name="check" size={14} /> Aceptar cotización</button>
              <button className="btn danger" disabled={busy} onClick={() => { setDecision('rechazada'); }}><Icon name="x" size={14} /> Rechazar</button>
            </div>
            {decision === 'rechazada' && (
              <div className="field" style={{ marginTop: 8 }}>
                <label>Motivo (opcional)</label>
                <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Precio, tiempos..." />
                <button type="button" className="btn danger sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => decidir('rechazada')}>Confirmar rechazo</button>
              </div>
            )}
          </div>
        ) : (
          <div className={`banner-${q.estado === 'aceptada' ? 'green' : 'red'}`} style={{ marginTop: 16 }}>
            <Icon name={q.estado === 'aceptada' ? 'check' : 'x'} size={15} /> {q.estado === 'aceptada' ? 'Cotización aceptada. El equipo de Bertika se va a contactar.' : q.estado === 'vencida' ? 'La cotización venció. Pedí una nueva versión.' : 'Cotización rechazada.'}
          </div>
        )}
      </div>
    </div>
  );
}
