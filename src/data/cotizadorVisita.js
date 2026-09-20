// Bertika - Configuración del cotizador de visita técnica.
//
// Los valores de acá son los DEFAULT (fallback y valor de fábrica). En runtime
// la configuración real vive en la base (`cotizador_config`) y la edita el admin
// desde el panel: la web la pide a GET /api/public/cotizador y la API la usa
// para recalcular cada cotización con `normalizarConfig()`.
//
// Modelo de traslado (mezcla de franjas + precio por km):
//   - Cada franja tiene una `base` que cubre hasta `cubreKm` km.
//   - Pasado `cubreKm` (y hasta el `hastaKm` de la última franja) se suma
//     `kmAdicional` por cada km extra.
//   - Arriba del `hastaKm` de la última franja NO se cotiza (fuera de cobertura).

export const VIGENCIA_DIAS = 15;

export const COTIZADOR_VISITA = {
  moneda: 'USD',
  iva: 0.21,
  vigenciaDias: VIGENCIA_DIAS,

  // Franjas de traslado (km desde nuestra planta). `desdeKm` se deriva de la
  // franja anterior: no hace falta cargarlo. El km declarado YA contempla el
  // viaje de ida y vuelta (no se multiplica por dos en ningún lado).
  zonas: [
    { id: 'z1', nombre: 'Hasta 100 km', desdeKm: 0, hastaKm: 100, base: 120, cubreKm: 100, kmAdicional: 0 },
    { id: 'z2', nombre: 'Más de 100 km', desdeKm: 100, hastaKm: 700, base: 120, cubreKm: 200, kmAdicional: 3 },
  ],

  // Revisión por tipo de batería (precio por unidad revisada).
  tipos: [
    { id: 'plomo', nombre: 'Plomo-Ácido (automotriz)', precioUnidad: 850 },
    { id: 'traccion', nombre: 'Plomo-Ácido tracción (autoelevador)', precioUnidad: 1200 },
    { id: 'estacionaria', nombre: 'Estacionaria / UPS', precioUnidad: 1400 },
    { id: 'litio', nombre: 'Litio', precioUnidad: 1600 },
    { id: 'solar', nombre: 'Solar y eólico', precioUnidad: 1400 },
    { id: 'nicd', nombre: 'Níquel-Cadmio', precioUnidad: 1800 },
  ],

  // Descuento por volumen sobre la suma de revisiones (unidades totales).
  descuentos: [
    { desde: 25, pct: 0.15 },
    { desde: 10, pct: 0.10 },
    { desde: 5, pct: 0.05 },
  ],

  // Servicios adicionales. porEquipo = true → el precio se multiplica por la
  // cantidad de equipos de la visita. Todos quedan sujetos a análisis comercial.
  extras: [
    { id: 'cargadores', nombre: 'Revisión de cargadores', precio: 600, porEquipo: false },
    { id: 'preventivo', nombre: 'Mantenimiento preventivo por equipo', precio: 700, porEquipo: true },
    { id: 'pruebaCap', nombre: 'Prueba de capacidad completa', precio: 900, porEquipo: true },
    { id: 'retiro', nombre: 'Retiro de baterías en desuso', precio: 500, porEquipo: false },
    { id: 'informe', nombre: 'Informe técnico por equipo', precio: 300, porEquipo: true },
  ],

  // Viáticos para visitas largas: se activan a partir de `desdeKm` y suman
  // `porDia` por cada día de viaje. Los días arrancan en 1 y suben uno más cada
  // `diaCadaKm` km adicionales (con tope en `maxDias`). porDia = 0 los desactiva.
  viaticos: { desdeKm: 300, porDia: 150, diaCadaKm: 200, maxDias: 5 },

  // Revisión en nuestro taller (el cliente trae la batería): sin traslado ni
  // viáticos y con un descuento sobre la revisión, que se muestra aparte.
  modoTaller: { habilitado: true, descuentoRevisionPct: 0.15 },

  // Costos internos para el análisis del admin (NUNCA se muestran al cliente).
  // porKm es el costo por km DECLARADO (ya incluye la ida y vuelta, igual que el
  // precio): no se multiplica por dos.
  costos: { porKm: 0.9, tecnicoPorDia: 120, viaticoPorDia: 90 },

  // Recargos (fracción, se suman y se aplican al subtotal).
  urgencia: { normal: 0, express: 0.25 },
  turno: { comercial: 0, finde: 0.30 },

  // Límites del formulario (los valida también la API).
  maxUnidadesPorRenglon: 500,
  maxRenglones: 20,
  maxCantidadExtra: 500,
};

