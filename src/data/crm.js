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

// Tipos de cliente que acepta la ficha (el CRM los muestra con etiqueta legible).
export const TIPOS_CLIENTE = [
  { key: 'particular', label: 'Particular' },
  { key: 'flotilla_corporativa', label: 'Flotilla corporativa' },
];

// Deja el tipo en un valor valido (cualquier cosa rara cae en 'particular').
export function normalizarTipoCliente(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return TIPOS_CLIENTE.some((t) => t.key === v) ? v : 'particular';
}

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

// ---------- Datos comerciales del cliente ----------

// Campos comerciales de la ficha (CRM). El orden es el que se muestra.
export const CAMPOS_COMERCIALES = [
  { key: 'direccion', label: 'Dirección', max: 160 },
  { key: 'localidad', label: 'Localidad', max: 80 },
  { key: 'cuit', label: 'CUIT', max: 20 },
  { key: 'condicion_pago', label: 'Condición de pago', max: 60 },
  { key: 'canal_origen', label: 'Cómo nos conoció', max: 60 },
  { key: 'vendedor', label: 'Vendedor', max: 80 },
];

// Canales de origen sugeridos (se puede escribir otro).
export const CANALES_ORIGEN = ['WhatsApp', 'Recomendación', 'Instagram', 'Facebook', 'Google', 'Pasó por el taller', 'Flotilla', 'Otro'];

// Devuelve solo los campos comerciales que tienen algo, listos para mostrar.
export function camposComercialesCargados(cliente) {
  return CAMPOS_COMERCIALES
    .map((c) => ({ ...c, valor: String(cliente?.[c.key] || '').trim() }))
    .filter((c) => c.valor !== '');
}

// ---------- Motivo de pérdida ----------

export const MOTIVOS_PERDIDA = ['Precio', 'Compró en otro lado', 'No era el momento', 'No contestó más', 'Reparación no convenía', 'Otro'];

// El motivo es obligatorio para dar una oportunidad por perdida.
export function faltaMotivoPerdida(etapa, motivo) {
  return normalizarEtapa(etapa) === 'perdido' && String(motivo || '').trim() === '';
}

// ---------- Métricas del embudo ----------

// Orden del flujo comercial (perdido queda afuera: no es un paso hacia adelante).
export const FLUJO = ['nuevo', 'presupuestado', 'negociando', 'ganado'];

const red2 = (n) => Math.round(n * 10000) / 10000;
const aFecha = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

