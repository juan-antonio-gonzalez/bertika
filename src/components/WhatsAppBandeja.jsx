import { useEffect, useRef, useState } from 'react';
import { Icon, fmtFecha } from './ui';
import { api } from '../store/api';
import { useStore } from '../store/store';

const listaDe = (texto) => String(texto || '').split(', ').filter(Boolean);

// Bandeja de WhatsApp del taller: estado del canal, filtros y el CRM de cada
// conversacion (responsable, etiquetas, notas internas y ficha del cliente).
export default function WhatsAppBandeja() {
  const toastShow = useStore((s) => s.toastShow);
  const yo = useStore((s) => s.user);
  const [estado, setEstado] = useState(null);
  const [convs, setConvs] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [errorConvs, setErrorConvs] = useState(null);
  const [filtro, setFiltro] = useState({ q: '', etiqueta: '', asignado: '', sinLeer: false });
  const [sel, setSel] = useState(null);
  const [hilo, setHilo] = useState(null);
  const [texto, setTexto] = useState('');
  const [etiquetaNueva, setEtiquetaNueva] = useState('');
  const [nota, setNota] = useState('');
  const [verNotas, setVerNotas] = useState(false);
  const [prueba, setPrueba] = useState({ telefono: '', texto: 'Hola, esta es una prueba del canal de WhatsApp de Bertika.' });
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const finRef = useRef(null);

  const cargarEstado = async () => {
    try { setEstado(await api('/whatsapp/estado')); } catch (e) { toastShow(e.message, 'error'); }
  };
  const cargarAgentes = async () => {
    try { setAgentes(await api('/whatsapp/agentes')); } catch { /* sin permiso o caido */ }
  };
  const cargarConvs = async (f = filtro) => {
    const p = new URLSearchParams();
    if (f.q.trim()) p.set('q', f.q.trim());
    if (f.etiqueta) p.set('etiqueta', f.etiqueta);
    if (f.asignado) p.set('asignado', f.asignado);
    if (f.sinLeer) p.set('sin_leer', '1');
    const qs = p.toString();
    try { setConvs(await api(`/whatsapp/conversaciones${qs ? `?${qs}` : ''}`)); setErrorConvs(null); }
    catch (e) { setErrorConvs(e.message || 'No se pudo cargar la bandeja'); }
  };
  const abrir = async (id) => {
    setSel(id);
    try { setHilo(await api(`/whatsapp/conversaciones/${id}`)); } catch (e) { toastShow(e.message, 'error'); }
  };

  // Al cambiar un filtro se recarga la lista (con una pausa corta al tipear).
  useEffect(() => {
    const t = setTimeout(() => cargarConvs(filtro), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  useEffect(() => {
    const t = setInterval(() => { cargarEstado(); cargarConvs(filtro); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  useEffect(() => {
    Promise.all([cargarEstado(), cargarAgentes()]).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      cargarConvs(filtro);
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
      cargarConvs(filtro);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  const asignar = async (email) => {
    if (!sel) return;
    try {
      await api(`/whatsapp/conversaciones/${sel}`, { method: 'PATCH', body: { asignado_a: email } });
      await abrir(sel);
      cargarConvs(filtro);
      toastShow(email ? 'Conversación asignada' : 'Conversación sin responsable', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const guardarEtiquetas = async (lista) => {
    if (!sel) return;
    try {
      await api(`/whatsapp/conversaciones/${sel}`, { method: 'PATCH', body: { etiquetas: lista.join(', ') } });
      await abrir(sel);
      cargarEstado();
      cargarConvs(filtro);
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const agregarEtiqueta = () => {
    const t = etiquetaNueva.trim();
    if (!t || !sel) return;
    guardarEtiquetas([...listaDe(hilo?.conversacion?.etiquetas), t]);
    setEtiquetaNueva('');
  };
  const quitarEtiqueta = (t) => guardarEtiquetas(listaDe(hilo?.conversacion?.etiquetas).filter((x) => x.toLowerCase() !== t.toLowerCase()));

  const guardarNota = async () => {
    const t = nota.trim();
    if (!t || !sel) return;
    setEnviando(true);
    try {
      await api(`/whatsapp/conversaciones/${sel}/notas`, { method: 'POST', body: { texto: t } });
      setNota('');
      await abrir(sel);
      setVerNotas(true);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <p className="muted">Cargando el canal de WhatsApp...</p>;

  const hayFiltro = Boolean(filtro.q || filtro.etiqueta || filtro.asignado || filtro.sinLeer);
  const etiquetasHilo = listaDe(hilo?.conversacion?.etiquetas);
  const porVencer = (hilo?.ficha?.garantias || []).filter((g) => {
    const v = g.garantia?.vence;
    if (!v) return false;
    const dias = Math.round((new Date(v) - Date.now()) / 86400000);
    return dias >= 0 && dias <= 60;
  });

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
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', display: 'grid', gap: 7 }}>
            <input
              className="input" style={{ fontSize: 12.5 }} placeholder="Buscar por nombre, teléfono o texto"
              value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })}
            />
            <div className="row wrap" style={{ gap: 6 }}>
              <button className={`chip${filtro.sinLeer ? ' on' : ''}`} onClick={() => setFiltro({ ...filtro, sinLeer: !filtro.sinLeer })}>Sin leer</button>
              <button
                className={`chip${filtro.asignado && filtro.asignado === yo?.email ? ' on' : ''}`}
                onClick={() => setFiltro({ ...filtro, asignado: filtro.asignado === yo?.email ? '' : (yo?.email || '') })}
              >Mías</button>
              {(estado?.etiquetas || []).map((t) => (
                <button key={t} className={`chip${filtro.etiqueta === t ? ' on' : ''}`} onClick={() => setFiltro({ ...filtro, etiqueta: filtro.etiqueta === t ? '' : t })}>{t}</button>
              ))}
              {hayFiltro && (
                <button className="chip" onClick={() => setFiltro({ q: '', etiqueta: '', asignado: '', sinLeer: false })}>Limpiar ✕</button>
              )}
            </div>
          </div>
          {errorConvs && (
            <p style={{ padding: 14, fontSize: 12.5, color: 'var(--red)' }}>
              No pude cargar las conversaciones: {errorConvs}
            </p>
          )}
          {convs.length === 0 && !errorConvs && (
            <p className="muted" style={{ padding: 14, fontSize: 12.5 }}>
              {hayFiltro ? 'Ninguna conversación coincide con el filtro.' : 'Todavía no hay conversaciones. Cuando un cliente escriba, aparece acá.'}
            </p>
          )}
          {convs.map((c) => (
            <button key={c.id} className={`wa-conv${sel === c.id ? ' on' : ''}`} onClick={() => abrir(c.id)}>
              <div className="row between" style={{ gap: 6 }}>
                <b style={{ fontSize: 13 }}>{c.cliente_nombre || c.nombre_perfil || c.telefono}</b>
                {c.no_leidos > 0 && <span className="badge amber">{c.no_leidos}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultimo_texto || '—'}</div>
              <div className="muted" style={{ fontSize: 11 }}>{c.ultima_fecha ? fmtFecha(c.ultima_fecha) : ''}{c.cliente_id ? ' · cliente registrado' : ''}</div>
              {(c.asignado_a || c.etiquetas) && (
                <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                  {c.asignado_a && <span className="badge gray" style={{ fontSize: 10 }}>{String(c.asignado_a).split('@')[0]}</span>}
                  {listaDe(c.etiquetas).map((t) => <span key={t} className="badge" style={{ fontSize: 10 }}>{t}</span>)}
                </div>
              )}
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
                  {hilo.ficha && (
                    <div className="row wrap" style={{ gap: 5, marginTop: 5 }}>
                      <span className="badge gray">{hilo.ficha.ordenes} órdenes</span>
                      {hilo.ficha.cotizadas > 0 && <span className="badge blue">{hilo.ficha.cotizadas} cotizadas</span>}
                      {hilo.ficha.entregadas > 0 && <span className="badge green">{hilo.ficha.entregadas} entregadas</span>}
                      {hilo.ficha.con_garantia > 0 && <span className="badge">{hilo.ficha.con_garantia} con garantía</span>}
                      {porVencer.length > 0 && (
                        <span className="badge amber">garantía por vencer · {porVencer[0].bateria_serie}</span>
                      )}
                    </div>
                  )}
                </div>
                {hilo.ordenes?.length > 0 && (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {hilo.ordenes.map((o) => (
                      <span key={o.id} className="badge">{o.id} · {o.bateria_serie} · {o.estado}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* CRM: responsable y etiquetas */}
              <div className="wa-crm">
                <span className="muted" style={{ fontSize: 12 }}>Responsable:</span>
                <select
                  className="input" style={{ width: 190, fontSize: 12.5 }}
                  value={hilo.conversacion.asignado_a || ''} onChange={(e) => asignar(e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {agentes.map((a) => <option key={a.email} value={a.email}>{a.email}</option>)}
                </select>
                <span className="muted" style={{ fontSize: 12 }}>Etiquetas:</span>
                {etiquetasHilo.map((t) => (
                  <span key={t} className="chip on">
                    {t}
                    <button type="button" title="Quitar" onClick={() => quitarEtiqueta(t)}>✕</button>
                  </span>
                ))}
                <input
                  className="input" style={{ width: 130, fontSize: 12.5 }} placeholder="+ etiqueta"
                  value={etiquetaNueva} onChange={(e) => setEtiquetaNueva(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarEtiqueta(); } }}
                />
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

              {/* Notas internas (no se le mandan al cliente) */}
              <div className="wa-notas">
                <div className="row between wrap" style={{ gap: 8 }}>
                  <button className="btn sm ghost" onClick={() => setVerNotas(!verNotas)}>
                    <Icon name="clipboard" size={12} /> Notas internas ({hilo.notas?.length || 0}) {verNotas ? '▲' : '▼'}
                  </button>
                  <span className="muted" style={{ fontSize: 11.5 }}>Solo las ve el taller: no se le envían al cliente</span>
                </div>
                {verNotas && (
                  <>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <input
                        className="input" style={{ flex: 1 }} placeholder="Anotá algo del cliente (ej. prefiere que lo llamen después de las 18)"
                        value={nota} onChange={(e) => setNota(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNota(); } }}
                      />
                      <button className="btn primary" disabled={enviando || !nota.trim()} onClick={guardarNota}>Anotar</button>
                    </div>
                    <div className="col" style={{ gap: 6, marginTop: 8 }}>
                      {(hilo.notas || []).map((n) => (
                        <div key={n.id} style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '6px 9px', fontSize: 12.5 }}>
                          <div>{n.texto}</div>
                          <div className="wa-meta">{n.autor} · {fmtFecha(n.fecha)}</div>
                        </div>
                      ))}
                      {(hilo.notas || []).length === 0 && <span className="muted" style={{ fontSize: 12 }}>Todavía no hay notas en esta conversación.</span>}
                    </div>
                  </>
                )}
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
