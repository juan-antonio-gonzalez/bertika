// Tests del embudo comercial (CRM). Sin base de datos:  npm test
import assert from 'node:assert/strict';
import {
  ETAPAS, ETAPA_DEFAULT, ETAPAS_ABIERTAS, normalizarEtapa, normalizarMonto, resumenEmbudo, agruparEmbudo,
  TIPOS_CLIENTE, normalizarTipoCliente, CAMPOS_COMERCIALES, camposComercialesCargados, CANALES_ORIGEN, MOTIVOS_PERDIDA,
  faltaMotivoPerdida, FLUJO, calcularMetricas, formatearDuracion, formatearTasa,
  ESTADOS_TAREA, normalizarEstadoTarea, tareaVencida, ordenarTareas, contarTareasPendientes,
} from '../api/crm.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nEmbudo comercial');

test('las etapas están en orden y arrancan en nuevo', () => {
  assert.deepEqual(ETAPAS.map((e) => e.key), ['nuevo', 'presupuestado', 'negociando', 'ganado', 'perdido']);
  assert.equal(ETAPA_DEFAULT, 'nuevo');
  assert.deepEqual(ETAPAS_ABIERTAS, ['nuevo', 'presupuestado', 'negociando']);
  assert.equal(ETAPAS.every((e) => e.label && e.detalle), true);
});

test('una etapa rara cae en nuevo (no rompe el tablero)', () => {
  assert.equal(normalizarEtapa('presupuestado'), 'presupuestado');
  assert.equal(normalizarEtapa('  GANADO '), 'ganado');
  assert.equal(normalizarEtapa('cualquiera'), 'nuevo');
  assert.equal(normalizarEtapa(''), 'nuevo');
  assert.equal(normalizarEtapa(null), 'nuevo');
  assert.equal(normalizarEtapa(undefined), 'nuevo');
});

test('el monto estimado se limpia y queda en null si no sirve', () => {
  assert.equal(normalizarMonto(15000), 15000);
  assert.equal(normalizarMonto('15000'), 15000);
  assert.equal(normalizarMonto('$ 15.000'), 15000);
  assert.equal(normalizarMonto('15.000,50'), 15000.5);
  assert.equal(normalizarMonto('1.234.567'), 1234567);
  assert.equal(normalizarMonto(1234.567), 1234.57);
  assert.equal(normalizarMonto(''), null);
  assert.equal(normalizarMonto(null), null);
  assert.equal(normalizarMonto('abc'), null);
  assert.equal(normalizarMonto(-50), null);
  assert.equal(normalizarMonto(1e12), 1e9, 'se limita el monto máximo');
});

test('el resumen suma cantidades y montos por etapa', () => {
  const convs = [
    { etapa: 'nuevo', monto_estimado: 1000 },
    { etapa: 'nuevo', monto_estimado: null },
    { etapa: 'presupuestado', monto_estimado: '2500' },
    { etapa: 'negociando', monto_estimado: 500 },
    { etapa: 'ganado', monto_estimado: 8000 },
    { etapa: 'perdido', monto_estimado: 300 },
    { etapa: 'etapa-inventada', monto_estimado: 100 },
  ];
  const r = resumenEmbudo(convs);
  assert.deepEqual(r.porEtapa.nuevo, { cantidad: 3, monto: 1100 }, 'la etapa inválida cuenta como nuevo');
  assert.deepEqual(r.porEtapa.presupuestado, { cantidad: 1, monto: 2500 });
  assert.deepEqual(r.porEtapa.ganado, { cantidad: 1, monto: 8000 });
  assert.deepEqual(r.abiertos, { cantidad: 5, monto: 4100 }, 'abiertos = nuevo + presupuestado + negociando');
  assert.equal(r.ganado.monto, 8000);
  assert.equal(r.perdido.cantidad, 1);
});

test('sin conversaciones el resumen queda en cero (no rompe)', () => {
  const r = resumenEmbudo(null);
  assert.equal(r.abiertos.cantidad, 0);
  assert.equal(r.abiertos.monto, 0);
  assert.equal(r.ganado.cantidad, 0);
  assert.equal(agruparEmbudo(undefined).length, ETAPAS.length);
});

