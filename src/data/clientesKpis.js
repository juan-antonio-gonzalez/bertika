// Bertika - KPIs por cliente para la seccion Clientes/CRM. FUENTE UNICA.
//
// Todo el calculo vive aca, separado de la pantalla, para poder probarlo sin
// navegador. Es defensivo a proposito: los datos reales traen clientes sin
// ordenes, ordenes sin cotizacion, garantias sin fecha y montos cargados como
// texto. Nada de eso puede romper la tabla ni mostrar NaN.

import { ESTADOS } from './reglas.js';

// Una orden "activa" es la que todavia esta en el taller (ni entregada ni baja).
export const ESTADOS_ACTIVOS = ESTADOS.map((e) => e.key).filter((k) => k !== 'delivered' && k !== 'cancelled');

export function esEstadoActivo(estado) {
  return ESTADOS_ACTIVOS.includes(String(estado || '').trim());
}

// Numero seguro: texto, null, NaN o Infinity caen en 0.
// Acepta como se escribe en Argentina: "15000", "$ 15.000", "18.000,50".
export function aNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let s = String(valor ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // punto de miles
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Fecha segura: si no se puede leer, null (nunca "Invalid Date").
export function aFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function montoCobrado(orden) {
  return aNumero(orden?.monto_cobrado);
}

// Lo cotizado sirve para ver cuanto hay en juego en las ordenes abiertas.
export function montoCotizado(orden) {
  const detalle = orden?.cotizacion;
  if (!detalle || typeof detalle !== 'object') return 0;
  return aNumero(detalle.monto);
}

// Una garantia sin fecha no se puede considerar vigente (mejor no mentir).
export function garantiaVigente(garantia, hoy = new Date()) {
  const vence = aFecha(garantia?.vence);
  if (!vence) return false;
  return vence.getTime() >= hoy.getTime();
}

// Dias que faltan para el vencimiento (null si la garantia no tiene fecha).
export function diasParaVencer(garantia, hoy = new Date()) {
  const vence = aFecha(garantia?.vence);
  if (!vence) return null;
  return Math.round((vence.getTime() - hoy.getTime()) / 86400000);
}

const fechaMasReciente = (fechas) => {
  let mejor = null;
  for (const f of fechas) {
    const d = aFecha(f);
    if (d && (!mejor || d.getTime() > mejor.getTime())) mejor = d;
  }
  return mejor ? mejor.toISOString() : null;
};

// KPIs de un cliente. `datos` = { ordenes, baterias } tal como estan en el store.
export function kpisCliente(cliente, { ordenes = [], baterias = [] } = {}, hoy = new Date()) {
  const id = cliente?.id;
  const mias = (Array.isArray(ordenes) ? ordenes : []).filter((o) => o && id && o.cliente_id === id);
  const misBaterias = (Array.isArray(baterias) ? baterias : []).filter(
    (b) => b && id && b.cliente_id === id && String(b.estado_vida || '').toLowerCase() !== 'baja'
  );

  const activas = mias.filter((o) => esEstadoActivo(o.estado));
  const entregadas = mias.filter((o) => o.estado === 'delivered');
  const conGarantia = mias.filter((o) => o.garantia && garantiaVigente(o.garantia, hoy));
  const porVencer = conGarantia.filter((o) => {
    const dias = diasParaVencer(o.garantia, hoy);
    return dias !== null && dias <= 60;
  });

  return {
    ordenes: mias.length,
    activas: activas.length,
    entregadas: entregadas.length,
    cotizadas: mias.filter((o) => montoCotizado(o) > 0).length,
    flotilla: misBaterias.length,
    garantias: conGarantia.length,
    garantiasPorVencer: porVencer.length,
    cobrado: Math.round(entregadas.reduce((a, o) => a + montoCobrado(o), 0) * 100) / 100,
    cotizado: Math.round(mias.reduce((a, o) => a + montoCotizado(o), 0) * 100) / 100,
    ultimaActividad: fechaMasReciente(mias.map((o) => o.fecha_ingreso)),
  };
}

// Ficha completa del cliente: los datos de contacto + sus ordenes, equipos y
// garantias ya resueltos, para que la pantalla no tenga que filtrar nada.
export function fichaCliente(cliente, { ordenes = [], baterias = [] } = {}, hoy = new Date()) {
  const id = cliente?.id;
  const mias = (Array.isArray(ordenes) ? ordenes : [])
    .filter((o) => o && id && o.cliente_id === id)
    .slice()
    .sort((a, b) => (aFecha(b.fecha_ingreso)?.getTime() || 0) - (aFecha(a.fecha_ingreso)?.getTime() || 0));
  const misBaterias = (Array.isArray(baterias) ? baterias : []).filter((b) => b && id && b.cliente_id === id);
  const garantias = mias
    .filter((o) => o.garantia)
    .map((o) => ({
      orden_id: o.id,
      serie: o.bateria_serie || '',
      meses: aNumero(o.garantia?.meses),
      ciclos: aNumero(o.garantia?.ciclos),
      vence: o.garantia?.vence || null,
      dias: diasParaVencer(o.garantia, hoy),
      vigente: garantiaVigente(o.garantia, hoy),
    }))
    .sort((a, b) => (b.dias ?? -1e9) - (a.dias ?? -1e9));
  return { cliente: cliente || null, kpis: kpisCliente(cliente, { ordenes, baterias }, hoy), ordenes: mias, baterias: misBaterias, garantias };
}

// Tipo de cliente en palabras (lo que se muestra en la tabla).
export function tipoCliente(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  if (t === 'flotilla_corporativa') return 'Flotilla';
  if (t === 'particular') return 'Particular';
  return t ? t.replace(/_/g, ' ') : 'Sin tipo';
}

// Tabla completa + totales de la cabecera.
export function resumenClientes(clientes, datos = {}, hoy = new Date()) {
  const filas = (Array.isArray(clientes) ? clientes : [])
    .filter((c) => c && c.id)
    .map((c) => ({ cliente: c, kpis: kpisCliente(c, datos, hoy) }));
  const totales = filas.reduce(
    (a, f) => ({
      clientes: a.clientes + 1,
      activas: a.activas + f.kpis.activas,
      flotilla: a.flotilla + f.kpis.flotilla,
      garantias: a.garantias + f.kpis.garantias,
      cobrado: Math.round((a.cobrado + f.kpis.cobrado) * 100) / 100,
    }),
    { clientes: 0, activas: 0, flotilla: 0, garantias: 0, cobrado: 0 }
  );
  return { filas, totales };
}

// Buscador: nombre, empresa, contacto, telefono, email y tipo.
export function filtrarClientes(filas, texto) {
  const q = String(texto || '').trim().toLowerCase();
  if (!q) return Array.isArray(filas) ? filas : [];
  return (Array.isArray(filas) ? filas : []).filter((f) => {
    const c = f?.cliente || {};
    return [c.nombre, c.empresa, c.contacto, c.telefono, c.email, tipoCliente(c.tipo)]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
}

// Orden: por nombre (alfabetico) o por los numeros que mas se miran.
export const ORDENES = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'cobrado', label: 'Monto cobrado' },
  { key: 'activas', label: 'Órdenes activas' },
  { key: 'flotilla', label: 'Equipos en flotilla' },
  { key: 'ordenes', label: 'Órdenes totales' },
];

export function ordenarClientes(filas, criterio = 'nombre') {
  const lista = (Array.isArray(filas) ? filas : []).slice();
  const col = String(criterio || 'nombre');
  const texto = (v) => String(v || '').toLowerCase();
  if (col === 'nombre') return lista.sort((a, b) => texto(a?.cliente?.nombre).localeCompare(texto(b?.cliente?.nombre), 'es'));
  const num = (f) => aNumero(f?.kpis?.[col]);
  return lista.sort((a, b) => num(b) - num(a) || texto(a?.cliente?.nombre).localeCompare(texto(b?.cliente?.nombre), 'es'));
}
