import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import { Icon, Modal, FormGrid, fmtARS, fmtFecha } from '../components/ui';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { ETAPAS, normalizarEtapa } from '../data/crm.js';

const ABIERTAS = ['nuevo', 'presupuestado', 'negociando'];
const etapaLabel = (k) => ETAPAS.find((e) => e.key === k)?.label || k;
const puede = (user, clave) => user?.rol === 'admin' || user?.permisos?.[clave] === true;

function Kpi({ label, value, sub, tone }) {
  return <div className="kpi"><div className="kpi-label">{label}</div><div className="kpi-value" style={{ fontSize: 22, color: tone }}>{value}</div><div className="kpi-sub">{sub}</div></div>;
}

function OportunidadModal({ oportunidad, clientes, prospectos, busy, onGuardar, onCotizar, onPerder, onOrden, onClose }) {
  const [f, setF] = useState(() => ({
    titulo: oportunidad?.titulo || '', cliente_id: oportunidad?.cliente_id || '',
    prospecto_id: oportunidad?.prospecto_id || '',
    prospecto_nombre: oportunidad?.prospecto_nombre || '', prospecto_email: oportunidad?.prospecto_email || '', prospecto_telefono: oportunidad?.prospecto_telefono || '',
    etapa: oportunidad?.etapa || 'nuevo', monto_estimado: oportunidad?.monto_estimado ?? '',
    probabilidad: oportunidad?.probabilidad ?? 10, cierre_estimado: oportunidad?.cierre_estimado?.slice?.(0, 10) || '',
    responsable: oportunidad?.responsable || '', origen: oportunidad?.origen || '', serie: oportunidad?.serie || '',
    proxima_accion: oportunidad?.proxima_accion || '', fecha_proxima_accion: oportunidad?.fecha_proxima_accion?.slice?.(0, 10) || '',
    notas: oportunidad?.notas || '',
  }));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const enviar = (e) => { e.preventDefault(); if (f.titulo.trim()) onGuardar(f); };
  return (
    <Modal size="lg" title={oportunidad ? 'Oportunidad' : 'Nueva oportunidad'} sub={oportunidad ? oportunidad.cliente_nombre || oportunidad.prospecto_nombre || 'Sin cliente' : 'Cargá el negocio aunque todavía no haya orden.'} onClose={onClose} closeOnBackdrop={false}
      footer={(
        <>
          {oportunidad && puede(useStore.getState().user, 'ventas_cerrar') && !oportunidad.orden_id && (
            <button type="button" className="btn" onClick={onOrden} disabled={busy}><Icon name="tools" size={13} /> Crear orden</button>
          )}
          {oportunidad && puede(useStore.getState().user, 'ventas_cerrar') && !['ganado', 'perdido'].includes(oportunidad.etapa) && (
            <button type="button" className="btn danger" onClick={onPerder} disabled={busy}><Icon name="x" size={13} /> Perder</button>
          )}
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-oportunidad" className="btn primary" disabled={busy || !f.titulo.trim()}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      )}
    >
      <form id="form-oportunidad" onSubmit={enviar}>
        <div className="field"><label>Título *</label><input className="input" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej.: Cambio de baterías montacargas" data-autofocus /></div>
        <FormGrid cols={2}>
          <div className="field"><label>Prospecto vinculado</label>
            <select className="input" value={f.prospecto_id} onChange={(e) => {
              const id = e.target.value; const p = prospectos.find((x) => x.id === id);
              setF((prev) => ({ ...prev, prospecto_id: id, prospecto_nombre: p?.empresa || prev.prospecto_nombre, prospecto_email: p?.email || prev.prospecto_email, prospecto_telefono: p?.telefono || prev.prospecto_telefono }));
            }}>
              <option value="">— Sin prospecto —</option>
              {prospectos.filter((x) => x.estado !== 'convertido').map((x) => <option key={x.id} value={x.id}>{x.empresa} · {x.localidad || 'sin localidad'}</option>)}
            </select>
            <small className="ayuda">Si acepta la cotización, se convierte en cliente automáticamente.</small>
          </div>
          <div className="field"><label>Cliente</label><select className="input" value={f.cliente_id} onChange={(e) => set('cliente_id', e.target.value)}><option value="">— Prospecto —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}</option>)}</select></div>
          <div className="field"><label>Etapa</label><select className="input" value={f.etapa} onChange={(e) => set('etapa', e.target.value)}>{ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</select></div>
          {!f.cliente_id && <div className="field"><label>Prospecto</label><input className="input" value={f.prospecto_nombre} onChange={(e) => set('prospecto_nombre', e.target.value)} placeholder="Nombre o empresa" /></div>}
          {!f.cliente_id && <div className="field"><label>Email del prospecto</label><input className="input" type="email" value={f.prospecto_email} onChange={(e) => set('prospecto_email', e.target.value)} /></div>}
          {!f.cliente_id && <div className="field"><label>Teléfono del prospecto</label><input className="input" value={f.prospecto_telefono} onChange={(e) => set('prospecto_telefono', e.target.value)} /></div>}
          <div className="field"><label>Monto estimado</label><input className="input" value={f.monto_estimado} onChange={(e) => set('monto_estimado', e.target.value)} placeholder="150000" /></div>
          <div className="field"><label>Probabilidad (%)</label><input className="input" type="number" min="0" max="100" value={f.probabilidad} onChange={(e) => set('probabilidad', e.target.value)} /></div>
          <div className="field"><label>Cierre estimado</label><input className="input" type="date" value={f.cierre_estimado} onChange={(e) => set('cierre_estimado', e.target.value)} /></div>
          <div className="field"><label>Responsable</label><input className="input" value={f.responsable} onChange={(e) => set('responsable', e.target.value)} placeholder="email del vendedor" /></div>
          <div className="field"><label>Origen</label><input className="input" value={f.origen} onChange={(e) => set('origen', e.target.value)} placeholder="WhatsApp, recomendación, visita..." /></div>
          <div className="field"><label>N° de serie / equipo</label><input className="input" value={f.serie} onChange={(e) => set('serie', e.target.value)} placeholder="Para poder crear la orden" /></div>
          <div className="field"><label>Próxima acción</label><input className="input" value={f.proxima_accion} onChange={(e) => set('proxima_accion', e.target.value)} placeholder="Llamar, mandar muestra..." /></div>
          <div className="field"><label>Fecha próxima acción</label><input className="input" type="date" value={f.fecha_proxima_accion} onChange={(e) => set('fecha_proxima_accion', e.target.value)} /></div>
        </FormGrid>
        <div className="field"><label>Notas</label><textarea className="input" rows={3} value={f.notas} onChange={(e) => set('notas', e.target.value)} /></div>
        {oportunidad && (
          <div className="banner-info" style={{ marginTop: 8 }}>
            <Icon name="calculator" size={15} />
            <span>Cotización actual: <b>{oportunidad.cotizacion_estado || 'sin cotización'}</b>{oportunidad.cotizacion_total ? ` · ${fmtARS(oportunidad.cotizacion_total)}` : ''}. {oportunidad.orden_id ? ` Orden ${oportunidad.orden_id}.` : ''}</span>
            {puede(useStore.getState().user, 'ventas_cotizar') && <button type="button" className="btn sm" onClick={onCotizar}><Icon name="plus" size={12} /> Cotizar</button>}
          </div>
        )}
      </form>
    </Modal>
  );
}

