// Bertika - Configuracion del cotizador de visita tecnica.
// Todas las tarifas viven aca (valores provisorios ajustables).
// La funcion calcularVisita() es pura: recibe la config del formulario y
// devuelve el desglose completo + el texto de resumen para /contacto.

export const COTIZADOR_VISITA = {
  moneda: 'USD',
  iva: 0.21,

  // Traslado por franjas de distancia (km desde nuestra planta).
  zonas: [
    { id: 'z1', nombre: 'Hasta 25 km', minKm: 0, maxKm: 25, base: 180, kmAdicional: 9 },
    { id: 'z2', nombre: 'De 26 a 50 km', minKm: 26, maxKm: 50, base: 280, kmAdicional: 11 },
    { id: 'z3', nombre: 'De 51 a 100 km', minKm: 51, maxKm: 100, base: 420, kmAdicional: 12 },
    { id: 'z4', nombre: 'Más de 100 km', minKm: 101, maxKm: 9999, base: 600, kmAdicional: 14 },
  ],

  // Revision por tipo de bateria (precio por unidad revisada).
  tipos: [
    { id: 'plomo', nombre: 'Plomo-Ácido (automotriz)', precioUnidad: 850 },
    { id: 'traccion', nombre: 'Plomo-Ácido tracción (autoelevador)', precioUnidad: 1200 },
    { id: 'estacionaria', nombre: 'Estacionaria / UPS', precioUnidad: 1400 },
    { id: 'litio', nombre: 'Litio', precioUnidad: 1600 },
    { id: 'solar', nombre: 'Solar y eólico', precioUnidad: 1400 },
    { id: 'nicd', nombre: 'Níquel-Cadmio', precioUnidad: 1800 },
  ],

  // Descuento por volumen aplicado a la suma de revisiones (unidades totales).
  descuentos: [
    { desde: 25, pct: 0.15 },
    { desde: 10, pct: 0.10 },
    { desde: 5, pct: 0.05 },
  ],

  // Servicios adicionales.
  extras: [
    { id: 'cargadores', nombre: 'Revisión de cargadores', precio: 600 },
    { id: 'preventivo', nombre: 'Mantenimiento preventivo por equipo', precio: 700 },
    { id: 'pruebaCap', nombre: 'Prueba de capacidad completa', precio: 900 },
    { id: 'retiro', nombre: 'Retiro de baterías en desuso', precio: 500 },
    { id: 'informe', nombre: 'Informe técnico por equipo', precio: 300 },
  ],

  // Recargos (fraccion, se suman).
  urgencia: { normal: 0, express: 0.25 },
  turno: { comercial: 0, finde: 0.30 },
};

// Nota visible sobre la moneda de las tarifas.
export const NOTA_CAMBIO =
  'Precios de referencia en dólares estadounidenses (USD), convertidos al tipo de cambio del día según la cotización del Banco Central de la República Argentina.';

export const fmtUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const tipoPorId = Object.fromEntries(COTIZADOR_VISITA.tipos.map((t) => [t.id, t]));

export function zonaParaKm(km) {
  const n = Number(km) || 0;
  const z = COTIZADOR_VISITA.zonas.find((x) => n >= x.minKm && n <= x.maxKm);
  return z || COTIZADOR_VISITA.zonas[0];
}

function descuentoPct(unidades) {
  const d = COTIZADOR_VISITA.descuentos.find((x) => unidades >= x.desde);
  return d ? d.pct : 0;
}

// entrada: { km, renglones: [{tipoId, cantidad}], extrasSel: [id], urgencia, turno }
export function calcularVisita({ km = 0, renglones = [], extrasSel = [], urgencia = 'normal', turno = 'comercial' } = {}) {
  const renglonesValidos = renglones
    .filter((r) => r && tipoPorId[r.tipoId] && Number(r.cantidad) > 0)
    .map((r) => ({ tipo: tipoPorId[r.tipoId], cantidad: Number(r.cantidad) }));
  const totalUnidades = renglonesValidos.reduce((s, r) => s + r.cantidad, 0);

  const zona = zonaParaKm(km);
  const kmExcedente = Math.max(0, Number(km) - zona.maxKm);
  const traslado = Number(km) > 0 ? zona.base + kmExcedente * zona.kmAdicional : 0;

  const revision = renglonesValidos.reduce((s, r) => s + r.cantidad * r.tipo.precioUnidad, 0);
  const descPct = descuentoPct(totalUnidades);
  const descuentoVol = Math.round(revision * descPct);

  const detExtras = COTIZADOR_VISITA.extras.filter((e) => extrasSel.includes(e.id));
  const extras = detExtras.reduce((s, e) => s + e.precio, 0);

  const subtotal = traslado + revision - descuentoVol + extras;
  const recargoPct = (COTIZADOR_VISITA.urgencia[urgencia] ?? 0) + (COTIZADOR_VISITA.turno[turno] ?? 0);
  const recargo = Math.round(subtotal * recargoPct);
  const iva = Math.round((subtotal + recargo) * COTIZADOR_VISITA.iva);
  const total = subtotal + recargo + iva;

  const resumen = [
    `Distancia aprox: ${Number(km)} km (${zona.nombre})`,
    ...renglonesValidos.map((r) => `Baterías ${r.tipo.nombre}: ${r.cantidad} unidad(es)`),
    ...detExtras.map((e) => `Extra: ${e.nombre}`),
    `Urgencia: ${urgencia === 'express' ? 'Express 48 h' : 'Normal'} · Turno: ${turno === 'finde' ? 'Fin de semana' : 'Horario comercial'}`,
    NOTA_CAMBIO,
    'El importe es solo por el servicio de revisión y diagnóstico en planta. No incluye reparación, repuestos ni recambio de celdas.',
  ].join('\n');

  return {
    zona,
    traslado,
    revision,
    descPct,
    descuentoVol,
    extras,
    detExtras,
    subtotal,
    recargo,
    recargoPct,
    iva,
    total,
    totalUnidades,
    detalle: renglonesValidos,
    resumen,
  };
}