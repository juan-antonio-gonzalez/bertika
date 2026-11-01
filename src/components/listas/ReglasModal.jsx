import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { api } from '../../store/api';
import { etiquetaTipo } from '../../data/listas';

const OPS = [
  { op: 'igual', label: 'es igual a' },
  { op: 'contiene', label: 'contiene' },
  { op: 'distinto', label: 'es distinto de' },
  { op: 'mayor', label: 'es mayor que' },
  { op: 'menor', label: 'es menor que' },
  { op: 'vacio', label: 'está vacío' },
];
const VACIA = { nombre: '', evento: 'ambos', campo: '', op: 'igual', valor: '', accion: 'email', destinatario: '', asunto: '', campo_destino: '', mensaje: '', activo: true };

export default function ReglasModal({ lista, campos, onClose }) {
  const [reglas, setReglas] = useState([]);
  const [form, setForm] = useState(VACIA);
  const [editando, setEditando] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      setReglas(await api(`/listas/${lista.id}/reglas`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const editar = (r) => {
    setEditando(r.id);
    setForm({
      nombre: r.nombre || '', evento: r.evento || 'ambos', campo: r.campo || '', op: r.op || 'igual',
      valor: r.valor || '', accion: r.accion || 'email', destinatario: r.destinatario || '', asunto: r.asunto || '',
      campo_destino: r.campo_destino || '', mensaje: r.mensaje || '', activo: r.activo !== false,
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) return setError('La regla necesita un nombre.');
    if (!form.campo) return setError('Elegí el campo que dispara el aviso.');
    if (form.accion === 'whatsapp') {
      if (!form.campo_destino) return setError('Elegí el campo de teléfono para el WhatsApp.');
    } else if (!/^\S+@\S+\.\S+$/.test(form.destinatario.trim())) return setError('El email del aviso no es válido.');
    setBusy(true);
    try {
      if (editando) await api(`/lista-reglas/${editando}`, { method: 'PATCH', body: form });
      else await api(`/listas/${lista.id}/reglas`, { method: 'POST', body: form });
      setEditando(null);
      setForm(VACIA);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (r) => {
    setBusy(true);
    try {
      await api(`/lista-reglas/${r.id}`, { method: 'DELETE' });
      if (editando === r.id) { setEditando(null); setForm(VACIA); }
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const campo = campos.find((c) => c.id === form.campo);

  return (
    <Modal
      size="xl"
      title="Reglas y avisos"
      sub="Cuando un registro cumpla la condición, se manda un correo al destinatario."
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}

      <div className="col" style={{ gap: 7 }}>
        {cargando ? <p className="muted">Cargando reglas...</p> : reglas.length === 0 ? (
          <p className="muted">No hay reglas. Creá la primera abajo.</p>
        ) : reglas.map((r) => {
          const c = campos.find((x) => x.id === r.campo);
          return (
            <div className="lista-campo-row" key={r.id}>
              <div className="grow">
                <b>{r.nombre}</b>
                <span className={`badge ${r.activo ? 'green' : 'gray'}`} style={{ marginLeft: 6 }}>{r.activo ? 'Activa' : 'Apagada'}</span>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {r.evento} · {c?.nombre || 'campo'} {r.op} {r.valor || ''} · {r.accion === 'whatsapp' ? `WhatsApp a ${campos.find((x) => x.id === r.campo_destino)?.nombre || 'teléfono'}` : `email a ${r.destinatario}`}
                </div>
              </div>
              <button type="button" className="btn sm" onClick={() => editar(r)}><Icon name="gear" size={12} /> Editar</button>
              <button type="button" className="btn sm danger" onClick={() => borrar(r)} disabled={busy}><Icon name="x" size={12} /> Borrar</button>
            </div>
          );
        })}
      </div>

      <form onSubmit={guardar} style={{ marginTop: 18 }}>
        <div className="fsec-head">
          <h4>{editando ? 'Editar regla' : 'Nueva regla'}</h4>
          <p>El aviso se manda después de guardar un registro que cumpla la condición.</p>
        </div>
        <FormGrid cols={2}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej.: Avisar cuando entra un pedido" />
          </div>
          <div className="field">
            <label>Cuándo</label>
            <select className="input" value={form.evento} onChange={(e) => set('evento', e.target.value)}>
              <option value="ambos">Al crear o editar</option>
              <option value="crear">Solo al crear</option>
              <option value="editar">Solo al editar</option>
            </select>
          </div>
          <div className="field">
            <label>Acción</label>
            <select className="input" value={form.accion} onChange={(e) => set('accion', e.target.value)}>
              <option value="email">Enviar email</option>
              <option value="whatsapp">Enviar WhatsApp</option>
            </select>
          </div>
          <div className="field">
            <label>Campo *</label>
            <select className="input" value={form.campo} onChange={(e) => set('campo', e.target.value)}>
              <option value="">Elegir campo...</option>
              {campos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({etiquetaTipo(c.tipo)})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Condición</label>
            <div className="row" style={{ gap: 6 }}>
              <select className="input" value={form.op} onChange={(e) => set('op', e.target.value)}>
                {OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
              </select>
              {form.op !== 'vacio' && <input className="input" value={form.valor} onChange={(e) => set('valor', e.target.value)} placeholder="Valor" />}
            </div>
          </div>
          {form.accion === 'whatsapp' ? (
            <>
              <div className="field">
                <label>Campo de teléfono *</label>
                <select className="input" value={form.campo_destino} onChange={(e) => set('campo_destino', e.target.value)}>
                  <option value="">Elegir campo...</option>
                  {campos.filter((c) => c.tipo === 'telefono').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Mensaje de WhatsApp</label>
                <textarea className="input" rows={2} value={form.mensaje} onChange={(e) => set('mensaje', e.target.value)} placeholder="Hola, te escribimos desde Bertika..." />
                <small className="ayuda">Si queda vacío se manda un resumen de la regla.</small>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>Avisar a (email) *</label>
                <input className="input" type="email" value={form.destinatario} onChange={(e) => set('destinatario', e.target.value)} placeholder="equipo@bertika.com" />
              </div>
              <div className="field">
                <label>Asunto</label>
                <input className="input" value={form.asunto} onChange={(e) => set('asunto', e.target.value)} placeholder="Bertika · aviso de la lista" />
              </div>
            </>
          )}
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
              <span>Regla activa</span>
            </label>
            {campo && <small className="ayuda">Se evalúa sobre “{campo.nombre}”.</small>}
          </div>
        </FormGrid>
        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <button type="submit" className="btn primary sm" disabled={busy}>
            <Icon name="check" size={13} /> {busy ? 'Guardando...' : editando ? 'Guardar regla' : 'Crear regla'}
          </button>
          {editando && <button type="button" className="btn sm" onClick={() => { setEditando(null); setForm(VACIA); }}>Cancelar edición</button>}
        </div>
      </form>
    </Modal>
  );
}
