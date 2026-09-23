// Bertika - Respuestas rapidas de la bandeja y ayudas de busqueda. FUENTE UNICA.
//
// La usan el frontend (src/components/WhatsAppBandeja.jsx) y la API
// (api/server.js importa este archivo). Asi las variables que se reemplazan y
// el recorte de los resultados de busqueda son los mismos de los dos lados.

// Variables que se pueden escribir en una respuesta rapida.
export const VARIABLES_RESPUESTA = [
  { clave: 'nombre', ayuda: 'Nombre del cliente' },
  { clave: 'serie', ayuda: 'Serie de la última batería del cliente' },
  { clave: 'link', ayuda: 'Enlace de seguimiento de la orden' },
];

// Reemplaza {{nombre}}, {{serie}} y {{link}} con los datos de la conversacion.
// Si falta un dato, deja algo razonable en vez de un hueco vacio.
export function aplicarVariables(texto, { nombre = '', serie = '', link = '' } = {}) {
  return String(texto || '')
    .replace(/\{\{\s*nombre\s*\}\}/gi, String(nombre || '').trim() || 'cliente')
    .replace(/\{\{\s*serie\s*\}\}/gi, String(serie || '').trim() || 'tu batería')
    .replace(/\{\{\s*link\s*\}\}/gi, String(link || '').trim());
}

// Atajo de respuesta rapida: sin "/", sin espacios, en minusculas.
export function normalizarAtajo(valor) {
  return String(valor || '').trim().replace(/^\/+/, '').replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').toLowerCase().slice(0, 20);
}

// Formatea el codigo de seguimiento con guiones cada 4 digitos (para el enlace).
export function formatearCodigoSeguimiento(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length !== 16) return String(valor || '');
  return d.replace(/(\d{4})(?=\d)/g, '$1-');
}

// Enlace publico de seguimiento de una orden (necesita el codigo de 16 digitos:
// el detalle publico no acepta el id interno).
export function enlaceSeguimiento(orden, sitio = '') {
  const codigo = orden?.codigo_seguimiento || orden?.codigo || '';
  const formateado = formatearCodigoSeguimiento(codigo);
  if (!formateado) return '';
  const base = String(sitio || '').replace(/\/+$/, '');
  return base ? `${base}/tracker/${formateado}` : `/tracker/${formateado}`;
}

// Recorta el texto alrededor de la coincidencia, para mostrarla en los
// resultados de busqueda sin traer el mensaje entero.
export function fragmentoConTexto(texto, termino, largo = 140) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const limite = Math.max(20, Number(largo) || 140);
  if (t.length <= limite) return t;
  const aguja = String(termino || '').trim().toLowerCase();
  const pos = aguja ? t.toLowerCase().indexOf(aguja) : -1;
  if (pos < 0) return `${t.slice(0, limite - 1)}…`;
  const mitad = Math.floor((limite - aguja.length) / 2);
  const ini = Math.max(0, pos - mitad);
  const fin = Math.min(t.length, ini + limite);
  return `${ini > 0 ? '…' : ''}${t.slice(ini, fin)}${fin < t.length ? '…' : ''}`;
}

// Respuestas de ejemplo para un taller de baterias (se siembran solo si la
// tabla esta vacia).
export const RESPUESTAS_EJEMPLO = [
  { atajo: 'horarios', texto: 'Hola {{nombre}}, atendemos de lunes a viernes de 9 a 18 y sábados de 9 a 13. ¿Querés que te esperemos?' },
  { atajo: 'demora', texto: 'Hola {{nombre}}, estamos esperando un repuesto para tu batería {{serie}}. Te avisamos apenas llegue.' },
  { atajo: 'comollegar', texto: 'Hola {{nombre}}, te paso cómo llegar al taller: https://bertika.com/como-llegar. Si me avisás, te espero.' },
  { atajo: 'garantia', texto: 'Hola {{nombre}}, tu batería {{serie}} está en garantía. Si notás algo raro, traela y la revisamos sin cargo.' },
  { atajo: 'lista', texto: 'Hola {{nombre}}, tu batería {{serie}} ya está lista para retirar. Podés ver el estado acá: {{link}}' },
];

// Paleta para pintar las etiquetas (y para asignar color a las que ya existian).
export const PALETA_ETIQUETAS = ['#d98e00', '#2f9e44', '#e03131', '#1c7ed6', '#7048e8', '#0ca678', '#f76707', '#868e96'];

export function colorDePaleta(indice) {
  const i = Math.abs(Number(indice) || 0) % PALETA_ETIQUETAS.length;
  return PALETA_ETIQUETAS[i];
}
