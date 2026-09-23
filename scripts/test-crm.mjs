// Tests del embudo comercial (CRM). Sin base de datos:  npm test
import assert from 'node:assert/strict';
import { ETAPAS, ETAPA_DEFAULT, ETAPAS_ABIERTAS, normalizarEtapa, normalizarMonto, resumenEmbudo, agruparEmbudo } from '../api/crm.js';

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

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
