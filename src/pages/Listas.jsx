import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, ConfirmDialog, fmtFecha } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { valorVisible } from '../data/listas';
import { filasCsv, valorDesdeCsv } from '../data/csv';
import RegistroModal from '../components/listas/RegistroModal';
import CampoModal from '../components/listas/CampoModal';
import ListaConfigModal from '../components/listas/ListaConfigModal';
import ConvertirModal from '../components/listas/ConvertirModal';
import ReglasModal from '../components/listas/ReglasModal';
import FormularioPublicoModal from '../components/listas/FormularioPublicoModal';
import AprobacionesPendientesModal from '../components/listas/AprobacionesPendientesModal';
import AuditoriaListaModal from '../components/listas/AuditoriaListaModal';
import GuardarPlantillaModal from '../components/listas/GuardarPlantillaModal';
import VistaFormulario from '../components/listas/VistaFormulario';
import { AdjuntoLink, AdjuntoImg } from '../components/listas/AdjuntoLink';
import {
  FiltrosModal, ColumnasModal, NuevaVistaModal, NuevaListaModal, ImportarModal, DuplicarListaModal, FormatoModal,
  PapeleraListasModal, PapeleraRegistrosModal,
} from '../components/listas/ModalesLista';

const POR_PAGINA = 12;
const texto = (v) => String(v ?? '').toLowerCase();
const vacio = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function cumpleFiltro(registro, campo, filtro) {
  const valor = registro?.datos?.[campo.id];
  if (filtro.op === 'vacio') return vacio(valor);
  if (vacio(valor)) return false;
  if (filtro.op === 'contiene') {
    return Array.isArray(valor)
      ? valor.some((x) => texto(x).includes(texto(filtro.valor)))
      : texto(valor).includes(texto(filtro.valor));
  }
  if (filtro.op === 'igual') {
    if (campo.tipo === 'checkbox') return Boolean(valor) === (String(filtro.valor) === 'true');
    return texto(valor) === texto(filtro.valor);
  }
  if (filtro.op === 'distinto') {
    if (campo.tipo === 'checkbox') return Boolean(valor) !== (String(filtro.valor) === 'true');
    return texto(valor) !== texto(filtro.valor);
  }
  if (filtro.op === 'mayor' || filtro.op === 'menor') {
    const a = campo.tipo === 'fecha' ? new Date(`${String(valor).slice(0, 10)}T00:00:00`).getTime() : Number(valor);
    const b = campo.tipo === 'fecha' ? new Date(`${String(filtro.valor).slice(0, 10)}T00:00:00`).getTime() : Number(filtro.valor);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return filtro.op === 'mayor' ? a > b : a < b;
  }
  return true;
}

function ordenarRegistros(registros, campos, orden) {
  if (!orden?.campo) return registros;
  const campo = campos.find((c) => c.id === orden.campo);
  if (!campo) return registros;
  const dir = orden.dir === 'asc' ? 1 : -1;
  return [...registros].sort((a, b) => {
    const va = a.datos?.[campo.id];
    const vb = b.datos?.[campo.id];
    if (vacio(va) && vacio(vb)) return 0;
    if (vacio(va)) return 1;
    if (vacio(vb)) return -1;
    if (campo.tipo === 'numero' || campo.tipo === 'moneda') return (Number(va) - Number(vb)) * dir;
    if (campo.tipo === 'fecha') {
      return (new Date(`${String(va).slice(0, 10)}T00:00:00`) - new Date(`${String(vb).slice(0, 10)}T00:00:00`)) * dir;
    }
    return texto(va).localeCompare(texto(vb), 'es') * dir;
  });
}

function columnasDeVista(vista, campos) {
  const ids = Array.isArray(vista?.config?.columnas) ? vista.config.columnas : [];
  const resueltas = ids.map((id) => campos.find((c) => c.id === id)).filter(Boolean);
  return resueltas.length ? resueltas : campos;
}

function TarjetaLista({ lista, areaSlug }) {
  return (
    <Link to={`/listas/${areaSlug}/${lista.id}`} className="card area-lista-card">
      <div className="row between" style={{ gap: 8 }}>
        <span className="area-ico"><Icon name={lista.icono || 'clipboard'} size={15} /></span>
        <Icon name="external" size={13} style={{ opacity: 0.45 }} />
      </div>
      <b>{lista.nombre}</b>
      <p>{lista.descripcion || 'Sin descripción'}</p>
      <span className="muted" style={{ fontSize: 11.5 }}>Abrir lista</span>
    </Link>
  );
}