// Metricas del embudo a partir de las conversaciones, el historial de etapas y
// la primera fecha de cada conversacion (para saber cuando entro a "nuevo").
export function calcularMetricas({ conversaciones = [], historial = [], primeras = {}, ordenes = [], ahora = Date.now() } = {}) {
  const convs = Array.isArray(conversaciones) ? conversaciones : [];
  const hist = Array.isArray(historial) ? historial : [];
  const resumen = resumenEmbudo(convs);
  const total = convs.length;

  // 1) Cuantas oportunidades llegaron a cada etapa (las de hoy + las que pasaron).
  //    Todas arrancan en "nuevo", asi que esa etapa cuenta el total.
  const alcanzo = {};
  for (const e of ETAPAS) alcanzo[e.key] = 0;
  alcanzo[ETAPA_DEFAULT] = total;
  const vistas = new Set(convs.map((c) => `${c?.id || ''}|${ETAPA_DEFAULT}`));
  const sumar = (id, etapa) => {
    const clave = `${id}|${etapa}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    alcanzo[etapa] += 1;
  };
  for (const c of convs) sumar(c?.id || '', normalizarEtapa(c?.etapa));
  for (const h of hist) sumar(h?.conversacion_id || '', normalizarEtapa(h?.nueva));

  // La conversion de cada paso se mide contra la ultima etapa del flujo que tuvo
  // oportunidades (si nadie pasó por "negociando", no tiene sentido dividir por 0:
  // se compara con la anterior que sí tuvo).
  const embudo = FLUJO.map((etapa, i) => {
    let base = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (alcanzo[FLUJO[j]] > 0) { base = alcanzo[FLUJO[j]]; break; }
    }
    return {
      etapa,
      cantidad: alcanzo[etapa],
      tasaDelTotal: total ? red2(alcanzo[etapa] / total) : 0,
      tasaDeAnterior: i === 0
        ? (total ? red2(alcanzo[etapa] / total) : 0)
        : (base ? red2(alcanzo[etapa] / base) : null),
    };
  });

  const cerradas = resumen.ganado.cantidad + resumen.perdido.cantidad;
  const tasaCierre = cerradas ? red2(resumen.ganado.cantidad / cerradas) : null;

  // 2) Motivos de perdida (contados del historial, agrupados sin distinguir mayusculas).
  const motivosMap = new Map();
  for (const h of hist) {
    if (normalizarEtapa(h?.nueva) !== 'perdido') continue;
    const motivo = String(h?.motivo || '').trim();
    if (!motivo) continue;
    const clave = motivo.toLowerCase();
    const prev = motivosMap.get(clave) || { motivo, cantidad: 0, monto: 0 };
    prev.cantidad += 1;
    prev.monto = red2(prev.monto + (normalizarMonto(h?.monto) || 0));
    motivosMap.set(clave, prev);
  }
  const motivos = [...motivosMap.values()]
    .sort((a, b) => b.cantidad - a.cantidad || a.motivo.localeCompare(b.motivo))
    .slice(0, 5);

  // 3) Tiempo medio en cada etapa: se recorre el historial de cada conversacion
  //    midiendo el tramo entre un cambio y el siguiente (o hasta ahora si sigue ahi).
  const porConv = new Map();
  for (const h of hist) {
    const id = String(h?.conversacion_id || '');
    if (!id) continue;
    if (!porConv.has(id)) porConv.set(id, []);
    porConv.get(id).push(h);
  }
  const acumulado = {};
  for (const e of ETAPAS) acumulado[e.key] = { totalMs: 0, muestras: 0 };
  const medir = (etapa, desde, hasta) => {
    if (desde === null || hasta === null || hasta < desde) return;
    acumulado[etapa].totalMs += hasta - desde;
    acumulado[etapa].muestras += 1;
  };
  for (const c of convs) {
    const id = c?.id || '';
    const filas = (porConv.get(id) || [])
      .slice()
      .sort((a, b) => (aFecha(a.fecha) || 0) - (aFecha(b.fecha) || 0));
    let etapa = ETAPA_DEFAULT;
    let desde = aFecha(primeras[id]) ?? aFecha(c?.ultima_fecha);
    for (const h of filas) {
      const f = aFecha(h.fecha);
      medir(etapa, desde, f);
      etapa = normalizarEtapa(h.nueva);
      desde = f;
    }
    if (normalizarEtapa(c?.etapa) === etapa) medir(etapa, desde, ahora);
  }
  const tiempoPorEtapa = {};
  for (const e of ETAPAS) {
    const a = acumulado[e.key];
    tiempoPorEtapa[e.key] = { promedioMs: a.muestras ? Math.round(a.totalMs / a.muestras) : null, muestras: a.muestras };
  }

  // 4) Cierre real: oportunidades con orden vinculada, monto cotizado y cobrado.
  //    El embudo mide intenciones; esto mide lo que llego al taller.
  const ordenesPorId = new Map((Array.isArray(ordenes) ? ordenes : []).map((o) => [o.id, o]));
  let conOrden = 0;
  let cotizado = 0;
  let cobrado = 0;
  let entregadas = 0;
  const ordenesVistas = new Set();
  for (const c of convs) {
    const o = c?.orden_id ? ordenesPorId.get(c.orden_id) : null;
    if (!o) continue;
    conOrden += 1;
    // Si dos conversaciones apuntan a la misma orden, el monto se cuenta una vez.
    if (ordenesVistas.has(o.id)) continue;
    ordenesVistas.add(o.id);
    cotizado += normalizarMonto(o.cotizacion?.monto) || 0;
    if (String(o.estado || '').toLowerCase() === 'delivered') {
      entregadas += 1;
      cobrado += normalizarMonto(o.monto_cobrado) || 0;
    }
  }
  const ordenesResumen = {
    conOrden,
    tasaOrden: total ? red2(conOrden / total) : 0,
    cotizado: red2(cotizado),
    cobrado: red2(cobrado),
    entregadas,
    tasaCobro: conOrden ? red2(entregadas / conOrden) : null,
  };

  return {
    total,
    porEtapa: resumen.porEtapa,
    abiertos: resumen.abiertos,
    ganado: resumen.ganado,
    perdido: resumen.perdido,
    embudo,
    tasaCierre,
    motivos,
    tiempoPorEtapa,
    ordenes: ordenesResumen,
  };
}

// Duracion legible ("3 d 4 h", "45 min", "—" si no hay dato).
export function formatearDuracion(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas} h ${min % 60} min`;
  return `${Math.floor(horas / 24)} d ${horas % 24} h`;
}

// Porcentaje legible ("35 %" o "—" si no hay base de calculo).
export function formatearTasa(tasa) {
  if (tasa === null || tasa === undefined || !Number.isFinite(Number(tasa))) return '—';
  return `${Math.round(Number(tasa) * 100)} %`;
}

// ---------- Tareas / recordatorios ----------

export const ESTADOS_TAREA = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'cerrada', label: 'Cerrada' },
];

export function normalizarEstadoTarea(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return ESTADOS_TAREA.some((e) => e.key === v) ? v : 'pendiente';
}

// Una tarea vencida es la pendiente cuya fecha ya paso.
export function tareaVencida(tarea, ahora = Date.now()) {
  if (normalizarEstadoTarea(tarea?.estado) !== 'pendiente') return false;
  const v = aFecha(tarea?.vence);
  return v !== null && v < ahora;
}

// Ordena por vencimiento: primero las vencidas, despues las que vencen antes y
// al final las que no tienen fecha.
export function ordenarTareas(tareas) {
  const filas = Array.isArray(tareas) ? tareas.slice() : [];
  return filas.sort((a, b) => {
    const va = aFecha(a?.vence);
    const vb = aFecha(b?.vence);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb;
  });
}

// Cantidad de tareas pendientes (para el contador del menu). Con `soloDe` cuenta
// unicamente las asignadas a esa persona.
export function contarTareasPendientes(tareas, { soloDe = null } = {}) {
  const filas = Array.isArray(tareas) ? tareas : [];
  return filas.filter((t) => normalizarEstadoTarea(t?.estado) === 'pendiente' && (!soloDe || t?.asignado_a === soloDe)).length;
}
