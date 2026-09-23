// Tests de los avisos automaticos por WhatsApp (sin base de datos ni Meta).
// Sin dependencias:  npm test
import assert from 'node:assert/strict';
import {
  PLANTILLA_POR_ESTADO, EVENTOS, AVISOS_DEFAULT, normalizarAvisos, primerNombre, parametrosAviso, resumenAviso,
} from '../api/avisos.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nAvisos automáticos');

test('cada estado avisado tiene su plantilla y su evento listado', () => {
  assert.equal(PLANTILLA_POR_ESTADO.received, 'bateria_recibida');
  assert.equal(PLANTILLA_POR_ESTADO.quoted, 'cotizacion_lista');
  assert.equal(PLANTILLA_POR_ESTADO.ready, 'bateria_lista');
  assert.deepEqual(EVENTOS.map((e) => e.evento).sort(), Object.keys(PLANTILLA_POR_ESTADO).sort());
  // Estados sin aviso no tienen plantilla.
  assert.equal(PLANTILLA_POR_ESTADO.delivered, undefined);
  assert.equal(PLANTILLA_POR_ESTADO.cancelled, undefined);
});

test('sin configuración guardada, los avisos vienen prendidos', () => {
  assert.deepEqual(normalizarAvisos(null), AVISOS_DEFAULT);
  assert.deepEqual(normalizarAvisos({}), AVISOS_DEFAULT);
  assert.deepEqual(normalizarAvisos(undefined), { received: true, quoted: true, ready: true });
});

test('solo acepta booleanos y claves conocidas', () => {
  assert.deepEqual(normalizarAvisos({ received: false, ready: false }), { received: false, quoted: true, ready: false });
  assert.deepEqual(normalizarAvisos({ received: 'no', inventado: false }), AVISOS_DEFAULT);
  assert.equal(normalizarAvisos({ delivered: false }).delivered, undefined);
});

test('el nombre del cliente se recorta al primer nombre', () => {
  assert.equal(primerNombre('  Juan   Pérez  '), 'Juan');
  assert.equal(primerNombre('Marcos'), 'Marcos');
  assert.equal(primerNombre(''), 'cliente');
  assert.equal(primerNombre(null), 'cliente');
  assert.equal(primerNombre('x'.repeat(80)).length, 40);
});

test('las variables de cada plantilla son las que espera Meta', () => {
  const cliente = { nombre: 'Juan Pérez' };
  const orden = { id: 'ord_07', bateria_serie: 'BAT-AUT-003' };
  assert.deepEqual(parametrosAviso('received', { cliente, orden, sitio: 'https://bertika.com' }), ['Juan', 'BAT-AUT-003', 'https://bertika.com/seguimiento']);
  assert.deepEqual(parametrosAviso('quoted', { cliente, orden, sitio: 'https://bertika.com' }), ['Juan', 'BAT-AUT-003', 'https://bertika.com/cotizacion/ord_07']);
  assert.deepEqual(parametrosAviso('ready', { cliente, orden }), ['Juan', 'BAT-AUT-003']);
  assert.deepEqual(parametrosAviso('delivered', { cliente, orden }), []);
  // Sin nombre de cliente igual sale algo razonable.
  assert.equal(parametrosAviso('ready', { orden })[0], 'cliente');
  // Sin serie no queda un hueco vacío.
  assert.equal(parametrosAviso('ready', { cliente })[1], 'tu batería');
});

test('el texto que queda en la bandeja dice que fue automático', () => {
  const orden = { id: 'ord_07', bateria_serie: 'BAT-AUT-003' };
  for (const evento of ['received', 'quoted', 'ready']) {
    const t = resumenAviso(evento, { orden });
    assert.match(t, /Aviso automático/);
    assert.match(t, /BAT-AUT-003/);
  }
  assert.equal(resumenAviso('otro', { orden }), 'Aviso automático.');
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
