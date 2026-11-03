import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/layout/PageHeader';
import { Icon, Modal, FormGrid, fmtFecha } from '../components/ui';
import { api, apiDescargar } from '../store/api';
import { useStore, usePermiso } from '../store/store';

const VACIO = {
  empresa: '', cuit: '', localidad: '', direccion: '', rubro: '', perfil_redes: '',
  contacto_nombre: '', contacto_cargo: '', email: '', email_secundario: '', telefono: '', tipo_contacto: '',
  estado: 'nuevo', observaciones: '', notas: '', responsable: '', proxima_accion: '',
  fecha_proxima_accion: '',
};

const LIMITE = 10;
const COLORES = ['gray', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'yellow', 'teal'];
const badge = (estado, estados) => {
  const e = estados.find((x) => x.clave === estado);
  return <span className={`badge ${e?.color || 'gray'}`}>{e?.nombre || estado}</span>;
};

function ProspectoForm({ abierto, inicial, estados, onGuardar, onClose, busy }) {
  const [form, setForm] = useState(VACIO);
  useEffect(() => { setForm({ ...VACIO, ...inicial }); }, [inicial, abierto]);
  if (!abierto) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    onGuardar(form);
  };
  return (
    <Modal
      size="xl"
      title={inicial?.id ? 'Editar prospecto' : 'Nuevo prospecto'}
      sub="Datos comerciales, contacto y seguimiento."
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-prospecto" className="btn primary" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      )}
    >
      <form id="form-prospecto" onSubmit={submit} className="col">
        <FormGrid cols={2}>
          <div className="field"><label>Empresa / Prospecto *</label><input className="input" value={form.empresa} onChange={(e) => set('empresa', e.target.value)} required /></div>
          <div className="field"><label>Zona / Localidad</label><input className="input" value={form.localidad} onChange={(e) => set('localidad', e.target.value)} /></div>
          <div className="field"><label>Dirección / Ubicación</label><input className="input" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} /></div>
          <div className="field"><label>CUIT / CUIL / DNI *</label><input className="input" value={form.cuit} onChange={(e) => set('cuit', e.target.value)} placeholder="Documento único" /></div>
          <div className="field"><label>Rubro / Equipamiento principal</label><input className="input" value={form.rubro} onChange={(e) => set('rubro', e.target.value)} /></div>
          <div className="field"><label>Perfil redes sociales</label><input className="input" value={form.perfil_redes} onChange={(e) => set('perfil_redes', e.target.value)} /></div>
          <div className="field"><label>Contacto</label><input className="input" value={form.contacto_nombre} onChange={(e) => set('contacto_nombre', e.target.value)} /></div>
          <div className="field"><label>Cargo</label><input className="input" value={form.contacto_cargo} onChange={(e) => set('contacto_cargo', e.target.value)} /></div>
          <div className="field"><label>Email de contacto</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="field"><label>Emails adicionales</label><input className="input" value={form.email_secundario || ''} onChange={(e) => set('email_secundario', e.target.value)} placeholder="Separados por coma" /></div>
          <div className="field"><label>Teléfono / WhatsApp</label><input className="input" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} /></div>
          <div className="field"><label>Tipo de contacto</label><input className="input" value={form.tipo_contacto} onChange={(e) => set('tipo_contacto', e.target.value)} /></div>
          <div className="field"><label>Estado de seguimiento</label>
            <select className="input" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
              {estados.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
            </select>
          </div>
          <div className="field"><label>Responsable</label><input className="input" value={form.responsable} onChange={(e) => set('responsable', e.target.value)} /></div>
          <div className="field"><label>Próxima acción</label><input className="input" value={form.proxima_accion} onChange={(e) => set('proxima_accion', e.target.value)} /></div>
          <div className="field"><label>Fecha próxima acción</label><input className="input" type="date" value={String(form.fecha_proxima_accion || '').slice(0, 10)} onChange={(e) => set('fecha_proxima_accion', e.target.value)} /></div>
        </FormGrid>
        <div className="field"><label>Observaciones / foco comercial</label><textarea className="input" rows={4} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} /></div>
        <div className="field"><label>Notas internas</label><textarea className="input" rows={3} value={form.notas} onChange={(e) => set('notas', e.target.value)} /></div>
      </form>
    </Modal>
  );
}

