import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store/store';
import { EstadoPill, ProgressTracker, Icon, fmtFecha, fmtDate, Timeline } from '../components/ui';

export default function Tracker() {
  const { orden_id } = useParams();
  const data = useStore((s) => s.data);
  const orden = data.ordenes.find((o) => o.id === orden_id);
  if (!orden) {
    return (
      <div className="wrap page center">
        <div className="empty"><div className="big"><Icon name="battery" size={40} /></div>Orden no encontrada.</div>
        <Link to="/" className="btn">Volver al inicio</Link>
      </div>
    );
  }
  const bateria = data.baterias.find((b) => b.numero_serie === orden.bateria_serie);
  const cliente = data.clientes.find((c) => c.id === orden.cliente_id);
  const ultimoEv = orden.eventos[orden.eventos.length - 1];

  return (
    <div className="wrap page">
      <div className="center mb8">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>
          <span className="logo"><Icon name="bolt" size={16} /></span>
          Bertika
        </div>
        <p className="muted" style={{ margin: 0 }}>Seguimiento publico · sin necesidad de cuenta</p>
      </div>

      <div className="card mt16" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <span className="serie" style={{ fontWeight: 800, fontSize: 18 }}>{orden.bateria_serie}</span>
            <span className="chip" style={{ marginLeft: 8 }}>{bateria?.aplicacion || '—'}</span>
            <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              {bateria ? `${bateria.tipo} · ${bateria.voltaje} · ${bateria.capacidad}Ah · ${bateria.equipo}` : 'Tipo de equipo no especificado'}
            </div>
            {cliente && <div className="muted" style={{ fontSize: 12.5 }}>Cliente: {cliente.nombre}</div>}
          </div>
          <EstadoPill estado={orden.estado} />
        </div>

        <ProgressTracker orden={orden} ordenesAnteriores={[]} />

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
          <div className="mt8"><Timeline eventos={orden.eventos} /></div>
        </details>

        <div className="center mt24">
          <Link to="/" className="btn"><Icon name="bolt" size={14} /> Ir al taller</Link>
        </div>
      </div>
    </div>
  );
}