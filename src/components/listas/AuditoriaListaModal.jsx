import { useEffect, useState } from 'react';
import { Icon, Modal, fmtFecha } from '../ui';
import { api } from '../../store/api';

const ETIQUETA = {
  crear: 'Creó un registro',
  editar: 'Editó un registro',
  archivar: 'Archivó un registro',
  restaurar: 'Restauró un registro',
  restaurar_version: 'Restauró una versión',
  crear_formulario: 'Creó un registro desde formulario',
};

export default function AuditoriaListaModal({ lista, onClose }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    api(`/listas/${lista.id}/auditoria`)
      .then((r) => { if (vivo) setFilas(Array.isArray(r) ? r : []); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [lista.id]);

  return (
    <Modal
      size="lg"
      title="Actividad de la lista"
      sub={`${lista.nombre} · últimos 100 movimientos`}
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      {cargando ? <p className="muted">Cargando actividad...</p> : filas.length === 0 ? (
        <div className="empty"><Icon name="clock" size={26} /><b>Todavía no hay movimientos</b></div>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          {filas.map((f) => (
            <div className="lista-audit-row" key={f.id}>
              <span className="lista-audit-ico"><Icon name={f.accion === 'archivar' ? 'x' : f.accion === 'restaurar' ? 'refresh' : 'check'} size={13} /></span>
              <div className="grow">
                <b>{ETIQUETA[f.accion] || f.accion}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {f.actor || 'sistema'} · {fmtFecha(f.fecha)}
                  {f.campos ? ` · ${f.campos}` : ''}
                </div>
                {f.detalle && <small className="muted">{f.detalle}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
