// Bertika - Avisos automaticos por WhatsApp cuando cambia el estado de una orden.
//
// La logica de "que plantilla y con que datos" vive aca, separada del servidor,
// para poder probarla sin base de datos ni llamadas a Meta.
//
// Las plantillas se crean con: bash scripts/whatsapp-plantillas.sh
// (textos en docs/WHATSAPP_PLANTILLAS.md). Mientras Meta no las apruebe, el
// envio falla con un error claro y queda registrado en la bandeja.

export const PLANTILLA_POR_ESTADO = {
  received: 'bateria_recibida',
  quoted: 'cotizacion_lista',
  ready: 'bateria_lista',
};

export const EVENTOS = [
  { evento: 'received', etiqueta: 'Batería recibida', detalle: 'Cuando la batería ingresa al taller (con el enlace de seguimiento).' },
  { evento: 'quoted', etiqueta: 'Presupuesto listo', detalle: 'Cuando el técnico genera la cotización.' },
  { evento: 'ready', etiqueta: 'Lista para retirar', detalle: 'Cuando la prueba final se aprueba.' },
  { evento: 'garantia', etiqueta: 'Garantía por vencer', detalle: 'Revisión diaria: avisa 30 días antes del vencimiento de la garantía.' },
];

// La garantia no depende del estado actual: la manda la revision diaria.
export const PLANTILLA_GARANTIA = 'garantia_por_vencer';
export const DIAS_AVISO_GARANTIA = 30;

export const AVISOS_DEFAULT = { received: true, quoted: true, ready: true, garantia: true };

// Deja solo las claves conocidas y con valor booleano.
export function normalizarAvisos(valor) {
  const salida = { ...AVISOS_DEFAULT };
  if (valor && typeof valor === 'object') {
    for (const e of EVENTOS) {
      if (typeof valor[e.evento] === 'boolean') salida[e.evento] = valor[e.evento];
    }
  }
  return salida;
}

// Primer nombre del cliente, para que el mensaje suene humano.
export function primerNombre(nombre) {
  const limpio = String(nombre || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return limpio ? limpio.split(' ')[0] : 'cliente';
}

// Variables que espera cada plantilla (en orden). La {{3}} de "recibida" es el
// enlace de seguimiento y la de "cotización" el enlace para aprobar. El server
// pasa `linkCotizacion` firmado; si no viene, se usa el enlace pelado (compat).
export function parametrosAviso(evento, { cliente, orden, sitio = 'https://bertika.com', linkCotizacion = '' } = {}) {
  const nombre = primerNombre(cliente?.nombre);
  const serie = String(orden?.bateria_serie || 'tu batería').slice(0, 60);
  if (evento === 'received') return [nombre, serie, `${sitio}/seguimiento`];
  if (evento === 'quoted') return [nombre, serie, linkCotizacion || `${sitio}/cotizacion/${orden?.id || ''}`];
  if (evento === 'ready') return [nombre, serie];
  return [];
}

// Texto que queda guardado en la bandeja (para que el taller vea que se avisó).
export function resumenAviso(evento, { orden } = {}) {
  const serie = String(orden?.bateria_serie || '');
  if (evento === 'received') return `Aviso automático: batería recibida (${serie}).`;
  if (evento === 'quoted') return `Aviso automático: presupuesto listo (${serie}).`;
  if (evento === 'ready') return `Aviso automático: lista para retirar (${serie}).`;
  if (evento === 'garantia') return `Aviso automático: garantía por vencer (${serie}).`;
  return 'Aviso automático.';
}

// ---------- Garantías por vencer ----------

// Dias que faltan para el vencimiento (null si no hay fecha valida).
export function diasHastaVencimiento(vence, ahora = Date.now()) {
  if (!vence) return null;
  const t = new Date(vence).getTime();
  if (!Number.isFinite(t) || Number.isNaN(t)) return null;
  return Math.ceil((t - ahora) / 86400000);
}

// Se avisa si la garantia vence entre hoy y los proximos `dias` (30 por defecto).
export function debeAvisarGarantia(vence, ahora = Date.now(), dias = DIAS_AVISO_GARANTIA) {
  const d = diasHastaVencimiento(vence, ahora);
  return d !== null && d >= 0 && d <= dias;
}

// dd/mm/aaaa para el texto de la plantilla (en UTC, para que no cambie de dia
// segun la zona horaria del servidor).
export function formatoFecha(vence) {
  const t = new Date(vence);
  if (!Number.isFinite(t.getTime()) || Number.isNaN(t.getTime())) return '';
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${t.getUTCFullYear()}`;
}

// Variables de la plantilla de garantia: nombre, serie y fecha de vencimiento.
export function parametrosGarantia({ cliente, orden } = {}) {
  const nombre = primerNombre(cliente?.nombre);
  const serie = String(orden?.bateria_serie || 'tu batería').slice(0, 60);
  const vence = formatoFecha(orden?.garantia?.vence);
  return [nombre, serie, vence || '-'];
}
