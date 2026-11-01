import { useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { etiquetaTipo } from '../../data/listas';

export default function ListaConfigModal({
  lista, busy, onGuardarLista, onNuevoCampo, onEditarCampo, onEliminarCampo, onArchivarLista, onDuplicar, onPapelera, onReglas, onFormulario, onClose,
}) {
  const [nombre, setNombre] = useState(lista.nombre || '');
  const [descripcion, setDescripcion] = useState(lista.descripcion || '');
  const [permisoFilas, setPermisoFilas] = useState(lista.permiso_filas || 'todos');
  const [permisoCampo, setPermisoCampo] = useState(lista.permiso_campo || '');
  const [verFilas, setVerFilas] = useState(lista.ver_filas || 'todos');
  const [verCampo, setVerCampo] = useState(lista.ver_campo || '');
  const [requiereAprobacion, setRequiereAprobacion] = useState(lista.requiere_aprobacion === true);
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
          if (nombre.trim().length >= 2) onGuardarLista({ nombre: nombre.trim(), descripcion: descripcion.trim(), permiso_filas: permisoFilas, permiso_campo: permisoCampo || null, ver_filas: verFilas, ver_campo: verCampo || null, requiere_aprobacion: requiereAprobacion });
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
        <div className="field">
          <label>¿Quién puede ver las filas?</label>
          <select className="input" value={verFilas} onChange={(e) => { setVerFilas(e.target.value); if (e.target.value !== 'responsable') setVerCampo(''); }}>
            <option value="todos">Todos los que tengan permiso en el área</option>
            <option value="creador">Solo quien creó la fila</option>
            <option value="responsable">Solo el responsable de la fila</option>
            <option value="admin">Solo administradores</option>
          </select>
          {verFilas === 'responsable' && (
            <select className="input" value={verCampo} onChange={(e) => setVerCampo(e.target.value)} style={{ marginTop: 6 }}>
              <option value="">Elegir campo de persona...</option>
              {campos.filter((c) => c.tipo === 'persona').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <small className="ayuda">Filtra las filas que se listan y el acceso a comentarios, historial y aprobaciones. Los administradores de la lista y del sistema ven todo.</small>
        </div>
        <div className="field">
          <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={requiereAprobacion} onChange={(e) => setRequiereAprobacion(e.target.checked)} />
            <span>Exigir aprobación antes de publicar o modificar filas</span>
          </label>
          <small className="ayuda">Si está activo, las altas y ediciones de usuarios comunes quedan pendientes hasta que un gestor las apruebe. Los formularios públicos también quedan pendientes.</small>
        </div>
        <div className="field">
          <label>¿Quién puede editar o archivar filas?</label>
          <select className="input" value={permisoFilas} onChange={(e) => { setPermisoFilas(e.target.value); if (e.target.value !== 'responsable') setPermisoCampo(''); }}>
            <option value="todos">Todos los que tengan permiso en el área</option>
            <option value="creador">Solo quien creó la fila</option>
            <option value="responsable">Solo el responsable de la fila</option>
            <option value="admin">Solo administradores</option>
          </select>
          {permisoFilas === 'responsable' && (
            <select className="input" value={permisoCampo} onChange={(e) => setPermisoCampo(e.target.value)} style={{ marginTop: 6 }}>
              <option value="">Elegir campo de persona...</option>
              {campos.filter((c) => c.tipo === 'persona').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <small className="ayuda">El servidor valida esta regla también al editar, archivar y restaurar.</small>
        </div>
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
          {onReglas && (
            <button type="button" className="btn sm" onClick={onReglas}>
              <Icon name="bell" size={13} /> Reglas y avisos
            </button>
          )}
          {onFormulario && (
            <button type="button" className="btn sm" onClick={onFormulario}>
              <Icon name="link" size={13} /> Formulario público
            </button>
          )}
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
