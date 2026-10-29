import { useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { etiquetaTipo } from '../../data/listas';

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
