// Bertika - Reglas de negocio del flujo de ordenes. FUENTE UNICA.
//
// La consumen el frontend (src/data/seed.js las reexporta; src/store/store.js
// valida con canTransition) y la API (api/reglas.js las reexporta). Asi el
// cliente y el servidor no pueden divergir: una transicion permitida en la UI
// siempre lo es en la base y viceversa.
//
// Nota de deploy: api/ la importa con la ruta relativa ../src/data/reglas.js y
// scripts/deploy.sh copia src/data/ al VPS junto con api/, por lo que la ruta
// se resuelve igual en local y en produccion.

export const ORDEN_ESTADOS = [
  'received', 'diagnosing', 'quoted', 'approved', 'in_repair', 'testing', 'ready', 'delivered', 'cancelled',
];

// Estados con etiqueta legible (la UI los usa para pills y tableros).
export const ESTADOS = [
  { key: 'received', label: 'Recibida' },
  { key: 'diagnosing', label: 'Diagnosticando' },
  { key: 'quoted', label: 'Cotizada' },
  { key: 'approved', label: 'Aprobada' },
  { key: 'in_repair', label: 'En reparacion' },
  { key: 'testing', label: 'Prueba final' },
  { key: 'ready', label: 'Lista' },
  { key: 'delivered', label: 'Entregada' },
  { key: 'cancelled', label: 'Cancelada' },
];

export const ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.key, e.label]));

// Flujo visible en el tracker (pasos de negocio)
export const TRACKER_STEPS = [
  { key: 'received', label: 'Recibida' },
  { key: 'diagnosing', label: 'Diagnostico' },
  { key: 'quoted', label: 'Cotizacion' },
  { key: 'approved', label: 'En reparacion' },
  { key: 'testing', label: 'Prueba final' },
  { key: 'ready', label: 'Lista' },
  { key: 'delivered', label: 'Entregada' },
];

// Indice del paso alcanzado segun el estado de la orden
export const STATUS_STEP_INDEX = {
  received: 0,
  diagnosing: 1,
  quoted: 2,
  approved: 3,
  in_repair: 3,
  testing: 4,
  ready: 5,
  delivered: 6,
  cancelled: 0,
};

// Transicion central del negocio
export const FLOW_CHAIN = [
  'received',
  'diagnosing',
  'quoted',
  'approved',
  'in_repair',
  'testing',
  'ready',
  'delivered',
];

// Grafo de transiciones permitidas. Regla central: testing -> in_repair cuando
// la prueba final falla, y NO se puede entregar sin pasar la prueba.
export const TRANSITIONS = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['quoted', 'cancelled'],
  quoted: ['approved', 'cancelled'],
  approved: ['in_repair', 'cancelled'],
  in_repair: ['testing', 'cancelled'],
  testing: ['ready', 'in_repair'],
  ready: ['delivered'],
  delivered: [],
  cancelled: [],
};

// Validacion de una transicion. Devuelve { ok } o { ok: false, err }.
export function canTransition(orden, target) {
  const t = TRANSITIONS[orden.estado] || [];
  if (!t.includes(target)) return { ok: false, err: `Transicion ${orden.estado} -> ${target} no permitida` };
  if (target === 'ready') {
    if (orden.prueba_final?.estado !== 'passed') {
      return { ok: false, err: 'La orden no puede marcarse lista: la prueba final debe estar aprobada' };
    }
  }
  // Volver de la prueba final fallida a reparacion no exige re-aprobacion.
  if (target === 'in_repair' && orden.estado !== 'testing') {
    if (orden.estado_cotizacion !== 'approved') {
      return { ok: false, err: 'La cotizacion debe ser aprobada por el cliente antes de reparar' };
    }
  }
  return { ok: true };
}
