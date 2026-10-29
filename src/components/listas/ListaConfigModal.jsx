import { useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { etiquetaTipo } from '../../data/listas';

export default function ListaConfigModal({
  lista, busy, onGuardarLista, onNuevoCampo, onEditarCampo, onEliminarCampo, onArchivarLista, onDuplicar, onPapelera, onClose,
}) {
  const [nombre, setNombre] = useState(lista.nombre || '');
  const [descripcion, setDescripcion] = useState(lista.descripcion || '');
  const campos = lista.campos || [];

  return (
    <Modal
      size="xl"
      title={`Configurar ${lista.nombre}`}
      sub="Nombre, campos y estructura de la lista."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <button type="button" className="btn izq" onClick={onClose}>Cerrar</button>
      )}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nombre.trim().length >= 2) onGuardarLista({ nombre: nombre.trim(), descripcion: descripcion.trim() });
        }}
        className="col"
        style={{ gap: 12 }}
      >
        <FormGrid cols={2}>
          <div className="field">
            <label>Nombre de la lista</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="field">
            <label>Descripción</label>
            <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
        </FormGrid>
        <button type="submit" className="btn sm" disabled={busy || nombre.trim().length < 2} style={{ alignSelf: 'flex-start' }}>
          <Icon name="check" size={13} /> Guardar datos de la lista
        </button>
      </form>

      <div className="fsec-head" style={{ marginTop: 20 }}>
        <h4>Campos ({campos.length})</h4>
        <p>Las columnas y el formulario se arman con estos campos. Podés reordenar el orden de creación.</p>
      </div>

      <div className="col" style={{ gap: 7 }}>
        {campos.length === 0 && (
          <div className="banner-info">
            <Icon name="info" size={15} />
            <span>Todavía no hay campos. Agregá el primero para poder cargar registros.</span>
          </div>
        )}
        {campos.map((campo) => (
          <div className="lista-campo-row" key={campo.id}>
            <div className="grow">
              <b>{campo.nombre}</b>
              {campo.requerido && <span className="badge amber" style={{ marginLeft: 6 }}>Obligatorio</span>}
              {campo.unico && <span className="badge blue" style={{ marginLeft: 6 }}>Único</span>}
              <div className="muted" style={{ fontSize: 11.5 }}>
                {etiquetaTipo(campo.tipo)}
                {campo.config?.opciones?.length ? ` · ${campo.config.opciones.length} opción(es)` : ''}
              </div>
            </div>
            <button type="button" className="btn sm" onClick={() => onEditarCampo(campo)}>
              <Icon name="gear" size={12} /> Editar
            </button>
            <button type="button" className="btn sm danger" onClick={() => onEliminarCampo(campo)}>
              <Icon name="x" size={12} /> Quitar
            </button>
          </div>
        ))}
      </div>

      <div className="row between wrap" style={{ marginTop: 12, gap: 8 }}>
        <button type="button" className="btn primary sm" onClick={onNuevoCampo}>
          <Icon name="plus" size={13} /> Agregar campo
        </button>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {onPapelera && (
            <button type="button" className="btn sm" onClick={onPapelera}>
              <Icon name="recycl" size={13} /> Papelera de registros
            </button>
          )}
          {onDuplicar && (
            <button type="button" className="btn sm" onClick={onDuplicar}>
              <Icon name="grid" size={13} /> Duplicar como plantilla
            </button>
          )}
          {onArchivarLista && (
            <button type="button" className="btn sm danger" onClick={onArchivarLista}>
              <Icon name="x" size={13} /> Archivar lista
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
