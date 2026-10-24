import { useEffect, useState } from 'react';
import { api } from '../store/api';
import { Icon, Modal } from './ui';

const fmtF = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Constancia de una aceptación. La usan el panel de privacidad, la ficha del
// cliente y el detalle de la orden. Solo se muestra a quien tiene permiso
// "sistema": el endpoint también lo exige.
export default function ConstanciaModal({ id, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    api(`/privacidad/consentimientos/${id}`)
      .then((d) => { if (vivo) setDetalle(d); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [id]);

  const descargar = () => {
    if (!detalle) return;
    const blob = new Blob([JSON.stringify(detalle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `constancia-${detalle.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      size="lg"
      title="Constancia de aceptación"
      sub={id}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
          <button type="button" className="btn primary" onClick={descargar} disabled={!detalle}>
            <Icon name="truck" size={13} /> Descargar constancia
          </button>
        </>
      )}
    >
      {error && <div className="alerta">{error}</div>}
      {!detalle && !error && <p className="muted">Cargando constancia…</p>}
      {detalle && (
        <>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 14 }}>
            {detalle.integro
              ? <span className="badge green">Registro íntegro</span>
              : <span className="badge red">Registro alterado o incompleto</span>}
            {detalle.anonimizado_en && <span className="badge gray">Anonimizado</span>}
            <span className="muted" style={{ fontSize: 12 }}>
              {detalle.integro_legal ? 'Hash legal OK' : 'Hash legal con diferencias'} ·{' '}
              {detalle.integro_completo ? 'Hash completo OK' : 'Hash completo con diferencias'}
            </span>
          </div>

          <dl className="privacidad-detalle">
            <dt>Fecha</dt><dd>{fmtF(detalle.creado_en)}</dd>
            <dt>Tipo</dt><dd>{detalle.tipo}</dd>
            <dt>Nombre</dt><dd>{detalle.anonimizado_en ? 'anonimizado' : (detalle.nombre || '—')}</dd>
            <dt>Email</dt><dd>{detalle.anonimizado_en ? 'anonimizado' : (detalle.email || '—')}</dd>
            <dt>IP</dt><dd className="mono">{detalle.anonimizado_en ? 'anonimizada' : (detalle.ip || '—')}</dd>
            <dt>Navegador</dt><dd style={{ fontSize: 12 }}>{detalle.anonimizado_en ? 'anonimizado' : (detalle.user_agent || '—')}</dd>
            <dt>Origen / página</dt><dd>{detalle.origen || '—'} · {detalle.pagina || '—'}</dd>
            <dt>Canal / acción</dt><dd>{detalle.canal || '—'} · {detalle.accion || '—'}</dd>
            <dt>Motivo</dt><dd>{detalle.motivo || '—'}</dd>
            <dt>Cookies</dt><dd>
              Necesarias: {detalle.cookies_necesarias ? 'sí' : 'no'} · Medición: {detalle.cookies_analiticas ? 'sí' : 'no'} · Marketing: {detalle.cookies_marketing ? 'sí' : 'no'}
              {detalle.cookies_version ? ` · versión ${detalle.cookies_version}` : ''}
            </dd>
            <dt>Idempotencia</dt><dd className="mono" style={{ fontSize: 11 }}>{detalle.idempotency_key || '—'}</dd>
          </dl>

          <h3 className="privacidad-detalle-titulo">Documentos aceptados</h3>
          <div className="privacidad-docs">
            {detalle.terminos_version ? (
              <div>
                <b>Términos v{detalle.terminos_version}</b>
                {detalle.terminos_url && <a href={detalle.terminos_url} target="_blank" rel="noreferrer">Ver texto exacto</a>}
                <code className="privacidad-hash">{detalle.terminos_hash}</code>
              </div>
            ) : <p className="muted">No aplica (no es un formulario).</p>}
            {detalle.privacidad_version ? (
              <div>
                <b>Privacidad v{detalle.privacidad_version}</b>
                {detalle.privacidad_url && <a href={detalle.privacidad_url} target="_blank" rel="noreferrer">Ver texto exacto</a>}
                <code className="privacidad-hash">{detalle.privacidad_hash}</code>
              </div>
            ) : null}
          </div>

          <h3 className="privacidad-detalle-titulo">Huellas de integridad</h3>
          <p className="muted" style={{ fontSize: 12 }}>Hash completo (incluye identidad):</p>
          <code className="privacidad-hash">{detalle.hash}</code>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Hash legal (verificable tras anonimizar):</p>
          <code className="privacidad-hash">{detalle.hash_legal || '—'}</code>
        </>
      )}
    </Modal>
  );
}
