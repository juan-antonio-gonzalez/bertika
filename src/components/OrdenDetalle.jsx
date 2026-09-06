import { useState } from 'react';
import { useStore } from '../store/store';
import { Modal, EstadoPill, Timeline, Icon, fmtDate, fmtMXN, appIconName, fmtFecha } from './ui';

const INS_CAT = ['Celdas', 'Electrolito', 'Bornes y Conectores', 'Cargadores', 'Cables', 'EPP y Seguridad'];

function Warning({ text }) {
  return <div className="banner-warn"><Icon name="warn" size={15} /> {text}</div>;
}

function DiagnosticoForm({ orden }) {
  const saveDiagnosis = useStore((s) => s.saveDiagnosis);
  const [v, setV] = useState(orden.diagnostico?.voltaje_medido ?? '');
  const [ri, setRi] = useState(orden.diagnostico?.resistencia_interna ?? '');
  const [pc, setPc] = useState(orden.diagnostico?.prueba_carga ?? 'passed');
  const [notas, setNotas] = useState(orden.diagnostico?.notas ?? '');
  const [serv, setServ] = useState(orden.diagnostico?.servicioTipo ?? '');
  return (
    <div className="col">
      <div className="grid2">
        <div className="field"><label>Voltaje medido (V)</label><input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="ej. 12.4" /></div>
        <div className="field"><label>Resistencia interna (mOhm)</label><input className="input" value={ri} onChange={(e) => setRi(e.target.value)} placeholder="ej. 6.5" /></div>
      </div>
      <div className="field"><label>Resultado de prueba de carga</label>
        <select className="input" value={pc} onChange={(e) => setPc(e.target.value)}>
          <option value="passed">Aprobada</option>
          <option value="failed">Fallida (indica falla)</option>
        </select>
      </div>
      <div className="field"><label>Tipo de servicio a cotizar</label>
        <select className="input" value={serv} onChange={(e) => setServ(e.target.value)}>
          <option value="">— Seleccionar —</option>
          <option value="Reacondicionamiento">Reacondicionamiento</option>
          <option value="Reparacion (cambio de celdas)">Reparacion (cambio de celdas)</option>
          <option value="Reemplazo de bateria">Reemplazo de bateria</option>
          <option value="Mantenimiento preventivo">Mantenimiento preventivo</option>
        </select>
      </div>
      <div className="field"><label>Notas tecnicas</label><textarea className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Hallazgos, estado de celdas, sulfatacion, etc." /></div>
      <button className="btn primary block" disabled={!v || !ri} onClick={() => saveDiagnosis(orden.id, { voltaje: v, resistencia: ri, pruebaCarga: pc, notas, servicioTipo: serv })}>
        <Icon name="bolt" size={15} /> Guardar diagnostico y generar cotizacion
      </button>
    </div>
  );
}