test('agrupar arma una columna por etapa', () => {
  const cols = agruparEmbudo([
    { id: 'a', etapa: 'ganado' },
    { id: 'b', etapa: 'nuevo' },
    { id: 'c', etapa: 'nuevo' },
  ]);
  assert.equal(cols.length, 5);
  assert.deepEqual(cols[0].conversaciones.map((c) => c.id), ['b', 'c']);
  assert.deepEqual(cols[3].conversaciones.map((c) => c.id), ['a']);
  assert.deepEqual(cols[1].conversaciones, []);
});

test('el tipo de cliente se valida contra la lista (particular por defecto)', () => {
  assert.deepEqual(TIPOS_CLIENTE.map((t) => t.key), ['particular', 'flotilla_corporativa']);
  assert.equal(normalizarTipoCliente('flotilla_corporativa'), 'flotilla_corporativa');
  assert.equal(normalizarTipoCliente('  FLOTILLA_CORPORATIVA '), 'flotilla_corporativa');
  assert.equal(normalizarTipoCliente('particular'), 'particular');
  assert.equal(normalizarTipoCliente('mayorista'), 'particular', 'un tipo desconocido no rompe la ficha');
  assert.equal(normalizarTipoCliente(''), 'particular');
  assert.equal(normalizarTipoCliente(null), 'particular');
});

console.log('\nDatos comerciales del cliente');

test('los campos comerciales son los seis de la ficha', () => {
  assert.deepEqual(CAMPOS_COMERCIALES.map((c) => c.key), ['direccion', 'localidad', 'cuit', 'condicion_pago', 'canal_origen', 'vendedor']);
  assert.equal(CAMPOS_COMERCIALES.every((c) => c.label && c.max > 0), true);
  assert.equal(CANALES_ORIGEN.length >= 5, true);
  assert.equal(CANALES_ORIGEN.includes('Recomendación'), true);
});

test('la ficha solo muestra los campos comerciales cargados (y sin espacios de más)', () => {
  const llenos = camposComercialesCargados({ direccion: '  Av. Siempreviva 742 ', localidad: '', cuit: null, vendedor: 'Ana' });
  assert.deepEqual(llenos.map((c) => c.key), ['direccion', 'vendedor']);
  assert.equal(llenos[0].valor, 'Av. Siempreviva 742');
  assert.deepEqual(camposComercialesCargados({}), []);
  assert.deepEqual(camposComercialesCargados(null), []);
});

console.log('\nMotivo de pérdida');

test('marcar como perdido exige motivo', () => {
  assert.equal(faltaMotivoPerdida('perdido', ''), true);
  assert.equal(faltaMotivoPerdida('perdido', '   '), true);
  assert.equal(faltaMotivoPerdida('perdido', undefined), true);
  assert.equal(faltaMotivoPerdida('perdido', 'Precio'), false);
  assert.equal(faltaMotivoPerdida('ganado', ''), false, 'solo se exige al perder');
  assert.equal(MOTIVOS_PERDIDA.includes('Precio'), true);
});

console.log('\nMétricas del embudo');

const CONVS = [
  { id: 'c1', etapa: 'ganado', monto_estimado: 3000, ultima_fecha: '2026-09-01T00:00:00.000Z' },
  { id: 'c2', etapa: 'perdido', monto_estimado: 500, ultima_fecha: '2026-09-01T00:00:00.000Z' },
  { id: 'c3', etapa: 'nuevo', monto_estimado: null, ultima_fecha: '2026-09-10T00:00:00.000Z' },
  { id: 'c4', etapa: 'presupuestado', monto_estimado: 800, ultima_fecha: '2026-09-08T00:00:00.000Z' },
];
const HIST = [
  { conversacion_id: 'c1', anterior: 'nuevo', nueva: 'presupuestado', monto: 1000, fecha: '2026-09-02T00:00:00.000Z' },
  { conversacion_id: 'c1', anterior: 'presupuestado', nueva: 'ganado', monto: 3000, fecha: '2026-09-05T00:00:00.000Z' },
  { conversacion_id: 'c2', anterior: 'nuevo', nueva: 'perdido', monto: 500, motivo: 'Precio', fecha: '2026-09-04T00:00:00.000Z' },
  { conversacion_id: 'c4', anterior: 'nuevo', nueva: 'presupuestado', monto: 800, fecha: '2026-09-09T00:00:00.000Z' },
];
const AHORA = Date.parse('2026-09-20T00:00:00.000Z');
const PRIMERAS = { c1: '2026-09-01T00:00:00.000Z', c2: '2026-09-01T00:00:00.000Z', c3: '2026-09-10T00:00:00.000Z', c4: '2026-09-08T00:00:00.000Z' };

