import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { Icon, EstadoPill, OrdenCard, Modal, fmtDate, fmtARS, fmtFecha, nombreActor } from '../components/ui';
import OrdenDetalle from '../components/OrdenDetalle';
import CotizadorConfig from '../components/CotizadorConfig';
import WhatsAppBandeja from '../components/WhatsAppBandeja';
import { ORDEN_ESTADOS } from '../data/reglas';

// Columnas del tablero: todos los estados del flujo (incluye "approved" y
// "cancelled", que antes no tenian columna y desaparecian del kanban).
const ESTADOS = ORDEN_ESTADOS;

const ESTADO_COLOR = {
  received: ['#d98e04', 'var(--amber-bg)'],
  diagnosing: ['#4aa4ff', 'var(--blue-bg)'],
  quoted: ['#d9a04e', 'rgba(217,160,78,.12)'],
  approved: ['#7a6cff', 'rgba(122,108,255,.12)'],
  in_repair: ['#ff7a1a', 'var(--orange-bg)'],
  testing: ['#ffc04a', 'rgba(255,192,74,.12)'],
  ready: ['#36c97a', 'var(--green-bg)'],
  delivered: ['#5f6b7a', 'rgba(95,107,122,.15)'],
  cancelled: ['#ff4d5e', 'var(--red-bg)'],
};

const ESTADO_LB = {
  received: 'Recibidas', diagnosing: 'Diagnostico', quoted: 'Cotizadas', approved: 'Aprobadas',
  in_repair: 'En reparación', testing: 'Prueba final', ready: 'Listas', delivered: 'Entregadas',
  cancelled: 'Canceladas',
};

function AltasForm({ onClose }) {
  const crearCliente = useStore((s) => s.crearCliente);
  const crearTecnico = useStore((s) => s.crearTecnico);
  const crearInsumo = useStore((s) => s.crearInsumo);
  const [tipo, setTipo] = useState('cliente');
  const [cliente, setCliente] = useState({ nombre: '', empresa: '', email: '', telefono: '' });
  const [tecnico, setTecnico] = useState({ nombre: '', especialidad: '', certificaciones: '' });
  const [insumo, setInsumo] = useState({ nombre: '', categoria: '', stock: '', precio: '' });
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    setBusy(true);
    if (tipo === 'cliente') {
      await crearCliente(cliente);
    } else if (tipo === 'tecnico') {
      await crearTecnico({ ...tecnico, certificaciones: tecnico.certificaciones.split(',').map((c) => c.trim()).filter(Boolean) });
    } else {
      await crearInsumo({ ...insumo, stock: Number(insumo.stock) || 0, precio: Number(insumo.precio) || 0 });
    }
    setBusy(false);
    onClose();
  };

  return (
    <div>
      <div className="tabs mb16">
        <button className={`tab ${tipo === 'cliente' ? 'active' : ''}`} onClick={() => setTipo('cliente')}><Icon name="building" size={13} /> Cliente</button>
        <button className={`tab ${tipo === 'tecnico' ? 'active' : ''}`} onClick={() => setTipo('tecnico')}><Icon name="users" size={13} /> Tecnico</button>
        <button className={`tab ${tipo === 'insumo' ? 'active' : ''}`} onClick={() => setTipo('insumo')}><Icon name="box" size={13} /> Insumo</button>
      </div>

      {tipo === 'cliente' && (
        <div className="col">
          <div className="field"><label>Nombre</label><input className="input" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} placeholder="Nombre del cliente" /></div>
          <div className="field"><label>Empresa / flotilla</label><input className="input" value={cliente.empresa} onChange={(e) => setCliente({ ...cliente, empresa: e.target.value })} placeholder="ej. Transportes La Union" /></div>
          <div className="field"><label>Email</label><input className="input" type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} placeholder="cliente@empresa.com" /></div>
          <div className="field"><label>Teléfono</label><input className="input" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} placeholder="(55) 0000-0000" /></div>
        </div>
      )}

      {tipo === 'tecnico' && (
        <div className="col">
          <div className="field"><label>Nombre</label><input className="input" value={tecnico.nombre} onChange={(e) => setTecnico({ ...tecnico, nombre: e.target.value })} placeholder="Nombre del tecnico" /></div>
          <div className="field"><label>Especialidad</label><input className="input" value={tecnico.especialidad} onChange={(e) => setTecnico({ ...tecnico, especialidad: e.target.value })} placeholder="ej. Plomo-Acido" /></div>
          <div className="field"><label>Certificaciones (separadas por coma)</label><input className="input" value={tecnico.certificaciones} onChange={(e) => setTecnico({ ...tecnico, certificaciones: e.target.value })} placeholder="ej. Cert. Bosch, Seguridad industrial" /></div>
        </div>
      )}

      {tipo === 'insumo' && (
        <div className="col">
          <div className="field"><label>Nombre</label><input className="input" value={insumo.nombre} onChange={(e) => setInsumo({ ...insumo, nombre: e.target.value })} placeholder="ej. Acido sulfurico" /></div>
          <div className="field"><label>Categoría</label><input className="input" value={insumo.categoria} onChange={(e) => setInsumo({ ...insumo, categoria: e.target.value })} placeholder="ej. Insumo / Repuesto" /></div>
          <div className="row">
            <div className="field"><label>Stock inicial</label><input className="input" type="number" value={insumo.stock} onChange={(e) => setInsumo({ ...insumo, stock: e.target.value })} placeholder="0" /></div>
            <div className="field"><label>Precio unitario (ARS)</label><input className="input" type="number" value={insumo.precio} onChange={(e) => setInsumo({ ...insumo, precio: e.target.value })} placeholder="0" /></div>
          </div>
        </div>
      )}

      <button className="btn primary block lg" disabled={busy} onClick={guardar}><Icon name="plus" size={15} /> {busy ? 'Guardando...' : 'Dar de alta'}</button>
    </div>
  );
}

