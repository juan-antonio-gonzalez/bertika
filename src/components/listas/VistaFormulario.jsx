import { useState } from 'react';
import { Icon, FormGrid } from '../ui';
import { validarRegistro, valorVisible } from '../../data/listas';
import { CampoInput } from './RegistroModal';

function datosIniciales(campos) {
  const salida = {};
  for (const campo of campos || []) {
    if (campo.config?.defecto !== undefined) salida[campo.id] = campo.config.defecto;
    else if (campo.tipo === 'multiseleccion') salida[campo.id] = [];
    else if (campo.tipo === 'checkbox') salida[campo.id] = false;
    else salida[campo.id] = '';
  }
  return salida;
}

export default function VistaFormulario({ lista, campos, registros = [], puedeCrear, puedeEditar, busy, onGuardar }) {
  const [datos, setDatos] = useState(() => datosIniciales(campos));
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [seleccionado, setSeleccionado] = useState('');

  const setCampo = (id, valor) => setDatos((prev) => ({ ...prev, [id]: valor }));

  const tituloCampo = campos.find((c) => c.tipo === 'texto') || campos[0] || null;
  const cargarRegistro = (id) => {
    setSeleccionado(id);
    setError('');
    setEnviado(false);
    if (!id) { setDatos(datosIniciales(campos)); return; }
    const registro = (registros || []).find((r) => r.id === id);
    if (!registro) return;
    const siguiente = datosIniciales(campos);
    for (const campo of campos) {
      if (Object.prototype.hasOwnProperty.call(registro.datos || {}, campo.id)) siguiente[campo.id] = registro.datos[campo.id];
    }
    setDatos(siguiente);
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviado(false);
    const validado = validarRegistro(campos, datos);
    if (!validado.ok) return setError(validado.error);
    const ok = await onGuardar(validado.datos, seleccionado || null);
    if (ok) {
      if (!seleccionado) setDatos(datosIniciales(campos));
      setEnviado(true);
    } else {
      setError('No se pudo guardar. Revisá permisos, aprobación o validaciones del servidor.');
    }
  };

  if (!puedeCrear) {
    return (
      <div className="banner-info">
        <Icon name="shield" size={15} />
        <span>No tenés permiso para crear registros en esta lista.</span>
      </div>
    );
  }

  return (
    <div className="card vista-formulario">
      <div className="vista-form-head">
        <div>
          <h3 className="card-title"><Icon name="clipboard" size={16} /> {seleccionado ? 'Editar registro' : 'Formulario de alta'}</h3>
          <p className="muted">{seleccionado ? 'Modificá el registro y guardá los cambios.' : `Cargá un registro nuevo en ${lista.nombre}.`} Los campos obligatorios están marcados con *.</p>
        </div>
        <span className="badge gray">{campos.length} campo(s)</span>
      </div>
      {(puedeEditar && registros.length > 0) && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Cargar un registro existente</label>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" value={seleccionado} onChange={(e) => cargarRegistro(e.target.value)}>
              <option value="">Nuevo registro</option>
              {registros.slice(0, 300).map((r) => (
                <option key={r.id} value={r.id}>{valorVisible(tituloCampo, r.datos?.[tituloCampo?.id]) || r.id}</option>
              ))}
            </select>
            {seleccionado && <button type="button" className="btn sm" onClick={() => cargarRegistro('')}>Nuevo</button>}
          </div>
        </div>
      )}
      {enviado && (
        <div className="banner-info" style={{ marginBottom: 12 }}>
          <Icon name="check" size={15} />
          <span>Registro guardado. Podés cargar otro.</span>
        </div>
      )}
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      <form onSubmit={enviar}>
        <FormGrid cols={2}>
          {campos.map((campo) => (
            <CampoInput
              key={campo.id}
              campo={campo}
              value={datos[campo.id]}
              onChange={(valor) => setCampo(campo.id, valor)}
              listaId={lista.id}
            />
          ))}
        </FormGrid>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" className="btn primary" disabled={busy || !campos.length}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : seleccionado ? 'Guardar cambios' : 'Guardar registro'}
          </button>
        </div>
      </form>
    </div>
  );
}
