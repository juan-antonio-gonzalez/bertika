import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { api } from '../store/api';
import { Modal, EstadoPill, Timeline, Icon, fmtDate, fmtARS, appIconName, fmtFecha, diasEnEstado, etiquetaAntiguedad, tonoAntiguedad, waNumero, numeroEnRango, nombreActor } from './ui';
import { MIN_CAPACIDAD_PCT } from '../data/reglas';
import { OrdenTrabajo, ComprobanteEntrega } from './DocumentosTaller';
import { CONTACTO, OFICIAL } from '../data/siteData';
import EtiquetaBateria from './EtiquetaBateria';

function Warning({ text }) {
  return <div className="banner-warn"><Icon name="warn" size={15} /> {text}</div>;
}

function DiagnosticoForm({ orden }) {
  const saveDiagnosis = useStore((s) => s.saveDiagnosis);
  const toastShow = useStore((s) => s.toastShow);
  const bat = useStore((s) => s.data.baterias.find((b) => b.numero_serie === orden.bateria_serie));
  const [v, setV] = useState(orden.diagnostico?.voltaje_medido ?? '');
  const [ri, setRi] = useState(orden.diagnostico?.resistencia_interna ?? '');
  const [pc, setPc] = useState(orden.diagnostico?.prueba_carga ?? 'passed');
  const [notas, setNotas] = useState(orden.diagnostico?.notas ?? '');
  const [serv, setServ] = useState(orden.diagnostico?.servicioTipo ?? '');
  const [fotos, setFotos] = useState(orden.diagnostico?.fotos || []);
  const [busy, setBusy] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const vNum = numeroEnRango(v, 0.1, 1000);
  const riNum = numeroEnRango(ri, 0.01, 100000);
  const vNominal = parseFloat(String(bat?.voltaje ?? '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

  const errV = v === '' ? 'Falta la lectura de voltaje' : vNum === null ? 'Voltaje fuera de rango (0,1 a 1000 V)' : '';
  const errRi = ri === '' ? 'Falta la resistencia interna' : riNum === null ? 'Resistencia fuera de rango (0,01 a 100.000 mΩ)' : '';
  const aviso = vNominal && vNum !== null && vNum > vNominal * 1.5
    ? `El voltaje medido (${vNum} V) supera ampliamente el nominal del banco (${bat.voltaje}). Verificá la escala del instrumento.`
    : '';

  const guardar = async () => {
    if (busy) return;
    if (errV || errRi) return toastShow(errV || errRi, 'warn');
    setBusy(true);
    try {
      await saveDiagnosis(orden.id, { voltaje: vNum, resistencia: riNum, pruebaCarga: pc, notas, servicioTipo: serv });
    } finally {
      setBusy(false);
    }
  };

  // Evidencia fotografica del estado de ingreso (endpoint multipart ya existente).
  const subirFotos = async (files) => {
    const lista = [...(files || [])].slice(0, 6);
    if (!lista.length) return;
    const fd = new FormData();
    for (const f of lista) fd.append('fotos', f);
    setSubiendo(true);
    try {
      const r = await api(`/diagnostico/${orden.id}/fotos`, { form: fd });
      setFotos(r.fotos || []);
      toastShow(`${lista.length} foto(s) adjuntadas al diagnostico`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="col">
      <div className="grid2">
        <div className="field">
          <label>Voltaje medido (V)</label>
          <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={bat?.voltaje ? `Nominal: ${bat.voltaje}` : 'ej. 12.4'} />
          {v !== '' && errV && <small style={{ color: 'var(--red)' }}>{errV}</small>}
        </div>
        <div className="field">
          <label>Resistencia interna (mΩ)</label>
          <input className="input" value={ri} onChange={(e) => setRi(e.target.value)} placeholder="ej. 6.5" />
          {ri !== '' && errRi && <small style={{ color: 'var(--red)' }}>{errRi}</small>}
        </div>
      </div>
      {aviso && <div className="banner-warn"><Icon name="warn" size={15} /> {aviso}</div>}
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
      <div className="field"><label>Notas técnicas</label><textarea className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Hallazgos, estado de celdas, sulfatación, etc." /></div>
      <div className="field">
        <label>Fotos del estado de ingreso (hasta 6)</label>
        <input className="input" type="file" accept="image/*" multiple disabled={subiendo} onChange={(e) => { subirFotos(e.target.files); e.target.value = ''; }} />
        {subiendo && <small className="muted">Subiendo fotos...</small>}
      </div>
      {fotos.length > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {fotos.map((f) => (
            <a key={f} href={f} target="_blank" rel="noopener noreferrer" title="Ver en tamaño completo">
              <img src={f} alt="Foto del diagnostico" style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
            </a>
          ))}
        </div>
      )}
      <button className="btn primary block" disabled={busy || !!errV || !!errRi} onClick={guardar}>
        <Icon name="bolt" size={15} /> {busy ? 'Guardando...' : 'Guardar diagnóstico y generar cotización'}
      </button>
    </div>
  );
}

function CotizacionForm({ orden }) {
  const generarCotizacion = useStore((s) => s.generarCotizacion);
  const [servicios, setServicios] = useState(orden.cotizacion?.servicios_costos || [{ nombre: '', monto: '' }]);
  const [insumos, setInsumos] = useState(orden.cotizacion?.insumos || []);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const totalServicios = servicios.reduce((a, s) => a + (Number(s.monto) || 0), 0);
  const totalInsumos = insumos.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precio) || 0), 0);
  const totalOtros = Number(extra) || 0;
  const total = totalServicios + totalInsumos + totalOtros;
  const guardar = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await generarCotizacion(orden.id, { monto: total, servicios, insumos });
    } finally {
      setBusy(false);
    }
  };
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
            <button className="btn icon sm danger" aria-label="Quitar renglón de mano de obra" onClick={() => setServicios(servicios.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
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
            <button className="btn icon sm danger" aria-label="Quitar renglón de insumo" onClick={() => setInsumos(insumos.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setInsumos([...insumos, { nombre: '', cantidad: 1, precio: '' }])}><Icon name="plus" size={13} /> Agregar insumo</button>
      </div>
      <div className="field"><label>Otros conceptos</label><input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ej. traslado a planta" /></div>
      <div className="col" style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '10px 14px', gap: 4 }}>
        <span className="row between" style={{ fontSize: 12.5 }}><span className="muted">Mano de obra ({servicios.filter((s) => s.nombre).length} renglón/es)</span><b>{fmtARS(totalServicios)}</b></span>
        <span className="row between" style={{ fontSize: 12.5 }}><span className="muted">Materiales ({insumos.length} renglón/es)</span><b>{fmtARS(totalInsumos)}</b></span>
        <span className="row between" style={{ fontSize: 12.5 }}><span className="muted">Otros</span><b>{fmtARS(totalOtros)}</b></span>
        <span className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          <b>TOTAL</b>
          <b style={{ fontSize: 18, color: 'var(--amber)' }}>{fmtARS(total)}</b>
        </span>
      </div>
      <button className="btn primary block" disabled={busy || !total || servicios.every((s) => !s.nombre)} onClick={guardar}>
        <Icon name="clipboard" size={15} /> {busy ? 'Guardando...' : 'Guardar cotizacion'}
      </button>
    </div>
  );
}

