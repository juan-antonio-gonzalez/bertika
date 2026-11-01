import { useEffect, useState } from 'react';
import { Icon, Modal, fmtFecha } from '../ui';
import { api } from '../../store/api';

export default function AprobacionesModal({ lista, registro, puedeSolicitar, puedeAprobar, onClose }) {
  const [filas, setFilas] = useState([]);
  const [comentario, setComentario] = useState('');
  const [decision, setDecision] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      setFilas(await api(`/listas/${lista.id}/registros/${registro.id}/aprobaciones`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pendiente = filas.find((f) => f.estado === 'pendiente');

  const solicitar = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/listas/${lista.id}/registros/${registro.id}/aprobaciones`, { method: 'POST', body: { comentario: comentario.trim() } });
      setComentario('');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decidir = async (estado) => {
    if (!pendiente) return;
    setBusy(true);
    try {
      await api(`/lista-aprobaciones/${pendiente.id}`, { method: 'PATCH', body: { estado, comentario: decision.trim() } });
      setDecision('');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Aprobaciones"
      sub={`${lista.nombre} · ${registro.id}`}
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando aprobaciones...</p> : (
        <div className="col" style={{ gap: 8 }}>
          {filas.length === 0 && <p className="muted">Este registro no tiene solicitudes de aprobación.</p>}
          {filas.map((f) => (
            <div className={`lista-aprobacion ${f.estado}`} key={f.id}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <b>Solicitud de {f.solicitado_por || 'usuario'}</b>
                  <span className={`badge ${f.estado === 'aprobado' ? 'green' : f.estado === 'rechazado' ? 'red' : 'amber'}`} style={{ marginLeft: 6 }}>{f.estado}</span>
                </div>
                <span className="muted" style={{ fontSize: 11 }}>{fmtFecha(f.creado_en)}</span>
              </div>
              {f.comentario && <p>{f.comentario}</p>}
              {f.aprobador && <small className="muted">Aprobador: {f.aprobador}{f.fecha_limite ? ` · vence ${fmtFecha(f.fecha_limite)}` : ''}</small>}
              {f.decidido_por && <small className="muted">Decidió {f.decidido_por} · {f.decidido_en ? fmtFecha(f.decidido_en) : ''}</small>}
            </div>
          ))}

          {puedeAprobar && pendiente && (
            <div className="lista-aprobacion pendiente">
              <b>Decidir solicitud pendiente</b>
              <textarea className="input" rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Comentario de la decisión (opcional)" />
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <button type="button" className="btn primary sm" onClick={() => decidir('aprobado')} disabled={busy}>
                  <Icon name="check" size={13} /> Aprobar
                </button>
                <button type="button" className="btn danger sm" onClick={() => decidir('rechazado')} disabled={busy}>
                  <Icon name="x" size={13} /> Rechazar
                </button>
              </div>
            </div>
          )}

          {puedeSolicitar && !pendiente && (
            <form onSubmit={solicitar} className="lista-aprobacion">
              <b>Solicitar aprobación</b>
              <textarea className="input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Explicá qué hay que aprobar (opcional)" />
              <button type="submit" className="btn primary sm" style={{ marginTop: 6, alignSelf: 'flex-start' }} disabled={busy}>
                <Icon name="check" size={13} /> Enviar solicitud
              </button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
