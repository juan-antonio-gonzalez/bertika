import { useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { TIPOS_CAMPO, normalizarOpciones } from '../../data/listas';

export default function CampoModal({ campo, busy, onGuardar, onClose }) {
  const [nombre, setNombre] = useState(campo?.nombre || '');
  const [tipo, setTipo] = useState(campo?.tipo || 'texto');
  const [opciones, setOpciones] = useState(() => (campo?.config?.opciones || []).join('\n'));
  const [requerido, setRequerido] = useState(Boolean(campo?.requerido));
  const [unico, setUnico] = useState(Boolean(campo?.unico));
  const [min, setMin] = useState(campo?.config?.min ?? '');
  const [max, setMax] = useState(campo?.config?.max ?? '');
  const [ayuda, setAyuda] = useState(campo?.config?.ayuda || '');
  const [error, setError] = useState('');
  const esSeleccion = tipo === 'seleccion' || tipo === 'multiseleccion';
  const esNumero = tipo === 'numero' || tipo === 'moneda';

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) {
      setError('El campo necesita un nombre.');
      return;
    }
    const ops = normalizarOpciones(opciones);
    if (esSeleccion && ops.length === 0) {
      setError('Agregá al menos una opción.');
      return;
    }
    const config = {};
    if (esSeleccion) config.opciones = ops;
    if (esNumero) {
      if (min !== '') config.min = Number(min);
      if (max !== '') config.max = Number(max);
    }
    if (ayuda.trim()) config.ayuda = ayuda.trim();
    onGuardar({
      nombre: nombre.trim(),
      tipo,
      config,
      requerido,
      unico,
    });
  };

  return (
    <Modal
      size="md"
      title={campo ? `Editar campo: ${campo.nombre}` : 'Agregar campo'}
      sub="Los campos definen las columnas de la lista y el formulario de carga."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-campo-lista" className="btn primary" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : campo ? 'Guardar campo' : 'Agregar campo'}
          </button>
        </>
      )}
    >
      <form id="form-campo-lista" onSubmit={submit} noValidate>
        {error && (
          <div className="banner-red" style={{ marginBottom: 14 }}>
            <div><Icon name="x" size={15} /> {error}</div>
          </div>
        )}
        <FormGrid cols={2}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Cliente, Etapa, Fecha" data-autofocus />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_CAMPO.map((t) => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
            </select>
          </div>

          {esSeleccion && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Opciones *</label>
              <textarea
                className="input"
                rows={4}
                value={opciones}
                onChange={(e) => setOpciones(e.target.value)}
                placeholder={'Una opción por línea\nEj.: Nuevo\nContactado\nGanado\nPerdido'}
              />
              <small className="ayuda">Una por línea. También podés separarlas con comas.</small>
            </div>
          )}

          {esNumero && (
            <>
              <div className="field">
                <label>Mínimo</label>
                <input className="input" type="number" step="any" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="field">
                <label>Máximo</label>
                <input className="input" type="number" step="any" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Ayuda para completar</label>
            <input className="input" value={ayuda} onChange={(e) => setAyuda(e.target.value)} placeholder="Opcional: una aclaración para el equipo" />
          </div>
        </FormGrid>

        <div className="col" style={{ gap: 6, marginTop: 12 }}>
          <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={requerido} onChange={(e) => setRequerido(e.target.checked)} />
            <span>Obligatorio para guardar un registro</span>
          </label>
          <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={unico} onChange={(e) => setUnico(e.target.checked)} />
            <span>No permitir valores repetidos en este campo</span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
