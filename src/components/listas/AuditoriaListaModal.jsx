import { useEffect, useState } from 'react';
import { Icon, Modal, fmtFecha } from '../ui';
import { api } from '../../store/api';
import { valorVisible } from '../../data/listas';

const ETIQUETA = {
  crear: 'Creó un registro',
  editar: 'Editó un registro',
  archivar: 'Archivó un registro',
  restaurar: 'Restauró un registro',
  restaurar_version: 'Restauró una versión',
  crear_formulario: 'Creó un registro desde formulario',
};
const TABLA = {
  listas: 'Lista',
  lista_campos: 'Campo',
  lista_vistas: 'Vista',
  lista_reglas: 'Regla',
  lista_formularios: 'Formulario',
};
const ACCION_ESTRUCTURA = {
  crear: 'creó',
  editar: 'editó',
  archivar: 'archivó',
  restaurar: 'restauró',
  borrar: 'borró',
  duplicar: 'duplicó',
  adjuntar: 'adjuntó',
  guardar: 'guardó',
};

export default function AuditoriaListaModal({ lista, onClose }) {
  const [tab, setTab] = useState('registros');
  const [filas, setFilas] = useState([]);
  const [estructura, setEstructura] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    Promise.all([
      api(`/listas/${lista.id}/auditoria`),
      api(`/listas/${lista.id}/auditoria-estructura`),
    ])
      .then(([r, e]) => {
        if (!vivo) return;
        setFilas(Array.isArray(r) ? r : []);
        setEstructura(Array.isArray(e) ? e : []);
      })
      .catch((err) => { if (vivo) setError(err.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [lista.id]);

  const cambiosDe = (f) => {
    const antes = f.antes && typeof f.antes === 'object' && !Array.isArray(f.antes) ? (f.antes.datos || f.antes) : null;
    const despues = f.despues && typeof f.despues === 'object' && !Array.isArray(f.despues) ? (f.despues.datos || f.despues) : null;
    if (!antes || !despues) return '';
    return (lista.campos || [])
      .filter((c) => JSON.stringify(antes[c.id]) !== JSON.stringify(despues[c.id]))
      .slice(0, 3)
      .map((c) => `${c.nombre}: ${valorVisible(c, antes[c.id]) || '—'} → ${valorVisible(c, despues[c.id]) || '—'}`)
      .join(' · ');
  };

  return (
    <Modal
      size="lg"
      title="Actividad de la lista"
      sub={`${lista.nombre} · registros y estructura`}
      onClose={onClose}
      footer={<button type="button" className="btn izq" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="banner-red" style={{ marginBottom: 12 }}><div><Icon name="x" size={15} /> {error}</div></div>}
      <div className="tabs mb16" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'registros'} className={`tab${tab === 'registros' ? ' active' : ''}`} onClick={() => setTab('registros')}>
          Registros ({filas.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'estructura'} className={`tab${tab === 'estructura' ? ' active' : ''}`} onClick={() => setTab('estructura')}>
          Lista y campos ({estructura.length})
        </button>
      </div>

      {cargando ? <p className="muted">Cargando actividad...</p> : tab === 'registros' ? (
        filas.length === 0 ? (
          <div className="empty"><Icon name="clock" size={26} /><b>Todavía no hay movimientos</b></div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {filas.map((f) => (
              <div className="lista-audit-row" key={f.id}>
                <span className="lista-audit-ico"><Icon name={f.accion === 'archivar' ? 'x' : f.accion === 'restaurar' ? 'refresh' : 'check'} size={13} /></span>
                <div className="grow">
                  <b>{ETIQUETA[f.accion] || f.accion}</b>
                  <div className="muted" style={{ fontSize: 11.5 }}>{f.actor || 'sistema'} · {fmtFecha(f.fecha)}</div>
                  {cambiosDe(f) && <small className="muted">{cambiosDe(f)}</small>}
                </div>
              </div>
            ))}
          </div>
        )
      ) : estructura.length === 0 ? (
        <div className="empty"><Icon name="clipboard" size={26} /><b>Sin cambios de estructura</b></div>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          {estructura.map((f) => (
            <div className="lista-audit-row" key={f.id}>
              <span className="lista-audit-ico"><Icon name="gear" size={13} /></span>
              <div className="grow">
                <b>{TABLA[f.tabla] || f.tabla}: {ACCION_ESTRUCTURA[f.accion] || f.accion}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>{f.actor || 'sistema'} · {fmtFecha(f.fecha)}</div>
                {f.detalle && <small className="muted">{f.detalle}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