test('cuenta cuántas oportunidades llegaron a cada etapa', () => {
  const m = calcularMetricas({ conversaciones: CONVS, historial: HIST, primeras: PRIMERAS, ahora: AHORA });
  assert.equal(m.total, 4);
  assert.deepEqual(m.embudo.map((e) => e.etapa), FLUJO);
  const por = Object.fromEntries(m.embudo.map((e) => [e.etapa, e.cantidad]));
  assert.deepEqual(por, { nuevo: 4, presupuestado: 2, negociando: 0, ganado: 1 });
  const ganado = m.embudo.find((e) => e.etapa === 'ganado');
  assert.equal(ganado.tasaDelTotal, 0.25);
  assert.equal(ganado.tasaDeAnterior, 0.5, 'de los 2 presupuestados, 1 se ganó');
});

test('la tasa de cierre es ganado / (ganado + perdido)', () => {
  const m = calcularMetricas({ conversaciones: CONVS, historial: HIST, primeras: PRIMERAS, ahora: AHORA });
  assert.equal(m.tasaCierre, 0.5);
  assert.equal(m.ganado.cantidad, 1);
  assert.equal(m.perdido.cantidad, 1);
  assert.equal(calcularMetricas({ conversaciones: [], ahora: AHORA }).tasaCierre, null, 'sin cerradas no se inventa un porcentaje');
});

test('no cuenta dos veces la misma etapa de la misma conversación', () => {
  const idaYVuelta = [
    ...HIST,
    { conversacion_id: 'c1', anterior: 'ganado', nueva: 'presupuestado', monto: 3000, fecha: '2026-09-06T00:00:00.000Z' },
  ];
  const m = calcularMetricas({ conversaciones: CONVS, historial: idaYVuelta, primeras: PRIMERAS, ahora: AHORA });
  assert.equal(m.embudo.find((e) => e.etapa === 'presupuestado').cantidad, 2, 'sigue siendo 2: c1 y c4');
});

test('junta los motivos de pérdida del historial', () => {
  const historial = [
    ...HIST,
    { conversacion_id: 'c9', anterior: 'nuevo', nueva: 'perdido', monto: 100, motivo: 'precio', fecha: '2026-09-07T00:00:00.000Z' },
    { conversacion_id: 'c8', anterior: 'nuevo', nueva: 'perdido', monto: 50, motivo: 'No contestó más', fecha: '2026-09-07T00:00:00.000Z' },
  ];
  const m = calcularMetricas({ conversaciones: CONVS, historial, primeras: PRIMERAS, ahora: AHORA });
  assert.equal(m.motivos.length, 2);
  assert.equal(m.motivos[0].motivo, 'Precio', 'el primero es el más frecuente (sin distinguir mayúsculas)');
  assert.equal(m.motivos[0].cantidad, 2);
  assert.equal(m.motivos[0].monto, 600);
});

test('calcula el tiempo medio en cada etapa', () => {
  const m = calcularMetricas({ conversaciones: CONVS, historial: HIST, primeras: PRIMERAS, ahora: AHORA });
  assert.equal(m.tiempoPorEtapa.nuevo.muestras, 4);
  assert.equal(Math.round(m.tiempoPorEtapa.nuevo.promedioMs / 86400000), 4, '3,75 días en promedio en Nuevo');
  assert.equal(m.tiempoPorEtapa.presupuestado.muestras, 2);
  assert.equal(Math.round(m.tiempoPorEtapa.presupuestado.promedioMs / 86400000), 7);
  assert.equal(m.tiempoPorEtapa.ganado.muestras, 1);
  assert.equal(m.tiempoPorEtapa.negociando.promedioMs, null, 'sin datos no se inventa un promedio');
});

