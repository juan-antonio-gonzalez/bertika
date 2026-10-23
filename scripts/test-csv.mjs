// Tests del export CSV (frontend y API). Sin base de datos:  npm test
import assert from 'node:assert/strict';
import { celdaCsv, filasCsv } from '../src/data/csv.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nExport CSV seguro');

test('escapa comillas y saltos de línea', () => {
  assert.equal(celdaCsv('hola "mundo"'), '"hola ""mundo"""');
  assert.equal(celdaCsv('linea 1\nlinea 2'), '"linea 1 linea 2"');
  assert.equal(celdaCsv('linea 1\r\nlinea 2'), '"linea 1 linea 2"');
});

test('neutraliza fórmulas de Excel (inyección CSV)', () => {
  assert.equal(celdaCsv('=1+1'), '"\'=1+1"');
  assert.equal(celdaCsv('+SUMA(A1:A9)'), '"\'+SUMA(A1:A9)"');
  assert.equal(celdaCsv('-2+3'), '"\'-2+3"');
  assert.equal(celdaCsv('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(celdaCsv('\t=1+1'), '"\'\t=1+1"');
  // El texto del cliente puede traer la fórmula después de espacios: Excel la
  // evalúa igual al importar, así que también se neutraliza.
  assert.equal(celdaCsv(' =1+1'), '"\' =1+1"');
});

test('no rompe los números negativos ni los datos normales', () => {
  assert.equal(celdaCsv(-50), '"-50"');
  assert.equal(celdaCsv('-50'), '"-50"');
  assert.equal(celdaCsv('-50,25'), '"-50,25"');
  assert.equal(celdaCsv(0), '"0"');
  assert.equal(celdaCsv('Batería 12V'), '"Batería 12V"');
  assert.equal(celdaCsv(null), '""');
  assert.equal(celdaCsv(undefined), '""');
});

test('arma el archivo con BOM, separador y filas', () => {
  const salida = filasCsv([['nombre', 'monto'], ['Ana "la jefa"', 1500]], { separador: ';' });
  assert.equal(salida, '\uFEFF"nombre";"monto"\r\n"Ana ""la jefa""";"1500"');
  assert.equal(salida.startsWith('\uFEFF'), true, 'Excel necesita el BOM para los acentos');
  assert.equal(filasCsv([['a']], { bom: false }), '"a"');
  assert.equal(filasCsv([['a']], { separador: ',' }), '\uFEFF"a"');
});

test('una fila con celdas peligrosas no puede inyectar columnas', () => {
  const salida = filasCsv([['x', "=cmd|' /C calc'!A0"]]);
  assert.equal(salida, '\uFEFF"x","\'=cmd|\' /C calc\'!A0"');
});

if (!process.exitCode) console.log(`\n${pasaron} pruebas de CSV OK`);
