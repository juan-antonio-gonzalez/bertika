// Tests de las respuestas rapidas y de la busqueda en mensajes (logica pura).
import assert from 'node:assert/strict';
import {
  VARIABLES_RESPUESTA, RESPUESTAS_EJEMPLO, PALETA_ETIQUETAS,
  aplicarVariables, normalizarAtajo, formatearCodigoSeguimiento, enlaceSeguimiento, fragmentoConTexto, colorDePaleta,
} from '../src/data/respuestas.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nRespuestas rápidas');

test('las variables declaradas son las que se reemplazan', () => {
  assert.deepEqual(VARIABLES_RESPUESTA.map((v) => v.clave), ['nombre', 'telefono', 'serie', 'link']);
  const t = 'Hola {{nombre}}, tu {{serie}} está lista: {{link}}';
  assert.equal(aplicarVariables(t, { nombre: 'Juan', serie: 'BAT-AUT-001', link: 'https://x/tracker/1' }),
    'Hola Juan, tu BAT-AUT-001 está lista: https://x/tracker/1');
  assert.equal(aplicarVariables('Cualquier duda al {{telefono}}', { telefono: '5491155550101' }), 'Cualquier duda al 5491155550101');
  assert.equal(aplicarVariables('Tel: {{ TELEFONO }}', { telefono: '111' }), 'Tel: 111');
});

test('las variables se completan aunque falten datos (sin huecos vacíos)', () => {
  assert.equal(aplicarVariables('Hola {{nombre}}, tu {{serie}}', {}), 'Hola cliente, tu tu batería');
  assert.equal(aplicarVariables('Hola  {{ NOMBRE }}', { nombre: 'Ana' }), 'Hola  Ana');
  assert.equal(aplicarVariables('', { nombre: 'Ana' }), '');
  assert.equal(aplicarVariables(null, {}), '');
});

test('el atajo se limpia: sin "/", sin espacios y en minúsculas', () => {
  assert.equal(normalizarAtajo('/Horarios'), 'horarios');
  assert.equal(normalizarAtajo('  Como Llegar '), 'como-llegar');
  assert.equal(normalizarAtajo('¿garantía?'), 'garanta');
  assert.equal(normalizarAtajo(''), '');
  assert.equal(normalizarAtajo(null), '');
  assert.equal(normalizarAtajo('x'.repeat(40)).length, 20);
});

test('los ejemplos cubren lo que más se pregunta en el taller', () => {
  const atajos = RESPUESTAS_EJEMPLO.map((r) => r.atajo);
  for (const a of ['horarios', 'demora', 'comollegar', 'garantia', 'lista']) {
    assert.equal(atajos.includes(a), true, `falta el atajo ${a}`);
  }
  assert.equal(RESPUESTAS_EJEMPLO.every((r) => r.texto.includes('{{nombre}}')), true, 'todas saludan por nombre');
  assert.equal(new Set(atajos).size, atajos.length, 'no hay atajos repetidos');
});

test('el enlace de seguimiento usa el código (no el id interno)', () => {
  assert.equal(formatearCodigoSeguimiento('1234567890123456'), '1234-5678-9012-3456');
  assert.equal(formatearCodigoSeguimiento('1234-5678-9012-3456'), '1234-5678-9012-3456');
  assert.equal(formatearCodigoSeguimiento('ord_07'), 'ord_07', 'lo que no es código queda igual');
  assert.equal(enlaceSeguimiento({ codigo_seguimiento: '1234567890123456' }, 'https://bertika.com'), 'https://bertika.com/tracker/1234-5678-9012-3456');
  assert.equal(enlaceSeguimiento({ codigo_seguimiento: '1234567890123456' }, 'https://bertika.com/'), 'https://bertika.com/tracker/1234-5678-9012-3456');
  assert.equal(enlaceSeguimiento({}, 'https://bertika.com'), '', 'sin código no hay enlace');
});

console.log('\nBúsqueda en mensajes');

test('el fragmento se recorta alrededor de la coincidencia', () => {
  const largo = 'x'.repeat(120) + ' presupuesto ' + 'y'.repeat(120);
  const f = fragmentoConTexto(largo, 'presupuesto', 60);
  assert.equal(f.includes('presupuesto'), true, 'el término queda visible');
  assert.equal(f.length <= 62, true, `el fragmento es corto (${f.length})`);
  assert.equal(f.startsWith('…'), true, 'avisa que hay texto antes');
  assert.equal(f.endsWith('…'), true, 'avisa que hay texto después');
});

test('un texto corto se devuelve entero y sin cambios raros', () => {
  assert.equal(fragmentoConTexto('Hola, ¿cómo va?', 'cómo'), 'Hola, ¿cómo va?');
  assert.equal(fragmentoConTexto('  varios    espacios  ', 'x'), 'varios espacios');
  assert.equal(fragmentoConTexto('', 'x'), '');
  assert.equal(fragmentoConTexto(null, 'x'), '');
});

test('si el término no está, igual devuelve algo presentable', () => {
  const f = fragmentoConTexto('a'.repeat(200), 'zapato', 50);
  assert.equal(f.endsWith('…'), true);
  assert.equal(f.length <= 52, true);
});

test('la paleta de etiquetas es estable y da la vuelta', () => {
  assert.equal(PALETA_ETIQUETAS.every((c) => /^#[0-9a-f]{6}$/i.test(c)), true);
  assert.equal(colorDePaleta(0), PALETA_ETIQUETAS[0]);
  assert.equal(colorDePaleta(PALETA_ETIQUETAS.length), PALETA_ETIQUETAS[0]);
  assert.equal(colorDePaleta(999), PALETA_ETIQUETAS[999 % PALETA_ETIQUETAS.length]);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
