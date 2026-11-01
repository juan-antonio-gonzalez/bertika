import { useEffect, useState } from 'react';
import { Icon, Modal, fmtFecha } from '../ui';
import { api } from '../../store/api';

export default function ComentariosModal({ lista, registro, onClose }) {
  const [comentarios, setComentarios] = useState([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      setComentarios(await api(`/listas/${lista.id}/registros/${registro.id}/comentarios`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setBusy(true);
    try {
      const nuevo = await api(`/listas/${lista.id}/registros/${registro.id}/comentarios`, {
        method: 'POST',
        body: { texto: texto.trim() },
      });
      setComentarios((prev) => [...prev, nuevo]);
      setTexto('');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const renderTexto = (textoComentario) => String(textoComentario || '').split(/(@[^\s@]+@[^\s@]+\.[^\s@]+)/g).map((parte, i) => (
    parte.startsWith('@') && parte.includes('@', 1)
      ? <b className="lista-mencion" key={i}>{parte}</b>
      : <span key={i}>{parte}</span>
  ));

  return (
    <Modal
      size="lg"
      title="Comentarios"
      sub={`${lista.nombre} · ${registro.id}`}
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando comentarios...</p> : (
        <div className="col" style={{ gap: 8 }}>
          {comentarios.length === 0 && <p className="muted">Todavía no hay comentarios. Podés mencionar a alguien con @email.</p>}
          {comentarios.map((c) => (
            <div className="lista-comentario" key={c.id}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <b>{c.autor || 'Usuario'}</b>
                <span className="muted" style={{ fontSize: 11 }}>{fmtFecha(c.creado_en)}</span>
              </div>
              <p>{renderTexto(c.texto)}</p>
              {Array.isArray(c.menciones) && c.menciones.length > 0 && (
                <small className="muted">Mencionó a {c.menciones.join(', ')}</small>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={enviar} style={{ marginTop: 14 }}>
        <div className="field">
          <label>Nuevo comentario</label>
          <textarea
            className="input"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí un comentario. Para mencionar a alguien, usá @email@dominio.com"
            disabled={busy}
          />
          <small className="ayuda">Las menciones con @email reciben un aviso por correo.</small>
        </div>
        <button type="submit" className="btn primary sm" disabled={busy || !texto.trim()}>
          <Icon name="mail" size={13} /> {busy ? 'Enviando...' : 'Comentar'}
        </button>
      </form>
    </Modal>
  );
}
