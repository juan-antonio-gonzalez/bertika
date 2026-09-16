// Reglas de negocio de Bertika (replican la logica del store del frontend).
// Fuente de verdad del servidor: cualquier cliente (web, app, API) debe cumplir estas reglas.

export const ORDEN_ESTADOS = [
  'received', 'diagnosing', 'quoted', 'approved', 'in_repair', 'testing', 'ready', 'delivered', 'cancelled',
];

// Nombres legibles de los estados
export const ESTADO_LABEL = Object.fromEntries(
  ORDEN_ESTADOS.map((e) => [
    e,
    e === 'received' ? 'Recibida'
    : e === 'diagnosing' ? 'Diagnosticando'
    : e === 'quoted' ? 'Cotizada'
    : e === 'approved' ? 'Aprobada'
    : e === 'in_repair' ? 'En reparacion'
    : e === 'testing' ? 'Prueba final'
    : e === 'ready' ? 'Lista'
    : e === 'delivered' ? 'Entregada'
    : 'Cancelada',
  ])
);

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

export function canTransition(orden, target) {
  const t = TRANSITIONS[orden.estado] || [];
  if (!t.includes(target)) return { ok: false, err: `Transicion ${orden.estado} -> ${target} no permitida` };
  if (target === 'ready') {
    if (orden.prueba_final?.estado !== 'passed') {
      return { ok: false, err: 'La orden no puede marcarse lista: la prueba final debe estar aprobada' };
    }
  }
  if (target === 'in_repair' && orden.estado !== 'testing') {
    if (orden.estado_cotizacion !== 'approved') {
      return { ok: false, err: 'La cotizacion debe ser aprobada por el cliente antes de reparar' };
    }
  }
  return { ok: true };
}