// Cobertura máxima por defecto = hastaKm de la última franja.
export const MAX_KM = COTIZADOR_VISITA.zonas[COTIZADOR_VISITA.zonas.length - 1].hastaKm;

export const AVISO_EXTRAS = 'Los servicios adicionales quedan sujetos a análisis del comercial.';
export const AVISO_LARGA_DISTANCIA = 'Visita de larga distancia: el importe del traslado queda sujeto a revisión del comercial.';

export function textoFueraCobertura(maxKm) {
  return `Supera los ${maxKm} km de cobertura: no se cotiza automáticamente. Contactá a un vendedor para analizar la viabilidad del servicio.`;
}
export const AVISO_FUERA_COBERTURA = textoFueraCobertura(MAX_KM);

// Nota visible sobre la moneda de las tarifas.
export const NOTA_CAMBIO =
  'Los importes son en dólares estadounidenses (USD). El equivalente en pesos es informativo y se calcula con el dólar oficial (venta) publicado por el Banco Central de la República Argentina; la factura se emite al tipo de cambio del día de la operación.';

export const fmtUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

const r2 = (n) => Math.round(Number(n) || 0);
const acotar = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);

/* ---------------- Configuración editable ---------------- */

const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const texto = (v, def = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : def);

// Toma una configuración parcial (la que manda el admin o la guardada en la
// base) y devuelve una configuración completa y válida. Lanza Error con el
// motivo cuando algo no cierra, para que la API responda 400 con ese texto.
export function normalizarConfig(parcial = {}) {
  const base = COTIZADOR_VISITA;

  const zonasInput = Array.isArray(parcial.zonas) ? parcial.zonas : base.zonas;
  if (!zonasInput.length) throw new Error('Tiene que haber al menos una franja de traslado');
  const zonas = zonasInput
    .map((z, i) => ({
      id: texto(z?.id, `z${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, ''),
      nombre: texto(z?.nombre, `Franja ${i + 1}`),
      hastaKm: Math.max(1, Math.round(num(z?.hastaKm, 0))),
      base: Math.max(0, r2(z?.base)),
      cubreKm: Math.max(0, Math.round(num(z?.cubreKm, 0))),
      kmAdicional: Math.max(0, num(z?.kmAdicional, 0)),
    }))
    .sort((a, b) => a.hastaKm - b.hastaKm);

  if (zonas.length > 10) throw new Error('Como máximo 10 franjas de traslado');
  let anterior = 0;
  for (const z of zonas) {
    if (z.hastaKm <= anterior) throw new Error(`La franja "${z.nombre}" no avanza respecto de la anterior (revisá los km)`);
    z.desdeKm = anterior;
    z.cubreKm = z.cubreKm > 0 ? z.cubreKm : z.hastaKm;
    if (z.cubreKm < z.desdeKm || z.cubreKm > z.hastaKm) {
      throw new Error(`En "${z.nombre}" los km cubiertos por la base (${z.cubreKm}) deben estar entre ${z.desdeKm} y ${z.hastaKm}`);
    }
    anterior = z.hastaKm;
  }
  const maxKm = anterior;

  const tiposInput = Array.isArray(parcial.tipos) ? parcial.tipos : base.tipos;
  if (!tiposInput.length) throw new Error('Tiene que haber al menos un tipo de batería');
  const tipos = tiposInput
    .slice(0, 20)
    .map((t, i) => {
      const nombre = texto(t?.nombre, `Tipo ${i + 1}`);
      return { id: texto(t?.id, slugify(nombre) || `tipo-${i + 1}`), nombre, precioUnidad: Math.max(0, r2(t?.precioUnidad)) };
    });

  const descuentos = (Array.isArray(parcial.descuentos) ? parcial.descuentos : base.descuentos)
    .slice(0, 10)
    .map((d) => ({ desde: Math.max(1, Math.round(num(d?.desde, 0))), pct: Math.min(Math.max(num(d?.pct, 0), 0), 1) }))
    .sort((a, b) => b.desde - a.desde);

  const extras = (Array.isArray(parcial.extras) ? parcial.extras : base.extras)
    .slice(0, 20)
    .map((e, i) => {
      const nombre = texto(e?.nombre, `Extra ${i + 1}`);
      return { id: texto(e?.id, slugify(nombre) || `extra-${i + 1}`), nombre, precio: Math.max(0, r2(e?.precio)), porEquipo: Boolean(e?.porEquipo) };
    });

  const iva = num(parcial.iva, base.iva);
  if (iva < 0 || iva > 1) throw new Error('El IVA debe estar entre 0 y 100%');

  const urgencia = {
    normal: acotar(parcial.urgencia?.normal ?? base.urgencia.normal, 0, 5),
    express: acotar(parcial.urgencia?.express ?? base.urgencia.express, 0, 5),
  };
  const turno = {
    comercial: acotar(parcial.turno?.comercial ?? base.turno.comercial, 0, 5),
    finde: acotar(parcial.turno?.finde ?? base.turno.finde, 0, 5),
  };

  const v = parcial.viaticos || {};
  const desdeKmViaticos = Math.max(0, Math.round(num(v.desdeKm, base.viaticos.desdeKm)));
  if (desdeKmViaticos > maxKm) throw new Error('Los viáticos no pueden empezar más allá de la cobertura máxima');
  const viaticos = {
    desdeKm: desdeKmViaticos,
    porDia: Math.max(0, r2(v.porDia ?? base.viaticos.porDia)),
    diaCadaKm: Math.max(1, Math.round(num(v.diaCadaKm, base.viaticos.diaCadaKm))),
    maxDias: Math.max(1, Math.min(30, Math.round(num(v.maxDias, base.viaticos.maxDias)))),
  };

  const mt = parcial.modoTaller || {};
  const modoTaller = {
    habilitado: Boolean(mt.habilitado ?? base.modoTaller.habilitado),
    descuentoRevisionPct: acotar(mt.descuentoRevisionPct ?? base.modoTaller.descuentoRevisionPct, 0, 1),
  };

  const co = parcial.costos || {};
  const costos = {
    porKm: Math.max(0, num(co.porKm, base.costos.porKm)),
    tecnicoPorDia: Math.max(0, r2(co.tecnicoPorDia ?? base.costos.tecnicoPorDia)),
    viaticoPorDia: Math.max(0, r2(co.viaticoPorDia ?? base.costos.viaticoPorDia)),
  };

  return {
    moneda: texto(parcial.moneda, base.moneda).toUpperCase().slice(0, 8),
    iva,
    vigenciaDias: Math.max(1, Math.min(365, Math.round(num(parcial.vigenciaDias, base.vigenciaDias)))),
    zonas,
    maxKm,
    tipos,
    descuentos,
    extras,
    viaticos,
    modoTaller,
    costos,
    urgencia,
    turno,
    maxUnidadesPorRenglon: Math.max(1, Math.min(10000, Math.round(num(parcial.maxUnidadesPorRenglon, base.maxUnidadesPorRenglon)))),
    maxRenglones: Math.max(1, Math.min(50, Math.round(num(parcial.maxRenglones, base.maxRenglones)))),
    maxCantidadExtra: Math.max(1, Math.min(10000, Math.round(num(parcial.maxCantidadExtra, base.maxCantidadExtra)))),
  };
}

// Config "de fábrica" ya normalizada (se usa como fallback si la base falla).
export const CONFIG_DEFAULT = normalizarConfig(COTIZADOR_VISITA);

/* ---------------- Cálculo ---------------- */

// Zona que corresponde a una distancia, o null si está fuera de cobertura.
export function zonaParaKm(km, config = CONFIG_DEFAULT) {
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0) return config.zonas[0];
  if (n > config.maxKm) return null;
  return config.zonas.find((z) => n <= z.hastaKm) || config.zonas[0];
}

function descuentoPct(unidades, config) {
  // Orden explícito: no depende de cómo esté cargado el array de tramos.
  const tramo = [...config.descuentos].sort((a, b) => b.desde - a.desde).find((d) => unidades >= d.desde);
  return tramo ? tramo.pct : 0;
}

// Normaliza los renglones de baterías (tipo válido y cantidad acotada).
export function normalizarRenglones(renglones = [], config = CONFIG_DEFAULT) {
  const porId = Object.fromEntries(config.tipos.map((t) => [t.id, t]));
  return (Array.isArray(renglones) ? renglones : [])
    .map((r) => {
      const tipo = porId[r?.tipoId];
      const cantidad = r2(acotar(r?.cantidad, 0, config.maxUnidadesPorRenglon));
      return tipo && cantidad > 0 ? { tipo, cantidad } : null;
    })
    .filter(Boolean)
    .slice(0, config.maxRenglones);
}

// Normaliza los extras seleccionados. Acepta ids sueltos u objetos
// { id, cantidad }; la cantidad por defecto depende de `porEquipo`.
export function normalizarExtras(extrasSel = [], unidadesSugeridas = 0, config = CONFIG_DEFAULT) {
  const porId = Object.fromEntries(config.extras.map((e) => [e.id, e]));
  return (Array.isArray(extrasSel) ? extrasSel : [])
    .slice(0, config.extras.length)
    .map((x) => {
      const id = typeof x === 'string' ? x : x?.id;
      const def = porId[id];
      if (!def) return null;
      const sugerida = def.porEquipo ? Math.max(1, unidadesSugeridas) : 1;
      const pedida = typeof x === 'object' && x?.cantidad != null
        ? r2(acotar(x.cantidad, 1, config.maxCantidadExtra))
        : sugerida;
      return { ...def, cantidad: pedida, subtotal: r2(def.precio * pedida) };
    })
    .filter(Boolean);
}

// entrada: { km, renglones, extrasSel, urgencia, turno, dolar?, config? }
// config: configuración ya normalizada (por defecto, la de fábrica).
export function calcularVisita({
  km = 0, renglones = [], extrasSel = [], urgencia = 'normal', turno = 'comercial',
  modo = 'sitio', dolar = null, config = CONFIG_DEFAULT,
} = {}) {
  const kmNum = Number(km) || 0;
  const esTaller = modo === 'taller' && config.modoTaller.habilitado;
  const zona = esTaller ? null : zonaParaKm(kmNum, config);
  const fueraDeZona = !esTaller && zona === null;

  const renglonesValidos = normalizarRenglones(renglones, config);
  const totalUnidades = renglonesValidos.reduce((s, r) => s + r.cantidad, 0);
  const detalle = renglonesValidos.map((r) => ({ ...r, subtotal: r2(r.cantidad * r.tipo.precioUnidad) }));

  const detExtras = normalizarExtras(extrasSel, totalUnidades, config);
  const extras = r2(detExtras.reduce((s, e) => s + e.subtotal, 0));

  // En taller el cliente trae la batería: se bonifica la revisión (no hay viaje).
  const revisionBruta = r2(detalle.reduce((s, d) => s + d.subtotal, 0));
  const descuentoTaller = esTaller ? r2(revisionBruta * config.modoTaller.descuentoRevisionPct) : 0;
  const revision = revisionBruta - descuentoTaller;
  const descPct = descuentoPct(totalUnidades, config);
  const descuentoVol = r2(revision * descPct);

  // Traslado (solo en visita al sitio): base de la franja + km que la exceden.
  const cubreKm = zona ? zona.cubreKm : 0;
  const kmExcedente = zona ? Math.max(0, kmNum - cubreKm) : 0;
  const traslado = !esTaller && kmNum > 0 && zona ? r2(zona.base + kmExcedente * zona.kmAdicional) : 0;

  // Viáticos: a partir de `desdeKm`, un día de viaje y uno más cada `diaCadaKm`.
  const viaticosActivos = !esTaller && !fueraDeZona && config.viaticos.porDia > 0 && kmNum >= config.viaticos.desdeKm;
  const viaticosDias = viaticosActivos
    ? Math.min(config.viaticos.maxDias, 1 + Math.floor((kmNum - config.viaticos.desdeKm) / config.viaticos.diaCadaKm))
    : 0;
  const viaticos = r2(viaticosDias * config.viaticos.porDia);

  const subtotal = r2(traslado + viaticos + revision - descuentoVol + extras);
  const recargoPct = (config.urgencia[urgencia] ?? 0) + (config.turno[turno] ?? 0);
  const recargo = r2(subtotal * recargoPct);
  const iva = r2((subtotal + recargo) * config.iva);
  const total = fueraDeZona ? null : r2(subtotal + recargo + iva);

  // Equivalente informativo en pesos (no interviene en el cálculo en USD).
  const ars = !fueraDeZona && dolar?.venta ? r2(total * dolar.venta) : null;

  // Costos internos (solo para el análisis del admin: nunca se muestran al
  // cliente). El km ya contempla ida y vuelta, así que no se multiplica.
  const diasTecnico = esTaller ? 1 : 1 + viaticosDias;
  const costoViaje = esTaller ? 0 : r2(kmNum * config.costos.porKm);
  const costoDias = r2(diasTecnico * config.costos.tecnicoPorDia);
  const costoViaticos = r2(viaticosDias * config.costos.viaticoPorDia);
  const costoInterno = r2(costoViaje + costoDias + costoViaticos);
  const margen = fueraDeZona ? null : r2(subtotal - costoInterno);
  const margenPct = fueraDeZona || !subtotal ? null : Math.round((margen / subtotal) * 100);

  const avisos = [];
  if (fueraDeZona) avisos.push({ id: 'fuera_cobertura', texto: textoFueraCobertura(config.maxKm) });
  else if (!esTaller && kmNum > 100) avisos.push({ id: 'larga_distancia', texto: AVISO_LARGA_DISTANCIA });
  if (detExtras.length) avisos.push({ id: 'extras', texto: AVISO_EXTRAS });

  const etiquetaUrgencia = urgencia === 'express' ? `Express 48 h (+${Math.round(config.urgencia.express * 100)}%)` : 'Normal';
  const etiquetaTurno = turno === 'finde' ? `Fin de semana (+${Math.round(config.turno.finde * 100)}%)` : 'Horario comercial';

  const filas = [];
  if (fueraDeZona) {
    filas.push(`Distancia declarada: ${kmNum} km (fuera de la cobertura de ${config.maxKm} km)`);
    filas.push(textoFueraCobertura(config.maxKm));
  } else {
    filas.push(esTaller
      ? `Modalidad: revisión en nuestro taller (el cliente trae la batería, sin traslado)${descuentoTaller > 0 ? ` · bonificación ${Math.round(config.modoTaller.descuentoRevisionPct * 100)}% sobre la revisión` : ''}`
      : 'Modalidad: visita técnica en el sitio del cliente');
    if (!esTaller) {
      filas.push(`Distancia: ${kmNum} km · ${zona.nombre} · traslado ${fmtUSD.format(traslado)}`);
      if (kmExcedente > 0) filas.push(`  (${zona.base} base hasta ${zona.cubreKm} km + ${kmExcedente} km × ${zona.kmAdicional})`);
      if (viaticos > 0) {
        filas.push(`Viáticos: ${viaticosDias} día(s) × ${fmtUSD.format(config.viaticos.porDia)} = ${fmtUSD.format(viaticos)} (desde ${config.viaticos.desdeKm} km)`);
      }
    }
    if (detalle.length) {
      filas.push(`Baterías a revisar (${totalUnidades} unidad/es): ${fmtUSD.format(revision)}`);
      for (const d of detalle) {
        filas.push(`  · ${d.tipo.nombre} × ${d.cantidad} = ${fmtUSD.format(d.subtotal)} (${fmtUSD.format(d.tipo.precioUnidad)} c/u)`);
      }
    } else {
      filas.push(esTaller ? 'Baterías a revisar: sin unidades cargadas' : 'Baterías a revisar: sin unidades cargadas (solo traslado)');
    }
    if (descuentoTaller > 0) filas.push(`Bonificación por traer la batería al taller (−${Math.round(config.modoTaller.descuentoRevisionPct * 100)}%): −${fmtUSD.format(descuentoTaller)}`);
    if (descuentoVol > 0) filas.push(`Descuento por volumen (−${Math.round(descPct * 100)}%): −${fmtUSD.format(descuentoVol)}`);
    if (detExtras.length) {
      filas.push('Servicios adicionales (sujetos a análisis comercial):');
      for (const e of detExtras) filas.push(`  · ${e.nombre} × ${e.cantidad} = ${fmtUSD.format(e.subtotal)}`);
    }
    filas.push(`Urgencia: ${etiquetaUrgencia} · Turno: ${etiquetaTurno}`);
    if (recargo > 0) filas.push(`Recargos (+${Math.round(recargoPct * 100)}%): ${fmtUSD.format(recargo)}`);
    filas.push(`Subtotal: ${fmtUSD.format(subtotal)} · IVA ${Math.round(config.iva * 100)}%: ${fmtUSD.format(iva)}`);
    filas.push(`TOTAL ESTIMADO: ${fmtUSD.format(total)}`);
    if (ars) {
      const cuando = dolar.actualizado
        ? new Date(dolar.actualizado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      filas.push(`Equivalente informativo: ${fmtARS.format(ars)} (dólar ${dolar.casa || 'oficial'} venta ${fmtARS.format(dolar.venta)}${cuando ? ` · ${cuando}` : ''}${dolar.fuente ? ` · ${dolar.fuente}` : ''})`);
    }
    filas.push(`Vigencia de la estimación: ${config.vigenciaDias} días.`);
    filas.push(esTaller
      ? 'El importe es solo por el servicio de revisión y diagnóstico en nuestro taller. No incluye reparación, repuestos ni recambio de celdas.'
      : 'El importe es solo por el servicio de revisión y diagnóstico en el sitio del cliente. No incluye reparación, repuestos ni recambio de celdas.');
  }

  const resumen = filas.join('\n');
  const resumenCorto = fueraDeZona
    ? `Visita técnica a ${kmNum} km (fuera de cobertura): requiere análisis de un vendedor.`
    : `${esTaller ? 'Revisión en taller' : `Visita técnica a ${kmNum} km`} · ${totalUnidades} unidad(es)${detExtras.length ? ` + ${detExtras.length} extra(s)` : ''} · ${etiquetaUrgencia}/${etiquetaTurno} · TOTAL ESTIMADO ${fmtUSD.format(total)}${ars ? ` (≈ ${fmtARS.format(ars)})` : ''}`;

  return {
    ok: !fueraDeZona,
    fueraDeZona,
    modo: esTaller ? 'taller' : 'sitio',
    zona,
    cubreKm,
    kmExcedente,
    traslado,
    viaticos,
    viaticosDias,
    revision,
    revisionBruta,
    descuentoTaller,
    totalUnidades,
    detalle,
    descPct,
    descuentoVol,
    extras,
    detExtras,
    subtotal,
    recargo,
    recargoPct,
    iva,
    total,
    ars,
    moneda: config.moneda,
    urgencia,
    turno,
    // Análisis interno (el frontend público no lo muestra).
    costoInterno,
    costoViaje,
    costoDias,
    costoViaticos,
    diasTecnico,
    margen,
    margenPct,
    avisos,
    resumen,
    resumenCorto,
  };
}
