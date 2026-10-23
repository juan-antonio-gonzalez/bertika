// Tests de los avisos automaticos por WhatsApp (sin base de datos ni Meta).
// Sin dependencias:  npm test
import assert from 'node:assert/strict';
import {
  PLANTILLA_POR_ESTADO, PLANTILLA_GARANTIA, DIAS_AVISO_GARANTIA, EVENTOS, AVISOS_DEFAULT, normalizarAvisos, primerNombre,
  parametrosAviso, resumenAviso, diasHastaVencimiento, debeAvisarGarantia, formatoFecha, parametrosGarantia,
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
  // Los 3 eventos de estado + la garantia (que no depende del estado).
  assert.deepEqual(EVENTOS.map((e) => e.evento).sort(), [...Object.keys(PLANTILLA_POR_ESTADO), 'garantia'].sort());
  // Estados sin aviso no tienen plantilla.
  assert.equal(PLANTILLA_POR_ESTADO.delivered, undefined);
  assert.equal(PLANTILLA_POR_ESTADO.cancelled, undefined);
});

test('sin configuración guardada, los avisos vienen prendidos', () => {
  assert.deepEqual(normalizarAvisos(null), AVISOS_DEFAULT);
  assert.deepEqual(normalizarAvisos({}), AVISOS_DEFAULT);
  assert.deepEqual(normalizarAvisos(undefined), { received: true, quoted: true, ready: true, garantia: true });
});

test('solo acepta booleanos y claves conocidas', () => {
  assert.deepEqual(normalizarAvisos({ received: false, ready: false }), { received: false, quoted: true, ready: false, garantia: true });
  assert.deepEqual(normalizarAvisos({ received: 'no', inventado: false }), AVISOS_DEFAULT);
  assert.equal(normalizarAvisos({ delivered: false }).delivered, undefined);
  assert.equal(normalizarAvisos({ garantia: false }).garantia, false);
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
  // El servidor pasa el enlace firmado: sin token el cliente no puede aprobar.
  assert.deepEqual(
    parametrosAviso('quoted', { cliente, orden, sitio: 'https://bertika.com', linkCotizacion: 'https://bertika.com/cotizacion/ord_07?t=abc' }),
    ['Juan', 'BAT-AUT-003', 'https://bertika.com/cotizacion/ord_07?t=abc']
  );
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

console.log('\nGarantías por vencer');

test('calcula los días que faltan para el vencimiento', () => {
  const ahora = Date.parse('2026-09-01T12:00:00.000Z');
  assert.equal(diasHastaVencimiento('2026-09-11T12:00:00.000Z', ahora), 10);
  assert.equal(diasHastaVencimiento('2026-09-01T12:00:00.000Z', ahora), 0);
  assert.equal(diasHastaVencimiento('2026-08-20T12:00:00.000Z', ahora), -12);
  assert.equal(diasHastaVencimiento('', ahora), null);
  assert.equal(diasHastaVencimiento(null, ahora), null);
  assert.equal(diasHastaVencimiento('no es fecha', ahora), null);
});

test('avisa solo entre hoy y los próximos 30 días', () => {
  const ahora = Date.parse('2026-09-01T12:00:00.000Z');
  assert.equal(DIAS_AVISO_GARANTIA, 30);
  assert.equal(debeAvisarGarantia('2026-09-20T12:00:00.000Z', ahora), true);
  assert.equal(debeAvisarGarantia('2026-09-01T12:00:00.000Z', ahora), true, 'vence hoy: avisa');
  assert.equal(debeAvisarGarantia('2026-10-15T12:00:00.000Z', ahora), false, 'faltan 44 días: todavía no');
  assert.equal(debeAvisarGarantia('2026-08-30T12:00:00.000Z', ahora), false, 'ya venció: no avisa');
  assert.equal(debeAvisarGarantia('', ahora), false);
  assert.equal(debeAvisarGarantia('2026-09-20T12:00:00.000Z', ahora, 5), false, 'con 5 días de anticipación no llega');
});

test('la fecha se escribe dd/mm/aaaa', () => {
  assert.equal(formatoFecha('2027-03-15T10:00:00.000Z'), '15/03/2027');
  assert.equal(formatoFecha('2026-12-01T00:00:00.000Z'), '01/12/2026');
  assert.equal(formatoFecha(''), '');
  assert.equal(formatoFecha('cualquier cosa'), '');
});

test('las variables de la plantilla de garantía son nombre, serie y fecha', () => {
  const orden = { bateria_serie: 'BAT-AUT-003', garantia: { vence: '2027-03-15T10:00:00.000Z' } };
  assert.deepEqual(parametrosGarantia({ cliente: { nombre: 'Juan Pérez' }, orden }), ['Juan', 'BAT-AUT-003', '15/03/2027']);
  assert.deepEqual(parametrosGarantia({ cliente: { nombre: 'Juan' }, orden: { bateria_serie: 'X' } }), ['Juan', 'X', '-']);
  assert.equal(PLANTILLA_GARANTIA, 'garantia_por_vencer');
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
