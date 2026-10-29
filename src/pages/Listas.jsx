import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, ConfirmDialog } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { valorVisible } from '../data/listas';
import RegistroModal from '../components/listas/RegistroModal';
import CampoModal from '../components/listas/CampoModal';
import ListaConfigModal from '../components/listas/ListaConfigModal';
import ConvertirModal from '../components/listas/ConvertirModal';
import {
  FiltrosModal, ColumnasModal, NuevaVistaModal, NuevaListaModal,
} from '../components/listas/ModalesLista';

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

function AreasHome({ areas, cargando }) {
  if (cargando) return <div className="wrap page"><p className="muted">Cargando áreas...</p></div>;
  return (
    <div className="wrap page">
      <PageHeader
        group="Listas"
        title="Listas"
        sub="Tablas y vistas flexibles por área. Cada equipo ve solo los espacios que tiene habilitados."
      />
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

function AreaDetalle({ area }) {
  const cargarAreas = useStore((s) => s.cargarAreas);
  const toastShow = useStore((s) => s.toastShow);
  const navigate = useNavigate();
  const [nueva, setNueva] = useState(false);
  const [busy, setBusy] = useState(false);

  const crear = async (payload) => {
    setBusy(true);
    try {
      const res = await api('/listas', { method: 'POST', body: { area_id: area.id, ...payload } });
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
        actions={area.puede?.crear_listas ? (
          <button type="button" className="btn primary sm" onClick={() => setNueva(true)}>
            <Icon name="plus" size={14} /> Nueva lista
          </button>
        ) : null}
      />

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
  const [modal, setModal] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [busy, setBusy] = useState(false);

  const campos = lista?.campos || [];
  const vistas = lista?.vistas || [];
  const puede = lista?.puede || {};
  const puedeConvertir = Boolean(puede.convertir_prospecto) && lista?.area_slug === 'ventas';
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
  const camposTarjeta = campos
    .filter((c) => c.id !== kanbanCampo?.id && c.id !== kanbanTitulo?.id)
    .slice(0, 3);

  const configVista = () => ({
    ...vistaActiva?.config,
    columnas,
    filtros,
    orden,
    q: busqueda,
  });

  const cargarDetalle = async ({ resetVista = false } = {}) => {
    const data = await api(`/listas/${listaId}`);
    setLista(data);
    const actual = data.vistas?.find((v) => v.id === vistaId);
    const elegida = (!resetVista && actual) ? actual : (data.vistas?.find((v) => v.predeterminada) || data.vistas?.[0]);
    setVistaId(elegida?.id || '');
    setColumnas(elegida?.config?.columnas || []);
    setOrden(elegida?.config?.orden || null);
    setFiltros(elegida?.config?.filtros || []);
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

  const crearVista = async ({ nombre, predeterminada }) => {
    setBusy(true);
    try {
      const res = await api(`/listas/${lista.id}/vistas`, {
        method: 'POST',
        body: { nombre, predeterminada, config: configVista() },
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
  }, [registros, campos, busqueda, filtros, orden, vistaActiva, usuario]);

  const cambiarOrden = (campo) => {
    setOrden((prev) => (
      prev?.campo === campo.id
        ? { campo: campo.id, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo: campo.id, dir: 'asc' }
    ));
  };

  const moverKanban = async (registro, opcion) => {
    if (!kanbanCampo || !puede.editar_registros) return;
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
                  {v.nombre}
                </button>
              ))}
              {puede.administrar_vistas && (
                <button type="button" className="tab listas-tab-add" onClick={() => setModal({ tipo: 'nuevaVista' })} title="Nueva vista">
                  <Icon name="plus" size={13} />
                </button>
              )}
            </div>
            <div className="listas-tools">
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
              {vistaActiva?.tipo !== 'kanban' && (
                <button type="button" className="btn sm" onClick={() => setModal({ tipo: 'columnas' })}>
                  <Icon name="grid" size={13} /> Columnas
                </button>
              )}
              {puede.administrar_vistas && vistaId && (
                <button type="button" className="btn sm" onClick={guardarVista} disabled={busy}>
                  <Icon name="check" size={13} /> Guardar vista
                </button>
              )}
            </div>
          </div>

          {!puede.ver_registros ? (
            <div className="banner-info">
              <Icon name="shield" size={15} />
              <span>No tenés permiso para ver los registros de esta lista.</span>
            </div>
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
                                draggable={Boolean(puede.editar_registros)}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', r.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={() => {
                                  if (puede.editar_registros) setModal({ tipo: 'registro', registro: r });
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
                          <th key={campo.id} onClick={() => cambiarOrden(campo)} title="Ordenar por esta columna">
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
                      ) : filtrados.map((registro) => (
                        <tr
                          key={registro.id}
                          className={puede.editar_registros ? 'listas-row-click' : ''}
                          onClick={() => {
                            if (puede.editar_registros) setModal({ tipo: 'registro', registro });
                          }}
                        >
                          {visibles.map((campo) => {
                            const valor = registro.datos?.[campo.id];
                            return (
                              <td key={campo.id}>
                                {campo.tipo === 'checkbox'
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
                              {puede.editar_registros && (
                                <button type="button" className="btn icon sm" title="Editar" onClick={() => setModal({ tipo: 'registro', registro })}>
                                  <Icon name="gear" size={13} />
                                </button>
                              )}
                              {puede.borrar_registros && (
                                <button type="button" className="btn icon sm danger" title="Archivar" onClick={() => confirmarArchivarRegistro(registro)}>
                                  <Icon name="x" size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="listas-grid-foot">
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {filtrados.length === total
                    ? `${total} registro(s)`
                    : `${filtrados.length} de ${total} registro(s)`}
                </span>
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
          puedeConvertir={puedeConvertir}
          busy={busy}
          onGuardar={guardarRegistro}
          onEliminar={(r) => confirmarArchivarRegistro(r)}
          onConvertir={(r) => setModal({ tipo: 'convertir', registro: r })}
          onClose={() => setModal(null)}
        />
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
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tipo === 'campo' && (
        <CampoModal
          campo={modal.campo}
          busy={busy}
          onGuardar={guardarCampo}
          onClose={() => setModal({ tipo: 'config' })}
        />
      )}

      {modal?.tipo === 'nuevaVista' && (
        <NuevaVistaModal busy={busy} onGuardar={crearVista} onClose={() => setModal(null)} />
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
          onAplicar={(cols) => { setColumnas(cols); setModal(null); }}
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