function ImportarModal({ abierto, onClose, onImportado }) {
  const toastShow = useStore((s) => s.toastShow);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [decisiones, setDecisiones] = useState({});
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => { if (!abierto) { setArchivo(null); setPreview(null); setDecisiones({}); setResultado(null); } }, [abierto]);

  const previsualizar = async (e) => {
    e.preventDefault();
    if (!archivo) return toastShow('Elegí un archivo .xlsx.', 'warn');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      const res = await api('/prospectos/importar/preview', { method: 'POST', form });
      setPreview(res);
      const inicial = {};
      res.filas.forEach((f, i) => {
        inicial[i] = f.clasificacion === 'nuevo' ? 'crear' : 'omitir';
      });
      setDecisiones(inicial);
    } catch (err) { toastShow(err.message, 'error'); } finally { setBusy(false); }
  };

  const confirmar = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await api('/prospectos/importar', { method: 'POST', body: { importacion_id: preview.importacion_id, decisiones } });
      setResultado(res);
      toastShow('Importación terminada', 'ok');
      onImportado();
    } catch (err) { toastShow(err.message, 'error'); } finally { setBusy(false); }
  };

  if (!abierto) return null;
  return (
    <Modal size="xl" title="Importar prospectos desde Excel" sub="Se lee la primera hoja. Antes de guardar nada vas a ver qué se crea, qué se omite y qué coincide parcialmente." onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cerrar</button>
          {!preview ? (
            <button type="submit" form="form-importar" className="btn primary" disabled={busy || !archivo}>
              <Icon name="upload" size={14} /> {busy ? 'Leyendo...' : 'Previsualizar'}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={confirmar} disabled={busy}>
              <Icon name="check" size={14} /> {busy ? 'Importando...' : 'Confirmar importación'}
            </button>
          )}
        </>
      )}
    >
      <form id="form-importar" onSubmit={previsualizar} className="col">
        <div className="field">
          <label>Archivo .xlsx</label>
          <input className="input" type="file" accept=".xlsx" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          <small className="ayuda">Se procesa la primera hoja. Máximo 2000 prospectos por archivo.</small>
        </div>
      </form>
      {resultado && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>Resultado:</b> {resultado.creados} creados · {resultado.actualizados} actualizados · {resultado.omitidos} omitidos · {resultado.errores} errores.
        </div>
      )}
      {preview && (
        <div className="col" style={{ marginTop: 14 }}>
          {preview.columnas_nuevas?.length > 0 && (
            <div className="banner-warn" style={{ marginBottom: 10 }}>
              <Icon name="warn" size={14} /> El Excel trae columnas nuevas que no están en la lista: <b>{preview.columnas_nuevas.join(', ')}</b>. Se importan los campos conocidos; para guardar esos datos, agregalos como campos de la lista.
            </div>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="badge blue">{preview.resumen.nuevos} nuevos</span>
            <span className="badge gray">{preview.resumen.exactos} exactos</span>
            <span className="badge amber">{preview.resumen.parciales} parciales</span>
            <span className="badge red">{preview.resumen.errores} errores</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 420 }}>
            <table className="tbl">
              <thead><tr><th>Fila</th><th>Empresa</th><th>Localidad</th><th>Email</th><th>Clasificación</th><th>Decisión</th></tr></thead>
              <tbody>
                {preview.filas.map((f, i) => (
                  <tr key={`${f.fila}-${i}`}>
                    <td>{f.fila}</td>
                    <td><b>{f.datos?.empresa || '—'}</b></td>
                    <td>{f.datos?.localidad || '—'}</td>
                    <td>{f.datos?.email || '—'}</td>
                    <td>
                      {f.clasificacion === 'nuevo' && <span className="badge blue">Nuevo</span>}
                      {f.clasificacion === 'exacto' && <span className="badge gray">Existe</span>}
                      {f.clasificacion === 'parcial' && <span className="badge amber">Parcial: {f.coincidencia?.empresa || 'coincide'}</span>}
                      {f.clasificacion === 'error' && <span className="badge red">{f.error}</span>}
                    </td>
                    <td>
                      <select className="input" value={decisiones[i] || 'omitir'} onChange={(e) => setDecisiones((d) => ({ ...d, [i]: e.target.value }))} disabled={f.clasificacion === 'error'}>
                        <option value="crear">Crear</option>
                        <option value="omitir">Omitir</option>
                        <option value="actualizar" disabled={!f.coincidencia?.id}>Actualizar</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EstadosModal({ abierto, estados, onClose, onCambio }) {
  const toastShow = useStore((s) => s.toastShow);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('blue');
  const [busy, setBusy] = useState(false);
  const [filas, setFilas] = useState(estados);
  useEffect(() => { setFilas(estados); }, [estados, abierto]);
  if (!abierto) return null;
  const crear = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/prospectos/estados', { method: 'POST', body: { nombre, color } });
      setNombre(''); onCambio();
    } catch (err) { toastShow(err.message, 'error'); } finally { setBusy(false); }
  };
  const guardar = async (f) => {
    setBusy(true);
    try {
      await api(`/prospectos/estados/${f.clave}`, { method: 'PATCH', body: { nombre: f.nombre, color: f.color, activo: f.activo } });
      toastShow('Estado actualizado', 'ok'); onCambio();
    } catch (err) { toastShow(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal size="lg" title="Estados de seguimiento" sub="Podés crear, renombrar, cambiar el color o desactivar estados." onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}>
      <form onSubmit={crear} className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input className="input" placeholder="Nuevo estado" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <select className="input" value={color} onChange={(e) => setColor(e.target.value)}>{COLORES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="btn primary" disabled={busy || !nombre.trim()}>Agregar</button>
      </form>
      <div className="col">
        {filas.map((f, i) => (
          <div key={f.clave} className="row" style={{ gap: 8 }}>
            <input className="input" value={f.nombre} onChange={(e) => setFilas((xs) => xs.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
            <select className="input" value={f.color || 'gray'} onChange={(e) => setFilas((xs) => xs.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}>{COLORES.map((c) => <option key={c}>{c}</option>)}</select>
            <label className="check-line" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={f.activo !== false} onChange={(e) => setFilas((xs) => xs.map((x, j) => j === i ? { ...x, activo: e.target.checked } : x))} /> Activo</label>
            <button type="button" className="btn sm" onClick={() => guardar(f)} disabled={busy}>Guardar</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function Prospectos() {
  const toastShow = useStore((s) => s.toastShow);
  const puedeEditar = usePermiso('ventas_editar');
  const puedeCerrar = usePermiso('ventas_cerrar');
  const [filas, setFilas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [documento, setDocumento] = useState('');
  const [responsable, setResponsable] = useState('');
  const [origen, setOrigen] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState(null);
  const [importar, setImportar] = useState(false);
  const [estadosAbierto, setEstadosAbierto] = useState(false);
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (estado) p.set('estado', estado);
    if (documento.trim()) p.set('documento', documento.trim());
    if (localidad.trim()) p.set('localidad', localidad.trim());
    if (responsable.trim()) p.set('responsable', responsable.trim());
    if (origen) p.set('origen', origen);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    return p.toString();
  }, [q, estado, localidad, documento, responsable, origen, desde, hasta]);

  const cargar = async (nuevoOffset = 0) => {
    setCargando(true);
    try {
      const res = await api(`/prospectos?${query}${query ? '&' : ''}limit=${LIMITE}&offset=${nuevoOffset}`);
      setFilas(res.filas);
      setTotal(res.total);
      setOffset(nuevoOffset);
      setEstados(res.estados || []);
    } catch (e) { toastShow(e.message, 'error'); } finally { setCargando(false); }
  };

  useEffect(() => { cargar(0); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async (datos) => {
    setBusy(true);
    try {
      if (form?.id) await api(`/prospectos/${form.id}`, { method: 'PATCH', body: datos });
      else await api('/prospectos', { method: 'POST', body: datos });
      setForm(null); toastShow('Prospecto guardado', 'ok'); cargar(offset);
    } catch (e) { toastShow(e.message, 'error'); } finally { setBusy(false); }
  };

  const archivar = async (p) => {
    if (!window.confirm(`¿Archivar ${p.empresa}?`)) return;
    try { await api(`/prospectos/${p.id}`, { method: 'DELETE' }); cargar(); } catch (e) { toastShow(e.message, 'error'); }
  };

  const convertir = async (p) => {
    if (!window.confirm(`¿Convertir ${p.empresa} en cliente?`)) return;
    try {
      const r = await api(`/prospectos/${p.id}/convertir`, { method: 'POST' });
      toastShow(r.nuevo ? 'Cliente creado y prospecto convertido' : 'Prospecto vinculado al cliente existente', 'ok');
      cargar();
    } catch (e) { toastShow(e.message, 'error'); }
  };

  const exportar = async (formato) => {
    try {
      await apiDescargar(`/prospectos/exportar?${query}${query ? '&' : ''}formato=${formato}`, `prospectos-${new Date().toISOString().slice(0, 10)}.${formato}`);
    } catch (e) { toastShow(e.message, 'error'); }
  };

  return (
    <div className="wrap page">
      <PageHeader
        group="Ventas"
        title="Prospectos"
        sub="Cartera comercial previa al cliente: importación, seguimiento y conversión."
        actions={(
          <>
            {puedeEditar && <button className="btn primary sm" onClick={() => setForm({ ...VACIO })}><Icon name="plus" size={14} /> Nuevo prospecto</button>}
            {puedeEditar && <button className="btn sm" onClick={() => setImportar(true)}><Icon name="upload" size={14} /> Importar Excel</button>}
            <button className="btn sm" onClick={() => exportar('xlsx')}><Icon name="download" size={14} /> Excel</button>
            <button className="btn sm" onClick={() => exportar('csv')}><Icon name="download" size={14} /> CSV</button>
            {puedeEditar && <button className="btn sm" onClick={() => setEstadosAbierto(true)}><Icon name="gear" size={14} /> Estados</button>}
          </>
        )}
      />
      <div className="card mb16 prospectos-filtros-card">
        <div className="pf-head">
          <div>
            <div className="pf-kicker"><Icon name="filter" size={14} /> Filtros de búsqueda</div>
            <div className="pf-count">{total} prospecto{total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}</div>
          </div>
          <div className="pf-head-actions">
            <button className="btn sm ghost" onClick={() => { setQ(''); setEstado(''); setLocalidad(''); setResponsable(''); setOrigen(''); setDesde(''); setHasta(''); }}>Limpiar filtros</button>
            <button className="btn sm" onClick={() => cargar()} disabled={cargando}><Icon name="refresh" size={14} /> Actualizar</button>
          </div>
        </div>
        <div className="prospectos-filtros">
          <div className="field pf-search">
            <label>Buscar</label>
            <div className="pf-search-wrap">
              <span><Icon name="search" size={15} /></span>
              <input className="input" placeholder="Empresa, localidad, rubro, contacto, email o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="field"><label>Estado</label><select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option>{estados.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}</select></div>
          <div className="field"><label>Localidad</label><input className="input" placeholder="Ej.: Haedo" value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></div>
          <div className="field"><label>CUIT / CUIL / DNI</label><input className="input" placeholder="Documento único" value={documento} onChange={(e) => setDocumento(e.target.value)} /></div>
          <div className="field"><label>Responsable</label><input className="input" placeholder="Email o nombre" value={responsable} onChange={(e) => setResponsable(e.target.value)} /></div>
          <div className="field"><label>Origen</label><select className="input" value={origen} onChange={(e) => setOrigen(e.target.value)}><option value="">Todos</option><option value="manual">Manual</option><option value="excel">Excel</option></select></div>
          <div className="field pf-date"><label>Desde</label><input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field pf-date"><label>Hasta</label><input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
        <div className="pf-foot"><span>Los filtros se aplican a la tabla y a la exportación.</span></div>
      </div>
      <div className="card">
        {filas.length === 0 ? <p className="muted">{cargando ? 'Cargando...' : 'No hay prospectos con esos filtros.'}</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Empresa</th><th>Localidad</th><th>CUIT / CUIL / DNI</th><th>Rubro / equipamiento</th><th>Contacto</th><th>Email / teléfono</th><th>Estado</th><th>Próxima acción</th><th /></tr></thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.empresa}</b>{p.origen === 'excel' && <div className="muted" style={{ fontSize: 11 }}>Importado #{p.origen_id || ''}</div>}</td>
                    <td>{p.localidad || '—'}</td>
                    <td>{p.cuit || '—'}</td>
                    <td>{p.rubro || '—'}</td>
                    <td>{p.contacto_nombre || '—'}{p.contacto_cargo ? <div className="muted" style={{ fontSize: 11 }}>{p.contacto_cargo}</div> : null}</td>
                    <td>{p.email || '—'}{p.email_secundario ? <div className="muted" style={{ fontSize: 11 }}>{p.email_secundario}</div> : null}{p.telefono ? <div className="muted" style={{ fontSize: 11 }}>{p.telefono}</div> : null}</td>
                    <td>{badge(p.estado, estados)}</td>
                    <td>{p.proxima_accion || '—'}{p.fecha_proxima_accion ? <div className="muted" style={{ fontSize: 11 }}>{fmtFecha(p.fecha_proxima_accion)}</div> : null}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {puedeEditar && <button className="btn icon sm" title="Editar prospecto" aria-label={`Editar ${p.empresa}`} onClick={() => setForm(p)}><Icon name="edit" size={14} /></button>}
                        {puedeCerrar && !p.cliente_id && <button className="btn icon sm" title="Convertir a cliente" aria-label={`Convertir ${p.empresa} a cliente`} onClick={() => convertir(p)}><Icon name="userPlus" size={14} /></button>}
                        {puedeEditar && <button className="btn icon sm danger" title="Archivar prospecto" aria-label={`Archivar ${p.empresa}`} onClick={() => archivar(p)}><Icon name="trash" size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="pf-pagination">
            <span className="muted">Mostrando {offset + 1}–{Math.min(offset + LIMITE, total)} de {total}</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => cargar(Math.max(0, offset - LIMITE))} disabled={cargando || offset === 0}>Anterior</button>
              <span className="badge gray">Página {Math.floor(offset / LIMITE) + 1} de {Math.max(1, Math.ceil(total / LIMITE))}</span>
              <button className="btn sm" onClick={() => cargar(offset + LIMITE)} disabled={cargando || offset + LIMITE >= total}>Siguiente</button>
            </div>
          </div>
        )}
      </div>
      <ProspectoForm abierto={Boolean(form)} inicial={form} estados={estados} onGuardar={guardar} onClose={() => setForm(null)} busy={busy} />
      <ImportarModal abierto={importar} onClose={() => setImportar(false)} onImportado={() => cargar(0)} />
      <EstadosModal abierto={estadosAbierto} estados={estados} onClose={() => setEstadosAbierto(false)} onCambio={() => cargar()} />
    </div>
  );
}
