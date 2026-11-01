import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { api } from '../../store/api';
import { etiquetaTipo } from '../../data/listas';

export default function FormularioPublicoModal({ lista, onClose }) {
  const [campos, setCampos] = useState([]);
  const [form, setForm] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [titulo, setTitulo] = useState(`Formulario de ${lista.nombre}`);
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    let vivo = true;
    api(`/listas/${lista.id}/formulario`)
      .then((r) => {
        if (!vivo) return;
        setCampos(r.campos || []);
        if (r.formulario) {
          setForm(r.formulario);
          setSeleccion(Array.isArray(r.formulario.campos) ? r.formulario.campos : []);
          setTitulo(r.formulario.titulo || `Formulario de ${lista.nombre}`);
          setDescripcion(r.formulario.descripcion || '');
          setActivo(r.formulario.activo !== false);
          setUrl(r.formulario.url || '');
        } else {
          setSeleccion((r.campos || []).map((c) => c.id));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [lista.id, lista.nombre]);

  const toggle = (id) => setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!seleccion.length) return setError('Elegí al menos un campo.');
    setBusy(true);
    try {
      const r = await api(`/listas/${lista.id}/formulario`, {
        method: 'PUT',
        body: { titulo, descripcion, campos: seleccion, activo },
      });
      setForm(r);
      setUrl(r.url);
      setCopiado(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setError('No se pudo copiar el enlace. Copialo manualmente.');
    }
  };

  return (
    <Modal
      size="lg"
      title="Formulario público"
      sub="Cualquiera con el enlace puede enviar una respuesta, sin cuenta."
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando formulario...</p> : (
        <form onSubmit={guardar} className="col" style={{ gap: 12 }}>
          <div className="banner-info">
            <Icon name="info" size={15} />
            <span>No se publican campos de relación, adjuntos ni cálculos. Los datos se validan igual que en el panel.</span>
          </div>
          <FormGrid cols={2}>
            <div className="field">
              <label>Título</label>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="field">
              <label>Descripción</label>
              <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Dejanos tus datos y te contactamos" />
            </div>
          </FormGrid>
          <div className="field">
            <label>Campos publicados ({seleccion.length})</label>
            <div className="lista-form-publica-campos">
              {campos.map((c) => (
                <label key={c.id} className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  <input type="checkbox" checked={seleccion.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span>{c.nombre} <small className="muted">({etiquetaTipo(c.tipo)})</small></span>
                </label>
              ))}
              {campos.length === 0 && <p className="muted">No hay campos públicos disponibles. Agregá campos de texto, número, fecha, selección o email.</p>}
            </div>
          </div>
          <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <span>Formulario activo</span>
          </label>
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="btn primary sm" disabled={busy || !seleccion.length}>
              <Icon name="check" size={13} /> {busy ? 'Guardando...' : 'Guardar formulario'}
            </button>
            {form && (
              <button
                type="button"
                className="btn sm danger"
                onClick={async () => {
                  if (!window.confirm('¿Borrar el formulario público? El enlace dejará de funcionar.')) return;
                  try {
                    await api(`/listas/${lista.id}/formulario`, { method: 'DELETE' });
                    setForm(null); setUrl('');
                  } catch (err) { setError(err.message); }
                }}
              >
                <Icon name="x" size={13} /> Borrar formulario
              </button>
            )}
          </div>
          {url && (
            <div className="form-publico-link">
              <small className="muted">Enlace público</small>
              <div className="row" style={{ gap: 6 }}>
                <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn sm" onClick={copiar}>
                  <Icon name="link" size={13} /> {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