function Kanban({ onOpen }) {
  const ordenes = useStore((s) => s.data.ordenes);
  const grupos = ESTADOS.map((e) => [e, ordenes.filter((o) => o.estado === e)]);
  return (
    <div className="kanban">
      {grupos.map(([estado, list]) => (
        <div key={estado} className="kcol">
          <div className="kcol-head" style={{ color: ESTADO_COLOR[estado][0] }}>
            <span className="row" style={{ gap: 6 }}><span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLOR[estado][0] }} /> {ESTADO_LB[estado]}</span>
            <span className="count">{list.length}</span>
          </div>
          <div className="kcol-body">
            {list.length === 0 && <p className="muted center" style={{ padding: 14, fontSize: 12 }}>Sin órdenes</p>}
            {list.map((o) => <OrdenCard key={o.id} orden={o} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const data = useStore((s) => s.data);
  const hoy = new Date().toDateString();
  const activas = data.ordenes.filter((o) => !['delivered', 'cancelled'].includes(o.estado));
  const cerradasHoy = data.ordenes.filter((o) => o.estado === 'delivered' && new Date(o.fecha_entrega).toDateString() === hoy);
  const ingresosHoy = cerradasHoy.reduce((a, o) => a + (o.monto_cobrado || o.cotizacion?.monto || 0), 0);
  const stockCritico = data.insumos.filter((i) => i.stock < 3);
  const reproceso = data.ordenes.filter((o) => o.estado === 'in_repair' && o.prueba_final?.estado === 'failed');
  const gPorVencer = [];
  for (const o of data.ordenes) {
    if (o.estado === 'delivered' && o.garantia) {
      const dias = Math.round((new Date(o.garantia.vence) - Date.now()) / 86400000);
      if (dias <= 30 && dias >= 0) gPorVencer.push({ orden: o, dias });
    }
  }
  // Entrega estimada para hoy y todavia abierta. Ojo: fecha_entrega solo se
  // completa al entregar, por eso antes contaba siempre 0.
  const pasadasHoy = data.ordenes.filter((o) => !['delivered', 'cancelled'].includes(o.estado)
    && o.hora_entrega && new Date(o.hora_entrega).toDateString() === hoy);
  const bateriasActivas = data.baterias.filter((b) => b.estado_vida !== 'dada_de_baja');
  const garantiaTip = data.baterias.filter((b) => b.estado_vida === 'en_garantia').length;

  // --- Indicadores de gestión del taller ---
  const entregadas = data.ordenes.filter((o) => o.estado === 'delivered' && o.fecha_ingreso && o.fecha_entrega);
  const tiempos = entregadas.map((o) => (new Date(o.fecha_entrega) - new Date(o.fecha_ingreso)) / 86400000);
  const tiempoMedio = tiempos.length ? tiempos.reduce((a, d) => a + d, 0) / tiempos.length : null;
  const conPrueba = data.ordenes.filter((o) => o.prueba_final && o.prueba_final.estado !== 'pending');
  const reprocesos = data.ordenes.filter((o) => (o.eventos || []).some((e) => e.tipo === 'prueba_fallida'));
  const tasaReproceso = conPrueba.length ? Math.round((reprocesos.length / conPrueba.length) * 100) : null;
  const conHoraEstimada = entregadas.filter((o) => o.hora_entrega);
  const enFecha = conHoraEstimada.filter((o) => new Date(o.fecha_entrega) <= new Date(o.hora_entrega));
  const cumplimiento = conHoraEstimada.length ? Math.round((enFecha.length / conHoraEstimada.length) * 100) : null;

  return (
    <div className="col">
      <div className="grid4">
        <div className="kpi"><div className="kpi-label">Baterías activas en taller</div><div className="kpi-value">{activas.length}</div><div className="kpi-sub">{bateriasActivas.length} registradas en total</div></div>
        <div className="kpi"><div className="kpi-label">Órdenes cerradas hoy</div><div className="kpi-value green">{cerradasHoy.length}</div><div className="kpi-sub">{pasadasHoy.length} entrega(s) pendiente(s) del día</div></div>
        <div className="kpi"><div className="kpi-label">Ingresos del día</div><div className="kpi-value">{fmtARS(ingresosHoy)}</div><div className="kpi-sub">facturados hoy</div></div>
        <div className={`kpi ${stockCritico.length ? 'alert' : ''}`}><div className="kpi-label">Stock bajo (crítico &lt; 3)</div><div className="kpi-value">{stockCritico.length}</div><div className="kpi-sub">cargadores y celdas con atención</div></div>
        <div className={`kpi ${reproceso.length ? 'danger' : ''}`}><div className="kpi-label">Prueba fallida (reproceso)</div><div className="kpi-value">{reproceso.length}</div><div className="kpi-sub">regresadas a reparación</div></div>
        <div className="kpi"><div className="kpi-label">Garantías por vencer (30 días)</div><div className="kpi-value">{gPorVencer.length}</div><div className="kpi-sub">{garantiaTip} baterías bajo garantía activa</div></div>
        <div className="kpi"><div className="kpi-label">Baterías dadas de baja</div><div className="kpi-value">{data.bajas.length}</div><div className="kpi-sub">trazabilidad de reciclaje</div></div>
        <div className="kpi">
          <div className="kpi-label">Tiempo medio de reparación</div>
          <div className="kpi-value">{tiempoMedio == null ? '—' : `${tiempoMedio.toFixed(1)} d`}</div>
          <div className="kpi-sub">{entregadas.length} órdenes entregadas</div>
        </div>
        <div className={`kpi ${tasaReproceso != null && tasaReproceso >= 20 ? 'danger' : ''}`}>
          <div className="kpi-label">Tasa de reproceso</div>
          <div className="kpi-value">{tasaReproceso == null ? '—' : `${tasaReproceso}%`}</div>
          <div className="kpi-sub">{reprocesos.length} de {conPrueba.length} pruebas con falla</div>
        </div>
        <div className={`kpi ${cumplimiento != null && cumplimiento < 80 ? 'alert' : ''}`}>
          <div className="kpi-label">Entregas en fecha</div>
          <div className="kpi-value">{cumplimiento == null ? '—' : `${cumplimiento}%`}</div>
          <div className="kpi-sub">{enFecha.length} de {conHoraEstimada.length} con hora estimada</div>
        </div>
        <div className="kpi"><div className="kpi-label">Técnicos activos</div><div className="kpi-value">{data.tecnicos.filter((t) => t.activo).length}</div><div className="kpi-sub">especialidades dedicadas</div></div>
      </div>

      {stockCritico.length > 0 && (
        <div className="banner-warn"><Icon name="warn" size={15} /> Stock crítico: {stockCritico.map((i) => `${i.nombre} (${i.stock})`).join(' · ')}</div>
      )}
      {pasadasHoy.length > 0 && (
        <div className="banner-green"><Icon name="clock" size={15} /> Entregas programadas para hoy: {pasadasHoy.map((o) => o.bateria_serie).join(' · ')}</div>
      )}
    </div>
  );
}

function NewOrdenForm({ onClose }) {
  const data = useStore((s) => s.data);
  const addOrder = useStore((s) => s.addOrder);
  const [serie, setSerie] = useState('');
  const [existe, setExiste] = useState(true);
  const batSel = data.baterias.find((b) => b.numero_serie === serie);
  const [tipo, setTipo] = useState('Plomo-Acido');
  const [volt, setVolt] = useState('12V');
  const [cap, setCap] = useState('');
  const [aplic, setAplic] = useState('Automotriz');
  const [maMa, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [equipo, setEquipo] = useState('');
  const [cli, setCli] = useState('');
  const [falla, setFalla] = useState('');

  const onSerie = (val) => {
    setSerie(val);
    const b = data.baterias.find((x) => x.numero_serie === val);
    setExiste(!!b);
    if (b) {
      setTipo(b.tipo); setVolt(b.voltaje); setCap(b.capacidad); setAplic(b.aplicacion);
      setMarca(b.marca); setModelo(b.modelo); setEquipo(b.equipo);
      if (!cli) setCli(b.cliente_id);
    }
  };

  const batData = batSel || null;

  return (
    <div className="col">
      <div className="field"><label>Numero de serie</label><input className="input mono" value={serie} onChange={(e) => onSerie(e.target.value)} placeholder='ej. BAT-AUT-004' /></div>
      {serie && existe && batData && (
        <div className="banner-green"><Icon name="battery" size={15} /> Bateria existente: {batData.tipo} {batData.voltaje} {batData.capacidad}Ah · {batData.equipo} · Cliente: {data.clientes.find((c) => c.id === batData.cliente_id)?.nombre}</div>
      )}
      {serie && !existe && (
        <>
          <div className="banner-warn"><Icon name="warn" size={15} /> Serie nueva: se registrara la bateria en el sistema.</div>
          <div className="grid2">
            <div className="field"><label>Tipo</label>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {['Plomo-Acido', 'AGM', 'Gel', 'Litio (Ion-Litio)', 'Ni-Cd'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Voltaje</label>
              <select className="input" value={volt} onChange={(e) => setVolt(e.target.value)}>
                {['6V', '12V', '24V', '36V', '48V', '72V', '96V'].map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Capacidad (Ah)</label><input className="input" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="ej. 60" /></div>
            <div className="field"><label>Aplicacion</label>
              <select className="input" value={aplic} onChange={(e) => setAplic(e.target.value)}>
                {['Automotriz', 'Autoelevador', 'Ferroviario', 'Industrial/UPS', 'Marino'].map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="field"><label>Marca</label><input className="input" value={maMa} onChange={(e) => setMarca(e.target.value)} /></div>
            <div className="field"><label>Modelo</label><input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Equipo asociado</label><input className="input" value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="ej. Montacargas Toyota 8FGU25 - Unidad 9" /></div>
          </div>
        </>
      )}
      <div className="field"><label>Cliente</label>
        <select className="input" value={cli} onChange={(e) => setCli(e.target.value)}>
          <option value="">— Seleccionar cliente —</option>
          {data.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field"><label>Falla reportada / motivo de ingreso</label><textarea className="input" value={falla} onChange={(e) => setFalla(e.target.value)} placeholder="ej. No mantiene carga en operacion" /></div>
      <button className="btn primary block lg" disabled={!serie || !cli || !falla || (!existe && !cap)} onClick={() => { addOrder({
        serie, tipo, voltaje: volt, capacidad: cap, aplicacion: aplic, marca: maMa, modelo, equipo, cliente_id: cli, falla,
      }); onClose(); }}>
        <Icon name="plus" size={16} /> Crear orden de trabajo
      </button>
    </div>
  );
}

function Inventario() {
  const data = useStore((s) => s.data);
  const agregarStock = useStore((s) => s.agregarStock);
  const ajustarStock = useStore((s) => s.ajustarStock);
  const movimientosInsumo = useStore((s) => s.movimientosInsumo);
  const toastShow = useStore((s) => s.toastShow);
  const [extra, setExtra] = useState({});
  const [mov, setMov] = useState(null);       // { insumo, movimientos } | null
  const [ajuste, setAjuste] = useState(null); // { insumo, stock, motivo } | null
  const [busy, setBusy] = useState(false);

  const verMovimientos = async (insumo) => {
    try {
      const r = await movimientosInsumo(insumo.id);
      setMov(r);
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const guardarAjuste = async () => {
    if (!ajuste?.motivo?.trim()) return toastShow('El motivo del ajuste es obligatorio', 'warn');
    if (ajuste.stock === '' || ajuste.stock == null) return toastShow('Ingresá el stock contado', 'warn');
    setBusy(true);
    try {
      await ajustarStock(ajuste.insumo.id, ajuste.stock, ajuste.motivo);
      setAjuste(null);
    } finally {
      setBusy(false);
    }
  };

  const tipoMov = {
    alta: 'Alta', ingreso: 'Ingreso', consumo: 'Consumo', reversion: 'Devolución', ajuste: 'Ajuste',
  };

  return (
    <div className="col">
      <p className="muted" style={{ marginTop: 0 }}>El stock se descuenta en tiempo real cada vez que un técnico registra un insumo en una orden. Todo movimiento queda auditado con su autor y motivo.</p>
      <div className="card pad0">
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>Insumo</th><th>Categoría</th><th className="num">Stock</th><th className="num">P. unit.</th><th className="num">Valor en inventario</th><th style={{ width: 170 }}>Agregar stock</th><th style={{ width: 170 }}>Trazabilidad</th></tr>
            </thead>
            <tbody>
              {data.insumos.map((i) => {
                const crit = i.stock < 3;
                return (
                  <tr key={i.id}>
                    <td><b>{i.nombre}</b></td>
                    <td><span className="chip">{i.categoria}</span></td>
                    <td className="num"><span className={`badge ${i.stock === 0 ? 'gray' : crit ? 'red' : 'green'}`}>{i.stock}</span></td>
                    <td className="num">{fmtARS(i.precio)}</td>
                    <td className="num mono">{fmtARS(i.stock * i.precio)}</td>
                    <td>
                      <div className="row">
                        <input className="input" type="number" min={1} style={{ width: 70 }} value={extra[i.id] || ''} onChange={(e) => setExtra({ ...extra, [i.id]: e.target.value })} placeholder="cant" />
                        <button className="btn sm primary" onClick={() => { agregarStock(i.id, extra[i.id]); setExtra({ ...extra, [i.id]: '' }); }}><Icon name="plus" size={13} /> Cargar</button>
                      </div>
                    </td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => verMovimientos(i)}><Icon name="clock" size={13} /> Movimientos</button>
                        <button className="btn sm" onClick={() => setAjuste({ insumo: i, stock: i.stock, motivo: '' })}><Icon name="refresh" size={13} /> Ajustar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {mov && (
        <Modal title={`Movimientos de stock`} sub={`${mov.insumo.nombre} · stock actual ${mov.insumo.stock}`} onClose={() => setMov(null)}>
          <div className="col">
            {mov.movimientos.length === 0 && <p className="muted" style={{ margin: 0 }}>Sin movimientos registrados todavía.</p>}
            {mov.movimientos.map((m) => (
              <div key={m.id} className="row between" style={{ fontSize: 12.5, borderBottom: '1px solid var(--line-soft)', paddingBottom: 6 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className={`badge ${m.tipo === 'consumo' ? 'orange' : m.tipo === 'ajuste' ? 'amber' : m.tipo === 'reversion' ? 'blue' : 'green'}`}>{tipoMov[m.tipo] || m.tipo}</span>
                  <span>{Number(m.cantidad) > 0 && m.tipo !== 'ajuste' ? '+' : ''}{m.cantidad}</span>
                  <span className="muted">→ {m.stock_resultante}</span>
                </span>
                <span className="col" style={{ alignItems: 'flex-end', gap: 0 }}>
                  <span className="muted">{fmtFecha(m.fecha)}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{nombreActor(m.usuario, data)} · {m.motivo || 'sin motivo'}</span>
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {ajuste && (
        <Modal title="Ajuste por recuento físico" sub={ajuste.insumo.nombre} onClose={() => setAjuste(null)}>
          <div className="col">
            <div className="banner-info"><Icon name="info" size={15} /> El stock del sistema es {ajuste.insumo.stock}. El ajuste queda auditado con tu usuario y el motivo.</div>
            <div className="field">
              <label>Stock contado (unidades)</label>
              <input className="input" type="number" min={0} value={ajuste.stock} onChange={(e) => setAjuste({ ...ajuste, stock: e.target.value })} />
            </div>
            <div className="field">
              <label>Motivo del ajuste *</label>
              <input className="input" value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} placeholder="ej. recuento mensual, merma, rotura" />
            </div>
            <button className="btn primary block" disabled={busy || !ajuste.motivo.trim()} onClick={guardarAjuste}>
              <Icon name="check" size={14} /> {busy ? 'Ajustando...' : 'Registrar ajuste'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Tecnicos() {
  const data = useStore((s) => s.data);
  const cArgos = data.tecnicos.map((t) => {
    const active = data.ordenes.filter((o) => !['delivered', 'cancelled'].includes(o.estado) && o.tecnico_id === t.id);
    const bySpec = active.filter((o) => {
      const b = data.baterias.find((x) => x.numero_serie === o.bateria_serie);
      return b && b.aplicacion === 'Ferroviario' ? t.especialidad !== 'Ferroviario'
        : b && b.aplicacion === 'Autoelevador' ? !['Plomo-Acido', 'Litio / Ion-Litio', 'Industrial Pesado'].includes(t.especialidad)
        : !['Plomo-Acido', 'Industrial Pesado'].includes(t.especialidad);
    });
    return { t, active, bySpec };
  });

  return (
    <div className="grid3">
      {cArgos.map(({ t, active, bySpec }) => (
        <div key={t.id} className="card">
          <div className="row between">
            <b>{t.nombre}</b>
            <span className={`badge ${t.activo ? 'green' : 'gray'}`}>{t.activo ? 'Activo' : 'Inactivo'}</span>
          </div>
          <div className="chip" style={{ marginTop: 6 }}><Icon name="tools" size={12} /> {t.especialidad}</div>
          <div className="col mt8" style={{ gap: 2 }}>
            {t.certificaciones.map((c) => <span key={c} className="muted" style={{ fontSize: 12 }}> <Icon name="shield" size={11} /> {c}</span>)}
          </div>
          <div className="row mt16">
            <span className="badge amber">{active.length} órdenes activas</span>
            {bySpec.length > 0 && <span className="badge orange">{bySpec.length} fuera de especialidad</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Flotillas() {
  const data = useStore((s) => s.data);
  const porCliente = (id) => data.baterias.filter((b) => b.cliente_id === id);
  const ordenActual = (serie) => data.ordenes.find((o) => o.bateria_serie === serie && !['delivered', 'cancelled'].includes(o.estado));
  return (
    <div className="col">
      {data.clientes.filter((c) => c.tipo === 'flotilla_corporativa').map((c) => {
        const bats = porCliente(c.id);
        const garantiaBaja = bats.filter((b) => b.estado_vida === 'en_garantia');
        return (
          <div key={c.id} className="card">
            <div className="row between wrap">
              <div>
                <b style={{ fontSize: 15 }}><Icon name="building" size={15} /> {c.nombre}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>Contacto: {c.contacto} · {c.telefono} · {bats.length} equipos</div>
              </div>
              {garantiaBaja.length > 0 ? <span className="badge green">Garantía activa en {garantiaBaja.length}</span> : <span className="badge gray">Sin garantías activas</span>}
            </div>
            <div className="mt16" style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Equipo / Batería</th><th>Serie</th><th>Especificación</th><th>Estado actual</th><th>Vida útil</th><th>Alerta</th></tr></thead>
                <tbody>
                  {bats.map((b) => {
                    const act = ordenActual(b.numero_serie);
                    const bajaCap = act?.prueba_final?.estado === 'failed';
                    return (
                      <tr key={b.id}>
                        <td><b>{b.equipo}</b></td>
                        <td className="mono">{b.numero_serie}</td>
                        <td>{b.tipo} · {b.voltaje} · {b.capacidad}Ah</td>
                        <td>{act ? <EstadoPill estado={act.estado} /> : <span className="badge gray">Disponible</span>}</td>
                        <td>
                          {b.estado_vida === 'dada_de_baja' ? <span className="badge red">Baja</span>
                            : b.estado_vida === 'en_garantia' ? <span className="badge green">En garantia</span>
                            : <span className="badge amber">Activa</span>}
                        </td>
                        <td>
                          {bajaCap ? <span className="badge red">Capacidad baja</span> : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Garantias() {
  const data = useStore((s) => s.data);
  const rows = data.ordenes.filter((o) => o.estado === 'delivered' && o.garantia).map((o) => {
    const dias = Math.round((new Date(o.garantia.vence) - Date.now()) / 86400000);
    const pct = Math.max(0, Math.min(100, Math.round((dias / (o.garantia.meses * 30)) * 100)));
    return { o, dias, pct };
  }).sort((a, b) => a.dias - b.dias);
  return (
    <div>
      <div className="card pad0 mt16">
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Serie</th><th>Cliente</th><th>Garantia</th><th>Vence</th><th style={{ width: 160 }}>Vigencia</th></tr></thead>
            <tbody>
              {rows.map(({ o, dias, pct }) => (
                <tr key={o.id}>
                  <td className="mono"><b>{o.bateria_serie}</b></td>
                  <td>{data.clientes.find((c) => c.id === o.cliente_id)?.nombre}</td>
                  <td>{o.garantia.meses} meses / {o.garantia.ciclos} ciclos</td>
                  <td>
                    <span className={`badge ${dias < 0 ? 'red' : dias <= 30 ? 'orange' : 'green'}`}>
                      {dias < 0 ? `Vencida (hace ${Math.abs(dias)}d)` : `En ${dias} dias`}
                    </span>
                    <div className="muted" style={{ fontSize: 11 }}>{fmtFecha(o.garantia.vence)}</div>
                  </td>
                  <td>
                    <div className="warranty-bar">
                      <div style={{ width: `${pct}%`, background: dias <= 30 ? 'var(--orange)' : 'var(--green)' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BajaYReciclaje({ onAbrirOrden }) {
  const data = useStore((s) => s.data);
  const marcarReciclada = useStore((s) => s.marcarReciclada);
  const bajas = data.bajas;
  const recicladas = bajas.filter((x) => x.reciclada).length;
  return (
    <div className="col">
      <div className="grid2">
        <div className="kpi"><div className="kpi-label">Baterías dadas de baja</div><div className="kpi-value" style={{ color: 'var(--red)' }}>{bajas.length}</div><div className="kpi-sub">trazabilidad de disposición</div></div>
        <div className="kpi"><div className="kpi-label">Recicladas / dispuestas</div><div className="kpi-value green">{recicladas}</div><div className="kpi-sub">{bajas.length - recicladas} pendientes de disposición final</div></div>
      </div>
      <div className="card pad0 mt16">
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Serie</th><th>Fecha de baja</th><th>Motivo</th><th>Disposicion</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {bajas.map((x) => {
                const bat = data.baterias.find((bb) => bb.id === x.bateria_id);
                return (
                  <tr key={x.id}>
                    <td className="mono"><b>{x.serie}</b></td>
                    <td>{fmtFecha(x.fecha)}</td>
                    <td>{x.motivo}</td>
                    <td>{x.disposicion}</td>
                    <td>{x.reciclada ? <span className="badge green">Reciclada</span> : <span className="badge red">Pendiente</span>}</td>
                    <td>
                      <div className="row">
                        {!x.reciclada && <button className="btn sm" onClick={() => marcarReciclada(x.id)}><Icon name="recycl" size={13} /> Marcar reciclada</button>}
                        {bat && onAbrirOrden && (
                          <button className="btn sm ghost" onClick={() => onAbrirOrden(data.ordenes.find((o) => o.bateria_serie === x.serie && o.estado === 'cancelled'))}><Icon name="clock" size={13} /> Ver</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HistorialSerie() {
  const data = useStore((s) => s.data);
  const [q, setQ] = useState('');
  const res = useMemo(() => {
    if (!q.trim()) return [];
    return data.ordenes.filter((o) => o.bateria_serie.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.fecha_ingreso.localeCompare(a.fecha_ingreso));
  }, [q, data]);
  const bats = useMemo(() => {
    if (!q.trim()) return [];
    return data.baterias.filter((b) => b.numero_serie.toLowerCase().includes(q.trim().toLowerCase()));
  }, [q, data]);
  return (
    <div className="col">
      <div className="field"><label>Buscar por numero de serie</label>
        <div className="row">
          <Icon name="search" size={16} style={{ position: 'absolute', marginLeft: 12 }} />
          <input className="input" style={{ paddingLeft: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ej. BAT-MTC-101" />
        </div>
      </div>
      {bats.map((b) => (
        <div key={b.id} className="card">
          <div className="row between wrap">
            <div>
              <b style={{ fontSize: 15 }}>{b.numero_serie}</b>
              <span className="chip" style={{ marginLeft: 8 }}><Icon name={appIconName(b.aplicacion)} size={12} /> {b.aplicacion}</span>
            </div>
            <span className={`badge ${b.estado_vida === 'dada_de_baja' ? 'red' : b.estado_vida === 'en_garantia' ? 'green' : 'amber'}`}>
              {b.estado_vida === 'dada_de_baja' ? 'Dada de baja' : b.estado_vida === 'en_garantia' ? 'En garantia' : 'Activa'}
            </span>
          </div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>{b.tipo} · {b.voltaje} · {b.capacidad}Ah · {b.equipo}</div>
          <div className="mt16">
            {res.length === 0 && <p className="muted">Sin órdenes historicas registradas.</p>}
            {res.map((o) => (
              <div key={o.id} className="row between" style={{ borderTop: '1px solid var(--line-soft)', padding: '10px 0' }}>
                <span className="mono">{o.id}</span>
                <span>{fmtDate(o.fecha_ingreso)}</span>
                {o.cotizacion && <span className="mono">{fmtARS(o.monto_cobrado || o.cotizacion.monto)}</span>}
                <EstadoPill estado={o.estado} />
                {o.garantia && <span className="badge green">Garantia {o.garantia.meses}m</span>}
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{res.length} orden(es) · ciclos estimados {b.ciclos_estimados}</p>
          </div>
        </div>
      ))}
      {q.trim() && bats.length === 0 && <div className="empty"><div className="big">?</div>Numero de serie no encontrado</div>}
    </div>
  );
}

export default function Hub() {
  const data = useStore((s) => s.data);
  const [tab, setTab] = useState('kanban');
  const [sel, setSel] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [altas, setAltas] = useState(false);
  const activas = data.ordenes.filter((o) => !['delivered', 'cancelled'].includes(o.estado)).length;

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">Hub administrativo</h1>
          <p className="page-sub">Operacion del taller · {activas} ordenes activas · {fmtARS(data.ordenes.filter((o) => o.estado === 'delivered').reduce((a, o) => a + (o.monto_cobrado || 0), 0))} facturados en total</p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => setNueva(true)}><Icon name="plus" size={15} /> Nueva orden</button>
          <button className="btn" onClick={() => setAltas(true)}><Icon name="users" size={15} /> Altas</button>
        </div>
      </div>

      <div className="tabs mb16">
        <button className={`tab ${tab === 'kanban' ? 'active' : ''}`} onClick={() => setTab('kanban')}><Icon name="battery" size={13} /> Kanban</button>
        <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}><Icon name="gauge" size={13} /> Dashboard del día</button>
        <button className={`tab ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}><Icon name="search" size={13} /> Historial por serie</button>
        <button className={`tab ${tab === 'inventario' ? 'active' : ''}`} onClick={() => setTab('inventario')}><Icon name="box" size={13} /> Inventario</button>
        <button className={`tab ${tab === 'tecnicos' ? 'active' : ''}`} onClick={() => setTab('tecnicos')}><Icon name="users" size={13} /> Técnicos</button>
        <button className={`tab ${tab === 'flotillas' ? 'active' : ''}`} onClick={() => setTab('flotillas')}><Icon name="building" size={13} /> Flotillas</button>
        <button className={`tab ${tab === 'garantias' ? 'active' : ''}`} onClick={() => setTab('garantias')}><Icon name="shield" size={13} /> Garantías</button>
        <button className={`tab ${tab === 'baja' ? 'active' : ''}`} onClick={() => setTab('baja')}><Icon name="recycl" size={13} /> Baja / reciclaje</button>
        <button className={`tab ${tab === 'cotizador' ? 'active' : ''}`} onClick={() => setTab('cotizador')}><Icon name="calculator" size={13} /> Cotizador</button>
        <button className={`tab ${tab === 'whatsapp' ? 'active' : ''}`} onClick={() => setTab('whatsapp')}><Icon name="mail" size={13} /> WhatsApp</button>
      </div>

      {tab === 'kanban' && <Kanban onOpen={setSel} />}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'historial' && <HistorialSerie />}
      {tab === 'inventario' && <Inventario />}
      {tab === 'tecnicos' && <Tecnicos />}
      {tab === 'flotillas' && <Flotillas />}
      {tab === 'garantias' && <Garantias />}
      {tab === 'baja' && <BajaYReciclaje onAbrirOrden={setSel} />}
      {tab === 'cotizador' && <CotizadorConfig />}
      {tab === 'whatsapp' && <WhatsAppBandeja />}

      {nueva && (
        <div className="modal-back">
          <div className="modal">
            <div className="row between mb16">
              <div><h3>Crear orden manual</h3><div className="sub">Registra el ingreso de la bateria al taller</div></div>
              <button className="btn icon sm" onClick={() => setNueva(false)}><Icon name="x" size={14} /></button>
            </div>
            <NewOrdenForm onClose={() => setNueva(false)} />
          </div>
        </div>
      )}

      {altas && (
        <div className="modal-back">
          <div className="modal">
            <div className="row between mb16">
              <div><h3>Altas administrativas</h3><div className="sub">Da de alta clientes, tecnicos e insumos del taller</div></div>
              <button className="btn icon sm" onClick={() => setAltas(false)}><Icon name="x" size={14} /></button>
            </div>
            <AltasForm onClose={() => setAltas(false)} />
          </div>
        </div>
      )}

      {sel && <OrdenDetalle orden={sel} role="admin" onClose={() => setSel(null)} />}
    </div>
  );
}