function CotizacionModal({ oportunidad, onClose, onSaved }) {
  const user = useStore((s) => s.user);
  const [items, setItems] = useState([{ descripcion: '', cantidad: 1, precio: '', descuento: '' }]);
  const [descuento, setDescuento] = useState('');
  const [ivaPct, setIvaPct] = useState('');
  const [validez, setValidez] = useState(15);
  const [quote, setQuote] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!oportunidad?.cotizacion_actual_id) return;
    let vivo = true;
    setCargando(true);
    api(`/cotizaciones/${oportunidad.cotizacion_actual_id}`)
      .then((q) => {
        if (!vivo) return;
        setQuote(q);
        if (q.estado === 'borrador') {
          setItems((q.items || []).map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio: i.precio_unitario, descuento: i.descuento })));
          setDescuento(q.descuento || ''); setIvaPct(q.iva_pct || ''); setValidez(q.validez_dias || 15);
        }
        if (q.token) setLink(`${window.location.origin}/cotizacion-venta/${q.token}`);
      })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [oportunidad?.cotizacion_actual_id]);

  const setItem = (i, k, v) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const guardar = async (enviar = false) => {
    setBusy(true); setError('');
    try {
      const body = { items: items.map((i) => ({ descripcion: i.descripcion, cantidad: Number(i.cantidad) || 1, precio_unitario: i.precio, descuento: i.descuento })), descuento, iva_pct: ivaPct, validez_dias: validez };
      const q = quote?.estado === 'borrador' ? await api(`/cotizaciones/${quote.id}`, { method: 'PATCH', body }) : await api(`/oportunidades/${oportunidad.id}/cotizaciones`, { method: 'POST', body });
      setQuote(q);
      if (enviar) {
        const r = await api(`/cotizaciones/${q.id}/enviar`, { method: 'POST' });
        setQuote(r);
        setLink(`${window.location.origin}/cotizacion-venta/${r.token}`);
      }
      onSaved?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const editable = !quote || quote.estado === 'borrador';
  const nuevaVersion = () => { setQuote(null); setLink(''); setError(''); };
  return (
    <Modal size="lg" title={quote ? `Cotización v${quote.version}` : 'Nueva cotización'} sub={oportunidad.titulo} onClose={onClose} closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cerrar</button>
          {quote && !editable && puede(user, 'ventas_cotizar') && <button type="button" className="btn" onClick={nuevaVersion} disabled={busy}><Icon name="plus" size={13} /> Nueva versión</button>}
          {editable && <button type="button" className="btn" onClick={() => guardar(false)} disabled={busy}><Icon name="check" size={13} /> Guardar borrador</button>}
          {editable && puede(user, 'ventas_cotizar') && <button type="button" className="btn primary" onClick={() => guardar(true)} disabled={busy}><Icon name="mail" size={13} /> {busy ? 'Guardando...' : 'Guardar y enviar'}</button>}
        </>
      )}
    >
      {error && <div className="banner-red" style={{ marginBottom: 8 }}><div><Icon name="x" size={14} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando cotización...</p> : (
        <>
          {quote && !editable && <div className="banner-info" style={{ marginBottom: 8 }}><Icon name="info" size={14} /> Estado: <b>{quote.estado}</b>{quote.vista_en ? ' · vista por el cliente' : ''}. Las cotizaciones enviadas no se editan; creá una nueva versión desde la oportunidad.</div>}
          <div className="col" style={{ gap: 6 }}>
            {items.map((it, i) => (
              <div className="row wrap" key={i} style={{ gap: 6 }}>
                <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="Descripción" value={it.descripcion} onChange={(e) => setItem(i, 'descripcion', e.target.value)} disabled={!editable} />
                <input className="input" style={{ width: 72 }} type="number" min="0.01" value={it.cantidad} onChange={(e) => setItem(i, 'cantidad', e.target.value)} disabled={!editable} title="Cantidad" />
                <input className="input" style={{ width: 100 }} value={it.precio} onChange={(e) => setItem(i, 'precio', e.target.value)} placeholder="Precio" disabled={!editable} />
                <input className="input" style={{ width: 90 }} value={it.descuento} onChange={(e) => setItem(i, 'descuento', e.target.value)} placeholder="Desc." disabled={!editable} />
                {editable && <button type="button" className="btn sm ghost" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} disabled={items.length === 1}><Icon name="x" size={12} /></button>}
              </div>
            ))}
            {editable && <button type="button" className="btn sm" onClick={() => setItems((p) => [...p, { descripcion: '', cantidad: 1, precio: '', descuento: '' }])}><Icon name="plus" size={12} /> Agregar ítem</button>}
          </div>
          <FormGrid cols={3}>
            <div className="field"><label>Descuento global</label><input className="input" value={descuento} onChange={(e) => setDescuento(e.target.value)} disabled={!editable} /></div>
            <div className="field"><label>IVA (%)</label><input className="input" type="number" min="0" max="100" value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} disabled={!editable} /></div>
            <div className="field"><label>Validez (días)</label><input className="input" type="number" min="1" max="365" value={validez} onChange={(e) => setValidez(e.target.value)} disabled={!editable} /></div>
          </FormGrid>
          {quote && <p className="muted" style={{ fontSize: 12 }}>Total: <b>{fmtARS(quote.total)}</b> · {quote.estado}</p>}
          {link && <div className="field"><label>Link para el cliente</label><div className="row" style={{ gap: 6 }}><input className="input mono" readOnly value={link} /><button type="button" className="btn sm" onClick={() => navigator.clipboard?.writeText(link)}>Copiar</button><a className="btn sm" href={link} target="_blank" rel="noreferrer">Abrir</a></div></div>}
        </>
      )}
    </Modal>
  );
}