test('con datos raros no rompe ni devuelve NaN', () => {
  const m = calcularMetricas({
    conversaciones: [{ id: 'x', etapa: 'cualquiera', monto_estimado: 'no es un monto' }, null],
    historial: [{ conversacion_id: 'x', nueva: null, fecha: 'no es fecha' }, {}],
    primeras: {},
    ahora: AHORA,
  });
  assert.equal(m.total, 2);
  assert.equal(m.embudo[0].cantidad >= 1, true);
  assert.equal(Number.isNaN(m.tasaCierre), false);
  assert.deepEqual(m.motivos, []);
  assert.equal(Object.values(m.tiempoPorEtapa).every((t) => t.promedioMs === null), true);
  assert.equal(calcularMetricas().total, 0);
});

test('los números se muestran legibles', () => {
  assert.equal(formatearTasa(0.5), '50 %');
  assert.equal(formatearTasa(0), '0 %');
  assert.equal(formatearTasa(null), '—');
  assert.equal(formatearTasa(undefined), '—');
  assert.equal(formatearDuracion(45 * 60000), '45 min');
  assert.equal(formatearDuracion(3 * 3600000 + 20 * 60000), '3 h 20 min');
  assert.equal(formatearDuracion(53 * 3600000), '2 d 5 h');
  assert.equal(formatearDuracion(null), '—');
  assert.equal(formatearDuracion(-5), '—');
});

console.log('\nTareas del CRM');

test('el estado de la tarea se valida (pendiente por defecto)', () => {
  assert.deepEqual(ESTADOS_TAREA.map((e) => e.key), ['pendiente', 'cerrada']);
  assert.equal(normalizarEstadoTarea('cerrada'), 'cerrada');
  assert.equal(normalizarEstadoTarea('  CERRADA '), 'cerrada');
  assert.equal(normalizarEstadoTarea('cualquiera'), 'pendiente');
  assert.equal(normalizarEstadoTarea(null), 'pendiente');
});

test('una tarea está vencida solo si sigue pendiente y ya pasó la fecha', () => {
  assert.equal(tareaVencida({ estado: 'pendiente', vence: '2026-09-01T00:00:00.000Z' }, AHORA), true);
  assert.equal(tareaVencida({ estado: 'pendiente', vence: '2026-09-25T00:00:00.000Z' }, AHORA), false);
  assert.equal(tareaVencida({ estado: 'cerrada', vence: '2026-09-01T00:00:00.000Z' }, AHORA), false);
  assert.equal(tareaVencida({ estado: 'pendiente', vence: null }, AHORA), false);
  assert.equal(tareaVencida({ estado: 'pendiente', vence: 'no es fecha' }, AHORA), false);
});

test('las tareas se ordenan por vencimiento y las sin fecha van al final', () => {
  const orden = ordenarTareas([
    { id: 'sin-fecha', vence: null },
    { id: 'despues', vence: '2026-10-01T00:00:00.000Z' },
    { id: 'antes', vence: '2026-09-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(orden.map((t) => t.id), ['antes', 'despues', 'sin-fecha']);
});

test('cuenta las pendientes (y las de una persona)', () => {
  const tareas = [
    { estado: 'pendiente', asignado_a: 'ana@bertika.com' },
    { estado: 'pendiente', asignado_a: 'leo@bertika.com' },
    { estado: 'cerrada', asignado_a: 'ana@bertika.com' },
    { estado: 'pendiente', asignado_a: null },
  ];
  assert.equal(contarTareasPendientes(tareas), 3);
  assert.equal(contarTareasPendientes(tareas, { soloDe: 'ana@bertika.com' }), 1);
  assert.equal(contarTareasPendientes(null), 0);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
