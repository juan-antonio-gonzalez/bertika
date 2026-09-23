import { useEffect, useRef, useState } from 'react';
import { Icon, fmtFecha } from './ui';
import { api } from '../store/api';
import { useStore } from '../store/store';

// Bandeja de WhatsApp del taller: estado del canal, prueba de envío y las
// conversaciones con el cliente y sus órdenes al lado.
export default function WhatsAppBandeja() {
  const toastShow = useStore((s) => s.toastShow);
  const [estado, setEstado] = useState(null);
  const [convs, setConvs] = useState([]);
  const [sel, setSel] = useState(null);
  const [hilo, setHilo] = useState(null);
  const [texto, setTexto] = useState('');
  const [prueba, setPrueba] = useState({ telefono: '', texto: 'Hola, esta es una prueba del canal de WhatsApp de Bertika.' });
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const finRef = useRef(null);

  const cargarEstado = async () => {
    try { setEstado(await api('/whatsapp/estado')); } catch (e) { toastShow(e.message, 'error'); }
  };
  const cargarConvs = async () => {
    try { setConvs(await api('/whatsapp/conversaciones')); } catch { /* sin permiso o caido */ }
  };
  const abrir = async (id) => {
    setSel(id);
    try { setHilo(await api(`/whatsapp/conversaciones/${id}`)); } catch (e) { toastShow(e.message, 'error'); }
  };

  useEffect(() => {
    Promise.all([cargarEstado(), cargarConvs()]).finally(() => setCargando(false));
    const t = setInterval(() => { cargarEstado(); cargarConvs(); }, 15000);
    return () => clearInterval(t);
  }, []);

  // Refresco del hilo abierto (para ver los mensajes que entran).
  useEffect(() => {
    if (!sel) return undefined;
    const t = setInterval(async () => {
      try { setHilo(await api(`/whatsapp/conversaciones/${sel}`)); } catch { /* ignorar */ }
    }, 10000);
    return () => clearInterval(t);
  }, [sel]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [hilo]);

  const enviarPrueba = async () => {
    if (!prueba.telefono.trim() || !prueba.texto.trim()) return toastShow('Completá el teléfono y el mensaje', 'warn');
    setEnviando(true);
    try {
      await api('/whatsapp/enviar', { method: 'POST', body: prueba });
      toastShow('Mensaje enviado por WhatsApp', 'ok');
      cargarConvs();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  const responder = async () => {
    const t = texto.trim();
    if (!t || !sel) return;
    setEnviando(true);
    try {
      await api(`/whatsapp/conversaciones/${sel}/responder`, { method: 'POST', body: { texto: t } });
      setTexto('');
      await abrir(sel);
      cargarConvs();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <p className="muted">Cargando el canal de WhatsApp...</p>;

  return (
    <div className="col">
      {/* Estado del canal */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="card-title"><Icon name="mail" size={14} /> Canal de WhatsApp (Meta)</div>
          <span className={`badge ${estado?.configurado ? 'green' : 'amber'}`}>
            {estado?.configurado ? 'Conectado' : 'Falta configurar'}
          </span>
        </div>
        {estado?.configurado ? (
          <div className="grid4 mt8">
            <div className="kpi"><div className="kpi-label">Número</div><div className="kpi-value" style={{ fontSize: 16 }}>{estado.numeroIdCorto}</div><div className="kpi-sub">API {estado.version}</div></div>
            <div className="kpi"><div className="kpi-label">Mensajes recibidos</div><div className="kpi-value">{estado.estadisticas.recibidos}</div><div className="kpi-sub">{estado.estadisticas.recibidos_7d} en 7 días</div></div>
            <div className="kpi"><div className="kpi-label">Mensajes enviados</div><div className="kpi-value">{estado.estadisticas.enviados}</div><div className="kpi-sub">{estado.estadisticas.con_error} con error</div></div>
            <div className="kpi"><div className="kpi-label">Conversaciones</div><div className="kpi-value">{estado.estadisticas.conversaciones}</div><div className="kpi-sub">{estado.estadisticas.sin_leer} sin leer</div></div>
          </div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
              Todavía no cargamos las claves de Meta. Mientras tanto el resto de la plataforma funciona igual.
              Pasos: <b>1)</b> cargar las claves en el servidor · <b>2)</b> pegar esta dirección en Meta:
            </p>
            <div className="row" style={{ gap: 8 }}>
              <input className="input mono" readOnly value={estado?.webhook || ''} onFocus={(e) => e.target.select()} />
              <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(estado?.webhook || ''); toastShow('Dirección copiada', 'ok'); }}>
                <Icon name="clipboard" size={13} /> Copiar
              </button>
            </div>
            {estado?.falta?.length > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                Falta cargar: <span className="mono">{estado.falta.join(', ')}</span>
              </p>
            )}
          </>
        )}
        {estado?.configurado && estado?.falta?.length > 0 && (
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            <span className="badge amber" style={{ marginRight: 6 }}>Atención</span>
            Falta cargar <span className="mono">{estado.falta.join(', ')}</span>. Sin el App Secret los mensajes que
            entren se rechazan (no aparecen en la bandeja) y sin la frase de verificación Meta no puede confirmar la
            dirección de avisos. Corré <span className="mono">bash scripts/whatsapp-env.sh</span>.
          </p>
        )}
      </div>

      {/* Prueba de envío */}
      {estado?.configurado && (
        <div className="card">
          <div className="card-title"><Icon name="bolt" size={14} /> Mandar una prueba</div>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
            Se puede escribir a números que ya te escribieron (o a los destinatarios autorizados del número de prueba de Meta).
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" style={{ width: 190 }} placeholder="Teléfono (ej. 11 5555-0101)" value={prueba.telefono} onChange={(e) => setPrueba({ ...prueba, telefono: e.target.value })} />
            <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Mensaje" value={prueba.texto} onChange={(e) => setPrueba({ ...prueba, texto: e.target.value })} />
            <button className="btn primary" disabled={enviando} onClick={enviarPrueba}><Icon name="mail" size={14} /> {enviando ? 'Enviando...' : 'Enviar'}</button>
          </div>
        </div>
      )}

      {/* Bandeja */}
      <div className="wa-panel">
        <div className="wa-lista">
          <div className="row between" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
            <b style={{ fontSize: 13 }}>Conversaciones</b>
            <button className="btn sm ghost" onClick={cargarConvs}><Icon name="refresh" size={12} /> Actualizar</button>
          </div>
          {convs.length === 0 && <p className="muted" style={{ padding: 14, fontSize: 12.5 }}>Todavía no hay conversaciones. Cuando un cliente escriba, aparece acá.</p>}
          {convs.map((c) => (
            <button key={c.id} className={`wa-conv${sel === c.id ? ' on' : ''}`} onClick={() => abrir(c.id)}>
              <div className="row between" style={{ gap: 6 }}>
                <b style={{ fontSize: 13 }}>{c.cliente_nombre || c.nombre_perfil || c.telefono}</b>
                {c.no_leidos > 0 && <span className="badge amber">{c.no_leidos}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultimo_texto || '—'}</div>
              <div className="muted" style={{ fontSize: 11 }}>{c.ultima_fecha ? fmtFecha(c.ultima_fecha) : ''}{c.cliente_id ? ' · cliente registrado' : ''}</div>
            </button>
          ))}
        </div>

        <div className="wa-hilo">
          {!hilo ? (
            <p className="muted" style={{ padding: 18, fontSize: 13 }}>Elegí una conversación para verla.</p>
          ) : (
            <>
              <div className="row between wrap" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', gap: 8 }}>
                <div>
                  <b>{hilo.cliente?.nombre || hilo.conversacion.nombre_perfil || hilo.conversacion.telefono}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {hilo.conversacion.telefono}
                    {hilo.cliente?.telefono && ` · ficha: ${hilo.cliente.telefono}`}
                    {hilo.cliente?.wa_optin && ' · acepta WhatsApp'}
                  </div>
                </div>
                {hilo.ordenes?.length > 0 && (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {hilo.ordenes.map((o) => (
                      <span key={o.id} className="badge">{o.id} · {o.bateria_serie} · {o.estado}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="wa-mensajes">
                {hilo.mensajes.map((m) => (
                  <div key={m.id} className={`wa-msg ${m.direccion}`}>
                    <div>{m.texto}</div>
                    <div className="wa-meta">
                      {fmtFecha(m.fecha)}{m.estado ? ` · ${m.estado}` : ''}{m.error ? ` · ${m.error}` : ''}
                    </div>
                  </div>
                ))}
                <div ref={finRef} />
              </div>

              <div className="row" style={{ padding: 10, gap: 8, borderTop: '1px solid var(--line)' }}>
                <input
                  className="input" style={{ flex: 1 }} placeholder="Escribí una respuesta y enter..."
                  value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                />
                <button className="btn primary" disabled={enviando || !texto.trim()} onClick={responder}>
                  <Icon name="mail" size={14} /> Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
