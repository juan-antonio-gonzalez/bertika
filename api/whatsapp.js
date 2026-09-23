// Bertika - Canal de WhatsApp (Meta WhatsApp Business Platform / Cloud API).
//
// Todo lo que habla con Meta vive acá: enviar texto, enviar plantillas
// aprobadas, verificar la firma de los avisos que Meta nos manda (webhook) y
// traducir los errores de Meta a algo entendible.
//
// Sin las variables de entorno cargadas, `configWhatsApp().configurado` es
// false y el resto del sistema sigue funcionando normal (el canal queda
// "apagado" en vez de romper).

import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';
const BASE = 'https://graph.facebook.com';

export function configWhatsApp() {
  const token = process.env.WHATSAPP_TOKEN || '';
  const phoneId = process.env.WHATSAPP_PHONE_ID || '';
  return {
    version: VERSION,
    phoneId,
    wabaId: process.env.WHATSAPP_WABA_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    token,
    configurado: Boolean(token && phoneId),
    // Solo para mostrarlo en el panel: nunca se expone el token.
    numeroIdCorto: phoneId ? `${phoneId.slice(0, 4)}…${phoneId.slice(-3)}` : '',
  };
}

// Version "publica" (para el panel): dice si esta configurado y que falta,
// sin exponer nunca la clave, el secreto de la app ni el token de verificacion.
export function configPublicaWhatsApp() {
  const c = configWhatsApp();
  return {
    configurado: c.configurado,
    version: c.version,
    numeroIdCorto: c.numeroIdCorto,
    wabaId: c.wabaId,
    falta: [
      !c.token && 'WHATSAPP_TOKEN',
      !c.phoneId && 'WHATSAPP_PHONE_ID',
      !c.wabaId && 'WHATSAPP_WABA_ID',
      !c.verifyToken && 'WHATSAPP_VERIFY_TOKEN',
      !c.appSecret && 'WHATSAPP_APP_SECRET',
    ].filter(Boolean),
  };
}

// Etiquetas de una conversacion (CRM). Se guardan como texto separado por coma
// para que la base no necesite arrays: sin repetidas, sin vacias, maximo 8.
export function normalizarEtiquetas(valor) {
  const partes = Array.isArray(valor) ? valor : String(valor || '').split(',');
  const vistas = new Set();
  const salida = [];
  for (const parte of partes) {
    const t = String(parte || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!t) continue;
    const clave = t.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(t);
    if (salida.length >= 8) break;
  }
  return salida.join(', ');
}

// Separa lo guardado en una lista (para el panel).
export function listaEtiquetas(valor) {
  return normalizarEtiquetas(valor).split(', ').filter(Boolean);
}

// Telefono en formato E.164 sin "+" como lo pide Meta.
// Los telefonos del taller vienen locales ("11 5555-0101"): se agrega 54 9.
export function normalizarTelefono(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('54')) return d;
  if (d.length === 10) return `549${d}`;
  if (d.length === 11 && d.startsWith('9')) return `54${d}`;
  return d;
}

// Meta devuelve codigos; los traducimos a algo que el taller entienda.
export function mensajeDeError(err) {
  const code = Number(err?.code || err?.error?.code || 0);
  const sub = Number(err?.error_subcode || err?.error?.error_subcode || 0);
  const msg = String(err?.message || err?.error?.message || err || '').trim();
  if (code === 131047 || sub === 131047) return 'El cliente tiene que escribirnos primero (pasaron más de 24 h). Para iniciar vos, hay que usar una plantilla aprobada.';
  if (code === 131030) return 'Ese número no está autorizado para recibir mensajes del número de prueba. Agregalo en Meta (WhatsApp → Configuración de la API → lista de destinatarios) y confirmá el código que te llega.';
  if (code === 131026) return 'Ese número no puede recibir mensajes de WhatsApp (o no existe).';
  if (code === 132000 || code === 132001) return 'La plantilla no está aprobada todavía o el nombre/idioma no coinciden.';
  if (code === 190 || code === 102) return 'La clave (token) de WhatsApp venció o es inválida: hay que regenerarla en Meta.';
  if (code === 133010) return 'La cuenta de WhatsApp no está registrada para enviar mensajes: revisá el alta del número en Meta.';
  if (code === 100) return `Meta rechazó un dato del envío: ${msg}`;
  return msg || 'WhatsApp rechazó el envío.';
}

async function llamarMeta(ruta, cuerpo, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const { token, version } = configWhatsApp();
  if (!token) return { ok: false, error: 'WhatsApp no está configurado (falta la clave).' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${BASE}/${version}/${ruta}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: mensajeDeError(json?.error || json), code: json?.error?.code || null };
    return { ok: true, id: json?.messages?.[0]?.id || null, json };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'Meta no respondió a tiempo.' : `No se pudo conectar con WhatsApp: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// Mensaje libre. Solo válido dentro de las 24 h desde el último mensaje del
// cliente (fuera de esa ventana Meta lo rechaza con el aviso de plantilla).
export async function enviarTexto({ to, texto, fetchImpl } = {}) {
  const destino = normalizarTelefono(to);
  const cuerpo = String(texto || '').trim().slice(0, 4096);
  if (!destino) return { ok: false, error: 'Falta el teléfono del cliente.' };
  if (!cuerpo) return { ok: false, error: 'El mensaje está vacío.' };
  return llamarMeta(`${configWhatsApp().phoneId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: destino,
    type: 'text',
    text: { preview_url: false, body: cuerpo },
  }, { fetchImpl });
}

// Plantilla aprobada (la única forma de iniciar una conversación).
export async function enviarPlantilla({ to, nombre, idioma = 'es_AR', parametros = [], fetchImpl } = {}) {
  const destino = normalizarTelefono(to);
  if (!destino) return { ok: false, error: 'Falta el teléfono del cliente.' };
  if (!nombre) return { ok: false, error: 'Falta el nombre de la plantilla.' };
  const components = parametros.length
    ? [{ type: 'body', parameters: parametros.map((p) => ({ type: 'text', text: String(p).slice(0, 1024) })) }]
    : [];
  return llamarMeta(`${configWhatsApp().phoneId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: destino,
    type: 'template',
    template: { name: nombre, language: { code: idioma }, components },
  }, { fetchImpl });
}

// Firma de los avisos de Meta (X-Hub-Signature-256) sobre el cuerpo crudo.
export function verificarFirma(cuerpoCrudo, header, appSecret = process.env.WHATSAPP_APP_SECRET) {
  if (!appSecret) return { ok: false, error: 'Falta WHATSAPP_APP_SECRET para verificar la firma.' };
  const recibido = String(header || '').replace(/^sha256=/, '').trim().toLowerCase();
  if (!recibido) return { ok: false, error: 'El aviso no trae firma.' };
  const esperado = createHmac('sha256', appSecret).update(cuerpoCrudo || Buffer.alloc(0)).digest('hex');
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recibido, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, error: 'La firma no coincide.' };
}

// Nombres legibles de los estados de entrega que manda Meta.
export const ESTADO_ENTREGA = { sent: 'enviado', delivered: 'entregado', read: 'leído', failed: 'error', deleted: 'borrado' };