function BusquedaListas() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState('');

  const buscar = async (e) => {
    e.preventDefault();
    const texto = q.trim();
    if (texto.length < 2) { setResultados([]); setHecho(false); return; }
    setBuscando(true);
    setError('');
    try {
      const r = await api(`/listas/buscar?q=${encodeURIComponent(texto)}`);
      setResultados(Array.isArray(r.resultados) ? r.resultados : []);
      setHecho(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="card busqueda-listas">
      <form onSubmit={buscar} className="busqueda-listas-form">
        <Icon name="search" size={16} />
        <input
          className="input"
          value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) { setResultados([]); setHecho(false); } }}
          placeholder="Buscar registros en todas las listas..."
          aria-label="Buscar registros en todas las listas"
        />
        <button type="submit" className="btn primary sm" disabled={buscando || q.trim().length < 2}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
      {error && <small className="pass-error">{error}</small>}
      {hecho && resultados.length === 0 && <p className="muted" style={{ margin: '9px 0 0', fontSize: 12 }}>No encontramos registros con “{q.trim()}”.</p>}
      {resultados.length > 0 && (
        <div className="busqueda-listas-res">
          {resultados.map((r) => (
            <button type="button" className="busqueda-lista-item" key={r.registro_id} onClick={() => navigate(`/listas/${r.area_slug}/${r.lista_id}`)}>
              <b>{r.titulo}</b>
              <span>{r.area_nombre} · {r.lista_nombre} · {fmtFecha(r.creado_en)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumenGlobal({ areas }) {
  const navigate = useNavigate();
  const usuario = useStore((s) => s.user);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      if (!areas.length) { setDatos({ areas: 0, listas: 0, registros: 0, nuevos: 0, pendientes: 0, recientes: [], barras: [] }); return; }
      const resultados = await Promise.allSettled(areas.map(async (area) => {
        const resumen = await api(`/listas/resumen?area_id=${encodeURIComponent(area.id)}`);
        return { area, resumen };
      }));
      if (!vivo) return;
      const ok = resultados.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (!ok.length) { setError('No se pudo cargar el resumen general.'); return; }
      const recientes = [];
      const barras = [];
      let listas = 0;
      let registros = 0;
      let nuevos = 0;
      for (const { area, resumen } of ok) {
        listas += resumen.listas.length;
        registros += resumen.total_registros;
        nuevos += resumen.nuevos_7d;
        barras.push({ id: area.id, slug: area.slug, nombre: area.nombre, total: resumen.total_registros });
        for (const r of resumen.recientes) recientes.push({ ...r, area_slug: area.slug, area_nombre: area.nombre });
      }
      let pendientes = 0;
      const conAprobaciones = ok.filter(({ area }) => usuario?.rol === 'admin' || area.puede?.editar_listas);
      const aprobaciones = await Promise.allSettled(conAprobaciones.map(({ area }) => api(`/listas/aprobaciones/pendientes?area_id=${encodeURIComponent(area.id)}`)));
      for (const r of aprobaciones) if (r.status === 'fulfilled') pendientes += Number(r.value.total || 0);
      if (!vivo) return;
      recientes.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
      setDatos({ areas: ok.length, listas, registros, nuevos, pendientes, recientes: recientes.slice(0, 8), barras });
    };
    cargar().catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [areas, usuario?.rol]);

  if (error) return <div className="banner-red" style={{ marginBottom: 14 }}><div><Icon name="x" size={15} /> {error}</div></div>;
  if (!datos) return <div className="card" style={{ marginBottom: 14 }}><p className="muted" style={{ margin: 0 }}>Cargando resumen general...</p></div>;
  const max = Math.max(1, ...datos.barras.map((b) => b.total));
  return (
    <div className="listas-resumen resumen-global">
      <div className="resumen-kpis">
        <div className="resumen-kpi"><span>Áreas</span><b>{datos.areas}</b></div>
        <div className="resumen-kpi"><span>Listas</span><b>{datos.listas}</b></div>
        <div className="resumen-kpi"><span>Registros</span><b>{datos.registros}</b></div>
        <div className="resumen-kpi"><span>Aprobaciones pendientes</span><b>{datos.pendientes}</b></div>
      </div>
      <div className="resumen-grid">
        <div className="card resumen-card">
          <h3 className="card-title"><Icon name="chart" size={15} /> Registros por área</h3>
          {datos.barras.length === 0 ? <p className="muted">Sin áreas visibles.</p> : (
            <div className="resumen-bars">
              {datos.barras.map((b) => (
                <button type="button" className="resumen-bar-row" key={b.id} onClick={() => navigate(`/listas/${b.slug}`)}>
                  <span className="resumen-bar-name">{b.nombre}</span>
                  <span className="resumen-bar-track"><span style={{ width: `${Math.max(3, (b.total / max) * 100)}%` }} /></span>
                  <b>{b.total}</b>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="card resumen-card">
          <h3 className="card-title"><Icon name="clock" size={15} /> Actividad reciente</h3>
          {datos.recientes.length === 0 ? <p className="muted">Sin registros recientes.</p> : (
            <div className="resumen-recientes">
              {datos.recientes.map((r) => (
                <button type="button" className="resumen-reciente" key={`${r.area_slug}-${r.id}`} onClick={() => navigate(`/listas/${r.area_slug}/${r.lista_id}`)}>
                  <b>{r.titulo}</b>
                  <span>{r.area_nombre} · {r.lista_nombre} · {fmtFecha(r.creado_en)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AreasHome({ areas, cargando }) {
  const esAdmin = useStore((s) => s.user?.rol === 'admin');
  const cargarAreas = useStore((s) => s.cargarAreas);
  const [papelera, setPapelera] = useState(false);
  if (cargando) return <div className="wrap page"><p className="muted">Cargando áreas...</p></div>;
  return (
    <div className="wrap page">
      <PageHeader
        group="Listas"
        title="Listas"
        sub="Tablas y vistas flexibles por área. Cada equipo ve solo los espacios que tiene habilitados."
        actions={esAdmin ? (
          <button type="button" className="btn sm" onClick={() => setPapelera(true)}>
            <Icon name="recycl" size={13} /> Papelera
          </button>
        ) : null}
      />

      <BusquedaListas />
      <ResumenGlobal areas={areas} />
      {papelera && (
        <PapeleraListasModal
          onRestaurada={cargarAreas}
          onClose={() => setPapelera(false)}
        />
      )}
      {areas.length === 0 ? (
        <div className="card">
          <h3 className="card-title"><Icon name="clipboard" size={15} /> Todavía no hay áreas visibles</h3>
          <p className="muted">El administrador tiene que habilitar un área en tu categoría.</p>
        </div>
      ) : (
        <div className="cat-grid">
          {areas.map((area) => (
            <Link key={area.id} to={`/listas/${area.slug}`} className="card area-home-card">
              <div className="row between" style={{ gap: 8 }}>
                <span className="area-ico"><Icon name={area.icono || 'clipboard'} size={18} /></span>
                <span className="badge gray">{area.listas?.length || 0} lista(s)</span>
              </div>
              <h3 className="card-title" style={{ margin: '10px 0 2px' }}>{area.nombre}</h3>
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{area.descripcion || 'Área de trabajo'}</p>
              <span className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 10 }}>
                <Icon name="external" size={13} /> Abrir área
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumenArea({ area }) {
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    api(`/listas/resumen?area_id=${encodeURIComponent(area.id)}`)
      .then((r) => { if (vivo) setDatos(r); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [area.id]);

  if (error) return <div className="banner-red" style={{ marginBottom: 14 }}><div><Icon name="x" size={15} /> {error}</div></div>;
  if (!datos) return <div className="card" style={{ marginBottom: 14 }}><p className="muted" style={{ margin: 0 }}>Cargando resumen del área...</p></div>;

  const max = Math.max(1, ...datos.listas.map((l) => Number(l.registros || 0)));
  const maxEtapa = Math.max(1, ...(datos.etapas || []).map((e) => e.total));
  return (
    <div className="listas-resumen">
      <div className="resumen-kpis">
        <div className="resumen-kpi"><span>Listas</span><b>{datos.listas.length}</b></div>
        <div className="resumen-kpi"><span>Registros</span><b>{datos.total_registros}</b></div>
        <div className="resumen-kpi"><span>Últimos 7 días</span><b>{datos.nuevos_7d}</b></div>
        <div className="resumen-kpi"><span>Actividad</span><b>{datos.recientes.length}</b></div>
      </div>

      <div className="resumen-grid">
        <div className="card resumen-card">
          <h3 className="card-title"><Icon name="grid" size={15} /> Registros por lista</h3>
          {datos.listas.length === 0 ? <p className="muted">Todavía no hay listas.</p> : (
            <div className="resumen-bars">
              {datos.listas.map((l) => (
                <button type="button" className="resumen-bar-row" key={l.id} onClick={() => navigate(`/listas/${area.slug}/${l.id}`)}>
                  <span className="resumen-bar-name">{l.nombre}</span>
                  <span className="resumen-bar-track"><span style={{ width: `${Math.max(3, (Number(l.registros) / max) * 100)}%` }} /></span>
                  <b>{l.registros}</b>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card resumen-card">
          <h3 className="card-title"><Icon name="clock" size={15} /> Actividad reciente</h3>
          {datos.recientes.length === 0 ? <p className="muted">Sin registros recientes.</p> : (
            <div className="resumen-recientes">
              {datos.recientes.map((r) => (
                <button type="button" className="resumen-reciente" key={r.id} onClick={() => navigate(`/listas/${area.slug}/${r.lista_id}`)}>
                  <b>{r.titulo}</b>
                  <span>{r.lista_nombre} · {fmtFecha(r.creado_en)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {datos.etapas?.length > 0 && (
          <div className="card resumen-card">
            <h3 className="card-title"><Icon name="chart" size={15} /> Pipeline comercial</h3>
            <div className="resumen-bars">
              {datos.etapas.map((e) => (
                <div className="resumen-bar-row" key={e.valor}>
                  <span className="resumen-bar-name">{e.valor}</span>
                  <span className="resumen-bar-track"><span style={{ width: `${Math.max(3, (e.total / maxEtapa) * 100)}%` }} /></span>
                  <b>{e.total}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {datos.alertas?.length > 0 && (
          <div className="card resumen-card">
            <h3 className="card-title"><Icon name="info" size={15} /> Atención</h3>
            <div className="col" style={{ gap: 7 }}>
              {datos.alertas.map((a) => (
                <div className="resumen-alerta" key={`${a.lista}-${a.texto}`}>
                  <span>{a.lista} · {a.texto}</span><b>{a.total}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AreaDetalle({ area }) {
  const cargarAreas = useStore((s) => s.cargarAreas);
  const toastShow = useStore((s) => s.toastShow);
  const navigate = useNavigate();
  const [nueva, setNueva] = useState(false);
  const [aprobaciones, setAprobaciones] = useState(false);
  const [pendientesAprobacion, setPendientesAprobacion] = useState(0);
  const [busy, setBusy] = useState(false);

  const cargarPendientes = async () => {
    if (!area.puede?.editar_listas) return;
    try {
      const r = await api(`/listas/aprobaciones/pendientes?area_id=${encodeURIComponent(area.id)}`);
      setPendientesAprobacion(Number(r.total || 0));
    } catch {
      setPendientesAprobacion(0);
    }
  };

  useEffect(() => { cargarPendientes(); }, [area.id, area.puede?.editar_listas]); // eslint-disable-line react-hooks/exhaustive-deps

  const crear = async (payload) => {
    setBusy(true);
    try {
      const { plantilla, ...resto } = payload;
      const res = plantilla
        ? await api(`/listas/plantillas/${encodeURIComponent(plantilla)}`, { method: 'POST', body: { area_id: area.id, ...resto } })
        : await api('/listas', { method: 'POST', body: { area_id: area.id, ...resto } });
      await cargarAreas();
      setNueva(false);
      toastShow('Lista creada', 'ok');
      navigate(`/listas/${area.slug}/${res.id}`);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap page">
      <PageHeader
        group="Listas"
        title={area.nombre}
        sub={area.descripcion || 'Listas y tablas del área.'}
        actions={(
          <>
            {area.puede?.editar_listas && (
              <button type="button" className="btn sm" onClick={() => setAprobaciones(true)}>
                <Icon name="check" size={14} /> Aprobaciones{pendientesAprobacion > 0 ? ` (${pendientesAprobacion})` : ''}
              </button>
            )}
            {area.puede?.crear_listas && (
              <button type="button" className="btn primary sm" onClick={() => setNueva(true)}>
                <Icon name="plus" size={14} /> Nueva lista
              </button>
            )}
          </>
        )}
      />

      <ResumenArea area={area} />

      {area.listas?.length ? (
        <div className="cat-grid">
          {area.listas.map((l) => <TarjetaLista key={l.id} lista={l} areaSlug={area.slug} />)}
        </div>
      ) : (
        <div className="card">
          <h3 className="card-title"><Icon name="clipboard" size={15} /> No hay listas en {area.nombre}</h3>
          <p className="muted">
            {area.puede?.crear_listas
              ? 'Creá la primera lista y después agregale campos y vistas.'
              : 'Todavía no tenés permiso para crear listas en esta área.'}
          </p>
          {area.puede?.crear_listas && (
            <button type="button" className="btn primary" onClick={() => setNueva(true)}>
              <Icon name="plus" size={14} /> Crear la primera lista
            </button>
          )}
        </div>
      )}

      {nueva && (
        <NuevaListaModal area={area} busy={busy} onGuardar={crear} onClose={() => setNueva(false)} />
      )}
      {aprobaciones && (
        <AprobacionesPendientesModal area={area} onClose={() => { setAprobaciones(false); cargarPendientes(); }} />
      )}
    </div>
  );
}

function ListaDetalle({ listaId, area }) {
  const navigate = useNavigate();
  const cargarAreas = useStore((s) => s.cargarAreas);
  const toastShow = useStore((s) => s.toastShow);
  const usuario = useStore((s) => s.user);
  const sync = useStore((s) => s.sync);
  const [lista, setLista] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [vistaId, setVistaId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [columnas, setColumnas] = useState([]);
  const [orden, setOrden] = useState(null);
  const [filtros, setFiltros] = useState([]);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [agrupar, setAgrupar] = useState(null);
  const [pagina, setPagina] = useState(0);
  const [arrastrandoColumna, setArrastrandoColumna] = useState(null);
  const [formato, setFormato] = useState([]);
  const [mes, setMes] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [busy, setBusy] = useState(false);

  const campos = lista?.campos || [];
  const vistas = lista?.vistas || [];
  const puede = lista?.puede || {};
  const puedeConvertir = Boolean(puede.convertir_prospecto) && lista?.area_slug === 'ventas';
  const puedeEditarFila = (registro) => {
    if (!puede.editar_registros) return false;
    if (usuario?.rol === 'admin') return true;
    const modo = lista?.permiso_filas || 'todos';
    if (modo === 'todos') return true;
    if (modo === 'admin') return false;
    if (modo === 'creador') return registro?.creado_por === usuario?.email;
    if (modo === 'responsable') {
      if (!lista?.permiso_campo) return false;
      const valor = String(registro?.datos?.[lista.permiso_campo] ?? '').trim().toLowerCase();
      const email = String(usuario?.email || '').toLowerCase();
      const uid = String(usuario?.uid || '').toLowerCase();
      return Boolean(valor) && (valor === email || (uid && valor === uid));
    }
    return true;
  };
  const puedeBorrarFila = (registro) => Boolean(puede.borrar_registros) && puedeEditarFila(registro);
  const bloqueadoAprobacionFila = (registro) => Boolean(lista?.requiere_aprobacion && !puede.editar_listas && ['pendiente', 'rechazado'].includes(registro?.aprobacion_estado));
  const vistaActiva = vistas.find((v) => v.id === vistaId) || null;
  const columnasVisibles = columnasDeVista(vistaActiva, campos);
  const visibles = columnasVisibles.length ? columnasVisibles : campos;
  const kanbanCampo = vistaActiva?.tipo === 'kanban'
    ? campos.find((c) => c.id === vistaActiva.config?.kanban)
    : null;
  const kanbanTitulo = campos.find((c) => c.id === vistaActiva?.config?.titulo)
    || campos.find((c) => c.tipo === 'texto')
    || campos[0]
    || null;
  const kanbanOpciones = Array.isArray(kanbanCampo?.config?.opciones) ? kanbanCampo.config.opciones : [];
  const calendarCampo = vistaActiva?.tipo === 'calendar'
    ? (campos.find((c) => c.id === vistaActiva.config?.calendario) || campos.find((c) => c.tipo === 'fecha'))
    : null;
  const galleryImage = vistaActiva?.tipo === 'gallery'
    ? (campos.find((c) => c.id === vistaActiva.config?.galeria) || campos.find((c) => c.tipo === 'adjunto' || c.tipo === 'imagen'))
    : null;
  const tarjetaTitulo = campos.find((c) => c.id === vistaActiva?.config?.titulo)
    || campos.find((c) => c.tipo === 'texto')
    || campos[0]
    || null;
  const camposTarjeta = campos
    .filter((c) => c.id !== kanbanCampo?.id && c.id !== kanbanTitulo?.id)
    .slice(0, 3);

  const configVista = () => ({
    ...vistaActiva?.config,
    columnas,
    filtros,
    orden,
    agrupar,
    formato,
    q: busqueda,
  });

  const persistirColumnas = async (nuevas) => {
    setColumnas(nuevas);
    if (!vistaId || !puede.administrar_vistas) return;
    try {
      await api(`/lista-vistas/${vistaId}`, {
        method: 'PATCH',
        body: { config: { ...vistaActiva?.config, columnas: nuevas, filtros, orden, agrupar, formato, q: busqueda } },
      });
    } catch (e) { toastShow(e.message, 'error'); }
  };

  const moverColumna = (origen, destino) => {
    if (!origen || !destino || origen === destino) return;
    const ids = (columnas.length ? columnas : campos.map((c) => c.id)).filter((id) => campos.some((c) => c.id === id));
    const desde = ids.indexOf(origen);
    const hasta = ids.indexOf(destino);
    if (desde < 0 || hasta < 0) return;
    ids.splice(hasta, 0, ids.splice(desde, 1)[0]);
    persistirColumnas(ids);
  };

  const cargarDetalle = async ({ resetVista = false } = {}) => {
    const data = await api(`/listas/${listaId}`);
    setLista(data);
    const actual = data.vistas?.find((v) => v.id === vistaId);
    const elegida = (!resetVista && actual) ? actual : (data.vistas?.find((v) => v.predeterminada) || data.vistas?.[0]);
    setVistaId(elegida?.id || '');
    setColumnas(elegida?.config?.columnas || []);
    setOrden(elegida?.config?.orden || null);
    setFiltros(elegida?.config?.filtros || []);
    setAgrupar(elegida?.config?.agrupar || null);
    setFormato(elegida?.config?.formato || []);
    setBusqueda(elegida?.config?.q || '');
    if (data.puede?.ver_registros) {
      const r = await api(`/listas/${data.id}/registros`);
      setRegistros(r.registros || []);
      setTotal(r.total || 0);
    } else {
      setRegistros([]);
      setTotal(0);
    }
    return data;
  };

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    setLista(null);
    setRegistros([]);
    setVistaId('');
    setColumnas([]);
    setOrden(null);
    setFiltros([]);
    setAgrupar(null);
    setFormato([]);
    setBusqueda('');
    cargarDetalle({ resetVista: true })
      .catch((e) => { if (vivo) setError(e.message || 'No se pudo abrir la lista.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaId]);

  const recargarRegistros = async () => {
    if (!lista?.puede?.ver_registros) return;
    const r = await api(`/listas/${lista.id}/registros`);
    setRegistros(r.registros || []);
    setTotal(r.total || 0);
  };

  const seleccionarVista = (v) => {
    setVistaId(v.id);
    setColumnas(v.config?.columnas || []);
    setOrden(v.config?.orden || null);
    setFiltros(v.config?.filtros || []);
    setAgrupar(v.config?.agrupar || null);
    setFormato(v.config?.formato || []);
    setBusqueda(v.config?.q || '');
  };

  const guardarVista = async () => {
    if (!vistaId) return setModal({ tipo: 'nuevaVista' });
    setBusy(true);
    try {
      await api(`/lista-vistas/${vistaId}`, {
        method: 'PATCH',
        body: { config: configVista() },
      });
      toastShow('Vista guardada', 'ok');
      await cargarDetalle({ resetVista: false });
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportarCsv = () => {
    try {
      const filas = [
        ['ID', ...visibles.map((c) => c.nombre)],
        ...filtrados.map((r) => [r.id, ...visibles.map((c) => valorVisible(c, r.datos?.[c.id]))]),
      ];
      const csv = filasCsv(filas, { separador: ';' });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(lista.nombre || 'lista').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastShow(`${filtrados.length} registro(s) exportados`, 'ok');
    } catch {
      toastShow('No se pudo exportar el CSV', 'error');
    }
  };

  const importarCsv = async ({ headers, filas, mapa }) => {
    setBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      const indice = new Map(headers.map((h, i) => [h, i]));
      for (const fila of filas.slice(0, 500)) {
        const datos = {};
        for (const [head, campoId] of Object.entries(mapa)) {
          if (!campoId) continue;
          const campo = campos.find((c) => c.id === campoId);
          const i = indice.get(head);
          if (!campo || i === undefined) continue;
          datos[campoId] = valorDesdeCsv(campo, fila[i]);
        }
        try {
          await api(`/listas/${lista.id}/registros`, { method: 'POST', body: { datos } });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setModal(null);
      await recargarRegistros();
      toastShow(
        fail
          ? `Importados ${ok} registro(s); ${fail} fila(s) con error. Revisá obligatorios y tipos.`
          : `Importados ${ok} registro(s)`,
        fail ? 'warn' : 'ok'
      );
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cambiarVisibilidadVista = async () => {
    if (!vistaActiva) return;
    const nueva = vistaActiva.visibilidad === 'personal' ? 'compartida' : 'personal';
    if (nueva === 'personal' && !window.confirm('Esta vista dejará de ser visible para los demás. ¿Continuar?')) return;
    setBusy(true);
    try {
      await api(`/lista-vistas/${vistaActiva.id}`, { method: 'PATCH', body: { visibilidad: nueva } });
      await cargarDetalle({ resetVista: false });
      setVistaId(vistaActiva.id);
      toastShow(nueva === 'personal' ? 'Vista ahora es privada' : 'Vista compartida con el equipo', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const crearVista = async ({ nombre, predeterminada, tipo = 'grid', extra = {}, visibilidad = 'compartida' }) => {
    setBusy(true);
    try {
      const res = await api(`/listas/${lista.id}/vistas`, {
        method: 'POST',
        body: { nombre, predeterminada, tipo, visibilidad, config: { ...configVista(), ...extra } },
      });
      setModal(null);
      await cargarDetalle({ resetVista: false });
      setVistaId(res.id);
      toastShow('Vista creada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const guardarRegistroInline = async (datos, registroId = null) => {
    setBusy(true);
    try {
      if (registroId) {
        await api(`/lista-registros/${registroId}`, { method: 'PATCH', body: { datos } });
        toastShow('Registro actualizado', 'ok');
      } else {
        await api(`/listas/${lista.id}/registros`, { method: 'POST', body: { datos } });
        toastShow('Registro creado', 'ok');
      }
      await recargarRegistros();
      return true;
    } catch (e) {
      toastShow(e.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const guardarRegistro = async (datos) => {
    setBusy(true);
    try {
      if (modal.registro) {
        await api(`/lista-registros/${modal.registro.id}`, { method: 'PATCH', body: { datos } });
        toastShow('Registro actualizado', 'ok');
      } else {
        await api(`/listas/${lista.id}/registros`, { method: 'POST', body: { datos } });
        toastShow('Registro creado', 'ok');
      }
      setModal(null);
      await recargarRegistros();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const convertirRegistro = async ({ cliente, equipo }) => {
    if (!modal?.registro) return;
    setBusy(true);
    try {
      const res = await api(`/listas/${lista.id}/registros/${modal.registro.id}/convertir`, {
        method: 'POST',
        body: { cliente, equipo },
      });
      await sync();
      await recargarRegistros();
      setModal(null);
      toastShow(`Cliente creado y orden ${res.orden_id} ingresada al taller`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const guardarPlantilla = async ({ nombre, descripcion }) => {
    setBusy(true);
    try {
      await api(`/listas/${lista.id}/guardar-plantilla`, { method: 'POST', body: { nombre, descripcion } });
      setModal(null);
      toastShow('Plantilla guardada. Ya aparece en Nueva lista.', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const duplicarLista = async ({ nombre }) => {
    setBusy(true);
    try {
      const res = await api(`/listas/${lista.id}/duplicar`, { method: 'POST', body: { nombre } });
      await cargarAreas();
      setModal(null);
      toastShow('Lista duplicada con sus campos y vistas', 'ok');
      navigate(`/listas/${lista.area_slug}/${res.id}`);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const guardarCampo = async (payload) => {
    setBusy(true);
    try {
      if (modal.campo?.id) {
        await api(`/lista-campos/${modal.campo.id}`, { method: 'PATCH', body: payload });
        toastShow('Campo actualizado', 'ok');
      } else {
        await api(`/listas/${lista.id}/campos`, { method: 'POST', body: payload });
        toastShow('Campo agregado', 'ok');
      }
      setModal({ tipo: 'config' });
      await cargarDetalle({ resetVista: false });
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const guardarLista = async (payload) => {
    setBusy(true);
    try {
      await api(`/listas/${lista.id}`, { method: 'PATCH', body: payload });
      toastShow('Lista actualizada', 'ok');
      await cargarDetalle({ resetVista: false });
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const archivarLista = () => {
    setConfirmar({
      titulo: 'Archivar lista',
      sub: lista.nombre,
      label: 'Archivar',
      texto: 'La lista y sus registros dejan de verse, pero no se borran. Un administrador puede recuperarla desde la base.',
      onConfirm: async () => {
        await api(`/listas/${lista.id}`, { method: 'DELETE' });
        await cargarAreas();
        toastShow('Lista archivada', 'warn');
        navigate(`/listas/${area.slug}`);
      },
    });
  };

  const confirmarArchivarRegistro = (registro) => {
    setModal(null);
    setConfirmar({
      titulo: 'Archivar registro',
      sub: 'El registro deja de verse en la lista.',
      label: 'Archivar',
      texto: 'No se borra físicamente; queda archivado para auditoría.',
      onConfirm: async () => {
        await api(`/lista-registros/${registro.id}`, { method: 'DELETE' });
        await recargarRegistros();
        toastShow('Registro archivado', 'warn');
      },
    });
  };

  const confirmarQuitarCampo = (campo) => {
    setConfirmar({
      titulo: 'Quitar campo',
      sub: campo.nombre,
      label: 'Quitar',
      texto: 'El campo deja de mostrarse. Los datos guardados no se borran.',
      onConfirm: async () => {
        await api(`/lista-campos/${campo.id}`, { method: 'DELETE' });
        toastShow('Campo quitado', 'warn');
        await cargarDetalle({ resetVista: false });
      },
    });
  };

  const filtrados = useMemo(() => {
    let out = registros || [];
    if (vistaActiva?.config?.mis) {
      const campoResp = campos.find((c) => c.id === vistaActiva.config.responsable)
        || campos.find((c) => String(c.nombre || '').toLowerCase().includes('responsable'));
      out = out.filter((r) => {
        if (usuario?.email && r.creado_por === usuario.email) return true;
        if (!campoResp || !usuario) return false;
        const valor = String(r.datos?.[campoResp.id] ?? '').toLowerCase();
        return [usuario.email, usuario.nombre]
          .filter(Boolean)
          .some((v) => valor.includes(String(v).toLowerCase()));
      });
    }
    if (soloPendientes) out = out.filter((r) => r.aprobacion_estado === 'pendiente');
    const q = busqueda.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => campos.some((c) => texto(r.datos?.[c.id]).includes(q)));
    }
    if (filtros.length) {
      out = out.filter((r) => filtros.every((f) => {
        const campo = campos.find((c) => c.id === f.campo);
        return campo ? cumpleFiltro(r, campo, f) : true;
      }));
    }
    return ordenarRegistros(out, campos, orden);
  }, [registros, campos, busqueda, filtros, orden, vistaActiva, usuario, soloPendientes]);

  useEffect(() => { setPagina(0); }, [listaId, vistaId, busqueda, filtros, orden, soloPendientes, agrupar]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const inicioPagina = paginaActual * POR_PAGINA;
  const finPagina = Math.min(inicioPagina + POR_PAGINA, filtrados.length);

  const grupos = useMemo(() => {
    if (!agrupar) return [{ key: '__todos', label: null, rows: filtrados }];
    const campo = campos.find((c) => c.id === agrupar);
    if (!campo) return [{ key: '__todos', label: null, rows: filtrados }];
    const mapa = new Map();
    for (const registro of filtrados) {
      const valor = registro.datos?.[campo.id];
      const key = vacio(valor) ? '__vacio' : String(valor);
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key).push(registro);
    }
    return [...mapa.entries()].map(([key, rows]) => ({
      key,
      label: key === '__vacio' ? 'Sin valor' : valorVisible(campo, rows[0].datos?.[campo.id]),
      rows,
    }));
  }, [filtrados, campos, agrupar]);

  const gruposPagina = useMemo(() => {
    let restante = POR_PAGINA;
    let saltar = inicioPagina;
    const salida = [];
    for (const grupo of grupos) {
      if (restante <= 0) break;
      if (saltar >= grupo.rows.length) { saltar -= grupo.rows.length; continue; }
      const rows = grupo.rows.slice(saltar, saltar + restante);
      if (rows.length) salida.push({ ...grupo, rows });
      restante -= rows.length;
      saltar = 0;
    }
    return salida;
  }, [grupos, inicioPagina]);

  const COLORES_FORMATO = {
    red: 'var(--red-bg)', amber: 'var(--amber-bg)', green: 'var(--green-bg)',
    blue: 'var(--blue-bg)', gray: 'var(--bg-3)',
  };
  const estiloFila = (registro) => {
    for (const regla of formato) {
      const campo = campos.find((c) => c.id === regla.campo);
      if (campo && cumpleFiltro(registro, campo, regla)) {
        return { background: COLORES_FORMATO[regla.color] || COLORES_FORMATO.amber };
      }
    }
    return undefined;
  };

  const cambiarOrden = (campo) => {
    setOrden((prev) => (
      prev?.campo === campo.id
        ? { campo: campo.id, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo: campo.id, dir: 'asc' }
    ));
  };

  const moverKanban = async (registro, opcion) => {
    if (!kanbanCampo || !puedeEditarFila(registro)) return;
    const actual = String(registro.datos?.[kanbanCampo.id] ?? '');
    if (actual === String(opcion)) return;
    setBusy(true);
    try {
      await api(`/lista-registros/${registro.id}`, {
        method: 'PATCH',
        body: { datos: { [kanbanCampo.id]: opcion || null } },
      });
      await recargarRegistros();
      toastShow(opcion ? `Movido a ${opcion}` : 'Movido a Sin etapa', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (cargando) return <div className="wrap page"><p className="muted">Abriendo lista...</p></div>;
  if (error) {
    return (
      <div className="wrap page">
        <div className="card">
          <h3 className="card-title"><Icon name="warn" size={15} /> No se pudo abrir la lista</h3>
          <p className="muted">{error}</p>
          <Link to={area ? `/listas/${area.slug}` : '/listas'} className="btn primary">Volver</Link>
        </div>
      </div>
    );
  }
  if (!lista) return null;

  return (
    <div className="wrap page listas-page">
      <PageHeader
        group={lista.area_nombre}
        title={lista.nombre}
        sub={lista.descripcion || 'Lista de trabajo'}
        actions={(
          <>
            {puede.crear_registros && (
              <button
                type="button"
                className="btn primary sm"
                onClick={() => setModal({ tipo: 'registro', registro: null })}
                disabled={!campos.length}
                title={!campos.length ? 'Primero agregá campos a la lista' : 'Nuevo registro'}
              >
                <Icon name="plus" size={14} /> Nuevo registro
              </button>
            )}
            {puede.editar_listas && (
              <button type="button" className="btn sm" onClick={() => setModal({ tipo: 'config' })}>
                <Icon name="gear" size={14} /> Configurar
              </button>
            )}
          </>
        )}
      />

      {campos.length === 0 ? (
        <div className="card">
          <h3 className="card-title"><Icon name="clipboard" size={15} /> Esta lista todavía no tiene campos</h3>
          <p className="muted">Agregá las columnas que necesita el equipo. Después vas a poder cargar registros y guardar vistas.</p>
          {puede.editar_listas && (
            <button type="button" className="btn primary" onClick={() => setModal({ tipo: 'config' })}>
              <Icon name="plus" size={14} /> Configurar la lista
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="listas-toolbar">
            <div className="tabs listas-views" role="tablist">
              {vistas.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={v.id === vistaId}
                  className={`tab${v.id === vistaId ? ' active' : ''}`}
                  onClick={() => seleccionarVista(v)}
                  title={v.predeterminada ? 'Vista predeterminada' : v.nombre}
                >
                  {v.nombre}{v.visibilidad === 'personal' && <Icon name="eye-off" size={11} title="Solo para mí" style={{ marginLeft: 5, opacity: 0.6 }} />}
                </button>
              ))}
              {puede.administrar_vistas && (
                <button type="button" className="tab listas-tab-add" onClick={() => setModal({ tipo: 'nuevaVista' })} title="Nueva vista">
                  <Icon name="plus" size={13} />
                </button>
              )}
            </div>
            <div className="listas-tools">
              {vistaActiva?.tipo === 'grid' && (
                <select
                  className="input"
                  style={{ width: 155 }}
                  value={agrupar || ''}
                  onChange={(e) => setAgrupar(e.target.value || null)}
                  aria-label="Agrupar por"
                >
                  <option value="">Sin agrupar</option>
                  {campos.filter((c) => ['seleccion', 'persona', 'checkbox'].includes(c.tipo)).map((c) => (
                    <option key={c.id} value={c.id}>Agrupar: {c.nombre}</option>
                  ))}
                </select>
              )}
              <div className="listas-search">
                <Icon name="search" size={14} />
                <input
                  className="input"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar en la lista..."
                  aria-label="Buscar en la lista"
                />
              </div>
              <button type="button" className={`btn sm${filtros.length ? ' primary' : ''}`} onClick={() => setModal({ tipo: 'filtros' })}>
                <Icon name="filter" size={13} /> Filtros{filtros.length ? ` (${filtros.length})` : ''}
              </button>
              {lista.requiere_aprobacion && (
                <button
                  type="button"
                  className={`btn sm${soloPendientes ? ' primary' : ''}`}
                  onClick={() => setSoloPendientes((v) => !v)}
                  title="Mostrar solo filas pendientes de aprobación"
                >
                  <Icon name="check" size={13} /> Pendientes ({registros.filter((r) => r.aprobacion_estado === 'pendiente').length})
                </button>
              )}
              {vistaActiva?.tipo === 'grid' && (
                <button type="button" className="btn sm" onClick={() => setModal({ tipo: 'columnas' })}>
                  <Icon name="grid" size={13} /> Columnas
                </button>
              )}
              {vistaActiva?.tipo === 'grid' && (
                <button type="button" className="btn sm" onClick={() => setModal({ tipo: 'formato' })}>
                  <Icon name="filter" size={13} /> Formato
                </button>
              )}
              {puede.ver_registros && (
                <button type="button" className="btn sm" onClick={exportarCsv} title="Exportar los registros visibles a CSV">
                  <Icon name="download" size={13} /> Exportar
                </button>
              )}
              {puede.crear_registros && (
                <button type="button" className="btn sm" onClick={() => setModal({ tipo: 'importar' })} title="Importar registros desde CSV">
                  <Icon name="upload" size={13} /> Importar
                </button>
              )}
              {puede.administrar_vistas && vistaId && (
                <button type="button" className="btn sm" onClick={guardarVista} disabled={busy}>
                  <Icon name="check" size={13} /> Guardar vista
                </button>
              )}
              {puede.administrar_vistas && vistaActiva && (
                <button type="button" className="btn sm" onClick={cambiarVisibilidadVista} disabled={busy} title="Cambiar visibilidad de la vista">
                  <Icon name={vistaActiva.visibilidad === 'personal' ? 'eye-off' : 'eye'} size={13} /> {vistaActiva.visibilidad === 'personal' ? 'Compartir vista' : 'Hacer privada'}
                </button>
              )}
            </div>
          </div>

          {!puede.ver_registros ? (
            <div className="banner-info">
              <Icon name="shield" size={15} />
              <span>No tenés permiso para ver los registros de esta lista.</span>
            </div>
          ) : vistaActiva?.tipo === 'form' ? (
            <VistaFormulario
              lista={lista}
              campos={campos}
              registros={filtrados}
              puedeCrear={Boolean(puede.crear_registros)}
              puedeEditar={Boolean(puede.editar_registros)}
              busy={busy}
              onGuardar={guardarRegistroInline}
            />
          ) : vistaActiva?.tipo === 'kanban' ? (
            (!kanbanCampo || kanbanOpciones.length === 0) ? (
              <div className="banner-info">
                <Icon name="info" size={15} />
                <span>Esta vista kanban no tiene una columna de etapa configurada.</span>
              </div>
            ) : (
              <div className="listas-kanban-wrap">
                <div className="listas-kanban">
                  {[...kanbanOpciones, ...(filtrados.some((r) => !kanbanOpciones.includes(String(r.datos?.[kanbanCampo.id] ?? ''))) ? [''] : [])].map((op) => {
                    const cards = filtrados.filter((r) => String(r.datos?.[kanbanCampo.id] ?? '') === op);
                    return (
                      <section
                        key={op || '__sin'}
                        className={`kanban-col${op === '' ? ' kanban-col-sin' : ''}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData('text/plain');
                          const registro = registros.find((r) => r.id === id);
                          if (registro) moverKanban(registro, op);
                        }}
                      >
                        <header>
                          <b>{op || 'Sin etapa'}</b>
                          <span className="badge gray">{cards.length}</span>
                        </header>
                        <div className="kanban-cards">
                          {cards.map((r) => {
                            const titulo = kanbanTitulo ? valorVisible(kanbanTitulo, r.datos?.[kanbanTitulo.id]) : '';
                            return (
                              <article
                                key={r.id}
                                className="kanban-card"
                                draggable={puedeEditarFila(r)}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', r.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={() => {
                                  if (puedeEditarFila(r)) setModal({ tipo: 'registro', registro: r });
                                }}
                              >
                                <b>{titulo || 'Sin título'}</b>
                                {camposTarjeta.map((c) => {
                                  const valor = r.datos?.[c.id];
                                  if (vacio(valor)) return null;
                                  return (
                                    <div className="kanban-meta" key={c.id}>
                                      <span>{c.nombre}</span>
                                      <span>{valorVisible(c, valor).slice(0, 80)}</span>
                                    </div>
                                  );
                                })}
                              </article>
                            );
                          })}
                          {cards.length === 0 && <div className="kanban-empty">Sin registros</div>}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <div className="listas-grid-foot">
                  <span className="muted" style={{ fontSize: 11.5 }}>{filtrados.length} de {total} registro(s)</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>Arrastrá las tarjetas para cambiar de etapa</span>
                </div>
              </div>
            )
          ) : vistaActiva?.tipo === 'calendar' ? (
            !calendarCampo ? (
              <div className="banner-info">
                <Icon name="info" size={15} />
                <span>Esta vista calendario no tiene un campo de fecha. Configurá una vista nueva con un campo de fecha.</span>
              </div>
            ) : (() => {
              const year = mes.getFullYear();
              const month = mes.getMonth();
              const inicio = (new Date(year, month, 1).getDay() + 6) % 7;
              const dias = new Date(year, month + 1, 0).getDate();
              const celdas = [...Array(inicio).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];
              const nombreMes = mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
              return (
                <div className="listas-calendar">
                  <div className="calendar-head">
                    <button type="button" className="btn icon sm" onClick={() => setMes(new Date(year, month - 1, 1))} title="Mes anterior">‹</button>
                    <b>{nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}</b>
                    <button type="button" className="btn icon sm" onClick={() => setMes(new Date(year, month + 1, 1))} title="Mes siguiente">›</button>
                  </div>
                  <div className="calendar-grid">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <div className="calendar-dow" key={d}>{d}</div>)}
                    {celdas.map((dia, i) => {
                      if (!dia) return <div className="calendar-cell calendar-empty" key={`v-${i}`} />;
                      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                      const delDia = filtrados.filter((r) => String(r.datos?.[calendarCampo.id] || '').slice(0, 10) === iso);
                      return (
                        <div className="calendar-cell" key={iso}>
                          <span className="calendar-day">{dia}</span>
                          <div className="calendar-events">
                            {delDia.slice(0, 4).map((r) => (
                              <button
                                type="button"
                                className="calendar-event"
                                key={r.id}
                                onClick={() => { if (puedeEditarFila(r)) setModal({ tipo: 'registro', registro: r }); }}
                                title="Abrir registro"
                              >
                                {valorVisible(tarjetaTitulo, r.datos?.[tarjetaTitulo?.id]) || 'Sin título'}
                              </button>
                            ))}
                            {delDia.length > 4 && <span className="muted" style={{ fontSize: 10 }}>+{delDia.length - 4} más</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="listas-grid-foot">
                    <span className="muted" style={{ fontSize: 11.5 }}>{filtrados.length} registro(s) en la vista</span>
                  </div>
                </div>
              );
            })()
          ) : vistaActiva?.tipo === 'gallery' ? (
            <div className="listas-gallery">
              {filtrados.length === 0 ? (
                <div className="empty"><Icon name="clipboard" size={26} /><b>No hay registros para mostrar</b></div>
              ) : filtrados.map((r) => {
                const img = galleryImage ? r.datos?.[galleryImage.id] : null;
                const titulo = valorVisible(tarjetaTitulo, r.datos?.[tarjetaTitulo?.id]) || 'Sin título';
                const extras = campos.filter((c) => c.id !== galleryImage?.id && c.id !== tarjetaTitulo?.id).slice(0, 3);
                return (
                  <button
                    type="button"
                    className="gallery-card"
                    key={r.id}
                    onClick={() => { if (puedeEditarFila(r)) setModal({ tipo: 'registro', registro: r }); }}
                  >
                    {img?.url ? <AdjuntoImg url={img.url} alt={img.nombre || titulo} className="gallery-img" /> : <div className="gallery-img gallery-noimg"><Icon name="clipboard" size={24} /></div>}
                    <b>{titulo}</b>
                    {extras.map((c) => (
                      <span className="gallery-meta" key={c.id}><small>{c.nombre}</small>{valorVisible(c, r.datos?.[c.id]) || '—'}</span>
                    ))}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="card listas-grid-card">
              {visibles.length === 0 ? (
                <p className="muted">No hay columnas visibles.</p>
              ) : (
                <div className="listas-grid-wrap">
                  <table className="listas-grid">
                    <thead>
                      <tr>
                        {visibles.map((campo) => (
                          <th
                            key={campo.id}
                            draggable
                            className={arrastrandoColumna === campo.id ? 'columna-arrastrando' : ''}
                            onDragStart={(e) => { setArrastrandoColumna(campo.id); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setArrastrandoColumna(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); moverColumna(arrastrandoColumna, campo.id); setArrastrandoColumna(null); }}
                            onClick={() => cambiarOrden(campo)}
                            title="Arrastrá para mover la columna; clic para ordenar"
                          >
                            <span>{campo.nombre}</span>
                            {orden?.campo === campo.id && <span className="listas-sort">{orden.dir === 'asc' ? '↑' : '↓'}</span>}
                          </th>
                        ))}
                        <th className="listas-acciones-col" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr>
                          <td colSpan={visibles.length + 1}>
                            <div className="listas-empty">
                              <Icon name="clipboard" size={20} />
                              <b>{registros.length ? 'No hay resultados con esos filtros' : 'Todavía no hay registros'}</b>
                              <span className="muted">
                                {registros.length
                                  ? 'Probá limpiar la búsqueda o los filtros.'
                                  : puede.crear_registros
                                    ? 'Cargá el primero con “Nuevo registro”.'
                                    : 'Cuando el equipo cargue registros, van a aparecer acá.'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : gruposPagina.map((grupo) => (
                        <Fragment key={grupo.key}>
                          {agrupar && (
                            <tr className="listas-group-row">
                              <td colSpan={visibles.length + 1}>
                                <b>{grupo.label}</b>
                                <span className="badge gray" style={{ marginLeft: 6 }}>{grupo.rows.length}</span>
                              </td>
                            </tr>
                          )}
                          {grupo.rows.map((registro) => (
                        <tr
                          key={registro.id}
                          className={puedeEditarFila(registro) ? 'listas-row-click' : ''}
                          style={estiloFila(registro)}
                          onClick={() => {
                            if (puedeEditarFila(registro)) setModal({ tipo: 'registro', registro });
                          }}
                        >
                          {visibles.map((campo) => {
                            const valor = registro.datos?.[campo.id];
                            return (
                              <td key={campo.id}>
                                {(campo.tipo === 'adjunto' || campo.tipo === 'imagen') && valor?.url ? (
                                  <AdjuntoLink className="listas-cell" url={valor.url} nombre={valor.nombre}>
                                    <Icon name="folder" size={12} /> {valor.nombre || 'Adjunto'}
                                  </AdjuntoLink>
                                ) : campo.tipo === 'checkbox'
                                  ? <span className={`badge ${valor ? 'green' : 'gray'}`}>{valor ? 'Sí' : 'No'}</span>
                                  : (vacio(valor) ? <span className="muted">—</span> : (
                                    <span className="listas-cell" title={String(valor)}>
                                      {valorVisible(campo, valor).slice(0, 160)}
                                    </span>
                                  ))}
                              </td>
                            );
                          })}
                          <td className="listas-acciones-col" onClick={(e) => e.stopPropagation()}>
                            <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                              {registro.aprobacion_estado === 'pendiente' && <span className="badge amber">Pendiente</span>}
                              {registro.aprobacion_estado === 'rechazado' && <span className="badge red">Rechazado</span>}
                              {puedeEditarFila(registro) && (
                                <button type="button" className="btn icon sm" title="Editar" onClick={() => setModal({ tipo: 'registro', registro })}>
                                  <Icon name="gear" size={13} />
                                </button>
                              )}
                              {puedeBorrarFila(registro) && !bloqueadoAprobacionFila(registro) && (
                                <button type="button" className="btn icon sm danger" title="Archivar" onClick={() => confirmarArchivarRegistro(registro)}>
                                  <Icon name="x" size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="listas-grid-foot">
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {filtrados.length === 0 ? '0 registro(s)' : `Mostrando ${inicioPagina + 1}–${finPagina} de ${filtrados.length} registro(s)`}
                </span>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <button type="button" className="btn sm" onClick={() => setPagina(Math.max(0, paginaActual - 1))} disabled={paginaActual === 0}>Anterior</button>
                  <span className="badge gray">Página {paginaActual + 1} de {totalPaginas}</span>
                  <button type="button" className="btn sm" onClick={() => setPagina(Math.min(totalPaginas - 1, paginaActual + 1))} disabled={paginaActual >= totalPaginas - 1}>Siguiente</button>
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {visibles.length} columna(s) · {filtros.length} filtro(s)
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {modal?.tipo === 'registro' && (
        <RegistroModal
          lista={lista}
          registro={modal.registro}
          puedeBorrar={puede.borrar_registros}
          puedeEditar={puede.editar_registros}
          puedeAprobar={puede.editar_listas}
          puedeConvertir={puedeConvertir}
          busy={busy}
          onGuardar={guardarRegistro}
          onEliminar={(r) => confirmarArchivarRegistro(r)}
          onConvertir={(r) => setModal({ tipo: 'convertir', registro: r })}
          onRecargar={recargarRegistros}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'auditoria' && (
        <AuditoriaListaModal lista={lista} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'formulario' && (
        <FormularioPublicoModal lista={lista} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'reglas' && (
        <ReglasModal lista={lista} campos={campos} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'papeleraRegistros' && (
        <PapeleraRegistrosModal
          lista={lista}
          campos={campos}
          onRestaurada={recargarRegistros}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'guardarPlantilla' && (
        <GuardarPlantillaModal lista={lista} busy={busy} onGuardar={guardarPlantilla} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'duplicar' && (
        <DuplicarListaModal lista={lista} busy={busy} onGuardar={duplicarLista} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'importar' && (
        <ImportarModal campos={campos} busy={busy} onImportar={importarCsv} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'convertir' && (
        <ConvertirModal
          lista={lista}
          registro={modal.registro}
          busy={busy}
          onGuardar={convertirRegistro}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'config' && (
        <ListaConfigModal
          lista={lista}
          busy={busy}
          onGuardarLista={guardarLista}
          onNuevoCampo={() => setModal({ tipo: 'campo', campo: null })}
          onEditarCampo={(campo) => setModal({ tipo: 'campo', campo })}
          onEliminarCampo={confirmarQuitarCampo}
          onArchivarLista={puede.borrar_listas ? archivarLista : null}
          onGuardarPlantilla={puede.editar_listas ? () => setModal({ tipo: 'guardarPlantilla' }) : null}
          onDuplicar={puede.crear_listas ? () => setModal({ tipo: 'duplicar' }) : null}
          onPapelera={puede.borrar_registros ? () => setModal({ tipo: 'papeleraRegistros' }) : null}
          onReglas={puede.editar_listas ? () => setModal({ tipo: 'reglas' }) : null}
          onFormulario={puede.editar_listas ? () => setModal({ tipo: 'formulario' }) : null}
          onAuditoria={puede.editar_listas ? () => setModal({ tipo: 'auditoria' }) : null}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'campo' && (
        <CampoModal
          campo={modal.campo}
          listas={area?.listas || []}
          listaActual={lista}
          camposActuales={lista.campos || []}
          busy={busy}
          onGuardar={guardarCampo}
          onClose={() => setModal({ tipo: 'config' })}
        />
      )}

      {modal?.tipo === 'nuevaVista' && (
        <NuevaVistaModal campos={campos} busy={busy} onGuardar={crearVista} onClose={() => setModal(null)} />
      )}

      {modal?.tipo === 'formato' && (
        <FormatoModal
          campos={campos}
          formato={formato}
          onAplicar={(f) => { setFormato(f); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'filtros' && (
        <FiltrosModal
          campos={campos}
          filtros={filtros}
          onAplicar={(f) => { setFiltros(f); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'columnas' && (
        <ColumnasModal
          campos={campos}
          columnas={columnas}
          onAplicar={(cols) => { persistirColumnas(cols); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      {confirmar && (
        <ConfirmDialog
          title={confirmar.titulo}
          sub={confirmar.sub}
          confirmLabel={confirmar.label}
          onCancel={() => setConfirmar(null)}
          onConfirm={async () => {
            const accion = confirmar;
            setConfirmar(null);
            try { await accion.onConfirm(); } catch (e) { toastShow(e.message, 'error'); }
          }}
        >
          <p className="muted" style={{ margin: 0 }}>{confirmar.texto}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function Listas() {
  const { areaSlug, listaId } = useParams();
  const areas = useStore((s) => s.data.areas);
  const cargarAreas = useStore((s) => s.cargarAreas);
  const [cargandoAreas, setCargandoAreas] = useState(!areas.length);

  useEffect(() => {
    if (areas.length) { setCargandoAreas(false); return; }
    let vivo = true;
    cargarAreas().finally(() => { if (vivo) setCargandoAreas(false); });
    return () => { vivo = false; };
  }, [areas.length, cargarAreas]);

  const area = areas.find((a) => a.slug === areaSlug);

  if (!areaSlug) return <AreasHome areas={areas} cargando={cargandoAreas} />;
  if (cargandoAreas) return <div className="wrap page"><p className="muted">Cargando área...</p></div>;
  if (!area) {
    return (
      <div className="wrap page">
        <div className="card">
          <h3 className="card-title"><Icon name="shield" size={15} /> No tenés acceso a esta área</h3>
          <p className="muted">Pedile al administrador que revise los permisos de tu categoría.</p>
          <Link to="/listas" className="btn primary">Volver a Listas</Link>
        </div>
      </div>
    );
  }
  if (!listaId) return <AreaDetalle area={area} />;
  return <ListaDetalle listaId={listaId} area={area} />;
}
