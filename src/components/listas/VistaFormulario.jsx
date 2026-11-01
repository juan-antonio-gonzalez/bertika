import { useState } from 'react';
import { Icon, FormGrid } from '../ui';
import { validarRegistro } from '../../data/listas';
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

export default function VistaFormulario({ lista, campos, puedeCrear, busy, onGuardar }) {
  const [datos, setDatos] = useState(() => datosIniciales(campos));
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  const setCampo = (id, valor) => setDatos((prev) => ({ ...prev, [id]: valor }));

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviado(false);
    const validado = validarRegistro(campos, datos);
    if (!validado.ok) return setError(validado.error);
    const ok = await onGuardar(validado.datos);
    if (ok) {
      setDatos(datosIniciales(campos));
      setEnviado(true);
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
          <h3 className="card-title"><Icon name="clipboard" size={16} /> Formulario de alta</h3>
          <p className="muted">Cargá un registro nuevo en {lista.nombre}. Los campos obligatorios están marcados con *.</p>
        </div>
        <span className="badge gray">{campos.length} campo(s)</span>
      </div>
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
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Guardar registro'}
          </button>
        </div>
      </form>
    </div>
  );
}
