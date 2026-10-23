// Tests del SLA de atención. Sin base ni red:  npm test
import assert from 'node:assert/strict';
import {
  primeraRespuestaMs, estaSinResponder, minutosSinResponder, percentil, resumenSla,
} from '../src/data/sla.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

const AHORA = Date.parse('2026-10-23T12:00:00Z');
const haceMin = (m) => new Date(AHORA - m * 60000).toISOString();

console.log('\nSLA de atención');

test('la primera respuesta se mide desde el primer mensaje del cliente', () => {
  assert.equal(primeraRespuestaMs({ primeraEntrada: haceMin(60), primeraSalida: haceMin(50) }), 10 * 60000);
  assert.equal(primeraRespuestaMs({ primeraEntrada: haceMin(10), primeraSalida: haceMin(10) }), 0);
  assert.equal(primeraRespuestaMs({ primeraEntrada: haceMin(10) }), null, 'sin respuesta no hay medida');
  // Una salida anterior a la entrada no cuenta (mensaje raro/importado).
  assert.equal(primeraRespuestaMs({ primeraEntrada: haceMin(10), primeraSalida: haceMin(20) }), null);
});

test('sin responder: el último mensaje es del cliente', () => {
  assert.equal(estaSinResponder({ ultimaEntrada: haceMin(120), ultimaSalida: haceMin(180) }), true);
  assert.equal(estaSinResponder({ ultimaEntrada: haceMin(120), ultimaSalida: haceMin(60) }), false);
  assert.equal(estaSinResponder({ ultimaEntrada: haceMin(120) }), true, 'nunca le contestamos');
  assert.equal(estaSinResponder({ ultimaSalida: haceMin(10) }), false, 'sin mensajes del cliente no aplica');
  assert.equal(estaSinResponder({}), false);
});

test('los minutos sin responder se redondean', () => {
  assert.equal(minutosSinResponder({ ultimaEntrada: haceMin(90) }, AHORA), 90);
  assert.equal(minutosSinResponder({ ultimaEntrada: null }, AHORA), null);
});

test('el percentil devuelve un valor real de la muestra', () => {
  assert.equal(percentil([10, 20, 30, 40], 0.9), 40);
  assert.equal(percentil([10, 20, 30, 40], 0.5), 20);
  assert.equal(percentil([], 0.9), null);
  assert.equal(percentil([5], 0.9), 5);
});

test('el resumen calcula promedio, p90, porcentaje en 30 min y sin responder', () => {
  const filas = [
    { id: 'c1', telefono: '1', nombre: 'Ana', asignado_a: 'ana@x.com', etapa: 'ganado', primeraEntrada: haceMin(100), primeraSalida: haceMin(90), ultimaEntrada: haceMin(100), ultimaSalida: haceMin(90) },
    { id: 'c2', telefono: '2', nombre: 'Beto', asignado_a: 'ana@x.com', etapa: 'negociando', primeraEntrada: haceMin(120), primeraSalida: haceMin(75), ultimaEntrada: haceMin(120), ultimaSalida: haceMin(75) },
    { id: 'c3', telefono: '3', nombre: 'Caro', asignado_a: null, etapa: 'presupuestado', primeraEntrada: haceMin(180), ultimaEntrada: haceMin(180) },
    { id: 'c4', telefono: '4', nombre: 'Dani', asignado_a: 'beto@x.com', etapa: 'nuevo', primeraEntrada: haceMin(20), primeraSalida: haceMin(5), ultimaEntrada: haceMin(20), ultimaSalida: haceMin(5) },
  ];
  const r = resumenSla(filas, { ahora: AHORA, umbralMs: 30 * 60000 });
  assert.equal(r.total, 4);
  assert.equal(r.medidas, 3);
  assert.equal(r.primeraRespuestaPromedioMs, Math.round(((10 + 45 + 15) / 3) * 60000));
  assert.equal(r.primeraRespuestaP90Ms, 45 * 60000);
  assert.equal(r.respondidasEn30Min, 2);
  assert.equal(r.pctEn30Min, 67);
  assert.equal(r.sinResponder.length, 1);
  assert.equal(r.sinResponder[0].id, 'c3');
  assert.equal(r.sinResponder[0].minutos, 180);
  const ana = r.porAgente.find((a) => a.agente === 'ana@x.com');
  assert.equal(ana.asignadas, 2);
  assert.equal(ana.ganadas, 1);
  assert.equal(ana.sinResponder, 0);
  assert.equal(ana.primeraRespuestaPromedioMs, Math.round(((10 + 45) / 2) * 60000));
  const sinAsignar = r.porAgente.find((a) => a.agente === 'sin_asignar');
  assert.equal(sinAsignar.sinResponder, 1);
});

test('sin conversaciones no divide por cero', () => {
  const r = resumenSla([], { ahora: AHORA });
  assert.equal(r.total, 0);
  assert.equal(r.primeraRespuestaPromedioMs, null);
  assert.equal(r.primeraRespuestaP90Ms, null);
  assert.equal(r.pctEn30Min, null);
  assert.deepEqual(r.sinResponder, []);
  assert.deepEqual(r.porAgente, []);
});

if (!process.exitCode) console.log(`\n${pasaron} pruebas de SLA OK`);