function InsumosForm({ orden }) {
  const data = useStore((s) => s.data);
  const registrarInsumo = useStore((s) => s.registrarInsumo);
  const revertirInsumo = useStore((s) => s.revertirInsumo);
  const [cat, setCat] = useState('Todas');
  const [q, setQ] = useState('');
  const [cant, setCant] = useState(1);
  const [enviando, setEnviando] = useState(null);

  // Categorias derivadas del inventario real: antes estaban hardcodeadas y una
  // categoria nueva cargada en la base no aparecia en el filtro.
  const categorias = useMemo(
    () => [...new Set(data.insumos.map((i) => i.categoria).filter(Boolean))].sort(),
    [data.insumos]
  );
  const texto = q.trim().toLowerCase();
  const lis = data.insumos.filter((i) => (cat === 'Todas' || i.categoria === cat)
    && (!texto || i.nombre.toLowerCase().includes(texto)));

  const usados = orden.insumos_utilizados || [];
  const costoMateriales = usados.reduce((a, u) => a + (Number(u.precio) || 0) * (Number(u.cantidad) || 0), 0);
  const cotizado = Number(orden.cotizacion?.monto) || 0;

  const agregar = async (insumo) => {
    if (enviando) return;
    setEnviando(insumo.id);
    try {
      await registrarInsumo(orden.id, insumo.id, cant);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="col">
      <div className="field">
        <label>Buscar insumo</label>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ej. celda, electrolito, borne" />
      </div>
      <div className="grid2">
        <div className="field"><label>Categoria</label>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option>Todas</option>
            {categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label>Cantidad</label><input className="input" type="number" min={1} value={cant} onChange={(e) => setCant(e.target.value)} /></div>
      </div>
      <div className="col" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {lis.length === 0 && <p className="muted">Sin insumos que coincidan con el filtro.</p>}
        {lis.map((i) => {
          const crit = i.stock < 3;
          return (
            <button key={i.id} className="btn" style={{ justifyContent: 'space-between', opacity: i.stock <= 0 ? 0.45 : 1 }} disabled={i.stock <= 0 || !!enviando} onClick={() => agregar(i)}>
              <span className="row" style={{ textAlign: 'left' }}><Icon name={i.categoria === 'Celdas' ? 'battery' : 'box'} size={14} /> {i.nombre}</span>
              <span className="row">
                <span className={`badge ${crit ? 'red' : i.stock === 0 ? 'gray' : 'green'}`}>{i.stock} disp.</span>
                <span className="muted mono">{fmtARS(i.precio)}</span>
                {enviando === i.id && <span className="muted" style={{ fontSize: 11 }}>...</span>}
              </span>
            </button>
          );
        })}
      </div>
      {usados.length > 0 && (
        <div className="col" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <label className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Insumos usados en esta orden</label>
          {usados.map((u, i) => (
            <div key={`${u.insumo_id || u.nombre}-${i}`} className="row between" style={{ fontSize: 13 }}>
              <span>{u.nombre} x{u.cantidad}</span>
              <span className="row" style={{ gap: 8 }}>
                <span className="muted">{fmtARS(u.precio * u.cantidad)}</span>
                <button className="btn icon sm" title="Devolver al stock (carga por error)" aria-label={`Devolver ${u.nombre} al stock`} onClick={() => revertirInsumo(orden.id, i)}>
                  <Icon name="recycl" size={12} />
                </button>
              </span>
            </div>
          ))}
          <div className="row between" style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px', marginTop: 6 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Costo de materiales</span>
            <b>{fmtARS(costoMateriales)}</b>
          </div>
          {cotizado > 0 && costoMateriales > cotizado && (
            <div className="banner-red" style={{ marginTop: 8 }}>
              <Icon name="warn" size={15} /> Los materiales ({fmtARS(costoMateriales)}) ya superan lo cotizado
              ({fmtARS(cotizado)}): revisá la cotización antes de entregar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PruebaFinalForm({ orden }) {
  const completeTest = useStore((s) => s.completeTest);
  const toastShow = useStore((s) => s.toastShow);
  const bat = useStore((s) => s.data.baterias.find((b) => b.numero_serie === orden.bateria_serie));
  const [cap, setCap] = useState(orden.prueba_final?.capacidad_medida ?? '');
  const [obs, setObs] = useState(orden.prueba_final?.obs ?? '');
  const [res, setRes] = useState('passed');
  const [busy, setBusy] = useState(false);

  const nominal = Number(bat?.capacidad) || 0;
  const medida = numeroEnRango(cap, 0.1, 1000000);
  const pct = nominal > 0 && medida !== null ? Math.round((medida / nominal) * 100) : null;
  const cumple = pct !== null && pct >= MIN_CAPACIDAD_PCT;
  const tono = pct === null ? 'gray' : cumple ? 'green' : pct >= 60 ? 'orange' : 'red';
  const minimoAh = Math.round((nominal * MIN_CAPACIDAD_PCT) / 100);

  const registrar = async () => {
    if (busy) return;
    if (medida === null) return toastShow('Ingresá la capacidad medida en Ah', 'warn');
    if (res === 'passed' && pct !== null && !cumple) {
      return toastShow(`No se puede aprobar: ${pct}% de la capacidad nominal. El minimo es ${MIN_CAPACIDAD_PCT}%.`, 'error');
    }
    setBusy(true);
    try {
      await completeTest(orden.id, { capacidad: medida, resultado: res, obs });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col">
      <div className="grid2">
        <div className="field">
          <label>Capacidad medida (Ah) *</label>
          <input className="input" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={nominal ? `Nominal: ${nominal} Ah` : 'ej. 42'} />
        </div>
        <div className="field"><label>Resultado</label>
          <select className="input" value={res} onChange={(e) => setRes(e.target.value)}>
            <option value="passed">Aprobada</option>
            <option value="failed">Fallida</option>
          </select>
        </div>
      </div>

      {/* Criterio de aceptacion evaluado en vivo contra la capacidad nominal. */}
      {nominal > 0 && (
        <div className="row between" style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '10px 14px' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Nominal {nominal} Ah · mínimo {MIN_CAPACIDAD_PCT}% ({minimoAh} Ah)
          </span>
          {pct !== null && <span className={`badge ${tono}`}>{pct}% de la nominal</span>}
        </div>
      )}
      {res === 'passed' && pct !== null && !cumple && (
        <div className="banner-red">
          <Icon name="warn" size={15} /> Capacidad insuficiente ({pct}%). No se puede aprobar por debajo del {MIN_CAPACIDAD_PCT}%:
          registrala como fallida (la orden vuelve a reparación).
        </div>
      )}
      {res === 'failed' && pct !== null && cumple && (
        <div className="banner-warn">
          <Icon name="warn" size={15} /> La capacidad alcanza el criterio ({pct}%) pero marcás la prueba como fallida:
          queda el motivo en las notas.
        </div>
      )}

      <div className="field"><label>Notas tecnicas</label><textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Protocolo de carga, temperatura, celdas reemplazadas, etc." /></div>
      <button className="btn primary block" disabled={busy || medida === null || (res === 'passed' && pct !== null && !cumple)} onClick={registrar}>
        <Icon name="gauge" size={15} /> {busy ? 'Registrando...' : 'Registrar resultado de prueba final'}
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
  const toastShow = useStore((s) => s.toastShow);
  const versionesCotizacion = useStore((s) => s.versionesCotizacion);
  const [sec, setSec] = useState('info');
  const [tecnicoSel, setTecnicoSel] = useState(orden.tecnico_id || '');
  const [confirm, setConfirm] = useState(null);
  const [entregar, setEntregar] = useState(false);
  const [compartir, setCompartir] = useState(null);
  const [versiones, setVersiones] = useState(null);

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

  // Control del piso: antiguedad en el estado actual y posible reproceso en garantia.
  const diasPiso = diasEnEstado(orden);
  const garantiaVigente = historial.find((h) => h.id !== orden.id && h.garantia?.vence
    && new Date(h.garantia.vence) > new Date());
  const waCliente = cliente?.telefono ? waNumero(cliente.telefono) : '';
  const msgCliente = `Hola ${cliente?.nombre || ''}, te escribimos del taller Bertika por la batería ${orden.bateria_serie} (orden ${orden.id}). Seguimiento en tiempo real: ${window.location.origin}/tracker/${orden.id}`;

  const deliver = () => {
    deliverOrder(orden.id, confirm?.monto, confirm?.meses, confirm?.ciclos, confirm?.medio);
    setConfirm(null);
    setEntregar(false);
    if (onEntregado) onEntregado();
    onClose();
  };

  // Enlaces publicos: cotizacion con firma HMAC + tracker. Genera o reusa el
  // enlace firmado del servidor para compartirlo por WhatsApp.
  const abrirCompartir = async () => {
    try {
      const r = await api(`/ordenes/${orden.id}/compartir`, { method: 'POST' });
      setCompartir(r);
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const textoCompartir = compartir
    ? `Seguimiento de tu batería ${orden.bateria_serie}: ${compartir.tracker}\nCotización para aprobar: ${compartir.cotizacion}`
    : '';

  // Auditoria: versiones anteriores de la cotizacion (quien, cuando, por cuanto).
  const verVersiones = async () => {
    try {
      setVersiones(await versionesCotizacion(orden.id));
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const actionsAvailable = orden.estado === 'received' || orden.estado === 'diagnosing' || orden.estado === 'approved' || orden.estado === 'in_repair' || orden.estado === 'testing' || orden.estado === 'ready' || orden.estado === 'quoted';

  return (
    <Modal title={`Orden ${orden.id}`} sub={`${orden.bateria_serie} · ${bateria ? bateria.aplicacion : ''}`} onClose={onClose}>
      {!tecnico && !esTec && orden.estado !== 'delivered' && (
        <div className="banner-orange" style={{ background: 'var(--orange-bg)', color: 'var(--orange)', border: '1px solid rgba(255,122,26,.5)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontWeight: 700 }}>
          <Icon name="warn" size={15} /> Sin técnico asignado. Asigná uno para que pueda operar.
        </div>
      )}

      {fallaSpec && orden.estado !== 'delivered' && (
        <Warning>Posible desajuste de especialidad: <b>{bateria.aplicacion}</b> vs tecnico <b>{tecnico.especialidad}</b> (validacion soft).</Warning>
      )}

      {garantiaVigente && !['delivered', 'cancelled'].includes(orden.estado) && (
        <div className="banner-info">
          <Icon name="shield" size={15} />
          <span>
            <b>Posible reproceso en garantía.</b> La orden <b>{garantiaVigente.id}</b> entregó esta batería con garantía
            hasta el {fmtFecha(garantiaVigente.garantia.vence)}. Verificá la cobertura antes de cotizar: un reproceso en
            garantía no se cobra.
          </span>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${sec === 'info' ? 'active' : ''}`} onClick={() => setSec('info')}>Orden</button>
        <button className={`tab ${sec === 'trabajo' ? 'active' : ''}`} onClick={() => setSec('trabajo')}>Trabajo</button>
        <button className={`tab ${sec === 'eventos' ? 'active' : ''}`} onClick={() => setSec('eventos')}>Eventos</button>
        {role !== 'cliente' && (
          <button className={`tab ${sec === 'documentos' ? 'active' : ''}`} onClick={() => setSec('documentos')}>Documentos</button>
        )}
        {role !== 'cliente' && (
          <button className={`tab ${sec === 'etiqueta' ? 'active' : ''}`} onClick={() => setSec('etiqueta')}>Etiqueta</button>
        )}
        {actionsAvailable && !esTec && orden.estado !== 'quoted' && (
          <button className={`tab ${sec === 'acciones' ? 'active' : ''}`} onClick={() => setSec('acciones')}>Acciones admin</button>
        )}
      </div>

      {sec === 'info' && (
        <div className="col">
          <div className="row between">
            <EstadoPill estado={orden.estado} />
            <span className="row" style={{ gap: 8 }}>
              {diasPiso != null && !['delivered', 'cancelled'].includes(orden.estado) && (
                <span className={`badge ${tonoAntiguedad(diasPiso)}`} title="Antigüedad en el estado actual">
                  <Icon name="clock" size={11} /> {etiquetaAntiguedad(diasPiso)} en este estado
                </span>
              )}
              <span className="muted mono">{fmtFecha(orden.fecha_ingreso)}</span>
            </span>
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
              <div className="card-title"><Icon name="users" size={14} /> Cliente / Técnico</div>
              <div className="col mt8" style={{ gap: 4 }}>
                <b>{cliente?.nombre}</b>
                <span className="muted">{cliente ? (cliente.tipo === 'flotilla_corporativa' ? cliente.contacto : `Tel: ${cliente.telefono}`) : ''}</span>
                <span>{tecnico ? `Técnico: ${tecnico.nombre}` : 'Sin técnico asignado'}</span>
                <span className="muted">{tecnico?.especialidad}</span>
                {role !== 'cliente' && waCliente && (
                  <a
                    className="btn sm mt8"
                    style={{ alignSelf: 'flex-start' }}
                    href={`https://wa.me/${waCliente}?text=${encodeURIComponent(msgCliente)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="mail" size={13} /> Avisar al cliente
                  </a>
                )}
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
          {orden.diagnostico?.fotos?.length > 0 && (
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="card-title"><Icon name="eye" size={14} /> Evidencia fotográfica ({orden.diagnostico.fotos.length})</div>
              <div className="row wrap mt8" style={{ gap: 8 }}>
                {orden.diagnostico.fotos.map((f) => (
                  <a key={f} href={f} target="_blank" rel="noopener noreferrer" title="Ver en tamaño completo">
                    <img src={f} alt="Foto del diagnostico" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          {orden.cotizacion && (
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="row between">
                <div className="card-title"><Icon name="clipboard" size={14} /> Cotización</div>
                <span className="badge amber">Total {fmtARS(orden.cotizacion.monto)}</span>
              </div>
              <ul className="ulist mt8">
                {(orden.cotizacion.servicios_costos || []).map((s, i) => (
                  <li key={i}><span>{s.nombre}</span><span className="mono">{fmtARS(s.monto)}</span></li>
                ))}
                {(orden.cotizacion.insumos || []).map((s, i) => (
                  <li key={i}><span>{s.nombre} x{s.cantidad}</span><span className="c mono">{fmtARS(s.precio * s.cantidad)}</span></li>
                ))}
              </ul>
            </div>
          )}
          {orden.cotizacion && role !== 'cliente' && (
            <div className="card" style={{ background: 'var(--bg-3)' }}>
              <div className="row between">
                <div className="card-title"><Icon name="clock" size={14} /> Versiones de la cotización</div>
                <button className="btn sm" onClick={verVersiones}><Icon name="search" size={12} /> Ver auditoría</button>
              </div>
              {versiones && (versiones.length === 0
                ? <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Sin versiones registradas (las cotizaciones anteriores a esta mejora no se guardaron).</p>
                : (
                  <div className="col mt8">
                    {versiones.map((v) => (
                      <div key={v.id} className="row between" style={{ fontSize: 12.5 }}>
                        <span className="muted">{fmtFecha(v.fecha)}</span>
                        <span>{nombreActor(v.usuario, data)}</span>
                        <b>{fmtARS(v.monto)}</b>
                      </div>
                    ))}
                  </div>
                ))}
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
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Garantía otorgada</div>
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
              <div className="card-title"><Icon name="clock" size={14} /> Historial de {orden.bateria_serie} ({historial.length} órdenes)</div>
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
              <div className="banner-green"><Icon name="bolt" size={15} /> Batería en taller. Realizá el diagnóstico para continuar el flujo.</div>
              {esTec && <DiagnosticoForm orden={orden} />}
              {!esTec && <p className="muted">El técnico asignado debe registrar el diagnóstico desde su vista operativa.</p>}
            </>
          )}
          {orden.estado === 'diagnosing' && esTec && (
            <>
              <div className="banner-green"><Icon name="volt" size={15} /> Registrá las lecturas del equipo y generá la cotización.</div>
              <DiagnosticoForm orden={orden} />
            </>
          )}
          {orden.estado === 'quoted' && role === 'cliente' && (
            <>
              <div className="banner-green"><Icon name="clipboard" size={15} /> Revisá la cotización y aprobá o rechazá el servicio.</div>
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <ul className="ulist">
                  {(orden.cotizacion?.servicios_costos || []).map((s, i) => <li key={i}><span>{s.nombre}</span><span className="mono">{fmtARS(s.monto)}</span></li>)}
                  {(orden.cotizacion?.insumos || []).map((s, i) => <li key={i}><span>{s.nombre} x{s.cantidad}</span><span className="mono">{fmtARS(s.precio * s.cantidad)}</span></li>)}
                </ul>
                <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <b>Total</b>
                  <b style={{ color: 'var(--amber)', fontSize: 18 }}>{fmtARS(orden.cotizacion?.monto)}</b>
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
              <p className="muted">Cotización enviada. Esperando aprobación del cliente.</p>
              <CotizacionForm orden={orden} />
              <button className="btn block mt8" onClick={abrirCompartir}><Icon name="mail" size={15} /> Compartir cotización con el cliente</button>
            </>
          )}
          {orden.estado === 'approved' && esTec && (
            <>
              <div className="banner-green"><Icon name="tools" size={15} /> Cotización aprobada. Iniciá la reparación / reacondicionamiento.</div>
              <button className="btn primary block lg" onClick={startRepair}><Icon name="tools" size={16} /> Iniciar reparación</button>
            </>
          )}
          {orden.estado === 'in_repair' && esTec && (
            <>
              <div className="banner-green"><Icon name="tools" size={15} /> Reparación en curso. Registrá los insumos y celdas utilizados.</div>
              <InsumosForm orden={orden} />
              <button className="btn primary lg block mt8" onClick={startTest}><Icon name="gauge" size={16} /> Iniciar prueba final de carga</button>
            </>
          )}
          {orden.estado === 'testing' && esTec && (
            <>
              <div className="banner-green"><Icon name="gauge" size={15} /> Prueba final en curso. Registrá el resultado (capacidad en Ah).</div>
              <PruebaFinalForm orden={orden} />
            </>
          )}
          {(orden.estado === 'ready' || orden.estado === 'delivered') && (
            <div className={orden.estado === 'ready' ? 'banner-green' : ''} style={orden.estado === 'delivered' ? { color: 'var(--muted)' } : {}}>
              <Icon name={orden.estado === 'ready' ? 'check' : 'truck'} size={15} />
              {orden.estado === 'ready' ? 'Batería lista para entrega. El admin registra cobro y garantía.' : 'Orden cerrada. La batería fue entregada y cobrada.'}
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
            <button className="btn danger block" onClick={() => setConfirm({ type: 'baja', motivo: 'Capacidad por debajo del 40% / no reparable' })}><Icon name="recycl" size={15} /> Dar de baja (no reparable / cancelar)</button>
          )}
          {orden.estado === 'quoted' && role === 'admin' && (
            <button className="btn danger block" onClick={() => { rechazarCotizacion(orden.id); onClose(); }}><Icon name="x" size={15} /> Cancelar orden (cliente rechaza)</button>
          )}
          {orden.estado === 'ready' && role === 'admin' && (
            <button className="btn primary block lg" onClick={() => setEntregar(true)}><Icon name="truck" size={16} /> Entregar y cobrar</button>
          )}
          <button className="btn block" onClick={abrirCompartir}><Icon name="mail" size={15} /> Compartir seguimiento y cotización</button>
        </div>
      )}

      {sec === 'eventos' && <Timeline eventos={orden.eventos} />}

      {sec === 'documentos' && (
        <div className="col">
          {['delivered', 'cancelled'].includes(orden.estado) && (
            <div className="banner-info"><Icon name="info" size={15} /> Comprobante de entrega disponible para imprimir y firmar.</div>
          )}
          {orden.estado === 'delivered' || orden.garantia ? (
            <ComprobanteEntrega orden={orden} bateria={bateria} cliente={cliente} tecnico={tecnico} />
          ) : (
            <div className="banner-warn"><Icon name="warn" size={15} /> El comprobante se emite al entregar la batería (con monto, medio de cobro y garantía).</div>
          )}
          <OrdenTrabajo orden={orden} bateria={bateria} cliente={cliente} tecnico={tecnico} historial={historial} />
        </div>
      )}

      {sec === 'etiqueta' && <EtiquetaBateria orden={orden} bateria={bateria} cliente={cliente} />}

      {confirm?.type === 'baja' && (
        <Modal title="Dar de baja la batería" sub="Trazabilidad obligatoria para disposición responsable" onClose={() => setConfirm(null)}>
          <div className="col">
            <Warning>La batería {orden.bateria_serie} quedará marcada como dada_de_baja (no reparable) y pasará al panel de reciclaje.</Warning>
            <div className="field"><label>Motivo</label><textarea className="input" value={confirm.motivo ?? ''} onChange={(e) => setConfirm({ ...confirm, motivo: e.target.value })} placeholder="Motivo de la baja (queda en la trazabilidad de reciclaje)" /></div>
            <button className="btn danger block" onClick={() => { darDeBaja(orden.id, confirm.motivo || 'Capacidad por debajo del 40% / no reparable'); setConfirm(null); onClose(); if (onBaja) onBaja(); }}>
              Confirmar baja
            </button>
          </div>
        </Modal>
      )}

      {entregar && (
        <Modal title="Entregar y cobrar" sub={`Orden ${orden.id} · ${orden.bateria_serie}`} onClose={() => setEntregar(false)}>
          <div className="col">
            <div className="field"><label>Monto cobrado (ARS)</label><input className="input" type="number" defaultValue={orden.cotizacion?.monto || ''} onChange={(e) => setConfirm({ ...confirm, monto: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><label>Garantía (meses)</label><input className="input" type="number" defaultValue={6} onChange={(e) => setConfirm({ ...confirm, meses: e.target.value })} /></div>
              <div className="field"><label>Ciclos de carga</label><input className="input" type="number" defaultValue={100} onChange={(e) => setConfirm({ ...confirm, ciclos: e.target.value })} /></div>
            </div>
            <div className="field">
              <label>Medio de cobro</label>
              <select className="input" value={confirm?.medio || 'Transferencia'} onChange={(e) => setConfirm({ ...confirm, medio: e.target.value })}>
                <option>Transferencia</option>
                <option>Efectivo</option>
                <option>Cheque</option>
                <option>Tarjeta</option>
                <option>Cuenta corriente</option>
              </select>
            </div>
            <button className="btn primary block lg" onClick={deliver}><Icon name="truck" size={16} /> Confirmar entrega y cobro</button>
          </div>
        </Modal>
      )}

      {compartir && (
        <Modal title="Compartir con el cliente" sub="Enlaces públicos de esta orden (sin login)" onClose={() => setCompartir(null)}>
          <div className="col">
            <div className="field">
              <label>Seguimiento en tiempo real</label>
              <input className="input mono" readOnly value={compartir.tracker} onFocus={(e) => e.target.select()} />
            </div>
            <div className="field">
              <label>Cotización para aprobar (enlace firmado)</label>
              <input className="input mono" readOnly value={compartir.cotizacion} onFocus={(e) => e.target.select()} />
            </div>
            <div className="grid2">
              <a
                className="btn primary"
                href={`https://wa.me/${CONTACTO.waVentas}?text=${encodeURIComponent(textoCompartir)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="mail" size={14} /> Enviar por WhatsApp
              </a>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(textoCompartir);
                  toastShow('Enlaces copiados', 'ok');
                }}
              >
                <Icon name="clipboard" size={14} /> Copiar enlaces
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="muted" style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--line-soft)', fontSize: 11.5, lineHeight: 1.7, textAlign: 'center' }}>
        Bertika® · Acumuladores Industriales · {CONTACTO.direccion}<br />
        Ventas (tel/WhatsApp): {CONTACTO.telefono} · Soporte técnico: {CONTACTO.telefonoSoporte}<br />
        {OFICIAL}
      </div>
    </Modal>
  );
}