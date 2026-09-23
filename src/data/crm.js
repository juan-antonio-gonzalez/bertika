// Bertika - Embudo comercial de la bandeja (CRM de oportunidades). FUENTE UNICA.
//
// La usan el frontend (src/components/WhatsAppBandeja.jsx) y la API
// (api/crm.js reexporta). Asi el tablero y el servidor no pueden divergir.
//
// Cada conversacion de WhatsApp tiene una etapa comercial y un monto estimado.
// La logica vive aca, separada del servidor, para poder probarla sin base.

export const ETAPAS = [
  { key: 'nuevo', label: 'Nuevo', detalle: 'Todavía sin presupuestar.' },
  { key: 'presupuestado', label: 'Presupuestado', detalle: 'Se le pasó un número.' },
  { key: 'negociando', label: 'Negociando', detalle: 'Está viendo si avanza.' },
  { key: 'ganado', label: 'Ganado', detalle: 'Dijo que sí (o ya es cliente).' },
  { key: 'perdido', label: 'Perdido', detalle: 'No avanzó.' },
];

export const ETAPA_DEFAULT = 'nuevo';
export const ETAPAS_ABIERTAS = ['nuevo', 'presupuestado', 'negociando'];

// Deja la etapa en un valor valido (cualquier cosa rara cae en 'nuevo').
export function normalizarEtapa(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return ETAPAS.some((e) => e.key === v) ? v : ETAPA_DEFAULT;
}

// El monto estimado es opcional: vacio o invalido queda en null.
// Acepta lo que la gente escribe: "15000", "$ 15.000", "15.000,50".
export function normalizarMonto(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  let s = String(valor).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.'); // 15.000,50 -> 15000.50
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // 15.000 -> 15000 (punto de miles)
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, 1e9) * 100) / 100;
}

// Totales por etapa para mostrar arriba de cada columna del tablero.
export function resumenEmbudo(convs) {
  const filas = Array.isArray(convs) ? convs : [];
  const porEtapa = {};
  for (const e of ETAPAS) porEtapa[e.key] = { cantidad: 0, monto: 0 };
  for (const c of filas) {
    const etapa = normalizarEtapa(c?.etapa);
    const monto = normalizarMonto(c?.monto_estimado) || 0;
    porEtapa[etapa].cantidad += 1;
    porEtapa[etapa].monto = Math.round((porEtapa[etapa].monto + monto) * 100) / 100;
  }
  const abiertos = ETAPAS_ABIERTAS.reduce((a, k) => ({ cantidad: a.cantidad + porEtapa[k].cantidad, monto: a.monto + porEtapa[k].monto }), { cantidad: 0, monto: 0 });
  return {
    porEtapa,
    abiertos: { cantidad: abiertos.cantidad, monto: Math.round(abiertos.monto * 100) / 100 },
    ganado: porEtapa.ganado,
    perdido: porEtapa.perdido,
  };
}

// Agrupa las conversaciones en columnas, en el orden del embudo.
export function agruparEmbudo(convs) {
  const filas = Array.isArray(convs) ? convs : [];
  return ETAPAS.map((e) => ({
    ...e,
    conversaciones: filas.filter((c) => normalizarEtapa(c?.etapa) === e.key),
  }));
}
