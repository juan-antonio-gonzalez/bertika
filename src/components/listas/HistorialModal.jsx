import { useEffect, useState } from 'react';
import { Icon, Modal, fmtFecha } from '../ui';
import { api } from '../../store/api';
import { valorVisible } from '../../data/listas';

export default function HistorialModal({ lista, registro, campos, puedeEditar, onRestaurada, onClose }) {
  const [versiones, setVersiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visibles = (campos || []).filter((c) => c.tipo !== 'calculado').slice(0, 6);

  const cargar = async () => {
    setCargando(true);
    try {
      setVersiones(await api(`/listas/${lista.id}/registros/${registro.id}/historial`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const restaurar = async (version) => {
    setBusy(true);
    try {
      await api(`/lista-registros/${registro.id}/historial/${version.id}/restaurar`, { method: 'PATCH' });
      await cargar();
      onRestaurada?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Historial de versiones"
      sub={`${lista.nombre} · ${registro.id}`}
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando historial...</p> : versiones.length === 0 ? (
        <p className="muted">Todavía no hay versiones guardadas de este registro.</p>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {versiones.map((v, i) => (
            <div className="lista-version" key={v.id}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <b>{i === 0 ? 'Versión actual' : `Versión ${versiones.length - i}`}</b>
                  <span className="badge gray" style={{ marginLeft: 6 }}>{v.accion || 'editar'}</span>
                </div>
                <span className="muted" style={{ fontSize: 11 }}>{fmtFecha(v.creado_en)} · {v.usuario || 'sistema'}</span>
              </div>
              <div className="lista-version-datos">
                {visibles.map((c) => (
                  <span key={c.id}><small>{c.nombre}</small>{valorVisible(c, v.datos?.[c.id]) || '—'}</span>
                ))}
              </div>
              {puedeEditar && i !== 0 && (
                <button type="button" className="btn sm" onClick={() => restaurar(v)} disabled={busy}>
                  <Icon name="refresh" size={12} /> Restaurar esta versión
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
