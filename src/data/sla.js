// Bertika - SLA de atención de WhatsApp. FUENTE UNICA.
//
// Mide lo que duele cuando hay varias personas contestando:
//   - ¿cuánto tarda la primera respuesta?
//   - ¿qué conversaciones quedaron sin responder y hace cuánto?
//   - ¿cómo viene cada responsable?
//
// El cálculo vive acá (sin base) para poder probarlo y para que la pantalla y
// la API no midan distinto.

const aMs = (v) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

// Tiempo desde el primer mensaje del cliente hasta la primera respuesta nuestra.
export function primeraRespuestaMs({ primeraEntrada, primeraSalida } = {}) {
  const entrada = aMs(primeraEntrada);
  const salida = aMs(primeraSalida);
  if (entrada === null || salida === null || salida < entrada) return null;
  return salida - entrada;
}

// Una conversación está sin responder si el último mensaje es del cliente
// (o si nunca le contestamos).
export function estaSinResponder({ ultimaEntrada, ultimaSalida } = {}) {
  const entrada = aMs(ultimaEntrada);
  if (entrada === null) return false;
  const salida = aMs(ultimaSalida);
  if (salida === null) return true;
  return entrada > salida;
}

export function minutosSinResponder(fila, ahora = Date.now()) {
  const entrada = aMs(fila?.ultimaEntrada);
  if (entrada === null) return null;
  return Math.max(0, Math.round((ahora - entrada) / 60000));
}

// Percentil simple (0..1). No interpola: devuelve un valor real de la muestra.
export function percentil(valores, p = 0.9) {
  const limpios = (Array.isArray(valores) ? valores : [])
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (!limpios.length) return null;
  const pos = Math.min(limpios.length - 1, Math.max(0, Math.ceil(p * limpios.length) - 1));
  return limpios[pos];
}

const promedio = (valores) => {
  const limpios = (Array.isArray(valores) ? valores : []).filter((v) => Number.isFinite(v));
  if (!limpios.length) return null;
  return Math.round(limpios.reduce((a, b) => a + b, 0) / limpios.length);
};

// Resumen completo. `filas` son conversaciones con primeraEntrada, primeraSalida,
// ultimaEntrada, ultimaSalida, asignado_a y etapa.
export function resumenSla(filas, { ahora = Date.now(), umbralMs = 30 * 60 * 1000 } = {}) {
  const conversaciones = Array.isArray(filas) ? filas : [];
  const medidas = conversaciones.filter((f) => primeraRespuestaMs(f) !== null);
  const tiempos = medidas.map((f) => primeraRespuestaMs(f));
  const enTiempo = tiempos.filter((t) => t <= umbralMs).length;
  const sinResponder = conversaciones
    .filter((f) => estaSinResponder(f))
    .map((f) => ({
      id: f.id,
      telefono: f.telefono,
      nombre: f.nombre || f.nombrePerfil || f.telefono,
      asignado_a: f.asignado_a || null,
      etapa: f.etapa || 'nuevo',
      ultimaEntrada: f.ultimaEntrada,
      minutos: minutosSinResponder(f, ahora),
    }))
    .sort((a, b) => (b.minutos || 0) - (a.minutos || 0));

  const porAgenteMap = new Map();
  for (const f of conversaciones) {
    const agente = f.asignado_a || 'sin_asignar';
    if (!porAgenteMap.has(agente)) {
      porAgenteMap.set(agente, { agente, asignadas: 0, sinResponder: 0, ganadas: 0, tiempos: [] });
    }
    const fila = porAgenteMap.get(agente);
    fila.asignadas += 1;
    if (estaSinResponder(f)) fila.sinResponder += 1;
    if (String(f.etapa || '').toLowerCase() === 'ganado') fila.ganadas += 1;
    const t = primeraRespuestaMs(f);
    if (t !== null) fila.tiempos.push(t);
  }
  const porAgente = [...porAgenteMap.values()]
    .map(({ tiempos: t, ...resto }) => ({ ...resto, primeraRespuestaPromedioMs: promedio(t) }))
    .sort((a, b) => b.asignadas - a.asignadas || a.agente.localeCompare(b.agente));

  return {
    total: conversaciones.length,
    medidas: medidas.length,
    primeraRespuestaPromedioMs: promedio(tiempos),
    primeraRespuestaP90Ms: percentil(tiempos, 0.9),
    respondidasEn30Min: enTiempo,
    pctEn30Min: medidas.length ? Math.round((enTiempo / medidas.length) * 100) : null,
    umbralMinutos: Math.round(umbralMs / 60000),
    sinResponder,
    porAgente,
  };
}
