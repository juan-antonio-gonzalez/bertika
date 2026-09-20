import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { Icon, EstadoPill, fmtDate, appIconName, fmtTiempo, fmtARS, diasEnEstado, etiquetaAntiguedad, tonoAntiguedad } from '../components/ui';
import OrdenDetalle from '../components/OrdenDetalle';
import { ESTADO_LABEL } from '../data/reglas';
import { useNavigate } from 'react-router-dom';

export default function Tecnico() {
  const navigate = useNavigate();
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const [tab, setTab] = useState('activas');
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [q, setQ] = useState('');

  const miId = data.tecnicos.find((t) => t.id === user?.id)?.id || user?.id;
  const misOrdenes = useMemo(
    () => data.ordenes.filter((o) => o.tecnico_id === miId),
    [data, miId]
  );
  const activas = misOrdenes.filter((o) => !['delivered', 'cancelled'].includes(o.estado));
  const completadas = misOrdenes.filter((o) => ['delivered', 'cancelled'].includes(o.estado));
  const reproceso = activas.filter((o) => o.prueba_final?.estado === 'failed');

  // La API tambien le entrega al tecnico las recibidas/en diagnostico SIN asignar:
  // el piso puede diagnosticarlas sin esperar la asignacion del admin.
  const sinAsignar = useMemo(
    () => data.ordenes.filter((o) => !o.tecnico_id && ['received', 'diagnosing'].includes(o.estado)),
    [data]
  );

  // Buscador del piso: serie, equipo, cliente, falla o id de orden.
  const texto = q.trim().toLowerCase();
  const coincide = (o) => {
    if (!texto) return true;
    const b = data.baterias.find((x) => x.numero_serie === o.bateria_serie);
    const c = data.clientes.find((x) => x.id === o.cliente_id);
    return [o.id, o.bateria_serie, o.falla, b?.equipo, b?.tipo, b?.aplicacion, c?.nombre]
      .filter(Boolean).join(' ').toLowerCase().includes(texto);
  };
  // Lo mas viejo primero: es lo que hay que sacar del piso.
  const porAntiguedad = (a, b) => (diasEnEstado(b) ?? 0) - (diasEnEstado(a) ?? 0);
  const porEstado = (o) => filtro === 'todas' || o.estado === filtro;

  const listaActivas = activas.filter(porEstado).filter(coincide).sort(porAntiguedad);
  const listaSinAsignar = sinAsignar.filter(coincide).sort(porAntiguedad);
  const listaCompletadas = completadas.filter(porEstado).filter(coincide).sort(porAntiguedad);
  const vis = tab === 'activas' ? listaActivas : tab === 'sin_asignar' ? listaSinAsignar : listaCompletadas;

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">Vista operativa</h1>
          <p className="page-sub">Hola {data.tecnicos.find((t) => t.id === miId)?.nombre} · {data.tecnicos.find((t) => t.id === miId)?.especialidad} · {activas.length} órdenes asignadas · {sinAsignar.length} sin asignar</p>
        </div>
        <div className="row">
          {reproceso.length > 0 && (
            <span className="badge red" style={{ fontSize: 13, padding: '7px 12px' }}><Icon name="warn" size={14} /> {reproceso.length} en reproceso (prueba fallida)</span>
          )}
          <button className="btn sm" onClick={() => navigate('/settings')}><Icon name="gear" size={13} /> Perfil</button>
        </div>
      </div>

      {reproceso.length > 0 && (
        <div className="banner-red"><Icon name="warn" size={15} /> Una batería con prueba final fallida NO puede entregarse hasta pasar la prueba. Regresa automáticamente a reparación.</div>
      )}

      <div className="tabs mb16">
        <button className={`tab ${tab === 'activas' ? 'active' : ''}`} onClick={() => setTab('activas')}>Activas ({activas.length})</button>
        <button className={`tab ${tab === 'sin_asignar' ? 'active' : ''}`} onClick={() => setTab('sin_asignar')}>Sin asignar ({sinAsignar.length})</button>
        <button className={`tab ${tab === 'completadas' ? 'active' : ''}`} onClick={() => setTab('completadas')}>Completadas ({completadas.length})</button>
      </div>

      <div className="field mb16">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por serie, equipo, cliente, falla o N° de orden" />
      </div>

      {tab === 'sin_asignar' && sinAsignar.length > 0 && (
        <div className="banner-info">
          <Icon name="info" size={15} /> Estas órdenes entraron al taller sin técnico asignado. Podés registrar el
          diagnóstico; para repararlas, pedile al admin que te las asigne.
        </div>
      )}

      {tab === 'activas' && (
        <div className="row wrap mb16">
          {['todas', 'received', 'diagnosing', 'approved', 'in_repair', 'testing', 'ready'].map((e) => (
            <button key={e} className={`pill ${filtro === e ? 'amber-t' : 'muted'}`} onClick={() => setFiltro(e)}>
              {e === 'todas' ? 'Todas' : ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
      )}

      {vis.length === 0 && (
        <div className="empty"><div className="big"><Icon name="battery" size={40} /></div>
          {texto
            ? `Sin resultados para "${q.trim()}".`
            : tab === 'activas' ? 'No tenés órdenes activas asignadas.'
              : tab === 'sin_asignar' ? 'No hay órdenes sin asignar pendientes de diagnóstico.'
                : 'Sin órdenes completadas por ahora.'}
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
                    {!['delivered', 'cancelled'].includes(o.estado) && (
                      <span className={`badge ${tonoAntiguedad(diasEnEstado(o))}`} title="Antigüedad en el estado actual">
                        <Icon name="clock" size={11} /> {etiquetaAntiguedad(diasEnEstado(o))}
                      </span>
                    )}
                    {f && <span className="badge red"><Icon name="x" size={11} /> Prueba fallida</span>}
                  </div>
                  <div className="col mt8" style={{ gap: 2 }}>
                    <span style={{ fontSize: 12.5 }}>{b ? `${b.tipo} · ${b.voltaje} · ${b.capacidad} Ah · ${b.equipo}` : o.bateria_serie}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>Cliente: {c?.nombre} · Ingreso: {fmtDate(o.fecha_ingreso)} ({fmtTiempo(o.fecha_ingreso)})</span>
                    <span style={{ fontSize: 12.5, color: 'var(--amber-d)' }}>Falla: {o.falla}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {o.cotizacion?.monto && <span className="badge amber" style={{ fontSize: 13 }}>{fmtARS(o.cotizacion.monto)}</span>}
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