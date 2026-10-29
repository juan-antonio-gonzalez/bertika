import { useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';

function valorDe(lista, registro, nombres) {
  // Se respeta el orden de prioridad: para el cliente importa más "Prospecto"
  // que el nombre de la oportunidad.
  for (const buscado of nombres) {
    const campo = (lista.campos || []).find((c) => String(c.nombre || '').toLowerCase().includes(buscado));
    if (campo && registro?.datos?.[campo.id] !== undefined && registro.datos[campo.id] !== null) {
      return registro.datos[campo.id];
    }
  }
  return '';
}

export default function ConvertirModal({ lista, registro, busy, onGuardar, onClose }) {
  const nombreInicial = valorDe(lista, registro, ['prospecto', 'cliente', 'empresa', 'contacto', 'nombre']);
  const emailInicial = valorDe(lista, registro, ['email', 'correo']);
  const telefonoInicial = valorDe(lista, registro, ['teléfono', 'telefono', 'celular']);
  const empresaInicial = valorDe(lista, registro, ['empresa']);
  const notasInicial = valorDe(lista, registro, ['notas', 'observaciones']);
  const equipoInicial = valorDe(lista, registro, ['equipo', 'batería', 'bateria', 'producto']);
  const fallaInicial = valorDe(lista, registro, ['falla', 'necesidad', 'descripción', 'descripcion', 'notas']);
  const serieInicial = valorDe(lista, registro, ['serie']);

  const [cliente, setCliente] = useState({
    nombre: String(nombreInicial || ''),
    email: String(emailInicial || ''),
    telefono: String(telefonoInicial || ''),
    empresa: String(empresaInicial || ''),
    contacto: String(nombreInicial || ''),
    notas: String(notasInicial || ''),
  });
  const [equipo, setEquipo] = useState({
    serie: String(serieInicial || ''),
    equipo: String(equipoInicial || ''),
    falla: String(fallaInicial || ''),
    tipo: '',
    voltaje: '',
    capacidad: '',
    aplicacion: '',
    marca: '',
    modelo: '',
  });
  const [error, setError] = useState('');

  const setC = (k, v) => setCliente((prev) => ({ ...prev, [k]: v }));
  const setE = (k, v) => setEquipo((prev) => ({ ...prev, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!cliente.nombre.trim()) return setError('El nombre del cliente es obligatorio.');
    if (!/^\S+@\S+\.\S+$/.test(cliente.email.trim())) return setError('El email del cliente no es válido.');
    return onGuardar({
      cliente: { ...cliente, nombre: cliente.nombre.trim(), email: cliente.email.trim() },
      equipo: { ...equipo, equipo: equipo.equipo.trim() || cliente.nombre.trim() },
    });
  };

  return (
    <Modal
      size="lg"
      title="Convertir a cliente de taller"
      sub={`${lista.nombre} · ${String(cliente.nombre || 'registro')}`}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-convertir-cliente" className="btn primary" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Convirtiendo...' : 'Crear cliente y orden'}
          </button>
        </>
      )}
    >
      <form id="form-convertir-cliente" onSubmit={submit} noValidate>
        {error && (
          <div className="banner-red" style={{ marginBottom: 14 }}>
            <div><Icon name="x" size={15} /> {error}</div>
          </div>
        )}
        <div className="banner-info" style={{ marginBottom: 14 }}>
          <Icon name="info" size={15} />
          <span>
            Se crea el cliente y una <b>orden de ingreso</b> en el taller. El cliente deja de ser un
            prospecto y aparece en Taller; la orden queda como ingreso para que el equipo la complete.
          </span>
        </div>

        <div className="fsec-head">
          <h4>Cliente</h4>
          <p>Si el email ya existe, se vincula a la ficha existente.</p>
        </div>
        <FormGrid cols={2}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={cliente.nombre} onChange={(e) => setC('nombre', e.target.value)} data-autofocus />
          </div>
          <div className="field">
            <label>Email *</label>
            <input className="input" type="email" value={cliente.email} onChange={(e) => setC('email', e.target.value)} />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input className="input" value={cliente.telefono} onChange={(e) => setC('telefono', e.target.value)} />
          </div>
          <div className="field">
            <label>Empresa</label>
            <input className="input" value={cliente.empresa} onChange={(e) => setC('empresa', e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Notas</label>
            <textarea className="input" rows={2} value={cliente.notas} onChange={(e) => setC('notas', e.target.value)} />
          </div>
        </FormGrid>

        <div className="fsec-head" style={{ marginTop: 18 }}>
          <h4>Equipo a revisar</h4>
          <p>Lo mínimo para que el taller reciba el ingreso. Si no sabés la serie, se genera una provisoria.</p>
        </div>
        <FormGrid cols={2}>
          <div className="field">
            <label>Equipo / batería</label>
            <input className="input" value={equipo.equipo} onChange={(e) => setE('equipo', e.target.value)} placeholder="Ej.: Batería de autoelevador" />
          </div>
          <div className="field">
            <label>Serie</label>
            <input className="input" value={equipo.serie} onChange={(e) => setE('serie', e.target.value)} placeholder="Opcional" />
          </div>
          <div className="field">
            <label>Tipo</label>
            <input className="input" value={equipo.tipo} onChange={(e) => setE('tipo', e.target.value)} placeholder="Plomo-Ácido, Litio..." />
          </div>
          <div className="field">
            <label>Voltaje</label>
            <input className="input" value={equipo.voltaje} onChange={(e) => setE('voltaje', e.target.value)} placeholder="12V, 48V..." />
          </div>
          <div className="field">
            <label>Capacidad</label>
            <input className="input" type="number" value={equipo.capacidad} onChange={(e) => setE('capacidad', e.target.value)} placeholder="Ah" />
          </div>
          <div className="field">
            <label>Aplicación</label>
            <input className="input" value={equipo.aplicacion} onChange={(e) => setE('aplicacion', e.target.value)} placeholder="Autoelevador, solar..." />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Falla / necesidad</label>
            <textarea className="input" rows={2} value={equipo.falla} onChange={(e) => setE('falla', e.target.value)} placeholder="Qué hay que revisar" />
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}
