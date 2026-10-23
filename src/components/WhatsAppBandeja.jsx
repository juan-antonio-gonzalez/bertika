import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, ConfirmDialog, FormGrid, fmtFecha } from './ui';
import { api, getToken, BASE_URL } from '../store/api';
import { useStore, usePermiso } from '../store/store';
import {
  ETAPAS, agruparEmbudo, resumenEmbudo, normalizarMonto, formatearDuracion, formatearTasa,
  MOTIVOS_PERDIDA, TIPOS_CLIENTE, CANALES_ORIGEN,
} from '../data/crm.js';
import { aplicarVariables, enlaceSeguimiento, VARIABLES_RESPUESTA } from '../data/respuestas.js';

const listaDe = (texto) => String(texto || '').split(', ').filter(Boolean);

// Escapa un texto para usarlo dentro de una expresion regular.
const escaparRegex = (t) => String(t || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resalta el termino buscado dentro del fragmento.
const resaltar = (texto, termino) => {
  const t = String(texto || '');
  const q = String(termino || '').trim();
  if (!q) return t;
  const partes = t.split(new RegExp(`(${escaparRegex(q)})`, 'gi'));
  return partes.map((parte, i) => (parte.toLowerCase() === q.toLowerCase() ? <mark key={i}>{parte}</mark> : parte));
};

// Bandeja de WhatsApp del taller: estado del canal, filtros y el CRM de cada
// conversacion (responsable, etiquetas, notas internas y ficha del cliente).
export default function WhatsAppBandeja() {
  const toastShow = useStore((s) => s.toastShow);
  const clientes = useStore((s) => s.data.clientes) || [];
  const sync = useStore((s) => s.sync);
  const yo = useStore((s) => s.user);
  const puedeAvisos = usePermiso('avisos_whatsapp');
  const puedeCrm = usePermiso('crm_whatsapp');
  const esAdmin = yo?.rol === 'admin';
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
  const [notaABorrar, setNotaABorrar] = useState(null);
  const [prueba, setPrueba] = useState({ telefono: '', texto: 'Hola, esta es una prueba del canal de WhatsApp de Bertika.' });
  const [avisos, setAvisos] = useState(null);
  const [vista, setVista] = useState('bandeja');
  const [embudo, setEmbudo] = useState([]);
  const [revisando, setRevisando] = useState(false);
  // Rango y alcance de la exportación a CSV (admin).
  const [exportDesde, setExportDesde] = useState('');
  const [exportHasta, setExportHasta] = useState('');
  const [exportSoloAbierta, setExportSoloAbierta] = useState(false);
  const [metricas, setMetricas] = useState(null);
  const [motivoPerdida, setMotivoPerdida] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [vincular, setVincular] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [crearCli, setCrearCli] = useState(null);
  const [tareaNueva, setTareaNueva] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  // Etiquetas administrables, respuestas rápidas y búsqueda dentro de los mensajes.
  const [respuestas, setRespuestas] = useState([]);
  const [etiquetasCat, setEtiquetasCat] = useState([]);
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  const [etiquetaForm, setEtiquetaForm] = useState({ nombre: '', color: '#d98e00' });
  const [respuestaForm, setRespuestaForm] = useState({ atajo: '', texto: '' });
  const [buscarMsg, setBuscarMsg] = useState({ abierta: false, q: '', resultados: [], buscando: false });
  const [atajosAbiertos, setAtajosAbiertos] = useState(false);
  const finRef = useRef(null);

  const cargarRespuestas = async () => {
    try { setRespuestas(await api('/whatsapp/respuestas')); } catch { setRespuestas([]); }
  };
  const cargarEtiquetas = async () => {
    try { setEtiquetasCat(await api('/whatsapp/etiquetas')); } catch { setEtiquetasCat([]); }
  };

  const cargarEstado = async () => {
    try { setEstado(await api('/whatsapp/estado')); } catch (e) { toastShow(e.message, 'error'); }
  };
  const cargarAgentes = async () => {
    try { setAgentes(await api('/whatsapp/agentes')); } catch { /* sin permiso o caido */ }
  };
  // Los avisos automáticos los configura solo el admin: si no tiene permiso, la
  // tarjeta no se muestra (el 403 se ignora a propósito).
  const cargarAvisos = async () => {
    try { setAvisos(await api('/whatsapp/avisos')); } catch { setAvisos(null); }
  };
  const cambiarAviso = async (evento, valor) => {
    const activos = { ...avisos?.activos, [evento]: valor };
    setAvisos({ ...avisos, activos });
    try {
      setAvisos(await api('/whatsapp/avisos', { method: 'PUT', body: { activos } }));
      toastShow('Avisos automáticos actualizados', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
      cargarAvisos();
    }
  };

  // Embudo comercial: se carga aparte (sin los filtros de la bandeja).
  const cargarEmbudo = async () => {
    try { setEmbudo(await api('/whatsapp/conversaciones')); } catch (e) { toastShow(e.message, 'error'); }
  };
  const cargarMetricas = async () => {
    try { setMetricas(await api('/whatsapp/metricas')); } catch (e) { toastShow(e.message, 'error'); }
  };
  // Perder una oportunidad exige motivo: se pide antes de guardar (queda en el
  // historial de etapas y alimenta el ranking de motivos).
  const moverEtapa = async (id, etapa, textoMotivo = '') => {
    if (etapa === 'perdido' && !textoMotivo) {
      const conv = embudo.find((c) => c.id === id);
      setMotivo('');
      setMotivoPerdida({ id, titulo: conv?.cliente_nombre || conv?.nombre_perfil || conv?.telefono || id });
      return;
    }
    setEmbudo((cs) => cs.map((c) => (c.id === id ? { ...c, etapa } : c)));
    try {
      await api(`/whatsapp/conversaciones/${id}`, { method: 'PATCH', body: { etapa, motivo: textoMotivo || undefined } });
      if (vista === 'metricas') cargarMetricas();
    } catch (e) {
      toastShow(e.message, 'error');
      cargarEmbudo();
    }
  };
  const confirmarPerdida = async () => {
    const t = motivo.trim();
    if (!t) return toastShow('Escribí el motivo de la pérdida', 'warn');
    const pend = motivoPerdida;
    setMotivoPerdida(null);
    await moverEtapa(pend.id, 'perdido', t);
  };
  const vincularCliente = async (clienteId) => {
    try {
      await api(`/whatsapp/conversaciones/${sel}`, { method: 'PATCH', body: { cliente_id: clienteId } });
      toastShow('Conversación vinculada al cliente', 'ok');
      setVincular(false);
      setBuscaCliente('');
      await abrir(sel);
      cargarConvs(filtro);
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const guardarClienteNuevo = async () => {
    const f = crearCli || {};
    if (!String(f.nombre || '').trim() || !/^\S+@\S+\.\S+$/.test(String(f.email || '').trim())) {
      return toastShow('El nombre y un email válido son obligatorios', 'warn');
    }
    setEnviando(true);
    try {
      const nuevo = await api('/clientes', { method: 'POST', body: f });
      if (nuevo?.id) await api(`/whatsapp/conversaciones/${sel}`, { method: 'PATCH', body: { cliente_id: nuevo.id } });
      toastShow('Cliente creado y vinculado', 'ok');
      setCrearCli(null);
      await sync();
      await abrir(sel);
      cargarConvs(filtro);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };
  const guardarTarea = async () => {
    const f = tareaNueva || {};
    if (!String(f.titulo || '').trim()) return toastShow('La tarea necesita un título', 'warn');
    setEnviando(true);
    try {
      await api('/whatsapp/tareas', {
        method: 'POST',
        body: {
          titulo: f.titulo, vence: f.vence || null, asignado_a: f.asignado_a || '',
          conversacion_id: sel, cliente_id: hilo?.conversacion?.cliente_id || null,
        },
      });
      toastShow('Tarea creada', 'ok');
      setTareaNueva(null);
      await sync();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };
  const guardarMonto = async (id, valor) => {
    const monto = normalizarMonto(valor);
    try {
      await api(`/whatsapp/conversaciones/${id}`, { method: 'PATCH', body: { monto_estimado: monto } });
      setEmbudo((cs) => cs.map((c) => (c.id === id ? { ...c, monto_estimado: monto } : c)));
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const revisarGarantias = async () => {
    setRevisando(true);
    try {
      const r = await api('/whatsapp/avisos/garantias', { method: 'POST' });
      const texto = r.apagado
        ? 'El aviso de garantía está apagado'
        : `Garantías por vencer: ${r.revisadas}. Encoladas: ${r.encoladas ?? r.enviadas ?? 0}${r.errores ? `, con error: ${r.errores}` : ''}${r.sinTelefono ? `, sin teléfono: ${r.sinTelefono}` : ''}`;
      toastShow(texto, r.apagado || r.errores ? 'warn' : 'ok');
      cargarConvs(filtro);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setRevisando(false);
    }
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
    Promise.all([cargarEstado(), cargarAgentes(), cargarAvisos(), cargarRespuestas(), cargarEtiquetas()]).finally(() => setCargando(false));
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
    if (vista === 'embudo') cargarEmbudo();
    if (vista === 'metricas') cargarMetricas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [hilo]);

  const enviarPrueba = async () => {
    if (!prueba.telefono.trim() || !prueba.texto.trim()) return toastShow('Completá el teléfono y el mensaje', 'warn');
    setEnviando(true);
    try {
      const r = await api('/whatsapp/enviar', { method: 'POST', body: prueba });
      toastShow(r.enCola ? (r.aviso || 'El mensaje quedó en cola: se reintenta solo') : 'Mensaje enviado por WhatsApp', r.enCola ? 'warn' : 'ok');
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
      const r = await api(`/whatsapp/conversaciones/${sel}/responder`, { method: 'POST', body: { texto: t } });
      if (r.enCola) toastShow(r.aviso || 'El mensaje quedó en cola: se reintenta solo', 'warn');
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
  const agregarEtiqueta = (nombre) => {
    const t = String(nombre || etiquetaNueva || '').trim();
    if (!t || !sel) return;
    guardarEtiquetas([...listaDe(hilo?.conversacion?.etiquetas), t]);
    setEtiquetaNueva('');
  };
  const quitarEtiqueta = (t) => guardarEtiquetas(listaDe(hilo?.conversacion?.etiquetas).filter((x) => x.toLowerCase() !== t.toLowerCase()));

  // Alta de etiqueta en el catálogo (desde el botón "Nueva etiqueta…").
  const crearEtiqueta = async () => {
    const nombre = etiquetaForm.nombre.trim();
    if (!nombre) return toastShow('Poné un nombre para la etiqueta', 'warn');
    try {
      const nueva = await api('/whatsapp/etiquetas', { method: 'POST', body: { nombre, color: etiquetaForm.color } });
      await cargarEtiquetas();
      setEtiquetaForm({ nombre: '', color: '#d98e00' });
      toastShow(`Etiqueta "${nueva.nombre}" creada`, 'ok');
      if (sel) agregarEtiqueta(nueva.nombre);
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const cambiarEtiqueta = async (id, cambios) => {
    try {
      await api(`/whatsapp/etiquetas/${id}`, { method: 'PATCH', body: cambios });
      await cargarEtiquetas();
      cargarEstado();
      if (hilo) abrir(sel);
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const borrarEtiqueta = async (id) => {
    try {
      const r = await api(`/whatsapp/etiquetas/${id}`, { method: 'DELETE' });
      await cargarEtiquetas();
      cargarEstado();
      if (hilo) abrir(sel);
      toastShow(r?.desactivada ? (r.mensaje || 'La etiqueta quedó fuera del catálogo') : 'Etiqueta borrada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const borrarRespuesta = async (id) => {
    try {
      await api(`/whatsapp/respuestas/${id}`, { method: 'DELETE' });
      await cargarRespuestas();
      toastShow('Respuesta borrada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const crearRespuesta = async () => {
    const atajo = respuestaForm.atajo.trim();
    const txt = respuestaForm.texto.trim();
    if (!atajo || !txt) return toastShow('Completá el atajo y el texto', 'warn');
    try {
      await api('/whatsapp/respuestas', { method: 'POST', body: { atajo, texto: txt } });
      setRespuestaForm({ atajo: '', texto: '' });
      await cargarRespuestas();
      toastShow('Respuesta rápida creada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };
  const cambiarRespuesta = async (id, cambios) => {
    try {
      await api(`/whatsapp/respuestas/${id}`, { method: 'PATCH', body: cambios });
      await cargarRespuestas();
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  // ---- Respuestas rápidas: se disparan escribiendo "/" en el compositor ----
  const primerNombre = (n) => (String(n || '').trim().split(/\s+/)[0] || 'cliente');
  // La última orden del cliente da la serie y el enlace de seguimiento (que va
  // con el código de 16 dígitos: el detalle público no acepta el id interno).
  const primeraOrden = hilo?.ordenes?.[0] || null;
  const linkSeguimiento = primeraOrden ? enlaceSeguimiento(primeraOrden, window.location.origin) : '';
  const textoConVariables = (t) => aplicarVariables(t, {
    nombre: primerNombre(hilo?.cliente?.nombre || hilo?.conversacion?.nombre_perfil),
    telefono: hilo?.conversacion?.telefono,
    serie: primeraOrden?.bateria_serie,
    link: linkSeguimiento,
  });
  const usarAtajo = (r) => { setTexto(textoConVariables(r.texto)); setAtajosAbiertos(false); };
  const filtroAtajo = texto.replace(/^\//, '').toLowerCase().trim();
  const atajosFiltrados = (() => {
    if (!atajosAbiertos) return [];
    // Si el texto ya es una respuesta escrita, no se filtra por él.
    const q = filtroAtajo.length > 24 ? '' : filtroAtajo;
    return respuestas.filter((r) => !q || r.atajo.toLowerCase().includes(q) || String(r.texto).toLowerCase().includes(q)).slice(0, 8);
  })();

  // ---- Buscar dentro de los mensajes (no solo en nombre/teléfono) ----
  const buscarEnMensajes = async () => {
    const q = buscarMsg.q.trim();
    if (q.length < 2) return toastShow('Escribí al menos 2 letras', 'warn');
    setBuscarMsg((b) => ({ ...b, buscando: true }));
    try {
      const r = await api(`/whatsapp/buscar?q=${encodeURIComponent(q)}`);
      setBuscarMsg((b) => ({ ...b, resultados: r, buscando: false }));
    } catch (e) {
      setBuscarMsg((b) => ({ ...b, buscando: false }));
      toastShow(e.message, 'error');
    }
  };

  // Mandar una foto o un PDF dentro de la conversación.
  const enviarAdjunto = async (archivo) => {
    if (!sel || !archivo) return;
    if (archivo.size > 8 * 1024 * 1024) return toastShow('El archivo es muy pesado (máximo 8 MB)', 'warn');
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      if (texto.trim()) form.append('texto', texto.trim());
      const r = await api(`/whatsapp/conversaciones/${sel}/adjunto`, { method: 'POST', form });
      setTexto('');
      await abrir(sel);
      cargarConvs(filtro);
      toastShow(r.enCola ? (r.aviso || 'El archivo quedó en cola: se reintenta solo') : 'Archivo enviado', r.enCola ? 'warn' : 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  // Baja / alta del envío de mensajes (consentimiento).
  const cambiarOptin = async (estado) => {
    if (!sel) return;
    try {
      await api(`/whatsapp/conversaciones/${sel}/optin`, { method: 'POST', body: { estado } });
      await abrir(sel);
      toastShow(estado === 'baja' ? 'Marcado: no quiere recibir mensajes' : 'Habilitado para recibir mensajes', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  // Descarga de las conversaciones en CSV (admin), con el rango de fechas elegido.
  const exportarConversaciones = async () => {
    try {
      const p = new URLSearchParams();
      if (exportDesde) p.set('desde', `${exportDesde}T00:00:00`);
      if (exportHasta) p.set('hasta', `${exportHasta}T23:59:59`);
      if (exportSoloAbierta && sel) p.set('conversacion', sel);
      const qs = p.toString();
      const res = await fetch(`${BASE_URL}/whatsapp/export${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('No se pudo exportar (¿tenés permisos?)');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bertika-whatsapp-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastShow('Exportación descargada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

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

  // Borrar una nota interna: la API solo lo permite al autor o a un admin.
  const borrarNota = async (n) => {
    try {
      await api(`/whatsapp/conversaciones/${sel}/notas/${n.id}`, { method: 'DELETE' });
      setNotaABorrar(null);
      await abrir(sel);
      toastShow('Nota borrada', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  if (cargando) return <p className="muted">Cargando el canal de WhatsApp...</p>;

  const hayFiltro = Boolean(filtro.q || filtro.etiqueta || filtro.asignado || filtro.sinLeer);
  const embudoResumen = resumenEmbudo(embudo);
  const columnas = agruparEmbudo(embudo);
  // Clientes para el buscador de "Vincular cliente".
  const clientesFiltrados = (() => {
    const q = buscaCliente.trim().toLowerCase();
    const base = q
      ? clientes.filter((c) => `${c.nombre} ${c.telefono || ''} ${c.email || ''} ${c.empresa || ''}`.toLowerCase().includes(q))
      : clientes;
    return base.slice(0, 20);
  })();
  const etiquetasHilo = listaDe(hilo?.conversacion?.etiquetas);
  const enBaja = hilo?.consentimiento?.estado === 'baja';
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
        {estado?.configurado && esAdmin && (
          <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>Exportar conversaciones (CSV):</span>
            <input type="date" className="input" style={{ width: 145 }} value={exportDesde} onChange={(e) => setExportDesde(e.target.value)} title="Desde" />
            <span className="muted" style={{ fontSize: 12 }}>a</span>
            <input type="date" className="input" style={{ width: 145 }} value={exportHasta} onChange={(e) => setExportHasta(e.target.value)} title="Hasta" />
            <label className="row" style={{ gap: 6, fontSize: 12.5, opacity: sel ? 1 : 0.5 }}>
              <input type="checkbox" checked={exportSoloAbierta} disabled={!sel} onChange={(e) => setExportSoloAbierta(e.target.checked)} />
              solo la conversación abierta
            </label>
            <button className="btn sm" onClick={exportarConversaciones}>
              <Icon name="clipboard" size={12} /> Exportar
            </button>
            <span className="muted" style={{ fontSize: 11.5 }}>Sin fechas baja todo; queda registrado quién lo pidió.</span>
          </div>
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

      {/* Avisos automáticos (solo admin) */}
      {estado?.configurado && avisos?.eventos && puedeAvisos && (
        <div className="card">
          <div className="card-title"><Icon name="bolt" size={14} /> Avisos automáticos al cliente</div>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
            Cuando cambia el estado de una orden se le manda la plantilla aprobada por Meta. Si el aviso no sale,
            queda registrado como error en la bandeja (con el motivo).
          </p>
          <div className="row wrap" style={{ gap: 14 }}>
            {avisos.eventos.map((e) => (
              <label key={e.evento} className="row" style={{ gap: 6, fontSize: 12.5 }} title={e.detalle}>
                <input
                  type="checkbox" checked={Boolean(avisos.activos?.[e.evento])}
                  onChange={(ev) => cambiarAviso(e.evento, ev.target.checked)}
                />
                {e.etiqueta}
              </label>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="btn sm" disabled={revisando} onClick={revisarGarantias}>
              <Icon name="refresh" size={12} /> {revisando ? 'Revisando...' : 'Revisar garantías ahora'}
            </button>
            <span className="muted" style={{ fontSize: 11.5 }}>
              Avisa a los clientes cuya garantía vence en los próximos 30 días. También se corre solo una vez por día.
            </span>
          </div>
        </div>
      )}

      {/* Bandeja / Embudo comercial / Métricas */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <button className={`chip${vista === 'bandeja' ? ' on' : ''}`} onClick={() => setVista('bandeja')}>
          <Icon name="mail" size={12} /> Bandeja
        </button>
        <button className={`chip${vista === 'embudo' ? ' on' : ''}`} onClick={() => setVista('embudo')}>
          <Icon name="bolt" size={12} /> Embudo comercial
        </button>
        <button className={`chip${vista === 'metricas' ? ' on' : ''}`} onClick={() => setVista('metricas')}>
          <Icon name="gauge" size={12} /> Métricas
        </button>
        {vista === 'embudo' && (
          <span className="muted" style={{ fontSize: 12 }}>
            Oportunidades abiertas: {embudoResumen.abiertos.cantidad} · $ {Number(embudoResumen.abiertos.monto).toLocaleString('es-AR')}
            {' · '}Ganadas: {embudoResumen.ganado.cantidad}
          </span>
        )}
      </div>
      {vista === 'embudo' ? (
        <div className="embudo">
          {columnas.map((col) => (
            <div key={col.key} className="embudo-col">
              <div className="embudo-head">
                <b style={{ fontSize: 12.5 }}>{col.label}</b>
                <span className="muted" style={{ fontSize: 11 }}>
                  {col.conversaciones.length} · $ {Number(embudoResumen.porEtapa[col.key].monto).toLocaleString('es-AR')}
                </span>
              </div>
              {col.conversaciones.map((c) => (
                <div key={c.id} className="embudo-card">
                  <div className="row between" style={{ gap: 6 }}>
                    <b style={{ fontSize: 12.5 }}>{c.cliente_nombre || c.nombre_perfil || c.telefono}</b>
                    {c.no_leidos > 0 && <span className="badge amber">{c.no_leidos}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.ultimo_texto || '—'}
                  </div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    <input
                      className="input" style={{ width: 92, fontSize: 12 }} placeholder="$ monto"
                      defaultValue={c.monto_estimado ?? ''}
                      onBlur={(e) => guardarMonto(c.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    />
                    <select
                      className="input" style={{ width: 128, fontSize: 11.5 }} value={c.etapa || 'nuevo'}
                      onChange={(e) => moverEtapa(c.id, e.target.value)}
                    >
                      {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                    </select>
                    <button className="btn sm ghost" onClick={() => { setVista('bandeja'); abrir(c.id); }}>Abrir</button>
                  </div>
                </div>
              ))}
              {col.conversaciones.length === 0 && <p className="muted" style={{ fontSize: 11.5, padding: '4px 2px' }}>—</p>}
            </div>
          ))}
        </div>
      ) : vista === 'metricas' ? (
        <div className="col">
          {!metricas ? (
            <p className="muted">Cargando métricas…</p>
          ) : (
            <>
              <div className="grid4">
                <div className="kpi"><div className="kpi-label">Oportunidades</div><div className="kpi-value">{metricas.total}</div><div className="kpi-sub">{metricas.abiertos.cantidad} abiertas</div></div>
                <div className="kpi"><div className="kpi-label">Monto abierto</div><div className="kpi-value" style={{ fontSize: 20 }}>$ {Number(metricas.abiertos.monto).toLocaleString('es-AR')}</div><div className="kpi-sub">estimado en el embudo</div></div>
                <div className="kpi"><div className="kpi-label">Tasa de cierre</div><div className="kpi-value">{formatearTasa(metricas.tasaCierre)}</div><div className="kpi-sub">{metricas.ganado.cantidad} ganadas · {metricas.perdido.cantidad} perdidas</div></div>
                <div className="kpi"><div className="kpi-label">Ganado</div><div className="kpi-value" style={{ fontSize: 20 }}>$ {Number(metricas.ganado.monto).toLocaleString('es-AR')}</div><div className="kpi-sub">monto estimado</div></div>
              </div>

              <div className="card">
                <div className="card-title"><Icon name="bolt" size={14} /> Conversión etapa por etapa</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead>
                      <tr><th>Etapa</th><th className="num">Llegaron</th><th className="num">% del total</th><th className="num">% de la anterior</th><th className="num">Tiempo medio</th></tr>
                    </thead>
                    <tbody>
                      {metricas.embudo.map((e) => (
                        <tr key={e.etapa}>
                          <td><b>{ETAPAS.find((x) => x.key === e.etapa)?.label || e.etapa}</b></td>
                          <td className="num">{e.cantidad}</td>
                          <td className="num">{formatearTasa(e.tasaDelTotal)}</td>
                          <td className="num">{formatearTasa(e.tasaDeAnterior)}</td>
                          <td className="num">{formatearDuracion(metricas.tiempoPorEtapa[e.etapa]?.promedioMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid2">
                <div className="card">
                  <div className="card-title"><Icon name="warn" size={14} /> Motivos de pérdida</div>
                  {metricas.motivos.length === 0 ? (
                    <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                      Todavía no hay oportunidades perdidas con motivo. Cuando muevas una a «Perdido», el motivo queda acá.
                    </p>
                  ) : (
                    <ul className="ulist">
                      {metricas.motivos.map((m) => (
                        <li key={m.motivo}>
                          <b>{m.motivo}</b> — {m.cantidad} {m.cantidad === 1 ? 'vez' : 'veces'} · $ {Number(m.monto).toLocaleString('es-AR')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="card">
                  <div className="card-title"><Icon name="dollar" size={14} /> Monto por etapa</div>
                  <ul className="ulist">
                    {ETAPAS.map((e) => (
                      <li key={e.key}>
                        <b>{e.label}</b> — {metricas.porEtapa[e.key].cantidad} · $ {Number(metricas.porEtapa[e.key].monto).toLocaleString('es-AR')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 11.5 }}>
                El tiempo por etapa se mide con el historial de cambios de etapa y arranca desde el primer mensaje del cliente
                (las oportunidades viejas empiezan a medirse desde que se muevan).
              </p>
            </>
          )}
        </div>
      ) : (
      <div className="wa-panel">
        <div className="wa-lista">
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', display: 'grid', gap: 7 }}>
            <input
              className="input" style={{ fontSize: 12.5 }} placeholder="Buscar por nombre, teléfono o texto"
              value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })}
            />
            <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
              <button
                className={`chip${buscarMsg.abierta ? ' on' : ''}`}
                title="Buscar en el texto de todos los mensajes"
                onClick={() => setBuscarMsg((b) => ({ ...b, abierta: !b.abierta, resultados: [] }))}
              >
                🔍 En mensajes
              </button>
              <button className="chip" title="Administrar las etiquetas del taller" onClick={() => setVerEtiquetas(true)}>
                Etiquetas ({etiquetasCat.length})
              </button>
            </div>
            {buscarMsg.abierta && (
              <div className="col" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 6 }}>
                  <input
                    className="input" style={{ fontSize: 12.5, flex: 1 }} placeholder="Buscar dentro de los mensajes…"
                    value={buscarMsg.q}
                    onChange={(e) => setBuscarMsg((b) => ({ ...b, q: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarEnMensajes(); } }}
                  />
                  <button className="btn sm" disabled={buscarMsg.buscando} onClick={buscarEnMensajes}>
                    {buscarMsg.buscando ? '...' : 'Buscar'}
                  </button>
                </div>
                {buscarMsg.resultados.length > 0 && (
                  <div className="col" style={{ gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                    {buscarMsg.resultados.map((m) => (
                      <button
                        key={m.id} type="button" className="wa-conv" style={{ borderRadius: 8, border: '1px solid var(--line)' }}
                        onClick={() => { setVista('bandeja'); abrir(m.conversacion_id); }}
                      >
                        <div className="row between" style={{ gap: 6 }}>
                          <b style={{ fontSize: 12 }}>{m.cliente_nombre || m.nombre_perfil || m.telefono}</b>
                          <span className="muted" style={{ fontSize: 10.5 }}>{fmtFecha(m.fecha)}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {m.direccion === 'in' ? '←' : '→'}{' '}
                          {resaltar(m.texto, buscarMsg.q)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!buscarMsg.buscando && buscarMsg.q.trim().length >= 2 && buscarMsg.resultados.length === 0 && (
                  <span className="muted" style={{ fontSize: 11.5 }}>Sin resultados en los mensajes.</span>
                )}
              </div>
            )}
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
                  {hilo.consentimiento?.estado === 'baja' && (
                    <div className="row wrap" style={{ gap: 6, marginTop: 5, alignItems: 'center' }}>
                      <span className="badge red">No quiere recibir mensajes</span>
                      {puedeCrm && (
                        <button className="btn sm ghost" onClick={() => cambiarOptin('alta')}>Habilitar envío</button>
                      )}
                    </div>
                  )}
                  {hilo.consentimiento?.estado === 'alta' && puedeCrm && (
                    <button
                      className="btn sm ghost" style={{ marginTop: 5 }} title="El cliente pidió que no le escribamos"
                      onClick={() => cambiarOptin('baja')}
                    >Marcar que no quiere recibir</button>
                  )}
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
                {etiquetasHilo.map((t) => {
                  const cat = etiquetasCat.find((e) => e.nombre.toLowerCase() === t.toLowerCase());
                  return (
                    <span key={t} className="chip on" style={cat ? { borderColor: cat.color, color: cat.color } : undefined}>
                      {t}
                      <button type="button" title="Quitar" onClick={() => quitarEtiqueta(t)}>✕</button>
                    </span>
                  );
                })}
                <select
                  className="input" style={{ width: 165, fontSize: 12.5 }} value=""
                  onChange={(e) => {
                    if (e.target.value === '__nueva') { setEtiquetaForm({ nombre: '', color: '#d98e00' }); setVerEtiquetas(true); return; }
                    if (e.target.value) agregarEtiqueta(e.target.value);
                  }}
                >
                  <option value="">+ etiqueta</option>
                  {etiquetasCat
                    .filter((e) => !etiquetasHilo.some((t) => t.toLowerCase() === e.nombre.toLowerCase()))
                    .map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                  <option value="__nueva">Nueva etiqueta…</option>
                </select>
                {/* Ficha del cliente: si el teléfono no coincidió, la conversación
                    queda huérfana; desde acá se vincula o se crea la ficha. */}
                {hilo.conversacion.cliente_id ? (
                  <span className="badge green" title="Conversación vinculada a una ficha">
                    cliente: {hilo.cliente?.nombre || hilo.conversacion.cliente_id}
                  </span>
                ) : (
                  <>
                    <button className="btn sm" onClick={() => setVincular(true)}>
                      <Icon name="users" size={12} /> Vincular cliente
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => setCrearCli({
                        nombre: hilo.conversacion.nombre_perfil || '', email: '',
                        telefono: hilo.conversacion.telefono || '', tipo: 'particular', canal_origen: 'WhatsApp',
                      })}
                    >
                      <Icon name="plus" size={12} /> Crear cliente
                    </button>
                  </>
                )}
                <button className="btn sm ghost" onClick={() => setTareaNueva({ titulo: '', vence: '', asignado_a: yo?.email || '' })}>
                  <Icon name="clock" size={12} /> Tarea
                </button>
              </div>

              <div className="wa-mensajes">
                {hilo.mensajes.map((m) => (
                  <div key={m.id} className={`wa-msg ${m.direccion}`}>
                    {m.media_url && String(m.media_tipo || '').toLowerCase() === 'documento' ? (
                      <a href={m.media_url} target="_blank" rel="noreferrer">📄 {m.media_nombre || 'Documento'}</a>
                    ) : m.media_url ? (
                      <a href={m.media_url} target="_blank" rel="noreferrer">
                        <img src={m.media_url} alt={m.media_nombre || 'foto'} className="wa-foto" />
                      </a>
                    ) : null}
                    {(m.texto && (!m.media_url || !String(m.texto).startsWith('['))) && <div>{m.texto}</div>}
                    {!m.texto && !m.media_url && <div>—</div>}
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
                          <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
                            <div>{n.texto}</div>
                            {(yo?.rol === 'admin' || n.autor === yo?.email) && (
                              <button className="chip" title="Borrar nota" onClick={() => setNotaABorrar(n)}>✕</button>
                            )}
                          </div>
                          <div className="wa-meta">{n.autor} · {fmtFecha(n.fecha)}</div>
                        </div>
                      ))}
                      {(hilo.notas || []).length === 0 && <span className="muted" style={{ fontSize: 12 }}>Todavía no hay notas en esta conversación.</span>}
                    </div>
                  </>
                )}
              </div>

              <div className="row" style={{ padding: 10, gap: 8, borderTop: '1px solid var(--line)', position: 'relative' }}>
                {atajosAbiertos && (
                  <div className="atajos">
                    <div className="muted" style={{ fontSize: 11, padding: '2px 8px' }}>
                      Respuestas rápidas · variables: {VARIABLES_RESPUESTA.map((v) => `{{${v.clave}}}`).join(' ')}
                    </div>
                    {atajosFiltrados.length === 0 && <span className="muted" style={{ fontSize: 12, padding: '4px 8px' }}>No hay respuestas que coincidan.</span>}
                    {atajosFiltrados.map((r) => (
                      <button key={r.id} type="button" className="atajo" onClick={() => usarAtajo(r)}>
                        <b>/{r.atajo}</b>
                        <span className="muted">{textoConVariables(r.texto).slice(0, 70)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button" className={`btn sm${atajosAbiertos ? ' primary' : ''}`} title="Respuestas rápidas (/ en el chat)"
                  onClick={() => setAtajosAbiertos((a) => !a)}
                >Respuestas</button>
                <label className="btn sm" title="Mandar una foto o un PDF" style={{ cursor: 'pointer', margin: 0 }}>
                  📎
                  <input
                    type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviarAdjunto(f); }}
                  />
                </label>
                <input
                  className="input" style={{ flex: 1 }}
                  placeholder={enBaja ? 'El cliente pidió no recibir mensajes' : 'Escribí una respuesta (o / para respuestas rápidas)…'}
                  disabled={enBaja}
                  value={texto}
                  onChange={(e) => { setTexto(e.target.value); setAtajosAbiertos(/^\/\S*$/.test(e.target.value)); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                />
                <button className="btn primary" disabled={enviando || enBaja || !texto.trim()} onClick={responder}>
                  <Icon name="mail" size={14} /> Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {notaABorrar && (
        <ConfirmDialog
          title="Borrar nota interna"
          sub={notaABorrar.autor}
          confirmLabel="Borrar nota"
          onCancel={() => setNotaABorrar(null)}
          onConfirm={() => borrarNota(notaABorrar)}
        >
          <div className="col">
            <p className="muted" style={{ margin: 0 }}>«{notaABorrar.texto}»</p>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Se borra la nota del taller. Los mensajes de la conversación no se tocan. No se puede deshacer.
            </p>
          </div>
        </ConfirmDialog>
      )}
      {/* Perder una oportunidad exige motivo (queda en el historial). */}
      {motivoPerdida && (
        <Modal
          size="md"
          title="¿Por qué se perdió?"
          sub={motivoPerdida.titulo}
          onClose={() => setMotivoPerdida(null)}
          closeOnBackdrop={false}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setMotivoPerdida(null)}>Cancelar</button>
              <button type="button" className="btn primary" disabled={!motivo.trim()} onClick={confirmarPerdida}>
                <Icon name="check" size={14} /> Marcar como perdida
              </button>
            </>
          )}
        >
          <div className="col">
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              El motivo queda guardado en el historial y alimenta el ranking de motivos de pérdida.
            </p>
            <div className="row wrap" style={{ gap: 6 }}>
              {MOTIVOS_PERDIDA.map((m) => (
                <button key={m} type="button" className={`chip${motivo === m ? ' on' : ''}`} onClick={() => setMotivo(m)}>{m}</button>
              ))}
            </div>
            <div className="field">
              <label>Motivo</label>
              <input
                className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="ej. el precio no le cerró" data-autofocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarPerdida(); } }}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Vincular la conversación con una ficha existente. */}
      {vincular && (
        <Modal
          size="md"
          title="Vincular con un cliente"
          sub={hilo?.conversacion?.telefono}
          onClose={() => setVincular(false)}
          footer={<button type="button" className="btn" onClick={() => setVincular(false)}>Cerrar</button>}
        >
          <div className="col">
            <input
              className="input" placeholder="Buscar por nombre, teléfono, email o empresa"
              value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} autoFocus
            />
            <div className="col" style={{ gap: 4, maxHeight: 300, overflowY: 'auto' }}>
              {clientesFiltrados.map((c) => (
                <button key={c.id} className="btn sm block" style={{ justifyContent: 'flex-start' }} onClick={() => vincularCliente(c.id)}>
                  <b>{c.nombre}</b>
                  <span className="muted" style={{ marginLeft: 6 }}>{c.telefono || c.email || ''}</span>
                </button>
              ))}
              {clientesFiltrados.length === 0 && (
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>No encontré clientes con eso.</p>
              )}
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
              ¿Todavía no existe la ficha? Cerrá y usá «Crear cliente» (toma el nombre y el teléfono de la conversación).
            </p>
          </div>
        </Modal>
      )}

      {/* Crear la ficha del cliente desde la conversación. */}
      {crearCli && (
        <Modal
          size="lg"
          title="Crear cliente"
          sub={crearCli.telefono}
          onClose={() => setCrearCli(null)}
          closeOnBackdrop={false}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setCrearCli(null)} disabled={enviando}>Cancelar</button>
              <button type="button" className="btn primary" disabled={enviando} onClick={guardarClienteNuevo}>
                <Icon name="check" size={14} /> {enviando ? 'Guardando...' : 'Crear y vincular'}
              </button>
            </>
          )}
        >
          <div className="col">
            <FormGrid cols={2}>
              <div className="field ancho-total">
                <label>Nombre *</label>
                <input className="input" value={crearCli.nombre} onChange={(e) => setCrearCli({ ...crearCli, nombre: e.target.value })} data-autofocus />
              </div>
              <div className="field">
                <label>Email *</label>
                <input className="input" value={crearCli.email} onChange={(e) => setCrearCli({ ...crearCli, email: e.target.value })} placeholder="cliente@ejemplo.com" />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input className="input" value={crearCli.telefono} onChange={(e) => setCrearCli({ ...crearCli, telefono: e.target.value })} />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select className="input" value={crearCli.tipo} onChange={(e) => setCrearCli({ ...crearCli, tipo: e.target.value })}>
                  {TIPOS_CLIENTE.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Cómo nos conoció</label>
                <input className="input" list="canales-origen-bandeja" value={crearCli.canal_origen} onChange={(e) => setCrearCli({ ...crearCli, canal_origen: e.target.value })} />
                <datalist id="canales-origen-bandeja">
                  {CANALES_ORIGEN.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="field ancho-total">
                <label>Empresa / flotilla</label>
                <input className="input" value={crearCli.empresa || ''} onChange={(e) => setCrearCli({ ...crearCli, empresa: e.target.value })} />
              </div>
            </FormGrid>
          </div>
        </Modal>
      )}

      {/* Tarea / recordatorio desde la conversación. */}
      {tareaNueva && (
        <Modal
          size="md"
          title="Nueva tarea"
          sub={hilo?.conversacion?.nombre_perfil || hilo?.conversacion?.telefono}
          onClose={() => setTareaNueva(null)}
          closeOnBackdrop={false}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setTareaNueva(null)} disabled={enviando}>Cancelar</button>
              <button type="button" className="btn primary" disabled={enviando || !tareaNueva.titulo.trim()} onClick={guardarTarea}>
                <Icon name="check" size={14} /> Crear tarea
              </button>
            </>
          )}
        >
          <div className="col">
            <div className="field">
              <label>Título *</label>
              <input
                className="input" value={tareaNueva.titulo} autoFocus
                onChange={(e) => setTareaNueva({ ...tareaNueva, titulo: e.target.value })}
                placeholder="ej. llamarlo el jueves por el presupuesto"
              />
            </div>
            <FormGrid cols={2}>
              <div className="field">
                <label>Vence</label>
                <input className="input" type="date" value={tareaNueva.vence} onChange={(e) => setTareaNueva({ ...tareaNueva, vence: e.target.value })} />
              </div>
              <div className="field">
                <label>Responsable</label>
                <select className="input" value={tareaNueva.asignado_a} onChange={(e) => setTareaNueva({ ...tareaNueva, asignado_a: e.target.value })}>
                  {agentes.map((a) => <option key={a.email} value={a.email}>{a.email}</option>)}
                </select>
              </div>
            </FormGrid>
          </div>
        </Modal>
      )}

      {/* Administrar el catálogo de etiquetas y las respuestas rápidas */}
      {verEtiquetas && (
        <Modal
          size="xl"
          title="Etiquetas y respuestas rápidas"
          sub="Lo que el taller usa en la bandeja"
          onClose={() => setVerEtiquetas(false)}
          footer={<button type="button" className="btn" onClick={() => setVerEtiquetas(false)}>Cerrar</button>}
        >
          <div className="col" style={{ gap: 16 }}>
            <div className="col" style={{ gap: 6 }}>
              <b style={{ fontSize: 13 }}>Etiquetas</b>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input" style={{ flex: 1 }} placeholder="Nombre de la etiqueta"
                  value={etiquetaForm.nombre} onChange={(e) => setEtiquetaForm({ ...etiquetaForm, nombre: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearEtiqueta(); } }}
                />
                <input
                  type="color" title="Color" value={etiquetaForm.color}
                  onChange={(e) => setEtiquetaForm({ ...etiquetaForm, color: e.target.value })}
                  style={{ width: 46, height: 34, padding: 2, borderRadius: 8, border: '1px solid var(--line)' }}
                />
                <button className="btn primary" onClick={crearEtiqueta}>Agregar</button>
              </div>
              <div className="col" style={{ gap: 4, maxHeight: 190, overflowY: 'auto' }}>
                {etiquetasCat.map((e) => (
                  <div key={e.id} className="row between" style={{ gap: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>
                    <span className="chip on" style={{ borderColor: e.color, color: e.color }}>{e.nombre}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <input
                        className="input" style={{ width: 120, fontSize: 12 }} defaultValue={e.nombre} title="Renombrar (se cambia en las conversaciones)"
                        onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nombre) cambiarEtiqueta(e.id, { nombre: v }); }}
                      />
                      <input
                        type="color" title="Color" value={e.color || '#d98e00'}
                        onChange={(ev) => cambiarEtiqueta(e.id, { color: ev.target.value })}
                        style={{ width: 36, height: 30, padding: 2, borderRadius: 8, border: '1px solid var(--line)' }}
                      />
                      <input
                        className="input" type="number" title="Orden (menor = primero)" defaultValue={e.orden ?? 0}
                        style={{ width: 62, fontSize: 12 }}
                        onBlur={(ev) => { const n = Number(ev.target.value); if (Number.isFinite(n) && n !== e.orden) cambiarEtiqueta(e.id, { orden: n }); }}
                      />
                      <button className="btn sm ghost" title="Borrarla (si está en uso, se saca del catálogo y se mantiene en las conversaciones)" onClick={() => borrarEtiqueta(e.id)}>Borrar</button>
                    </div>
                  </div>
                ))}
                {etiquetasCat.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Todavía no hay etiquetas.</span>}
              </div>
            </div>

            <div className="col" style={{ gap: 6 }}>
              <b style={{ fontSize: 13 }}>Respuestas rápidas</b>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                En el chat escribís <b>/</b> (o tocás <b>Respuestas</b>) y elegís la respuesta. Las variables se completan solas:{' '}
                {VARIABLES_RESPUESTA.map((v) => (
                  <span key={v.clave} className="mono" title={v.ayuda} style={{ marginRight: 6 }}>{`{{${v.clave}}}`}</span>
                ))}
              </p>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input" style={{ width: 120 }} placeholder="atajo"
                  value={respuestaForm.atajo} onChange={(e) => setRespuestaForm({ ...respuestaForm, atajo: e.target.value })}
                />
                <input
                  className="input" style={{ flex: 1 }} placeholder="Texto de la respuesta"
                  value={respuestaForm.texto} onChange={(e) => setRespuestaForm({ ...respuestaForm, texto: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearRespuesta(); } }}
                />
                <button className="btn primary" disabled={enviando} onClick={crearRespuesta}>Agregar</button>
              </div>
              <div className="col" style={{ gap: 4, maxHeight: 190, overflowY: 'auto' }}>
                {respuestas.map((r) => (
                  <div key={r.id} className="row between" style={{ gap: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>
                    <span className="chip on">/{r.atajo}</span>
                    <input
                      className="input" style={{ flex: 1, fontSize: 12 }} defaultValue={r.texto}
                      onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== r.texto) cambiarRespuesta(r.id, { texto: v }); }}
                    />
                    <input
                      className="input" type="number" title="Orden (menor = primero)" defaultValue={r.orden ?? 0}
                      style={{ width: 62, fontSize: 12 }}
                      onBlur={(ev) => { const n = Number(ev.target.value); if (Number.isFinite(n) && n !== r.orden) cambiarRespuesta(r.id, { orden: n }); }}
                    />
                    <button className="btn sm ghost" title="Borrarla" onClick={() => borrarRespuesta(r.id)}>Borrar</button>
                  </div>
                ))}
                {respuestas.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Todavía no hay respuestas rápidas.</span>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
