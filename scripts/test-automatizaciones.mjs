// Tests de las automatizaciones de seguimiento. Sin base ni red:  npm test
import assert from 'node:assert/strict';
import {
  AUTOMATIZACIONES, CLAVES_AUTOMATIZACION, AUTOMATIZACIONES_DEFAULT,
  normalizarDias, normalizarAutomatizaciones, diasEsperando,
  debeSeguirPresupuesto, debePedirRetiro, tituloSeguimiento, tituloRetiro,
} from '../src/data/automatizaciones.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

const AHORA = Date.parse('2026-10-23T12:00:00Z');
const haceDias = (d) => new Date(AHORA - d * 86400000).toISOString();

console.log('\nAutomatizaciones de seguimiento');

test('el catálogo tiene claves estables y umbrales válidos', () => {
  assert.deepEqual(CLAVES_AUTOMATIZACION, ['seguimiento_presupuesto', 'retiro_pendiente']);
  for (const a of AUTOMATIZACIONES) {
    assert.ok(a.etiqueta && a.detalle, `la regla ${a.clave} está completa`);
    assert.ok(a.dias >= a.minDias && a.dias <= a.maxDias);
  }
  assert.deepEqual(AUTOMATIZACIONES_DEFAULT.seguimiento_presupuesto, { activo: true, dias: 2 });
});

test('los días se recortan a un rango razonable', () => {
  assert.equal(normalizarDias(5), 5);
  assert.equal(normalizarDias('7'), 7);
  assert.equal(normalizarDias(0), 1);
  assert.equal(normalizarDias(99), 30);
  assert.equal(normalizarDias('abc', 4), 4);
  assert.equal(normalizarDias(3.7), 4);
});

test('una configuración rota cae en los valores por defecto', () => {
  const n = normalizarAutomatizaciones({ seguimiento_presupuesto: { activo: false, dias: 5 }, basura: true });
  assert.deepEqual(n.seguimiento_presupuesto, { activo: false, dias: 5 });
  assert.deepEqual(n.retiro_pendiente, { activo: true, dias: 3 });
  assert.equal(n.basura, undefined, 'no se cuelan claves desconocidas');
  assert.deepEqual(normalizarAutomatizaciones(null), AUTOMATIZACIONES_DEFAULT);
  assert.deepEqual(normalizarAutomatizaciones('roto'), AUTOMATIZACIONES_DEFAULT);
});

test('cuenta los días completos esperando', () => {
  assert.equal(diasEsperando(haceDias(2.9), AHORA), 2);
  assert.equal(diasEsperando(haceDias(0.5), AHORA), 0);
  assert.equal(diasEsperando(null, AHORA), null);
  assert.equal(diasEsperando('no es fecha', AHORA), null);
});

test('presupuesto sin respuesta: solo oportunidades abiertas y vencidas', () => {
  const base = { etapa: 'presupuestado', ultimaFecha: haceDias(3), enBaja: false, tareaAbierta: false };
  assert.equal(debeSeguirPresupuesto(base, { dias: 2, ahora: AHORA }), true);
  assert.equal(debeSeguirPresupuesto({ ...base, etapa: 'negociando' }, { dias: 2, ahora: AHORA }), true);
  assert.equal(debeSeguirPresupuesto({ ...base, etapa: 'ganado' }, { dias: 2, ahora: AHORA }), false);
  assert.equal(debeSeguirPresupuesto({ ...base, etapa: 'perdido' }, { dias: 2, ahora: AHORA }), false);
  assert.equal(debeSeguirPresupuesto({ ...base, ultimaFecha: haceDias(1) }, { dias: 2, ahora: AHORA }), false);
  assert.equal(debeSeguirPresupuesto({ ...base, tareaAbierta: true }, { dias: 2, ahora: AHORA }), false);
  assert.equal(debeSeguirPresupuesto({ ...base, enBaja: true }, { dias: 2, ahora: AHORA }), false);
  assert.equal(debeSeguirPresupuesto({ ...base, ultimaFecha: null }, { dias: 2, ahora: AHORA }), false);
});

test('retiro pendiente: solo órdenes listas y vencidas', () => {
  const base = { estado: 'ready', horaEntrega: haceDias(4), fechaIngreso: haceDias(10), tareaAbierta: false };
  assert.equal(debePedirRetiro(base, { dias: 3, ahora: AHORA }), true);
  assert.equal(debePedirRetiro({ ...base, estado: 'testing' }, { dias: 3, ahora: AHORA }), false);
  assert.equal(debePedirRetiro({ ...base, horaEntrega: haceDias(1) }, { dias: 3, ahora: AHORA }), false);
  assert.equal(debePedirRetiro({ ...base, horaEntrega: null, fechaIngreso: haceDias(5) }, { dias: 3, ahora: AHORA }), true);
  assert.equal(debePedirRetiro({ ...base, tareaAbierta: true }, { dias: 3, ahora: AHORA }), false);
  assert.equal(debePedirRetiro({ ...base, horaEntrega: null, fechaIngreso: null }, { dias: 3, ahora: AHORA }), false);
});

test('los títulos de las tareas son claros', () => {
  assert.equal(tituloSeguimiento('Ana Pérez'), 'Seguir presupuesto de Ana Pérez');
  assert.equal(tituloSeguimiento(''), 'Seguir presupuesto de la oportunidad');
  assert.equal(tituloRetiro('Ana', 'BAT-1'), 'Avisar que la batería está lista: Ana (BAT-1)');
  assert.equal(tituloRetiro('', ''), 'Avisar que la batería está lista: el cliente');
});

if (!process.exitCode) console.log(`\n${pasaron} pruebas de automatizaciones OK`);