export default function Ventas() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const toastShow = useStore((s) => s.toastShow);
  const [vista, setVista] = useState(tab || 'pipeline');
  const [ops, setOps] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [hoy, setHoy] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [prospectos, setProspectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null);
  const [cotizando, setCotizando] = useState(null);
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const [o, r, h] = await Promise.all([api('/oportunidades'), api('/ventas/resumen'), api('/ventas/hoy')]);
      setOps(Array.isArray(o) ? o : []); setResumen(r); setHoy(h);
    } catch (e) { toastShow(e.message, 'error'); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api('/listas/clientes').then((r) => setClientes(Array.isArray(r) ? r : [])).catch(() => setClientes([]));
    api('/prospectos?limit=500').then((r) => setProspectos(Array.isArray(r.filas) ? r.filas : [])).catch(() => setProspectos([]));
  }, []);
  useEffect(() => { if (tab && tab !== vista) setVista(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnas = useMemo(() => ETAPAS.map((e) => ({ ...e, items: ops.filter((o) => normalizarEtapa(o.etapa) === e.key) })), [ops]);
  const puedeEditar = puede(user, 'ventas_editar');
  const puedeCotizar = puede(user, 'ventas_cotizar');

  const guardar = async (datos) => {
    setBusy(true);
    try {
      if (modal?.id) await api(`/oportunidades/${modal.id}`, { method: 'PATCH', body: datos });
      else await api('/oportunidades', { method: 'POST', body: datos });
      toastShow('Oportunidad guardada', 'ok'); setModal(null); await cargar();
    } catch (e) { toastShow(e.message, 'error'); } finally { setBusy(false); }
  };
  const mover = async (o, etapa) => {
    if (!puedeEditar) return;
    let motivo = '';
    if (etapa === 'perdido') { motivo = window.prompt('Motivo de pérdida:') || ''; if (!motivo.trim()) return; }
    try { await api(`/oportunidades/${o.id}`, { method: 'PATCH', body: { etapa, motivo_perdida: motivo || undefined } }); await cargar(); }
    catch (e) { toastShow(e.message, 'error'); }
  };
  const perder = async () => {
    const motivo = window.prompt('Motivo de pérdida:'); if (!motivo?.trim()) return;
    try { await api(`/oportunidades/${modal.id}/perder`, { method: 'POST', body: { motivo } }); setModal(null); await cargar(); } catch (e) { toastShow(e.message, 'error'); }
  };
  const crearOrden = async () => {
    try { const r = await api(`/oportunidades/${modal.id}/orden`, { method: 'POST' }); toastShow(`Orden ${r.id} creada`, 'ok'); setModal(null); await cargar(); }
    catch (e) { toastShow(e.message, 'error'); }
  };

  const setTab = (k) => { setVista(k); navigate(`/ventas/${k}`); };

  return (
    <div className="col">
      <PageHeader group="Comercial" title="Ventas" sub="Oportunidades, cotizaciones y seguimiento en un solo lugar."
        actions={puedeEditar ? <button className="btn primary" onClick={() => setModal({})}><Icon name="plus" size={14} /> Nueva oportunidad</button> : null} />

      <div className="grid4 mt8">
        <Kpi label="Pipeline abierto" value={fmtARS(resumen?.pipeline || 0)} sub={`${resumen?.abiertas || 0} oportunidades`} />
        <Kpi label="Ponderado" value={fmtARS(resumen?.ponderado || 0)} sub="por probabilidad" />
        <Kpi label="Estancadas" value={resumen?.estancadas || 0} sub="más de 7 días" tone={(resumen?.estancadas || 0) > 0 ? 'var(--amber)' : undefined} />
        <Kpi label="Cotizaciones pendientes" value={resumen?.cotizaciones?.pendientes || 0} sub={`${resumen?.cotizaciones?.aceptadas || 0} aceptadas`} />
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {[['pipeline', 'Pipeline'], ['cotizaciones', 'Cotizaciones'], ['hoy', 'Hoy']].map(([k, l]) => <button key={k} className={`chip${vista === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {cargando ? <p className="muted">Cargando ventas...</p> : vista === 'hoy' ? (
        <div className="grid2">
          <div className="card"><div className="card-title"><Icon name="clock" size={14} /> Próximas acciones</div>
            {(hoy?.acciones || []).length === 0 ? <p className="muted">Nada pendiente para hoy.</p> : <ul className="ulist">{hoy.acciones.map((o) => <li key={o.id}><span><b>{o.titulo}</b> <span className="muted">· {o.cliente_nombre || o.prospecto_nombre || 'Sin cliente'}</span></span><button className="btn sm" onClick={() => setModal(o)}>Abrir</button></li>)}</ul>}
          </div>
          <div className="card"><div className="card-title"><Icon name="warn" size={14} /> Cotizaciones sin respuesta</div>
            {(hoy?.sinRespuesta || []).length === 0 ? <p className="muted">Sin cotizaciones vencidas de seguimiento.</p> : <ul className="ulist">{hoy.sinRespuesta.map((q) => <li key={q.id}><span><b>{q.cliente_nombre || q.titulo}</b> <span className="muted">· {fmtARS(q.total)}</span></span><button className="btn sm" onClick={() => setModal(ops.find((o) => o.id === q.oportunidad_id) || { id: q.oportunidad_id, titulo: q.titulo })}>Abrir</button></li>)}</ul>}
          </div>
          <div className="card"><div className="card-title"><Icon name="warn" size={14} /> Estancadas</div>
            {(hoy?.estancadas || []).length === 0 ? <p className="muted">Ninguna oportunidad estancada.</p> : <ul className="ulist">{hoy.estancadas.map((o) => <li key={o.id}><span><b>{o.titulo}</b> <span className="muted">· {o.dias} días en {etapaLabel(o.etapa)}</span></span><button className="btn sm" onClick={() => setModal(o)}>Abrir</button></li>)}</ul>}
          </div>
        </div>
      ) : vista === 'cotizaciones' ? (
        <div className="card">
          <div className="card-title"><Icon name="calculator" size={14} /> Cotizaciones de oportunidades</div>
          <div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Oportunidad</th><th>Cliente</th><th>Estado</th><th className="num">Total</th><th /></tr></thead><tbody>
            {ops.filter((o) => o.cotizacion_estado).map((o) => <tr key={o.id}><td><b>{o.titulo}</b></td><td>{o.cliente_nombre || o.prospecto_nombre || '—'}</td><td><span className={`badge ${o.cotizacion_estado === 'aceptada' ? 'green' : o.cotizacion_estado === 'rechazada' ? 'red' : 'amber'}`}>{o.cotizacion_estado}</span></td><td className="num">{fmtARS(o.cotizacion_total || 0)}</td><td><button className="btn sm" onClick={() => setCotizando(o)}>Ver / cotizar</button></td></tr>)}
            {ops.filter((o) => o.cotizacion_estado).length === 0 && <tr><td colSpan={5}><span className="muted">Todavía no hay cotizaciones.</span></td></tr>}
          </tbody></table></div>
        </div>
      ) : (
        <div className="ventas-pipeline">
          {columnas.map((col) => (
            <div className="ventas-col" key={col.key}>
              <div className="ventas-col-head"><b>{col.label}</b><span>{col.items.length} · {fmtARS(col.items.reduce((n, o) => n + (Number(o.monto_estimado) || 0), 0))}</span></div>
              {col.items.map((o) => (
                <div className="ventas-card" key={o.id} onClick={() => setModal(o)}>
                  <div className="row between" style={{ gap: 6 }}><b>{o.titulo}</b>{o.dias_etapa > 7 && ABIERTAS.includes(normalizarEtapa(o.etapa)) && <span className="badge amber">{o.dias_etapa}d</span>}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{o.cliente_nombre || o.prospecto_nombre || 'Sin cliente'}</div>
                  <div className="row between" style={{ gap: 6, marginTop: 6 }}><b>{fmtARS(o.monto_estimado || 0)}</b><span className="muted">{o.probabilidad || 0}%</span></div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{o.cierre_estimado ? `Cierre ${fmtFecha(o.cierre_estimado)}` : 'Sin cierre estimado'}{o.responsable ? ` · ${o.responsable.split('@')[0]}` : ''}</div>
                  {o.proxima_accion && <div className="ventas-next"><Icon name="clock" size={11} /> {o.proxima_accion}{o.fecha_proxima_accion ? ` · ${fmtFecha(o.fecha_proxima_accion)}` : ''}</div>}
                  <div className="row wrap" style={{ gap: 4, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                    <select className="input" style={{ fontSize: 11, padding: '3px 6px' }} value={o.etapa} onChange={(e) => mover(o, e.target.value)} disabled={!puedeEditar}>{ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
                    {puedeCotizar && <button className="btn sm ghost" onClick={() => setCotizando(o)}><Icon name="calculator" size={11} /> Cotizar</button>}
                  </div>
                </div>
              ))}
              {col.items.length === 0 && <p className="muted" style={{ fontSize: 11.5 }}>—</p>}
            </div>
          ))}
        </div>
      )}

      {modal && <OportunidadModal oportunidad={modal.id ? modal : null} clientes={clientes} prospectos={prospectos} busy={busy} onGuardar={guardar} onCotizar={() => { setCotizando(modal); setModal(null); }} onPerder={perder} onOrden={crearOrden} onClose={() => setModal(null)} />}
      {cotizando && <CotizacionModal oportunidad={cotizando} onClose={() => setCotizando(null)} onSaved={cargar} />}
    </div>
  );
}
