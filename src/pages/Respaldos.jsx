import { useCallback, useEffect, useState } from 'react';
import { api, apiDescargar } from '../store/api';
import { useStore } from '../store/store';
import { Icon } from '../components/ui';

// Respaldos: el respaldo NO es programado. El administrador aprieta el boton
// cuando quiere, la base se respalda en el servidor y la copia baja al navegador.
// Lo unico que corre solo es la copia de seguridad diaria del propio servidor.

const fmtBytes = (b) => {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const fmtF = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const hace = (iso) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const dias = Math.round(hs / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
};

export default function Respaldos() {
  const toastShow = useStore((s) => s.toastShow);
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [respaldando, setRespaldando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setEstado(await api('/respaldos'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Boton principal: respalda AHORA y baja la copia al navegador.
  const respaldarAhora = async () => {
    setRespaldando(true);
    setAviso(null);
    try {
      const r = await api('/respaldos', { method: 'POST' });
      let bajado = 0;
      try {
        bajado = await apiDescargar(`/respaldos/${r.archivo}`, r.archivo);
      } catch (e) {
        // El respaldo ya quedo hecho: si solo falla la bajada, se avisa y la
        // copia se puede bajar despues desde la lista de abajo.
        toastShow(`Respaldo hecho (${r.archivo}), pero no se pudo bajar: ${e.message}`, 'warn');
      }
      setAviso({ ok: true, archivo: r.archivo, bytes: bajado || r.bytes, fotos: r.fotos, fecha: r.cuando });
      if (bajado) toastShow(`Respaldo hecho y descargado: ${r.archivo}`, 'ok');
      await cargar();
    } catch (e) {
      setAviso({ ok: false, error: e.message });
      toastShow(e.message, 'error');
    } finally {
      setRespaldando(false);
    }
  };

  const bajar = async (nombre) => {
    try {
      await apiDescargar(`/respaldos/${nombre}`, nombre);
      toastShow(`Descargado: ${nombre}`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const archivos = estado?.archivos || [];
  const bases = archivos.filter((a) => a.tipo === 'base');
  const ultima = estado?.base || bases[0] || null;

  return (
    <div className="wrap page">
      <div className="mb24">
        <h1 className="page-title">Respaldos</h1>
        <p className="page-sub">
          La copia de la base y de las fotos se hace cuando vos apretás el botón. No hay respaldo programado.
        </p>
      </div>

      <div className="card">
        <h3 className="card-title"><Icon name="shield" size={15} /> Respaldar ahora</h3>
        <p className="card-sub mb16">
          Hace una copia completa de la base, revisa que traiga las tablas del taller y la baja a tu equipo
          (queda en la carpeta de Descargas). Las fotos de los diagnósticos van en un archivo aparte.
        </p>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary lg" onClick={respaldarAhora} disabled={respaldando || estado?.corriendo}>
            {respaldando
              ? <><Icon name="clock" size={15} /> Respaldando...</>
              : <><Icon name="refresh" size={15} /> Respaldar ahora</>}
          </button>
          <button className="btn sm" onClick={cargar} disabled={cargando || respaldando}>
            <Icon name="refresh" size={13} /> Refrescar lista
          </button>
          {ultima && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              Último respaldo: {fmtF(ultima.fecha)} ({hace(ultima.fecha)}) · {fmtBytes(ultima.bytes)}
            </span>
          )}
        </div>

        {respaldando && (
          <p className="muted mt8" style={{ fontSize: 12.5 }}>
            Puede tardar unos segundos. No cierres esta pantalla hasta que termine.
          </p>
        )}

        {aviso?.ok && (
          <div className="badge green mt8" style={{ marginTop: 14, padding: '8px 12px', textTransform: 'none', letterSpacing: 0 }}>
            <Icon name="check" size={13} /> Respaldo listo: {aviso.archivo} · {fmtBytes(aviso.bytes)}
            {aviso.fotos ? ` · fotos: ${aviso.fotos}` : ' · sin fotos para copiar'}
          </div>
        )}
        {aviso && !aviso.ok && (
          <div className="alerta" style={{ marginTop: 14 }}>
            No se pudo respaldar: {aviso.error}
          </div>
        )}
        {error && <div className="alerta" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      <div className="card pad0" style={{ marginTop: 12 }}>
        <div className="row" style={{ padding: '14px 16px 10px', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h3 className="card-title" style={{ margin: 0 }}><Icon name="clipboard" size={15} /> Copias guardadas en el servidor</h3>
          <span className="muted grow" style={{ fontSize: 12.5 }}>
            Se conservan {estado?.retencionDias || 14} días · carpeta {estado?.carpeta || '/var/backups/bertika'}
          </span>
        </div>
        <div style={{ padding: '0 8px 8px', overflowX: 'auto' }}>
          {cargando ? (
            <p className="muted" style={{ padding: 16 }}>Cargando...</p>
          ) : archivos.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>Todavía no hay respaldos guardados. Apretá «Respaldar ahora».</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Qué es</th>
                  <th className="num">Tamaño</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {archivos.map((a) => (
                  <tr key={a.nombre}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{a.nombre}</td>
                    <td>
                      <span className={`badge ${a.tipo === 'base' ? 'blue' : 'gray'}`}>
                        {a.tipo === 'base' ? 'Base de datos' : 'Fotos'}
                      </span>
                    </td>
                    <td className="num">{fmtBytes(a.bytes)}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{fmtF(a.fecha)} <span className="muted">({hace(a.fecha)})</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => bajar(a.nombre)}>
                        <Icon name="truck" size={13} /> Descargar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        Para no depender de un solo lugar, bajá la copia de vez en cuando y guardala en tu equipo o en la nube.
        Mientras tanto, el servidor sigue dejando su propia copia de seguridad a las 03:17 por si algún día te olvidás.
      </p>
    </div>
  );
}
