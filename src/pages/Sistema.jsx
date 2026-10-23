// Bertika - Salud del sistema, cola de envíos de WhatsApp y auditoría.
//
// Tres pantallas en una (Sistema → Salud y auditoría):
//   1. Estado: si la base responde, cómo viene la cola, el último respaldo.
//   2. Envíos: qué mensajes esperan, cuáles fallaron y reintentarlos.
//   3. Auditoría: quién cambió qué, con el antes y el después.
//   4. Privacidad: consentimientos, versiones legales, exportación y anonimización.
//
// Solo la ve quien tenga el permiso "sistema" (por plantilla, el admin).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiDescargar } from '../store/api';
import { useStore } from '../store/store';
import { Icon, Modal, ConfirmDialog } from '../components/ui';

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
const duracion = (seg) => {
  const s = Number(seg) || 0;
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
};
const bytes = (n) => {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(2)} MB`;
};

const ESTADO_ENVIO = {
  pendiente: ['En cola', 'amber'],
  enviando: ['Enviando', 'blue'],
  enviado: ['Enviado', 'green'],
  fallido: ['Falló', 'red'],
  incierto: ['Sin confirmar', 'amber'],
};

const TIPO_ENVIO = { texto: 'Texto', plantilla: 'Plantilla', imagen: 'Foto', documento: 'Documento' };

function Kpi({ label, valor, sub, tono }) {
  return (
    <div className={`kpi${tono ? ` ${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{valor}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function Estado({ salud, cargando, error, actualizar }) {
  if (error) return <div className="alerta">{error}</div>;
  if (cargando && !salud) return <p className="muted">Consultando el estado del servidor...</p>;
  if (!salud) return null;
  const db = salud.db || {};
  const out = salud.outbox || {};
  const wa = salud.whatsapp || {};
  const respaldo = salud.respaldo;
  const respaldoTono = !respaldo ? 'amber' : respaldo.horas > 36 ? 'red' : 'green';
  return (
    <div className="col">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="badge" style={{ textTransform: 'none', letterSpacing: 0, padding: '8px 12px' }}>
          {salud.ok
            ? <><Icon name="check" size={13} /> El servidor y la base responden</>
            : <><Icon name="warn" size={13} /> Hay un problema: revisá las alertas</>}
        </div>
        <button className="btn sm" onClick={actualizar} disabled={cargando}>
          <Icon name="refresh" size={13} /> {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="grid4">
        <Kpi
          label="Base de datos"
          valor={db.ok ? `${db.ms} ms` : 'sin respuesta'}
          sub={db.ok ? 'consulta de prueba OK' : (db.error || 'error')}
          tono={db.ok ? 'green' : 'danger'}
        />
        <Kpi
          label="Cola de WhatsApp"
          valor={`${out.pendientes || 0} en cola`}
          sub={`${out.fallidos || 0} fallidos · ${out.inciertos || 0} sin confirmar`}
          tono={out.fallidos ? 'danger' : (out.pendientes ? 'alert' : 'green')}
        />
        <Kpi
          label="Último respaldo"
          valor={respaldo ? `${respaldo.horas} h` : 'sin dato'}
          sub={respaldo ? `${respaldo.nombre} · ${bytes(respaldo.bytes)}` : 'no se encontró la carpeta de respaldos'}
          tono={respaldoTono}
        />
        <Kpi
          label="Servidor"
          valor={`${salud.memoriaMB} MB`}
          sub={`${duracion(salud.uptimeSeg)} encendido · Node ${salud.node}`}
        />
      </div>

      <div className="card">
        <h3 className="card-title"><Icon name="mail" size={15} /> Canal de WhatsApp</h3>
        {wa.configurado ? (
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Configurado con el número <b>{wa.numeroIdCorto}</b> (API {wa.version}).
            {wa.wabaId ? ` WABA ${wa.wabaId}.` : ''}
          </p>
        ) : (
          <div className="alerta">
            WhatsApp no está configurado: faltan {wa.falta?.join(', ') || 'las claves'}. Los envíos quedan fallidos
            (no se pierden) y se pueden reintentar cuando esté configurado.
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title"><Icon name="shield" size={15} /> Alertas automáticas</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          El servidor revisa cada 5 minutos la base, la cola, el respaldo y los errores 500.
          {' '}
          {salud.alertas?.email
            ? <>Avisa por email a <b>{salud.alertas.destinoEmail}</b>.</>
            : <>No hay email configurado (<span className="mono">ALERTAS_EMAIL</span> / SMTP): las alertas quedan en el log.</>}
          {' '}
          {salud.alertas?.webhook ? 'También manda un webhook.' : ''}
          {' '}
          {salud.alertas?.ultimaRacha5xx ? `Errores 500 en los últimos 10 min: ${salud.alertas.ultimaRacha5xx}.` : ''}
        </p>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        Versión {salud.version} · consultado {fmtF(salud.hora)}. El monitor público es <span className="mono">/api/health</span>
        {' '}(devuelve 503 si la base no responde).
      </p>
    </div>
  );
}

function Envios() {
  const toastShow = useStore((s) => s.toastShow);
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [estado, setEstado] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams();
      if (estado) p.set('estado', estado);
      const r = await api(`/whatsapp/envios?${p}`);
      setFilas(r.filas || []);
      setResumen(r.resumen || null);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [estado]);

  useEffect(() => { cargar(); }, [cargar]);

  const procesar = async () => {
    setProcesando(true);
    try {
      const r = await api('/whatsapp/envios/procesar', { method: 'POST' });
      toastShow(`Cola procesada: ${r.procesados || 0} · enviados ${r.enviados || 0}`, 'ok');
      await cargar();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setProcesando(false);
    }
  };

  const reintentar = async (fila) => {
    try {
      const r = await api(`/whatsapp/envios/${fila.id}/reintentar`, { method: 'POST' });
      if (r.estado === 'pendiente') toastShow('Se reintenta solo en unos minutos', 'warn');
      else toastShow('Reintento hecho', 'ok');
      await cargar();
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const chips = [
    ['', 'Todos'],
    ['pendiente', 'En cola'],
    ['fallido', 'Fallidos'],
    ['incierto', 'Sin confirmar'],
    ['enviado', 'Enviados'],
  ];

  return (
    <div className="col">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          {chips.map(([k, label]) => (
            <button key={k} className={`chip${estado === k ? ' on' : ''}`} onClick={() => setEstado(k)}>{label}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" size={13} /> Refrescar
          </button>
          <button className="btn sm primary" onClick={procesar} disabled={procesando}>
            <Icon name="bolt" size={13} /> {procesando ? 'Procesando...' : 'Procesar cola'}
          </button>
        </div>
      </div>

      {resumen && (
        <div className="row wrap" style={{ gap: 16, fontSize: 12.5 }}>
          <span className="muted">Pendientes: <b>{resumen.pendientes || 0}</b></span>
          <span className="muted">Fallidos: <b>{resumen.fallidos || 0}</b></span>
          <span className="muted">Sin confirmar: <b>{resumen.inciertos || 0}</b></span>
          {resumen.proximoIntento && <span className="muted">Próximo intento: {fmtF(resumen.proximoIntento)}</span>}
        </div>
      )}

      {error && <div className="alerta">{error}</div>}

      <div className="card pad0">
        <div style={{ padding: '0 8px 8px', overflowX: 'auto' }}>
          {cargando && filas.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>Cargando...</p>
          ) : filas.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              No hay envíos{estado ? ' en este estado' : ''}. Todo lo que salga por WhatsApp va a quedar acá.
            </p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Para</th>
                  <th>Tipo</th>
                  <th>Mensaje</th>
                  <th>Estado</th>
                  <th className="num">Intentos</th>
                  <th>Error</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const [label, tono] = ESTADO_ENVIO[f.estado] || [f.estado, 'gray'];
                  const puedeReintentar = ['fallido', 'incierto'].includes(f.estado);
                  return (
                    <tr key={f.id}>
                      <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {fmtF(f.creado_en)}
                        <div className="muted" style={{ fontSize: 11 }}>{hace(f.creado_en)}</div>
                      </td>
                      <td className="mono" style={{ fontSize: 12.5 }}>{f.telefono}</td>
                      <td><span className="badge gray">{TIPO_ENVIO[f.tipo] || f.tipo}</span></td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.texto || f.plantilla || '—'}
                        </div>
                        {f.aviso_orden_id && <span className="muted" style={{ fontSize: 11 }}>aviso de {f.aviso_orden_id}</span>}
                      </td>
                      <td><span className={`badge ${tono}`}>{label}</span></td>
                      <td className="num">{f.intentos || 0}</td>
                      <td className="muted" style={{ fontSize: 12, maxWidth: 240 }}>{f.ultimo_error || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {puedeReintentar && (
                          <button className="btn sm" onClick={() => reintentar(f)}>
                            <Icon name="refresh" size={12} /> Reintentar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        Los errores de red, 429 y 5xx se reintentan solos (hasta 4 veces, con espera creciente).
        Un timeout queda "sin confirmar" para no mandar dos veces el mismo mensaje: decidí vos si reenviar.
      </p>
    </div>
  );
}

function Auditoria() {
  const [filas, setFilas] = useState([]);
  const [filtros, setFiltros] = useState({ tabla: '', actor: '', desde: '' });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState(null);

  const cargar = useCallback(async (f = { tabla: '', actor: '', desde: '' }) => {
    setCargando(true);
    try {
      const p = new URLSearchParams();
      if (f.tabla) p.set('tabla', f.tabla.trim());
      if (f.actor) p.set('actor', f.actor.trim());
      if (f.desde) p.set('desde', f.desde);
      p.set('limite', '200');
      const r = await api(`/auditoria?${p}`);
      setFilas(r.filas || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const buscar = (e) => {
    e.preventDefault();
    cargar(filtros);
  };

  const limpiar = () => {
    const vacio = { tabla: '', actor: '', desde: '' };
    setFiltros(vacio);
    cargar(vacio);
  };

  const json = (v) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));

  return (
    <div className="col">
      <form className="card" onSubmit={buscar}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>Tabla</label>
            <input className="input" value={filtros.tabla} onChange={(e) => setFiltros({ ...filtros, tabla: e.target.value })} placeholder="clientes, ordenes..." />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>Quién</label>
            <input className="input" value={filtros.actor} onChange={(e) => setFiltros({ ...filtros, actor: e.target.value })} placeholder="email del usuario" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Desde</label>
            <input className="input" type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
          </div>
          <button className="btn primary" type="submit" disabled={cargando}>
            <Icon name="search" size={13} /> Buscar
          </button>
          <button className="btn" type="button" onClick={limpiar} disabled={cargando}>Limpiar</button>
        </div>
      </form>

      {error && <div className="alerta">{error}</div>}

      <div className="card pad0">
        <div style={{ padding: '0 8px 8px', overflowX: 'auto' }}>
          {cargando && filas.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>Cargando...</p>
          ) : filas.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              No hay cambios registrados con esos filtros. La auditoría arranca a guardar desde esta versión.
            </p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Quién</th>
                  <th>Qué</th>
                  <th>Registro</th>
                  <th>Campos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtF(f.fecha)}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{f.actor || 'sistema'}</div>
                      <span className="muted" style={{ fontSize: 11 }}>{f.rol || ''}{f.ip ? ` · ${f.ip}` : ''}</span>
                    </td>
                    <td><span className="badge gray">{f.accion}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {f.tabla}
                      {f.registro_id ? <div className="muted">{f.registro_id}</div> : null}
                    </td>
                    <td style={{ maxWidth: 280, fontSize: 12.5 }}>{f.campos || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => setDetalle(f)}>Ver detalle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detalle && (
        <Modal
          size="lg"
          title="Detalle del cambio"
          sub={`${detalle.tabla}${detalle.registro_id ? ` · ${detalle.registro_id}` : ''} · ${fmtF(detalle.fecha)}`}
          onClose={() => setDetalle(null)}
          footer={<button className="btn" onClick={() => setDetalle(null)}>Cerrar</button>}
        >
          <div className="col">
            <p style={{ margin: 0, fontSize: 13 }}>
              <b>{detalle.actor || 'sistema'}</b> ({detalle.rol || 'sin rol'}) · {detalle.accion}
              {detalle.detalle ? ` · ${detalle.detalle}` : ''}
            </p>
            {detalle.request_id && <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>request-id: {detalle.request_id}</p>}
            <div className="grid2" style={{ gap: 12 }}>
              <div>
                <h4 style={{ margin: '0 0 6px' }}>Antes</h4>
                <pre className="mono" style={{ background: 'var(--bg2, #f6f7f9)', padding: 10, borderRadius: 8, fontSize: 11.5, maxHeight: 340, overflow: 'auto', margin: 0 }}>{json(detalle.antes)}</pre>
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px' }}>Después</h4>
                <pre className="mono" style={{ background: 'var(--bg2, #f6f7f9)', padding: 10, borderRadius: 8, fontSize: 11.5, maxHeight: 340, overflow: 'auto', margin: 0 }}>{json(detalle.despues)}</pre>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


function Privacidad() {
  const toastShow = useStore((s) => s.toastShow);
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [filtros, setFiltros] = useState({ tipo: '', q: '', desde: '' });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aAnonimizar, setAAnonimizar] = useState(null);
  const [anonimizando, setAnonimizando] = useState(false);

  const query = (f = filtros) => {
    const p = new URLSearchParams();
    if (f.tipo) p.set('tipo', f.tipo);
    if (f.q) p.set('q', f.q.trim());
    if (f.desde) p.set('desde', f.desde);
    p.set('limite', '200');
    return p.toString();
  };

  const cargar = useCallback(async (f = { tipo: '', q: '', desde: '' }) => {
    setCargando(true);
    try {
      const r = await api(`/privacidad/consentimientos?${query(f)}`);
      setFilas(r.filas || []);
      setResumen(r.resumen || null);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const buscar = (e) => {
    e.preventDefault();
    cargar(filtros);
  };

  const limpiar = () => {
    const vacio = { tipo: '', q: '', desde: '' };
    setFiltros(vacio);
    cargar(vacio);
  };

  const exportar = async () => {
    try {
      await apiDescargar(`/privacidad/consentimientos/export?${query()}`, `bertika-privacidad-${new Date().toISOString().slice(0, 10)}.csv`);
      toastShow('Exportación descargada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const anonimizar = async () => {
    if (!aAnonimizar) return;
    setAnonimizando(true);
    try {
      await api(`/privacidad/consentimientos/${aAnonimizar.id}/anonimizar`, { method: 'POST' });
      toastShow('Registro anonimizado; se conservó la prueba del consentimiento', 'ok');
      setAAnonimizar(null);
      cargar(filtros);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setAnonimizando(false);
    }
  };

  const tipoTono = { cookies: 'blue', formulario: 'green', retiro: 'amber' };

  return (
    <div className="col">
      <div className="grid4">
        <Kpi label="Registros" valor={resumen?.total ?? '—'} sub="prueba de consentimiento" />
        <Kpi label="Cookies" valor={resumen?.cookies ?? '—'} sub="decisiones del banner" />
        <Kpi label="Formularios" valor={resumen?.formulario ?? '—'} sub="términos y privacidad" />
        <Kpi label="Retiros / derechos" valor={resumen?.retiro ?? '—'} sub="solicitudes recibidas" />
      </div>

      <form className="card" onSubmit={buscar}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label>Tipo</label>
            <select className="input" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todos</option>
              <option value="cookies">Cookies</option>
              <option value="formulario">Formularios</option>
              <option value="retiro">Retiros / derechos</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 200, flex: 1 }}>
            <label>Buscar</label>
            <input className="input" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} placeholder="nombre o email" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Desde</label>
            <input className="input" type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
          </div>
          <button className="btn primary" type="submit" disabled={cargando}><Icon name="search" size={13} /> Filtrar</button>
          <button className="btn" type="button" onClick={limpiar} disabled={cargando}>Limpiar</button>
          <button className="btn" type="button" onClick={exportar}><Icon name="truck" size={13} /> Exportar CSV</button>
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
          Se conservan 5 años. «Anonimizar» quita nombre, email e IP, pero mantiene la versión, el hash y la fecha:
          la prueba de que existió un consentimiento no se borra.
        </p>
      </form>

      {error && <div className="alerta">{error}</div>}

      <div className="card pad0">
        <div style={{ padding: '0 8px 8px', overflowX: 'auto' }}>
          {cargando && filas.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>Cargando registros...</p>
          ) : filas.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>No hay consentimientos con esos filtros.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Persona</th><th>Documentos</th><th>Cookies</th><th>Canal / acción</th><th>IP</th><th /></tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(f.creado_en)}</td>
                    <td><span className={`badge ${tipoTono[f.tipo] || 'gray'}`}>{f.tipo}</span></td>
                    <td style={{ fontSize: 12.5 }}>
                      {f.anonimizado_en ? <span className="muted">anonimizado</span> : (
                        <>
                          <div>{f.nombre || '—'}</div>
                          <div className="muted">{f.email || '—'}</div>
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      {f.terminos_version && <div>Términos v{f.terminos_version}</div>}
                      {f.privacidad_version && <div>Privacidad v{f.privacidad_version}</div>}
                      {f.cookies_version && <div>Cookies v{f.cookies_version}</div>}
                      {!f.terminos_version && !f.privacidad_version && !f.cookies_version && '—'}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      {f.cookies_necesarias ? 'N' : '—'} · {f.cookies_analiticas ? 'M' : '—'} · {f.cookies_marketing ? 'P' : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>{f.canal || '—'}</div>
                      <div className="muted">{f.accion || '—'}</div>
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{f.anonimizado_en ? '—' : (f.ip || '—')}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!f.anonimizado_en && (
                        <button className="btn sm ghost" onClick={() => setAAnonimizar(f)}>Anonimizar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {aAnonimizar && (
        <ConfirmDialog
          title="Anonimizar consentimiento"
          sub={aAnonimizar.email || aAnonimizar.nombre || aAnonimizar.id}
          confirmLabel="Anonimizar"
          busy={anonimizando}
          onCancel={() => setAAnonimizar(null)}
          onConfirm={anonimizar}
        >
          <p style={{ fontSize: 13 }}>
            Se quitan nombre, email, IP y navegador. Se conservan la fecha, la versión y el hash del documento aceptado
            como prueba. Esta acción no se puede deshacer.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function Sistema() {
  const [tab, setTab] = useState('estado');
  const [salud, setSalud] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarSalud = useCallback(async () => {
    setCargando(true);
    try {
      setSalud(await api('/salud'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'estado') return undefined;
    cargarSalud();
    const t = setInterval(cargarSalud, 30000);
    return () => clearInterval(t);
  }, [tab, cargarSalud]);

  const tabs = useMemo(() => ([
    ['estado', 'Estado', 'gauge'],
    ['envios', 'Envíos', 'mail'],
    ['auditoria', 'Auditoría', 'search'],
    ['privacidad', 'Privacidad', 'shield'],
  ]), []);

  return (
    <div className="wrap page">
      <div className="mb24">
        <h1 className="page-title">Salud y auditoría</h1>
        <p className="page-sub">
          Estado del servidor, cola de salida, auditoría y consentimientos de privacidad.
        </p>
      </div>

      <div className="tabs mb16">
        {tabs.map(([k, label, icon]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            <Icon name={icon} size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'estado' && (
        <Estado salud={salud} cargando={cargando} error={error} actualizar={cargarSalud} />
      )}
      {tab === 'envios' && <Envios />}
      {tab === 'auditoria' && <Auditoria />}
      {tab === 'privacidad' && <Privacidad />}
    </div>
  );
}
