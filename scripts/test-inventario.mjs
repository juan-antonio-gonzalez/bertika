// Tests de las reglas de inventario (umbral de stock critico). Sin base: npm test
import assert from 'node:assert/strict';
import { STOCK_MINIMO_DEFAULT, stockMinimo, esStockCritico, contarCriticos } from '../src/data/inventario.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nInventario');

test('sin umbral cargado usa el de fábrica', () => {
  assert.equal(STOCK_MINIMO_DEFAULT, 3);
  assert.equal(stockMinimo({ stock: 5 }), 3);
  assert.equal(stockMinimo({ stock_minimo: null }), 3);
  assert.equal(stockMinimo({ stock_minimo: '' }), 3);
  assert.equal(stockMinimo({ stock_minimo: 'abc' }), 3);
  assert.equal(stockMinimo({ stock_minimo: -1 }), 3);
  assert.equal(stockMinimo(null), 3);
});

test('respeta el umbral propio del insumo', () => {
  assert.equal(stockMinimo({ stock_minimo: 0 }), 0);
  assert.equal(stockMinimo({ stock_minimo: 10 }), 10);
  assert.equal(stockMinimo({ stock_minimo: '4' }), 4);
});

test('marca crítico por debajo del umbral (el igual no es crítico)', () => {
  assert.equal(esStockCritico({ stock: 2, stock_minimo: 3 }), true);
  assert.equal(esStockCritico({ stock: 3, stock_minimo: 3 }), false);
  assert.equal(esStockCritico({ stock: 0, stock_minimo: 0 }), false, 'con umbral 0 nada es crítico');
  assert.equal(esStockCritico({ stock: 9, stock_minimo: 10 }), true);
  assert.equal(esStockCritico({ stock: 9 }), false, 'sin umbral usa 3');
});

test('un insumo raro no rompe el cálculo', () => {
  assert.equal(esStockCritico({}), true, 'sin stock cargado se considera 0');
  assert.equal(esStockCritico(null), true);
  assert.equal(esStockCritico({ stock: null, stock_minimo: null }), true);
});

test('cuenta los críticos de una lista', () => {
  const insumos = [
    { id: 'a', stock: 1 },
    { id: 'b', stock: 5 },
    { id: 'c', stock: 2, stock_minimo: 10 },
  ];
  assert.equal(contarCriticos(insumos), 2);
  assert.equal(contarCriticos([]), 0);
  assert.equal(contarCriticos(null), 0);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
