import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { Icon, EstadoPill, fmtDate, appIconName, fmtTiempo, fmtMXN } from '../components/ui';
import OrdenDetalle from '../components/OrdenDetalle';
import { useNavigate } from 'react-router-dom';

export default function Tecnico() {
  const navigate = useNavigate();
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const [tab, setTab] = useState('activas');
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState('todas');

  const miId = data.tecnicos.find((t) => t.id === user?.id)?.id || user?.id;
  const misOrdenes = useMemo(
    () => data.ordenes.filter((o) => o.tecnico_id === miId),
    [data, miId]
  );
  const activas = misOrdenes.filter((o) => !['delivered', 'cancelled'].includes(o.estado));
  const completadas = misOrdenes.filter((o) => ['delivered', 'cancelled'].includes(o.estado));
  const reproceso = activas.filter((o) => o.prueba_final?.estado === 'failed');

  const vis = (tab === 'activas' ? activas : completadas).filter((o) =>
    filtro === 'todas' || o.estado === filtro
  );

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">Vista operativa</h1>
          <p className="page-sub">Hola {data.tecnicos.find((t) => t.id === miId)?.nombre} · {data.tecnicos.find((t) => t.id === miId)?.especialidad} · {activas.length} ordenes activas asignadas</p>
        </div>
        <div className="row">
          {reproceso.length > 0 && (
            <span className="badge red" style={{ fontSize: 13, padding: '7px 12px' }}><Icon name="warn" size={14} /> {reproceso.length} en reproceso (prueba fallida)</span>
          )}
          <button className="btn sm" onClick={() => navigate('/settings')}><Icon name="gear" size={13} /> Perfil</button>
        </div>
      </div>

      {reproceso.length > 0 && (
        <div className="banner-red"><Icon name="warn" size={15} /> Una bateria con prueba final fallida NO puede entregarse hasta pasar la prueba. Regreso automatico a reparacion.</div>
      )}

      <div className="tabs mb16">
        <button className={`tab ${tab === 'activas' ? 'active' : ''}`} onClick={() => setTab('activas')}>Activas ({activas.length})</button>
        <button className={`tab ${tab === 'completadas' ? 'active' : ''}`} onClick={() => setTab('completadas')}>Completadas ({completadas.length})</button>
      </div>
      {tab === 'activas' && (
        <div className="row wrap mb16">
          {['todas', 'received', 'diagnosing', 'approved', 'in_repair', 'testing', 'ready'].map((e) => (
            <button key={e} className={`pill ${filtro === e ? 'amber-t' : 'muted'}`} onClick={() => setFiltro(e)}>
              {e === 'todas' ? 'Todas' : e}
            </button>
          ))}
        </div>
      )}

      {vis.length === 0 && (
        <div className="empty"><div className="big"><Icon name="battery" size={40} /></div>
          {tab === 'activas' ? 'No tienes ordenes activas asignadas.' : 'Sin ordenes completadas por ahora.'}
        </div>
      )}

      <div className="col">
        {vis.map((o) => {
          const b = data.baterias.find((x) => x.numero_serie === o.bateria_serie);
          const c = data.clientes.find((x) => x.id === o.cliente_id);
          const f = o.prueba_final?.estado === 'failed';
          return (
            <div key={o.id} className="card">
              <div className="row between wrap" style={{ gap: 10 }}>
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="serie" style={{ fontWeight: 800, fontSize: 14 }}><Icon name={appIconName(b?.aplicacion)} size={14} /> {o.bateria_serie}</span>
                    <EstadoPill estado={o.estado} />
                    {f && <span className="badge red"><Icon name="x" size={11} /> Prueba fallida</span>}
                  </div>
                  <div className="col mt8" style={{ gap: 2 }}>
                    <span style={{ fontSize: 12.5 }}>{b ? `${b.tipo} · ${b.voltaje} · ${b.capacidad} Ah · ${b.equipo}` : o.bateria_serie}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>Cliente: {c?.nombre} · Ingreso: {fmtDate(o.fecha_ingreso)} ({fmtTiempo(o.fecha_ingreso)})</span>
                    <span style={{ fontSize: 12.5, color: 'var(--amber-d)' }}>Falla: {o.falla}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {o.cotizacion?.monto && <span className="badge amber" style={{ fontSize: 13 }}>{fmtMXN(o.cotizacion.monto)}</span>}
                  <button className="btn primary" onClick={() => setSel(o)}><Icon name="volt" size={14} /> {o.estado === 'received' || o.estado === 'diagnosing' ? 'Diagnosticar' : 'Detalle'}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sel && <OrdenDetalle orden={sel} role="tecnico" onClose={() => setSel(null)} />}
    </div>
  );
}