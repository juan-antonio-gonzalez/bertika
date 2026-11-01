import { useState } from 'react';
import { Icon, Modal } from '../ui';

export default function GuardarPlantillaModal({ lista, busy, onGuardar, onClose }) {
  const [nombre, setNombre] = useState(`${lista.nombre} (plantilla)`);
  const [descripcion, setDescripcion] = useState(lista.descripcion || '');
  return (
    <Modal
      size="sm"
      title="Guardar como plantilla"
      sub="Se guardan los campos y las vistas compartidas. No se copian registros."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-guardar-plantilla" className="btn primary" disabled={busy || nombre.trim().length < 2}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Guardar plantilla'}
          </button>
        </>
      )}
    >
      <form id="form-guardar-plantilla" onSubmit={(e) => { e.preventDefault(); if (nombre.trim().length >= 2) onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() }); }}>
        <div className="field">
          <label>Nombre de la plantilla *</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} data-autofocus />
        </div>
        <div className="field">
          <label>Descripción</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
