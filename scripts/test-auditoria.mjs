// Tests de la auditoria y de la clasificacion de errores del outbox.
// Sin base de datos ni red:  npm test
import assert from 'node:assert/strict';
import { diferencias } from '../api/auditoria.js';
import { decidirResultado, MAX_INTENTOS, ESTADOS_OUTBOX } from '../api/outbox.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nAuditoría');

test('guarda solo los campos que cambiaron', () => {
  const antes = { nombre: 'Ana', telefono: '11 5555', email: 'ana@x.com' };
  const despues = { nombre: 'Ana', telefono: '11 4444', email: 'ana@x.com' };
  const d = diferencias(antes, despues);
  assert.deepEqual(d.campos, ['telefono']);
  assert.deepEqual(d.antes, { telefono: '11 5555' });
  assert.deepEqual(d.despues, { telefono: '11 4444' });
});

test('nunca guarda contraseñas, hashes ni tokens', () => {
  const d = diferencias(
    { email: 'a@x.com', password_hash: 'hash-viejo', permisos: { entregar: false }, token: 'abc' },
    { email: 'b@x.com', password_hash: 'hash-nuevo', permisos: { entregar: true }, token: 'def' }
  );
  assert.deepEqual(d.campos, ['email', 'permisos'], 'hash y token quedan afuera');
  assert.equal(JSON.stringify(d).includes('hash-viejo'), false);
  assert.equal(JSON.stringify(d).includes('abc'), false);
  assert.deepEqual(d.despues.permisos, { entregar: true });
});

test('una creación guarda el después y un borrado guarda el antes', () => {
  const creado = diferencias(null, { nombre: 'Nuevo', email: 'n@x.com' });
  assert.equal(creado.antes, null);
  assert.deepEqual(creado.despues, { nombre: 'Nuevo', email: 'n@x.com' });
  const borrado = diferencias({ nombre: 'Viejo' }, null);
  assert.deepEqual(borrado.antes, { nombre: 'Viejo' });
  assert.equal(borrado.despues, null);
});

test('recorta textos largos y no explota con objetos raros', () => {
  const largo = 'x'.repeat(5000);
  const d = diferencias({ nota: 'corta' }, { nota: largo });
  assert.ok(d.despues.nota.length < 2100, 'el texto se recorta');
  const raro = diferencias({ a: undefined }, { a: { b: { c: { d: { e: 1 } } } } });
  assert.equal(typeof raro.despues, 'object');
});

console.log('\nClasificación de errores del outbox');

test('un envío OK no se reintenta', () => {
  assert.equal(decidirResultado({ ok: true }), 'enviado');
});

test('red caída, 429 y 5xx se reintentan', () => {
  assert.equal(decidirResultado({ ok: false, transitorio: true }), 'reintentar');
  assert.equal(decidirResultado({ ok: false, code: 131016 }), 'reintentar', 'servicio de Meta no disponible');
  assert.equal(decidirResultado({ ok: false, code: 131000 }), 'reintentar');
});

test('errores de datos no se reintentan (sería mandar dos veces al pedo)', () => {
  for (const code of [131047, 131026, 131030, 132000, 132001, 190, 102, 100, 133010]) {
    assert.equal(decidirResultado({ ok: false, code }), 'fallido', `el código ${code} es definitivo`);
  }
  assert.equal(decidirResultado({ ok: false, error: 'sin configurar', code: 'SIN_CONFIG' }), 'fallido');
});

test('un timeout queda "incierto": no se reintenta solo', () => {
  assert.equal(decidirResultado({ ok: false, incierto: true, error: 'Meta no respondió a tiempo.' }), 'incierto');
});

test('los límites del worker están definidos', () => {
  assert.equal(MAX_INTENTOS, 4);
  assert.deepEqual(ESTADOS_OUTBOX, ['pendiente', 'enviando', 'enviado', 'fallido', 'incierto']);
});

if (!process.exitCode) console.log(`\n${pasaron} pruebas de auditoría/outbox OK`);
