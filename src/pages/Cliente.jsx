import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { Icon, EstadoPill, ProgressTracker, fmtDate, fmtARS, fmtFecha, appIconName, Timeline } from '../components/ui';
import OrdenDetalle from '../components/OrdenDetalle';
import { STATUS_STEP_INDEX } from '../data/seed';

function TrackerPanel({ orden, onVer }) {
  const bateria = useStore((s) => s.data.baterias.find((b) => b.numero_serie === orden.bateria_serie));
  const ultimoEv = orden.eventos[orden.eventos.length - 1];
  const activo = !['delivered', 'cancelled'].includes(orden.estado);
  return (
    <div className={`card ${activo ? '' : 'pad0'}`} style={!activo ? { borderColor: 'var(--line)' } : {}}>
      {!activo && <div style={{ padding: 14, opacity: 0.7 }} className="row between">
        <b>{orden.bateria_serie}</b><EstadoPill estado={orden.estado} />
      </div>}
      <div className="row between wrap" style={{ gap: 8 }}>
        <div>
          <span className="serie" style={{ fontWeight: 800, fontSize: 16 }}><Icon name={appIconName(bateria?.aplicacion)} size={15} /> {orden.bateria_serie}</span>
          <span className="chip" style={{ marginLeft: 8 }}>{bateria?.aplicacion}</span>
        </div>
        <EstadoPill estado={orden.estado} />
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        {bateria ? `${bateria.tipo} · ${bateria.voltaje} · ${bateria.capacidad}Ah · ${bateria.equipo}` : ''}
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
          {orden.estado === 'delivered' && <div className="badge green" style={{ marginTop: 6 }}>Entregada {orden.monto_cobrado ? `· ${fmtARS(orden.monto_cobrado)}` : ''}</div>}
        </div>
      </div>

      {orden.estado === 'quoted' && orden.estado_cotizacion !== 'rejected' ? (
        <div className="card mt16" style={{ background: 'var(--amber-bg)', borderColor: 'rgba(255,176,32,.45)' }}>
          <div className="row between">
            <div>
              <b style={{ fontSize: 14 }}><Icon name="clipboard" size={14} /> Cotizacion por aprobar</b>
              <div className="muted" style={{ fontSize: 12.5 }}>El taller espera tu aprobacion para iniciar.</div>
            </div>
            <b style={{ fontSize: 20, color: 'var(--amber)' }}>{fmtARS(orden.cotizacion?.monto)}</b>
          </div>
          <div className="grid2 mt16">
            <button className="btn primary lg" onClick={() => onVer(orden)}><Icon name="check" size={15} /> Revisar y aprobar</button>
            <button className="btn danger lg" onClick={() => onVer(orden)}><Icon name="x" size={15} /> Rechazar</button>
          </div>
        </div>
      ) : (
        <div className="row mt16">
          <button className="btn" onClick={() => onVer(orden)}><Icon name="bolt" size={14} /> Ver detalle completo</button>
          {orden.estado_cotizacion === 'rejected' && <span className="badge red">Cotizacion rechazada</span>}
        </div>
      )}

      {(orden.prueba_final?.estado === 'failed' || orden.estado === 'testing' || orden.estado === 'in_repair') && (
        <div className="mt16" style={{ fontSize: 12.5 }}>
          {orden.prueba_final?.estado === 'failed' && <div className="banner-red"><Icon name="warn" size={14} /> Prueba final fallida: la bateria regreso a reparacion. Garantizamos que no se entrega sin pasar la prueba.</div>}
          {orden.estado === 'testing' && <div className="banner-warn"><Icon name="gauge" size={14} /> Prueba final de carga en curso (paso obligatorio antes de entrega).</div>}
        </div>
      )}

      <details className="mt16" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
        <summary className="muted" style={{ fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Ver historial de eventos de esta orden</summary>
        <div className="mt8"><Timeline eventos={orden.eventos} /></div>
      </details>
    </div>
  );
}

export default function Cliente() {
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const [tab, setTab] = useState('tracker');
  const [sel, setSel] = useState(null);
  const [serieSel, setSerieSel] = useState('');
  const [agenda, setAgenda] = useState('');
  const [agendaTipo, setAgendaTipo] = useState('Mantenimiento preventivo');
  const toastShow = useStore((s) => s.toastShow);

  const clienteActual = data.clientes.find((c) => c.id === user?.id);
  const esFlotilla = clienteActual?.tipo === 'flotilla_corporativa';

  const activas = useMemo(
    () => data.ordenes.filter((o) => o.cliente_id === clienteActual?.id && !['delivered', 'cancelled'].includes(o.estado)),
    [data, clienteActual]
  );
  const historial = useMemo(
    () => data.ordenes.filter((o) => o.cliente_id === clienteActual?.id && o.estado === 'delivered').sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega)),
    [data, clienteActual]
  );

  const trac = activas.find((o) => o.bateria_serie === serieSel) || activas[0] || null;

  const garantias = data.ordenes.filter((o) => o.cliente_id === clienteActual?.id && o.garantia);
  const hoyRef = useMemo(() => Date.now(), []);
  const porVencer = useMemo(() => garantias.map((o) => {
    const dias = Math.round((new Date(o.garantia.vence) - hoyRef) / 86400000);
    return { o, dias };
  }).sort((a, b) => a.dias - b.dias), [garantias, hoyRef]);

  const bateriasDelCliente = data.baterias.filter((b) => b.cliente_id === clienteActual?.id);

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">{esFlotilla ? 'Flotilla y servicios' : 'Mi bateria'} · {clienteActual?.nombre}</h1>
          <p className="page-sub">
            {esFlotilla ? `Cliente corporativo · ${activas.length} orden(es) activa(s) · ${bateriasDelCliente.length} equipos registrados` : 'Seguimiento en tiempo real de tu bateria en el taller'}
          </p>
        </div>
        {activas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>Bateria en seguimiento:</span>
            <select className="input" style={{ width: 240 }} value={trac?.bateria_serie || ''} onChange={(e) => setSerieSel(e.target.value)}>
              {activas.map((o) => <option key={o.id} value={o.bateria_serie}>{o.bateria_serie}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="tabs mb16">
        <button className={`tab ${tab === 'tracker' ? 'active' : ''}`} onClick={() => setTab('tracker')}><Icon name="battery" size={13} /> Rastrear bateria</button>
        <button className={`tab ${tab === 'cotizaciones' ? 'active' : ''}`} onClick={() => setTab('cotizaciones')}>Cotizaciones ({activas.filter((o) => o.estado === 'quoted').length})</button>
        <button className={`tab ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}>Historial ({historial.length})</button>
        {esFlotilla && <button className={`tab ${tab === 'flotilla' ? 'active' : ''}`} onClick={() => setTab('flotilla')}>Flotilla</button>}
        <button className={`tab ${tab === 'garantias' ? 'active' : ''}`} onClick={() => setTab('garantias')}>Garantias</button>
        <button className={`tab ${tab === 'agenda' ? 'active' : ''}`} onClick={() => setTab('agenda')}>Agendar visita</button>
      </div>

      {tab === 'tracker' && (
        trac ? <TrackerPanel orden={trac} onVer={setSel} />
          : <div className="empty"><div className="big"><Icon name="battery" size={40} /></div>No hay baterias en el taller actualmente.</div>
      )}

      {tab === 'cotizaciones' && (
        <div className="col">
          {activas.filter((o) => o.estado === 'quoted').length === 0 && (
            <div className="empty"><div className="big"><Icon name="clipboard" size={36} /></div>No tienes cotizaciones pendientes por aprobar.</div>
          )}
          {activas.filter((o) => o.estado === 'quoted').map((o) => (
            <div key={o.id} className="card">
              <div className="row between wrap">
                <div>
                  <b style={{ fontSize: 15 }}>{o.bateria_serie}</b>
                  <div className="muted" style={{ fontSize: 12.5 }}>{data.baterias.find((b) => b.numero_serie === o.bateria_serie)?.equipo}</div>
                </div>
                <b style={{ fontSize: 22, color: 'var(--amber)' }}>{fmtARS(o.cotizacion?.monto)}</b>
              </div>
              <ul className="ulist mt8">
                {(o.cotizacion?.servicios_costos || []).map((s, i) => <li key={i}><span>{s.nombre}</span><span className="mono">{fmtARS(s.monto)}</span></li>)}
              </ul>
              <div className="grid2 mt16">
                <button className="btn primary lg" onClick={() => setSel(o)}><Icon name="check" size={15} /> Aprobar cotizacion</button>
                <button className="btn danger lg" onClick={() => setSel(o)}><Icon name="x" size={15} /> Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'historial' && (
        <div className="col">
          {historial.length === 0 && <div className="empty"><div className="big">?</div>Sin servicios previos registrados.</div>}
          {historial.map((o) => {
            const b = data.baterias.find((x) => x.numero_serie === o.bateria_serie);
            return (
              <div key={o.id} className="card">
                <div className="row between wrap">
                  <div>
                    <b style={{ fontSize: 15 }}>{o.bateria_serie}</b>
                    <span className="chip" style={{ marginLeft: 8 }}>{b?.aplicacion}</span>
                    <div className="muted" style={{ fontSize: 12.5 }}>{b?.equipo}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="badge green"><Icon name="check" size={11} /> {fmtFecha(o.fecha_entrega)}</span>
                    <b style={{ fontSize: 15 }}>{o.monto_cobrado ? fmtARS(o.monto_cobrado) : ''}</b>
                  </div>
                </div>
                {o.servicios?.length > 0 && (
                  <div className="mt8" style={{ fontSize: 13 }}>
                    <span className="muted">Servicio:</span> {o.servicios.join(' · ')}
                  </div>
                )}
                <div className="row wrap mt8" style={{ gap: 8 }}>
                  {data.tecnicos.find((t) => t.id === o.tecnico_id) && (
                    <span className="pill">Tecnico: {data.tecnicos.find((t) => t.id === o.tecnico_id).nombre}</span>
                  )}
                  {o.garantia && <span className="badge green">Garantia {o.garantia.meses} meses / {o.garantia.ciclos} ciclos</span>}
                  <button className="btn sm ghost" onClick={() => setSel(o)}><Icon name="clock" size={12} /> Detalle</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'flotilla' && esFlotilla && (
        <div className="col">
          {bateriasDelCliente.map((b) => {
            const o = data.ordenes.find((oo) => oo.bateria_serie === b.numero_serie && !['delivered', 'cancelled'].includes(oo.estado));
            const g = porVencer.find((x) => x.o.bateria_serie === b.numero_serie);
            const bajaCap = o?.prueba_final?.estado === 'failed';
            const idx = o ? STATUS_STEP_INDEX[o.estado] : 6;
            return (
              <div key={b.id} className="card">
                <div className="row between wrap">
                  <div className="grow">
                    <b style={{ fontSize: 14 }}>{b.equipo}</b>
                    <div className="chip" style={{ marginTop: 4 }}><Icon name={appIconName(b.aplicacion)} size={12} /> {b.tipo} · {b.voltaje} · {b.capacidad}Ah</div>
                    <div className="mono muted mt8" style={{ fontSize: 12 }}>{b.numero_serie}</div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
                    {o ? <EstadoPill estado={o.estado} /> : <span className="badge gray">Disponible</span>}
                    {bajaCap && <span className="badge red"><Icon name="warn" size={11} /> Capacidad baja detectada</span>}
                    {g && (
                      <span className={`badge ${g.dias <= 30 ? 'orange' : 'green'}`}>
                        {g.dias < 0 ? `Garantia vencida` : `Garantia en ${g.dias}d`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="warranty-bar mt16" style={{ marginTop: 10 }}>
                  <div style={{ width: `${Math.max(6, (idx / 6) * 100)}%`, background: 'var(--amber)' }} />
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Progreso del servicio actual ({Math.round((idx / 6) * 100)}%)</div>
                {o && <button className="btn sm mt8" onClick={() => setSel(o)}><Icon name="bolt" size={12} /> Rastrear</button>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'garantias' && (
        <div className="col">
          {garantias.length === 0 && <div className="empty"><div className="big"><Icon name="shield" size={36} /></div>Sin garantias activas registradas.</div>}
          {porVencer.map(({ o, dias }) => {
            const b = data.baterias.find((x) => x.numero_serie === o.bateria_serie);
            const pct = Math.max(0, Math.min(100, Math.round((dias / (o.garantia.meses * 30)) * 100)));
            return (
              <div key={o.id} className="card">
                <div className="row between wrap">
                  <div>
                    <b>{o.bateria_serie}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>{b?.equipo}</div>
                  </div>
                  <span className={`badge ${dias < 0 ? 'red' : dias <= 30 ? 'orange' : 'green'}`}>
                    {dias < 0 ? `Vencida hace ${Math.abs(dias)}d` : dias <= 30 ? `Vence en ${dias}d` : `Vigente · ${dias}d restantes`}
                  </span>
                </div>
                <div className="row mt8" style={{ gap: 14 }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>{o.garantia.meses} meses</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{o.garantia.ciclos} ciclos</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>Vence: {fmtFecha(o.garantia.vence)}</span>
                </div>
                <div className="warranty-bar mt8" style={{ marginTop: 8 }}>
                  <div style={{ width: `${pct}%`, background: dias <= 30 ? 'var(--orange)' : 'var(--green)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'agenda' && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 className="card-title"><Icon name="calendar" size={15} /> Agendar proxima visita o mantenimiento</h3>
          <p className="card-sub">El taller confirmara la cita por telefono o WhatsApp en la proxima fase.</p>
          <div className="col mt16">
            <div className="field"><label>Tipo de servicio</label>
              <select className="input" value={agendaTipo} onChange={(e) => setAgendaTipo(e.target.value)}>
                <option>Mantenimiento preventivo</option>
                <option>Recoleccion en planta</option>
                <option>Visita de diagnostico en sitio</option>
                <option>Entrega de bateria reparada</option>
              </select>
            </div>
            {esFlotilla && (
              <div className="field"><label>Equipo / bateria</label>
                <select className="input" value={serieSel} onChange={(e) => setSerieSel(e.target.value)}>
                  {bateriasDelCliente.map((b) => <option key={b.id} value={b.numero_serie}>{b.equipo} ({b.numero_serie})</option>)}
                </select>
              </div>
            )}
            <div className="field"><label>Fecha y horario preferido</label><input className="input" type="datetime-local" value={agenda} onChange={(e) => setAgenda(e.target.value)} /></div>
            <div className="field"><label>Notas</label><textarea className="input" placeholder="Detalles de la visita, cantidad de equipos, etc." /></div>
            <button className="btn primary lg" disabled={!agenda} onClick={() => toastShow('Cita registrada. Te contactaremos para confirmar.', 'ok')}>
              <Icon name="calendar" size={15} /> Registrar solicitud de cita
            </button>
          </div>
        </div>
      )}

      {sel && <OrdenDetalle orden={sel} role="cliente" onClose={() => setSel(null)} />}
    </div>
  );
}