function CotizacionForm({ orden }) {
  const generarCotizacion = useStore((s) => s.generarCotizacion);
  const [servicios, setServicios] = useState(orden.cotizacion?.servicios_costos || [{ nombre: '', monto: '' }]);
  const [insumos, setInsumos] = useState(orden.cotizacion?.insumos || []);
  const [extra, setExtra] = useState('');
  const total = servicios.reduce((a, s) => a + (Number(s.monto) || 0), 0) + insumos.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precio) || 0), 0) + (Number(extra) || 0);
  const setS = (i, k, v) => setServicios(servicios.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const setI = (i, k, v) => setInsumos(insumos.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <div className="col">
      <div className="col">
        <label className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Servicios y mano de obra</label>
        {servicios.map((s, i) => (
          <div key={i} className="row">
            <input className="input" placeholder="Servicio" value={s.nombre} onChange={(e) => setS(i, 'nombre', e.target.value)} />
            <input className="input" style={{ width: 110 }} placeholder="Monto" value={s.monto} onChange={(e) => setS(i, 'monto', e.target.value)} />
            <button className="btn icon sm danger" onClick={() => setServicios(servicios.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setServicios([...servicios, { nombre: '', monto: '' }])}><Icon name="plus" size={13} /> Agregar servicio</button>
      </div>
      <div className="col">
        <label className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Insumos / celdas</label>
        {insumos.map((s, i) => (
          <div key={i} className="row">
            <input className="input" placeholder="Insumo" value={s.nombre} onChange={(e) => setI(i, 'nombre', e.target.value)} />
            <input className="input" style={{ width: 80 }} placeholder="Cant" value={s.cantidad} onChange={(e) => setI(i, 'cantidad', e.target.value)} />
            <input className="input" style={{ width: 100 }} placeholder="P. unit" value={s.precio} onChange={(e) => setI(i, 'precio', e.target.value)} />
            <button className="btn icon sm danger" onClick={() => setInsumos(insumos.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setInsumos([...insumos, { nombre: '', cantidad: 1, precio: '' }])}><Icon name="plus" size={13} /> Agregar insumo</button>
      </div>
      <div className="field"><label>Otros conceptos</label><input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ej. traslado a planta" /></div>
      <div className="row between" style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '10px 14px' }}>
        <span style={{ fontWeight: 700 }}>TOTAL</span>
        <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--amber)' }}>{fmtMXN(total)} MXN</span>
      </div>
      <button className="btn primary block" disabled={!total || servicios.every((s) => !s.nombre)} onClick={() => generarCotizacion(orden.id, { monto: total, servicios, insumos })}>
        <Icon name="clipboard" size={15} /> Guardar cotizacion
      </button>
    </div>
  );
}

function InsumosForm({ orden }) {
  const data = useStore((s) => s.data);
  const registrarInsumo = useStore((s) => s.registrarInsumo);
  const [cat, setCat] = useState('Todas');
  const [cant, setCant] = useState(1);
  const lis = data.insumos.filter((i) => cat === 'Todas' || i.categoria === cat);
  return (
    <div className="col">
      <div className="grid2">
        <div className="field"><label>Categoria</label>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option>Todas</option>
            {INS_CAT.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label>Cantidad</label><input className="input" type="number" min={1} value={cant} onChange={(e) => setCant(e.target.value)} /></div>
      </div>
      <div className="col" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {lis.length === 0 && <p className="muted">Sin insumos en esa categoria.</p>}
        {lis.map((i) => {
          const crit = i.stock < 3;
          return (
            <button key={i.id} className="btn" style={{ justifyContent: 'space-between', opacity: i.stock <= 0 ? 0.45 : 1 }} disabled={i.stock <= 0} onClick={() => registrarInsumo(orden.id, i.id, cant)}>
              <span className="row" style={{ textAlign: 'left' }}><Icon name={i.categoria === 'Celdas' ? 'battery' : 'box'} size={14} /> {i.nombre}</span>
              <span className="row">
                <span className={`badge ${crit ? 'red' : i.stock === 0 ? 'gray' : 'green'}`}>{i.stock} disp.</span>
                <span className="muted mono">{fmtMXN(i.precio)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {orden.insumos_utilizados?.length > 0 && (
        <div className="col" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <label className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Insumos usados en esta orden</label>
          {orden.insumos_utilizados.map((u, i) => (
            <div key={i} className="row between" style={{ fontSize: 13 }}>
              <span>{u.nombre} x{u.cantidad}</span>
              <span className="muted">{fmtMXN(u.precio * u.cantidad)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PruebaFinalForm({ orden }) {
  const completeTest = useStore((s) => s.completeTest);
  const bat = useStore((s) => s.data.baterias.find((b) => b.numero_serie === orden.bateria_serie));
  const [cap, setCap] = useState('');
  const [obs, setObs] = useState('');
  const [res, setRes] = useState('passed');
  return (
    <div className="col">
      <div className="grid2">
        <div className="field">
          <label>Capacidad medida (Ah)</label>
          <input className="input" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={`Nominal: ${bat?.capacidad ?? '?'} Ah`} />
        </div>
        <div className="field"><label>Resultado</label>
          <select className="input" value={res} onChange={(e) => setRes(e.target.value)}>
            <option value="passed">Aprobada</option>
            <option value="failed">Fallida</option>
          </select>
        </div>
      </div>
      <div className="field"><label>Notas tecnicas</label><textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      <button className="btn primary block" disabled={!cap} onClick={() => completeTest(orden.id, { capacidad: cap, resultado: res, obs })}>
        <Icon name="gauge" size={15} /> Registrar resultado de prueba final
      </button>
      {res === 'failed' && <div className="banner-red"><Icon name="warn" size={15} /> Si la prueba falla, la orden regresara a reparacion automaticamente.</div>}
    </div>
  );
}

export default function OrdenDetalle({ orden, role, onClose, onEntregado, onBaja }) {
  const data = useStore((s) => s.data);
  const asignarTecnico = useStore((s) => s.asignarTecnico);
  const startRepair = useStore((s) => s.startRepair);
  const startTest = useStore((s) => s.startTest);
  const aprobarCotizacion = useStore((s) => s.aprobarCotizacion);
  const rechazarCotizacion = useStore((s) => s.rechazarCotizacion);
  const deliverOrder = useStore((s) => s.deliverOrder);
  const darDeBaja = useStore((s) => s.darDeBaja);
  const [sec, setSec] = useState('info');
  const [tecnicoSel, setTecnicoSel] = useState(orden.tecnico_id || '');
  const [confirm, setConfirm] = useState(null);
  const [entregar, setEntregar] = useState(false);

  const bateria = data.baterias.find((b) => b.numero_serie === orden.bateria_serie);
  const cliente = data.clientes.find((c) => c.id === orden.cliente_id);
  const tecnico = data.tecnicos.find((t) => t.id === orden.tecnico_id);
  const esTec = role === 'tecnico';

  const fallaSpec = bateria && tecnico
    ? bateria.aplicacion === 'Ferroviario' ? tecnico.especialidad !== 'Ferroviario'
      : bateria.aplicacion === 'Autoelevador' ? !['Plomo-Acido', 'Litio / Ion-Litio', 'Industrial Pesado'].includes(tecnico.especialidad)
      : !['Plomo-Acido', 'Industrial Pesado'].includes(tecnico.especialidad)
    : false;

  const historial = data.ordenes.filter((o) => o.bateria_serie === orden.bateria_serie);

  const deliver = () => {
    deliverOrder(orden.id, confirm?.monto, confirm?.meses, confirm?.ciclos);
    setConfirm(null);
    setEntregar(false);
    if (onEntregado) onEntregado();
    onClose();
  };

  const actionsAvailable = orden.estado === 'received' || orden.estado === 'diagnosing' || orden.estado === 'approved' || orden.estado === 'in_repair' || orden.estado === 'testing' || orden.estado === 'ready' || orden.estado === 'quoted';

  return (
    <Modal title={`Orden ${orden.id}`} sub={`${orden.bateria_serie} · ${bateria ? bateria.aplicacion : ''}`} onClose={onClose}>
      {!tecnico && !esTec && orden.estado !== 'delivered' && (
        <div className="banner-orange" style={{ background: 'var(--orange-bg)', color: 'var(--orange)', border: '1px solid rgba(255,122,26,.5)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontWeight: 700 }}>
          <Icon name="warn" size={15} /> Sin tecnico asignado. Asigna uno para que pueda operar.
        </div>
      )}

      {fallaSpec && orden.estado !== 'delivered' && (
        <Warning>Posible desajuste de especialidad: <b>{bateria.aplicacion}</b> vs tecnico <b>{tecnico.especialidad}</b> (validacion soft).</Warning>
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${sec === 'info' ? 'active' : ''}`} onClick={() => setSec('info')}>Orden</button>
        <button className={`tab ${sec === 'trabajo' ? 'active' : ''}`} onClick={() => setSec('trabajo')}>Trabajo</button>
        <button className={`tab ${sec === 'eventos' ? 'active' : ''}`} onClick={() => setSec('eventos')}>Eventos</button>
        {actionsAvailable && !esTec && orden.estado !== 'quoted' && (
          <button className={`tab ${sec === 'acciones' ? 'active' : ''}`} onClick={() => setSec('acciones')}>Acciones admin</button>
        )}
      </div>

      {sec === 'info' && (
        <div className="col">
          <div className="row between">
            <EstadoPill estado={orden.estado} />
            <span className="muted mono">{fmtFecha(orden.fecha_ingreso)}</span>
          </div>
          <div className="grid2">
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="card-title"><Icon name="battery" size={14} /> Bateria</div>
              <div className="col mt8" style={{ gap: 4 }}>
                <b style={{ fontSize: 15 }}>{orden.bateria_serie}</b>
                <span>{bateria ? `${bateria.tipo} · ${bateria.voltaje} · ${bateria.capacidad} Ah` : '—'}</span>
                <span className="mono">{bateria ? bateria.equipo : ''}</span>
                <span className="chip" style={{ alignSelf: 'flex-start', marginTop: 4 }}><Icon name={appIconName(bateria?.aplicacion)} size={12} /> {bateria?.aplicacion}</span>
              </div>
            </div>
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="card-title"><Icon name="users" size={14} /> Cliente / Tecnico</div>
              <div className="col mt8" style={{ gap: 4 }}>
                <b>{cliente?.nombre}</b>
                <span className="muted">{cliente ? (cliente.tipo === 'flotilla_corporativa' ? cliente.contacto : `Tel: ${cliente.telefono}`) : ''}</span>
                <span>{tecnico ? `Tecnico: ${tecnico.nombre}` : 'Sin tecnico asignado'}</span>
                <span className="muted">{tecnico?.especialidad}</span>
              </div>
            </div>
          </div>
          <div className="card" style={{ background: 'var(--bg-3)' }}>
            <div className="card-title"><Icon name="warn" size={14} /> Falla reportada</div>
            <p style={{ margin: '8px 0 0' }}>{orden.falla}</p>
          </div>
          {orden.diagnostico && (
            <div className="grid3">
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Voltaje</div>
                <b style={{ fontSize: 17 }}>{orden.diagnostico.voltaje_medido}V</b>
              </div>
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Resist. interna</div>
                <b style={{ fontSize: 17 }}>{orden.diagnostico.resistencia_interna} mΩ</b>
              </div>
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Prueba de carga</div>
                <b style={{ fontSize: 17 }}>{orden.diagnostico.prueba_carga === 'passed' ? 'Aprobada' : 'Fallida'}</b>
              </div>
            </div>
          )}
          {orden.cotizacion && (
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="row between">
                <div className="card-title"><Icon name="clipboard" size={14} /> Cotizacion</div>
                <span className="badge amber">Total {fmtMXN(orden.cotizacion.monto)} MXN</span>
              </div>
              <ul className="ulist mt8">
                {(orden.cotizacion.servicios_costos || []).map((s, i) => (
                  <li key={i}><span>{s.nombre}</span><span className="mono">{fmtMXN(s.monto)}</span></li>
                ))}
                {(orden.cotizacion.insumos || []).map((s, i) => (
                  <li key={i}><span>{s.nombre} x{s.cantidad}</span><span className="c mono">{fmtMXN(s.precio * s.cantidad)}</span></li>
                ))}
              </ul>
            </div>
          )}
          {orden.prueba_final && orden.prueba_final.estado !== 'pending' && (
            <div className={`card ${orden.prueba_final.estado === 'passed' ? '' : ''}`} style={{ background: 'var(--bg-3)', borderColor: orden.prueba_final.estado === 'passed' ? 'rgba(54,201,122,.4)' : 'rgba(255,77,94,.5)' }}>
              <div className="row between">
                <div className="card-title"><Icon name="gauge" size={14} /> Prueba final</div>
                <span className={`badge ${orden.prueba_final.estado === 'passed' ? 'green' : 'red'}`}>{orden.prueba_final.estado === 'passed' ? 'Aprobada' : 'Fallida'}</span>
              </div>
              {orden.prueba_final.capacidad_medida && <b style={{ fontSize: 18 }}>{orden.prueba_final.capacidad_medida} Ah</b>}
              {orden.prueba_final.obs && <p className="muted mt8" style={{ fontSize: 13, marginBottom: 0 }}>{orden.prueba_final.obs}</p>}
            </div>
          )}
          {orden.garantia && (
            <div className="grid2">
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Garantia otorgada</div>
                <b>{orden.garantia.meses} meses / {orden.garantia.ciclos} ciclos</b>
              </div>
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Vigencia</div>
                <b style={{ color: 'var(--green)' }}>{fmtFecha(orden.garantia.vence)}</b>
              </div>
            </div>
          )}
          {historial.length > 1 && (
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="card-title"><Icon name="clock" size={14} /> Historial de {orden.bateria_serie} ({historial.length} ordenes)</div>
              <div className="col mt8">
                {historial.map((h) => (
                  <div key={h.id} className="row between" style={{ fontSize: 12.5 }}>
                    <span className="mono">{h.id}</span>
                    <span>{fmtDate(h.fecha_ingreso)}</span>
                    <EstadoPill estado={h.estado} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sec === 'trabajo' && (
        <div className="col">
          {orden.estado === 'received' && (
            <>
              <div className="banner-green"><Icon name="bolt" size={15} /> Bateria en taller. Realiza el diagnostico para continuar el flujo.</div>
              {esTec && <DiagnosticoForm orden={orden} />}
              {!esTec && <p className="muted">El tecnico asignado debe registrar el diagnostico desde su vista operativa.</p>}
            </>
          )}
          {orden.estado === 'diagnosing' && esTec && (
            <>
              <div className="banner-green"><Icon name="volt" size={15} /> Registra las lecturas del equipo y genera la cotizacion.</div>
              <DiagnosticoForm orden={orden} />
            </>
          )}
          {orden.estado === 'quoted' && role === 'cliente' && (
            <>
              <div className="banner-green"><Icon name="clipboard" size={15} /> Revisa la cotizacion y aprueba o rechaza el servicio.</div>
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <ul className="ulist">
                  {(orden.cotizacion?.servicios_costos || []).map((s, i) => <li key={i}><span>{s.nombre}</span><span className="mono">{fmtMXN(s.monto)}</span></li>)}
                  {(orden.cotizacion?.insumos || []).map((s, i) => <li key={i}><span>{s.nombre} x{s.cantidad}</span><span className="mono">{fmtMXN(s.precio * s.cantidad)}</span></li>)}
                </ul>
                <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <b>Total</b>
                  <b style={{ color: 'var(--amber)', fontSize: 18 }}>{fmtMXN(orden.cotizacion?.monto)} MXN</b>
                </div>
              </div>
              <div className="grid2">
                <button className="btn primary lg" onClick={aprobarCotizacion}><Icon name="check" size={16} /> Aprobar cotizacion</button>
                <button className="btn danger lg" onClick={rechazarCotizacion}><Icon name="x" size={16} /> Rechazar</button>
              </div>
            </>
          )}
          {orden.estado === 'quoted' && esTec && (
            <>
              <p className="muted">Cotizacion enviada. Esperando aprobacion del cliente.</p>
              <CotizacionForm orden={orden} />
            </>
          )}
          {orden.estado === 'approved' && esTec && (
            <>
              <div className="banner-green"><Icon name="tools" size={15} /> Cotizacion aprobada. Inicia la reparacion / reacondicionamiento.</div>
              <button className="btn primary block lg" onClick={startRepair}><Icon name="tools" size={16} /> Iniciar reparacion</button>
            </>
          )}
          {orden.estado === 'in_repair' && esTec && (
            <>
              <div className="banner-green"><Icon name="tools" size={15} /> Reparacion en curso. Registra los insumos y celdas utilizados.</div>
              <InsumosForm orden={orden} />
              <button className="btn primary lg block mt8" onClick={startTest}><Icon name="gauge" size={16} /> Iniciar prueba final de carga</button>
            </>
          )}
          {orden.estado === 'testing' && esTec && (
            <>
              <div className="banner-green"><Icon name="gauge" size={15} /> Prueba final en curso. Registra el resultado (capacidad en Ah).</div>
              <PruebaFinalForm orden={orden} />
            </>
          )}
          {(orden.estado === 'ready' || orden.estado === 'delivered') && (
            <div className={orden.estado === 'ready' ? 'banner-green' : ''} style={orden.estado === 'delivered' ? { color: 'var(--muted)' } : {}}>
              <Icon name={orden.estado === 'ready' ? 'check' : 'truck'} size={15} />
              {orden.estado === 'ready' ? 'Bateria lista para entrega. El admin registra cobro y garantia.' : 'Orden cerrada. La bateria fue entregada y cobrada.'}
            </div>
          )}
        </div>
      )}

      {sec === 'acciones' && !esTec && (
        <div className="col">
          {orden.estado === 'received' || orden.estado === 'diagnosing' ? (
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="card-title mb8"><Icon name="users" size={14} /> Asignar / reasignar tecnico</div>
              <div className="row">
                <select className="input" value={tecnicoSel} onChange={(e) => setTecnicoSel(e.target.value)}>
                  <option value="">— Seleccionar tecnico —</option>
                  {data.tecnicos.filter((t) => t.activo).map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre} · {t.especialidad}</option>
                  ))}
                </select>
                <button className="btn primary" disabled={!tecnicoSel} onClick={() => asignarTecnico(orden.id, tecnicoSel)}>
                  <Icon name="check" size={14} /> Asignar
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Tecnico asignado: <b>{tecnico?.nombre || '—'}</b> ({tecnico?.especialidad})</p>
          )}

          {orden.estado === 'received' && role === 'admin' && (
            <button className="btn danger block" onClick={() => setConfirm({ type: 'baja' })}><Icon name="recycl" size={15} /> Dar de baja (no reparable / cancelar)</button>
          )}
          {orden.estado === 'quoted' && role === 'admin' && (
            <button className="btn danger block" onClick={() => { rechazarCotizacion(orden.id); onClose(); }}><Icon name="x" size={15} /> Cancelar orden (cliente rechaza)</button>
          )}
          {orden.estado === 'ready' && role === 'admin' && (
            <button className="btn primary block lg" onClick={() => setEntregar(true)}><Icon name="truck" size={16} /> Entregar y cobrar</button>
          )}
        </div>
      )}

      {sec === 'eventos' && <Timeline eventos={orden.eventos} />}

      {confirm?.type === 'baja' && (
        <Modal title="Dar de baja la bateria" sub="Trazabilidad obligatoria para disposicion responsable" onClose={() => setConfirm(null)}>
          <div className="col">
            <Warning>La bateria {orden.bateria_serie} quedara marcada como dada_de_baja (no reparable) y pasara al panel de reciclaje.</Warning>
            <div className="field"><label>Motivo</label><textarea className="input" defaultValue="Capacidad por debajo del 40% / no reparable" /></div>
            <button className="btn danger block" onClick={() => { darDeBaja(orden.id, confirm.motivo || 'Capacidad por debajo del 40% / no reparable'); setConfirm(null); onClose(); if (onBaja) onBaja(); }}>
              Confirmar baja
            </button>
          </div>
        </Modal>
      )}

      {entregar && (
        <Modal title="Entregar y cobrar" sub={`Orden ${orden.id} · ${orden.bateria_serie}`} onClose={() => setEntregar(false)}>
          <div className="col">
            <div className="field"><label>Monto cobrado (MXN)</label><input className="input" type="number" defaultValue={orden.cotizacion?.monto || ''} onChange={(e) => setConfirm({ ...confirm, monto: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><label>Garantia (meses)</label><input className="input" type="number" defaultValue={6} onChange={(e) => setConfirm({ ...confirm, meses: e.target.value })} /></div>
              <div className="field"><label>Ciclos de carga</label><input className="input" type="number" defaultValue={100} onChange={(e) => setConfirm({ ...confirm, ciclos: e.target.value })} /></div>
            </div>
            <button className="btn primary block lg" onClick={deliver}><Icon name="truck" size={16} /> Confirmar entrega y cobro</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}