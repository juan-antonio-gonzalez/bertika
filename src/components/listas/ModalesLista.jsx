import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid, fmtFecha } from '../ui';
import { etiquetaTipo, valorVisible } from '../../data/listas';
import { parseCsv } from '../../data/csv';
import { api } from '../../store/api';

const OPS = [
  { op: 'contiene', label: 'contiene' },
  { op: 'igual', label: 'es igual a' },
  { op: 'distinto', label: 'es distinto de' },
  { op: 'mayor', label: 'es mayor que' },
  { op: 'menor', label: 'es menor que' },
  { op: 'vacio', label: 'está vacío' },
];

function ValorFiltro({ campo, valor, onChange }) {
  if (!campo) return null;
  if (campo.tipo === 'seleccion') {
    return (
      <select className="input" value={valor || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegir...</option>
        {(campo.config?.opciones || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (campo.tipo === 'checkbox') {
    return (
      <select className="input" value={valor || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegir...</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  }
  const type = campo.tipo === 'fecha' ? 'date' : (campo.tipo === 'numero' || campo.tipo === 'moneda') ? 'number' : 'text';
  return <input className="input" type={type} step={type === 'number' ? 'any' : undefined} value={valor || ''} onChange={(e) => onChange(e.target.value)} placeholder="Valor" />;
}

export function FiltrosModal({ campos, filtros, onAplicar, onClose }) {
  const [conds, setConds] = useState(() => (filtros || []).map((f) => ({ ...f })));

  const cambiar = (i, parcial) => {
    setConds((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...parcial } : c)));
  };
  const agregar = () => {
    const primero = campos[0];
    setConds((prev) => [...prev, { campo: primero?.id || '', op: 'contiene', valor: '' }]);
  };
  const quitar = (i) => setConds((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Modal
      size="lg"
      title="Filtros de la vista"
      sub="Se aplican sobre los registros de esta lista. Podés guardarlos en la vista."
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => onAplicar(conds)}>
            <Icon name="check" size={14} /> Aplicar filtros
          </button>
        </>
      )}
    >
      {campos.length === 0 ? (
        <div className="banner-info"><Icon name="info" size={15} /><span>Primero agregá campos a la lista.</span></div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {conds.length === 0 && <p className="muted">No hay filtros. Agregá una condición.</p>}
          {conds.map((cond, i) => {
            const campo = campos.find((c) => c.id === cond.campo);
            return (
              <div className="lista-filtro-row" key={`${cond.campo}-${i}`}>
                <select
                  className="input"
                  value={cond.campo}
                  onChange={(e) => cambiar(i, { campo: e.target.value, valor: '' })}
                >
                  {campos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({etiquetaTipo(c.tipo)})</option>)}
                </select>
                <select className="input" value={cond.op} onChange={(e) => cambiar(i, { op: e.target.value })}>
                  {OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                {cond.op !== 'vacio' && (
                  <ValorFiltro campo={campo} valor={cond.valor} onChange={(v) => cambiar(i, { valor: v })} />
                )}
                <button type="button" className="btn icon sm danger" onClick={() => quitar(i)} title="Quitar filtro">
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
          <button type="button" className="btn sm" onClick={agregar} style={{ alignSelf: 'flex-start' }}>
            <Icon name="plus" size={13} /> Agregar condición
          </button>
        </div>
      )}
    </Modal>
  );
}

export function ColumnasModal({ campos, columnas, onAplicar, onClose }) {
  const [sel, setSel] = useState(() => (
    columnas?.length ? columnas : campos.map((c) => c.id)
  ));
  const toggle = (id) => setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <Modal
      size="sm"
      title="Columnas visibles"
      sub="Elegí qué columnas querés ver en la grilla."
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => onAplicar(sel)}>
            <Icon name="check" size={14} /> Aplicar
          </button>
        </>
      )}
    >
      <div className="col" style={{ gap: 7 }}>
        {campos.map((c) => (
          <label key={c.id} className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />
            <span>{c.nombre} <small className="muted">({etiquetaTipo(c.tipo)})</small></span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export function NuevaVistaModal({ busy, onGuardar, onClose }) {
  const [nombre, setNombre] = useState('');
  const [predeterminada, setPredeterminada] = useState(false);
  return (
    <Modal
      size="sm"
      title="Nueva vista"
      sub="Guarda la búsqueda, las columnas, el orden y los filtros actuales."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-nueva-vista" className="btn primary" disabled={busy || !nombre.trim()}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Crear vista'}
          </button>
        </>
      )}
    >
      <form id="form-nueva-vista" onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) onGuardar({ nombre: nombre.trim(), predeterminada }); }}>
        <div className="field">
          <label>Nombre *</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Mis oportunidades, Pendientes" data-autofocus />
        </div>
        <label className="check-line" style={{ marginTop: 12, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" checked={predeterminada} onChange={(e) => setPredeterminada(e.target.checked)} />
          <span>Usar como vista predeterminada</span>
        </label>
      </form>
    </Modal>
  );
}

export function NuevaListaModal({ area, busy, onGuardar, onClose }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  return (
    <Modal
      size="sm"
      title={`Nueva lista en ${area?.nombre || 'el área'}`}
      sub="Después de crearla vas a poder agregar campos y vistas."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-nueva-lista" className="btn primary" disabled={busy || nombre.trim().length < 2}>
            <Icon name="check" size={14} /> {busy ? 'Creando...' : 'Crear lista'}
          </button>
        </>
      )}
    >
      <form id="form-nueva-lista" onSubmit={(e) => { e.preventDefault(); if (nombre.trim().length >= 2) onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() }); }}>
        <FormGrid cols={1}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Materiales, Herramientas, Prospectos" data-autofocus />
          </div>
          <div className="field">
            <label>Descripción</label>
            <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué sirve esta lista" />
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}


function normalizarNombre(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function ImportarModal({ campos, busy, onImportar, onClose }) {
  const [headers, setHeaders] = useState([]);
  const [filas, setFilas] = useState([]);
  const [mapa, setMapa] = useState({});
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [error, setError] = useState('');

  const leer = async (file) => {
    setError('');
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError('El archivo es demasiado grande (máximo 4 MB).');
      return;
    }
    try {
      const texto = await file.text();
      const rows = parseCsv(texto);
      if (rows.length < 2) {
        setError('El CSV tiene que tener una fila de títulos y al menos una fila de datos.');
        setHeaders([]); setFilas([]); setMapa({});
        return;
      }
      const heads = rows[0].map((h) => String(h || '').trim());
      const cuerpo = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
      const auto = {};
      for (const head of heads) {
        const h = normalizarNombre(head);
        if (!h || h === 'id') continue;
        const campo = campos.find((c) => normalizarNombre(c.nombre) === h)
          || campos.find((c) => normalizarNombre(c.nombre).includes(h) || h.includes(normalizarNombre(c.nombre)));
        if (campo) auto[head] = campo.id;
      }
      setNombreArchivo(file.name);
      setHeaders(heads);
      setFilas(cuerpo);
      setMapa(auto);
      if (cuerpo.length > 500) setError('El CSV tiene más de 500 filas. Dividilo en partes.');
    } catch {
      setError('No se pudo leer el archivo. Probá con un CSV simple (coma o punto y coma).');
    }
  };

  const mapeados = Object.values(mapa).filter(Boolean);
  const puede = filas.length > 0 && filas.length <= 500 && mapeados.length > 0;

  return (
    <Modal
      size="lg"
      title="Importar CSV"
      sub="La primera fila debe tener los nombres de las columnas. Después podés ajustar el mapeo."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !puede}
            onClick={() => onImportar({ headers, filas, mapa })}
          >
            <Icon name="check" size={14} /> {busy ? 'Importando...' : `Importar ${filas.length} fila(s)`}
          </button>
        </>
      )}
    >
      {error && (
        <div className="banner-red" style={{ marginBottom: 14 }}>
          <div><Icon name="x" size={15} /> {error}</div>
        </div>
      )}
      <div className="field">
        <label>Archivo CSV</label>
        <input
          className="input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => leer(e.target.files?.[0])}
          disabled={busy}
        />
        <small className="ayuda">Máximo 4 MB y 500 filas por importación. Se aceptan comas o punto y coma.</small>
      </div>

      {headers.length > 0 && (
        <>
          <div className="row between wrap" style={{ margin: '14px 0 8px' }}>
            <b>{nombreArchivo}</b>
            <span className="badge gray">{filas.length} fila(s)</span>
          </div>
          <div className="col" style={{ gap: 7 }}>
            {headers.map((head, idx) => (
              <div className="lista-import-row" key={`${head}-${idx}`}>
                <span className="lista-import-head">{head || '(sin título)'}</span>
                <Icon name="external" size={12} style={{ opacity: 0.4 }} />
                <select
                  className="input"
                  value={mapa[head] || ''}
                  onChange={(e) => setMapa((prev) => ({ ...prev, [head]: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">— No importar —</option>
                  {campos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({etiquetaTipo(c.tipo)})</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export function DuplicarListaModal({ lista, busy, onGuardar, onClose }) {
  const [nombre, setNombre] = useState(`${lista?.nombre || 'Lista'} copia`);
  return (
    <Modal
      size="sm"
      title="Duplicar como plantilla"
      sub="Copia los campos y las vistas. No copia los registros."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-duplicar-lista" className="btn primary" disabled={busy || nombre.trim().length < 2}>
            <Icon name="check" size={14} /> {busy ? 'Duplicando...' : 'Duplicar lista'}
          </button>
        </>
      )}
    >
      <form id="form-duplicar-lista" onSubmit={(e) => { e.preventDefault(); if (nombre.trim().length >= 2) onGuardar({ nombre: nombre.trim() }); }}>
        <div className="field">
          <label>Nombre de la nueva lista *</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} data-autofocus />
        </div>
        <div className="banner-info" style={{ marginTop: 12 }}>
          <Icon name="info" size={15} />
          <span>Ideal para reutilizar {lista?.nombre || 'esta lista'} como plantilla sin cargar datos viejos.</span>
        </div>
      </form>
    </Modal>
  );
}


export function PapeleraListasModal({ onRestaurada, onClose }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      setFilas(await api('/listas/archivadas'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const restaurar = async (id) => {
    setBusy(true);
    try {
      await api(`/listas/${id}/restaurar`, { method: 'PATCH' });
      setFilas((prev) => prev.filter((f) => f.id !== id));
      onRestaurada?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Papelera de listas"
      sub="Las listas archivadas se pueden restaurar con sus campos, vistas y registros."
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando...</p> : filas.length === 0 ? (
        <div className="empty"><Icon name="recycl" size={26} /><b>No hay listas archivadas</b></div>
      ) : (
        <div className="col" style={{ gap: 7 }}>
          {filas.map((f) => (
            <div className="lista-campo-row" key={f.id}>
              <div className="grow">
                <b>{f.nombre}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {f.area_nombre} · archivada {f.archivada_en ? fmtFecha(f.archivada_en) : '—'}
                  {f.archivada_por ? ` por ${f.archivada_por}` : ''}
                </div>
              </div>
              <button type="button" className="btn sm" onClick={() => restaurar(f.id)} disabled={busy}>
                <Icon name="refresh" size={12} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function PapeleraRegistrosModal({ lista, campos, onRestaurada, onClose }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const etiqueta = campos.find((c) => c.tipo === 'texto') || campos[0];

  const cargar = async () => {
    setCargando(true);
    try {
      setFilas(await api(`/listas/${lista.id}/registros-archivados`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const restaurar = async (id) => {
    setBusy(true);
    try {
      await api(`/lista-registros/${id}/restaurar`, { method: 'PATCH' });
      setFilas((prev) => prev.filter((f) => f.id !== id));
      onRestaurada?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title={`Papelera de ${lista.nombre}`}
      sub="Los registros archivados no se borraron: se pueden restaurar."
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando...</p> : filas.length === 0 ? (
        <div className="empty"><Icon name="recycl" size={26} /><b>No hay registros archivados</b></div>
      ) : (
        <div className="col" style={{ gap: 7 }}>
          {filas.map((f) => (
            <div className="lista-campo-row" key={f.id}>
              <div className="grow">
                <b>{etiqueta ? valorVisible(etiqueta, f.datos?.[etiqueta.id]) || 'Sin título' : f.id}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  Archivado {f.archivado_en ? fmtFecha(f.archivado_en) : '—'}{f.archivado_por ? ` por ${f.archivado_por}` : ''}
                </div>
              </div>
              <button type="button" className="btn sm" onClick={() => restaurar(f.id)} disabled={busy}>
                <Icon name="refresh" size={12} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
