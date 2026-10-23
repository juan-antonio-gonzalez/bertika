// Tests de la fase 2 de integridad (logica pura). Sin base de datos:  npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { puedeTrabajarEnOrden, ESTADOS_CERRADOS, TRANSITIONS, esEstadoCerrado } from '../src/data/reglas.js';
import { normalizarBooleano } from '../api/validaciones.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nIntegridad: estados cerrados');

test('entregada y cancelada son los estados finales', () => {
  assert.deepEqual(ESTADOS_CERRADOS, ['delivered', 'cancelled']);
  assert.equal(esEstadoCerrado('delivered'), true);
  assert.equal(esEstadoCerrado('cancelled'), true);
});

test('los estados abiertos no cuentan como cerrados', () => {
  for (const estado of ['received', 'diagnosing', 'quoted', 'approved', 'in_repair', 'testing', 'ready']) {
    assert.equal(esEstadoCerrado(estado), false, `${estado} no deberia estar cerrado`);
  }
  assert.equal(esEstadoCerrado(undefined), false);
  assert.equal(esEstadoCerrado(null), false);
  assert.equal(esEstadoCerrado(''), false);
  assert.equal(esEstadoCerrado('DELIVERED'), false, 'el estado se compara tal cual');
});

test('los estados cerrados no tienen salida en el grafo de transiciones', () => {
  for (const estado of ESTADOS_CERRADOS) {
    assert.deepEqual(TRANSITIONS[estado], [], `${estado} no deberia permitir transiciones`);
  }
});

test('desde los estados abiertos tampoco se vuelve a un estado anterior', () => {
  // ready solo puede pasar a delivered (que exige el endpoint de admin).
  assert.deepEqual(TRANSITIONS.ready, ['delivered']);
  // Una vez entregada o cancelada, no hay vuelta atras por el flujo normal.
  assert.equal(TRANSITIONS.delivered.includes('quoted'), false);
  assert.equal(TRANSITIONS.cancelled.includes('quoted'), false);
});

console.log('\nIntegridad: activo (usuarios)');

test('acepta los booleanos de verdad', () => {
  assert.equal(normalizarBooleano(true), true);
  assert.equal(normalizarBooleano(false), false);
  assert.equal(normalizarBooleano(1), true);
  assert.equal(normalizarBooleano(0), false);
});

test('acepta los textos que manda un formulario', () => {
  assert.equal(normalizarBooleano('true'), true);
  assert.equal(normalizarBooleano('TRUE'), true);
  assert.equal(normalizarBooleano(' true '), true);
  assert.equal(normalizarBooleano('1'), true);
  assert.equal(normalizarBooleano('false'), false, 'este era el bug: "false" dejaba al usuario activo');
  assert.equal(normalizarBooleano('False'), false);
  assert.equal(normalizarBooleano('0'), false);
});

test('cualquier otra cosa devuelve null (el endpoint responde 400)', () => {
  for (const raro of [null, undefined, '', 'si', 'no', 'activo', {}, [], 2, -1, NaN]) {
    assert.equal(normalizarBooleano(raro), null, `${JSON.stringify(raro)} deberia ser invalido`);
  }
});

test('sin cartera asignada: cualquier tecnico trabaja con cualquier orden', () => {
  assert.equal(puedeTrabajarEnOrden('admin'), true);
  assert.equal(puedeTrabajarEnOrden('tecnico'), true, 'el tecnico trabaja con ordenes de cualquier cliente');
  assert.equal(puedeTrabajarEnOrden('cliente'), false, 'el cliente no escribe ordenes');
  assert.equal(puedeTrabajarEnOrden(undefined), false);
});

console.log('\nSeguimiento publico (siempre se ve como el cliente)');

const leerFuente = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la ruta /tracker no se envuelve en el panel de la plataforma', () => {
  const app = leerFuente('../src/App.jsx');
  const linea = app.split('\n').find((l) => l.includes('path="/tracker/:orden_id"'));
  assert.ok(linea, 'existe la ruta del tracker');
  assert.ok(!linea.includes('AppLayout'), 'el tracker no puede renderizarse dentro de AppLayout');
});

test('el tracker no lee las ordenes internas del store: siempre pide la vista publica', () => {
  const tracker = leerFuente('../src/pages/Tracker.jsx');
  assert.ok(tracker.includes('/public/ordenes/'), 'pide el detalle publico');
  assert.ok(!tracker.includes('data.ordenes'), 'no usa la fila interna (trae tecnico, montos y autor de eventos)');
});

test('la landing navega con los 16 digitos: el buscador no devuelve el codigo', () => {
  const seg = leerFuente('../src/pages/Seguimiento.jsx');
  assert.ok(!seg.includes('rows[0].codigo'), 'el endpoint de busqueda no manda codigo (iria a /tracker/undefined)');
  assert.ok(seg.includes('navigate(`/tracker/${digitos}`)'), 'navega con los digitos validados');
});

test('ningun enlace publico de seguimiento se arma con el id interno', () => {
  for (const ruta of ['../src/components/OrdenDetalle.jsx', '../src/components/EtiquetaBateria.jsx', '../src/pages/CotizacionPublica.jsx']) {
    const fuente = leerFuente(ruta);
    assert.ok(!fuente.includes('/tracker/${orden.id}'), `${ruta} no debe armar el enlace con orden.id`);
  }
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
