// Bertika - Automatizaciones de seguimiento del CRM. FUENTE UNICA.
//
// No mandan mensajes solos: crean TAREAS para que una persona decida. Asi no
// dependemos de que Meta apruebe una plantilla nueva ni mandamos de mas.
//
// Cada regla tiene un umbral en dias configurable y una clave estable (la usa
// la tabla wa_automatizaciones y el log de idempotencia).

import { normalizarEtapa } from './crm.js';

export const AUTOMATIZACIONES = [
  {
    clave: 'seguimiento_presupuesto',
    etiqueta: 'Presupuesto sin respuesta',
    detalle: 'Si una oportunidad presupuestada queda X días sin movimiento, crea una tarea para retomarla.',
    dias: 2,
    minDias: 1,
    maxDias: 30,
  },
  {
    clave: 'retiro_pendiente',
    etiqueta: 'Batería lista sin retirar',
    detalle: 'Si una orden lleva X días lista para retirar, crea una tarea para avisarle al cliente.',
    dias: 3,
    minDias: 1,
    maxDias: 30,
  },
];

export const CLAVES_AUTOMATIZACION = AUTOMATIZACIONES.map((a) => a.clave);

export const AUTOMATIZACIONES_DEFAULT = Object.fromEntries(
  AUTOMATIZACIONES.map((a) => [a.clave, { activo: true, dias: a.dias }])
);

export function normalizarDias(valor, porDefecto = 2) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.max(1, Math.min(Math.round(n), 30));
}

// Deja solo claves conocidas, activo booleano y dias en rango. Un valor roto
// cae en el default de la regla (nunca apaga una automatizacion por error).
export function normalizarAutomatizaciones(valor) {
  const entrada = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  const salida = {};
  for (const a of AUTOMATIZACIONES) {
    const regla = entrada[a.clave] && typeof entrada[a.clave] === 'object' ? entrada[a.clave] : {};
    salida[a.clave] = {
      activo: typeof regla.activo === 'boolean' ? regla.activo : AUTOMATIZACIONES_DEFAULT[a.clave].activo,
      dias: normalizarDias(regla.dias ?? AUTOMATIZACIONES_DEFAULT[a.clave].dias, a.dias),
    };
  }
  return salida;
}

// Dias completos transcurridos desde una fecha (null si no hay fecha valida).
export function diasEsperando(fecha, ahora = Date.now()) {
  const t = fecha ? new Date(fecha).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / 86400000));
}

const ETAPAS_ABIERTAS_SEGUIMIENTO = ['presupuestado', 'negociando'];

// ¿Hay que crear una tarea de seguimiento para esta oportunidad?
export function debeSeguirPresupuesto({
  etapa, ultimaFecha, enBaja = false, tareaAbierta = false,
}, { dias = 2, ahora = Date.now() } = {}) {
  if (enBaja || tareaAbierta) return false;
  if (!ETAPAS_ABIERTAS_SEGUIMIENTO.includes(normalizarEtapa(etapa))) return false;
  const esperando = diasEsperando(ultimaFecha, ahora);
  return esperando !== null && esperando >= normalizarDias(dias, 2);
}

// ¿Hay que crear una tarea para que retiren una batería que ya está lista?
export function debePedirRetiro({
  estado, horaEntrega, fechaIngreso, tareaAbierta = false,
}, { dias = 3, ahora = Date.now() } = {}) {
  if (tareaAbierta) return false;
  if (String(estado || '').toLowerCase() !== 'ready') return false;
  const referencia = horaEntrega || fechaIngreso;
  const esperando = diasEsperando(referencia, ahora);
  return esperando !== null && esperando >= normalizarDias(dias, 3);
}

// Textos de la tarea (los usa la API; probados aparte).
export function tituloSeguimiento(nombre) {
  return `Seguir presupuesto de ${String(nombre || 'la oportunidad').trim() || 'la oportunidad'}`;
}

export function tituloRetiro(nombre, serie) {
  const quien = String(nombre || 'el cliente').trim() || 'el cliente';
  const equipo = String(serie || '').trim();
  return `Avisar que la batería está lista: ${quien}${equipo ? ` (${equipo})` : ''}`;
}
