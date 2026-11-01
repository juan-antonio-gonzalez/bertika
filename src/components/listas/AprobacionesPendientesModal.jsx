import { useEffect, useState } from 'react';
import { Icon, Modal, fmtFecha } from '../ui';
import { api } from '../../store/api';

export default function AprobacionesPendientesModal({ area, onClose }) {
  const [filas, setFilas] = useState([]);
  const [comentario, setComentario] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await api(`/listas/aprobaciones/pendientes?area_id=${encodeURIComponent(area.id)}`);
      setFilas(r.aprobaciones || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decidir = async (id, estado) => {
    setBusy(true);
    try {
      await api(`/lista-aprobaciones/${id}`, { method: 'PATCH', body: { estado, comentario: comentario.trim() } });
      setFilas((prev) => prev.filter((f) => f.id !== id));
      setComentario('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Aprobaciones pendientes"
      sub={`${area.nombre} · resolvé las solicitudes sin abrir cada registro`}
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando aprobaciones...</p> : filas.length === 0 ? (
        <div className="empty"><Icon name="check" size={26} /><b>No hay aprobaciones pendientes</b><p className="muted">Todo al día en {area.nombre}.</p></div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          <div className="field">
            <label>Comentario para la decisión (opcional)</label>
            <textarea className="input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej.: Revisado con el equipo" />
          </div>
          {filas.map((f) => (
            <div className="lista-aprobacion pendiente" key={f.id}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <b>{f.titulo}</b>
                  <span className="badge amber" style={{ marginLeft: 6 }}>Pendiente</span>
                  <div className="muted" style={{ fontSize: 11.5 }}>{f.lista_nombre} · solicitó {f.solicitado_por} · {fmtFecha(f.creado_en)}</div>
                </div>
              </div>
              {f.comentario && <p>{f.comentario}</p>}
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn primary sm" onClick={() => decidir(f.id, 'aprobado')} disabled={busy}>
                  <Icon name="check" size={13} /> Aprobar
                </button>
                <button type="button" className="btn danger sm" onClick={() => decidir(f.id, 'rechazado')} disabled={busy}>
                  <Icon name="x" size={13} /> Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
