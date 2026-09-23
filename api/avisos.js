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
];

export const AVISOS_DEFAULT = { received: true, quoted: true, ready: true };

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
// enlace de seguimiento y la de "cotización" el enlace para aprobar.
export function parametrosAviso(evento, { cliente, orden, sitio = 'https://bertika.com' } = {}) {
  const nombre = primerNombre(cliente?.nombre);
  const serie = String(orden?.bateria_serie || 'tu batería').slice(0, 60);
  if (evento === 'received') return [nombre, serie, `${sitio}/seguimiento`];
  if (evento === 'quoted') return [nombre, serie, `${sitio}/cotizacion/${orden?.id || ''}`];
  if (evento === 'ready') return [nombre, serie];
  return [];
}

// Texto que queda guardado en la bandeja (para que el taller vea que se avisó).
export function resumenAviso(evento, { orden } = {}) {
  const serie = String(orden?.bateria_serie || '');
  if (evento === 'received') return `Aviso automático: batería recibida (${serie}).`;
  if (evento === 'quoted') return `Aviso automático: presupuesto listo (${serie}).`;
  if (evento === 'ready') return `Aviso automático: lista para retirar (${serie}).`;
  return 'Aviso automático.';
}
