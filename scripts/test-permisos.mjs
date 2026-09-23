// Tests del catalogo de permisos (que ve y que puede hacer cada usuario).
// Sin dependencias:  npm test
import assert from 'node:assert/strict';
import {
  SECCIONES, SECCIONES_CLIENTE, ACCIONES, TODAS_SECCIONES, TODAS_ACCIONES,
  PERMISOS_POR_ROL, permisosDeRol, normalizarPermisos, permisosEfectivos,
  puedeVer, puedeHacer, resumenPermisos,
} from '../api/permisos.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nPermisos por usuario');

test('el catalogo es coherente: sin claves repetidas ni vacias', () => {
  const grupos = [...SECCIONES, ...SECCIONES_CLIENTE];
  for (const g of grupos) {
    assert.ok(g.grupo, 'cada grupo tiene nombre');
    for (const i of g.items) {
      assert.ok(i.key && i.label && i.detalle, `el item ${i.key} tiene clave, nombre y detalle`);
    }
  }
  for (const g of ACCIONES) for (const i of g.items) assert.ok(i.key && i.label && i.detalle);
  assert.equal(new Set(TODAS_SECCIONES).size, TODAS_SECCIONES.length, 'secciones sin repetir');
  assert.equal(new Set(TODAS_ACCIONES).size, TODAS_ACCIONES.length, 'acciones sin repetir');
  assert.ok(TODAS_SECCIONES.length >= 15 && TODAS_ACCIONES.length >= 15);
});

test('cada rol tiene sus permisos de fábrica', () => {
  assert.deepEqual(permisosDeRol('admin').ver, TODAS_SECCIONES);
  assert.deepEqual(permisosDeRol('admin').hacer, TODAS_ACCIONES);
  const tec = permisosDeRol('tecnico');
  assert.ok(tec.ver.includes('tablero') && tec.ver.includes('whatsapp'));
  assert.ok(!tec.ver.includes('usuarios'), 'un técnico no administra usuarios');
  assert.ok(tec.hacer.includes('diagnostico') && tec.hacer.includes('responder_whatsapp'));
  assert.ok(!tec.hacer.includes('entregar'), 'un técnico no entrega ni cobra');
  assert.ok(!tec.hacer.includes('gestionar_usuarios'));
  const cli = permisosDeRol('cliente');
  assert.deepEqual(cli.ver, ['mi_espacio', 'mi_cuenta']);
  assert.deepEqual(cli.hacer, []);
});

test('el admin siempre queda con todo, aunque le manden casillas vacías', () => {
  assert.deepEqual(normalizarPermisos({ ver: [], hacer: [] }, 'admin').ver, TODAS_SECCIONES);
  assert.deepEqual(normalizarPermisos(null, 'admin').hacer, TODAS_ACCIONES);
  assert.equal(puedeHacer({ rol: 'admin' }, 'gestionar_usuarios'), true);
  assert.equal(puedeVer({ rol: 'admin' }, 'usuarios'), true);
});

test('normaliza lo que manda el panel: descarta claves raras y repetidas', () => {
  const p = normalizarPermisos({ ver: ['clientes', 'clientes', 'inventado', 7], hacer: 'no-es-lista' }, 'tecnico');
  assert.deepEqual(p.ver, ['clientes']);
  assert.deepEqual(p.hacer, [], 'si no es lista, no habilita nada');
  assert.deepEqual(normalizarPermisos(null, 'tecnico'), permisosDeRol('tecnico'), 'sin datos usa los del rol');
  assert.deepEqual(normalizarPermisos('', 'cliente'), permisosDeRol('cliente'));
});

test('acepta los permisos guardados como texto JSON (vienen así de la base)', () => {
  const guardado = JSON.stringify({ ver: ['clientes', 'whatsapp'], hacer: ['responder_whatsapp'] });
  const u = { rol: 'tecnico', permisos: guardado };
  assert.equal(puedeVer(u, 'clientes'), true);
  assert.equal(puedeVer(u, 'inventario'), false);
  assert.equal(puedeHacer(u, 'responder_whatsapp'), true);
  assert.equal(puedeHacer(u, 'entregar'), false);
});

test('sin permisos propios rigen los del rol', () => {
  const u = { rol: 'tecnico', permisos: null };
  assert.deepEqual(permisosEfectivos(u), permisosDeRol('tecnico'));
  assert.equal(puedeVer(u, 'tablero'), true);
  assert.equal(puedeVer(u, 'reportes'), false);
  assert.equal(puedeHacer(u, 'diagnostico'), true);
  assert.equal(puedeHacer(u, 'editar_clientes'), false);
});

test('un usuario sin rol ni permisos no ve ni hace nada', () => {
  assert.equal(puedeVer({}, 'tablero'), false);
  assert.equal(puedeHacer({}, 'crear_orden'), false);
  assert.equal(puedeVer({ rol: 'cliente', permisos: { ver: [], hacer: [] } }, 'mi_espacio'), false);
});

test('el resumen dice si quedó como el rol o personalizado', () => {
  assert.equal(resumenPermisos({ rol: 'admin' }), 'Acceso total');
  assert.equal(resumenPermisos({ rol: 'tecnico', permisos: null }), 'Como Técnico');
  assert.equal(resumenPermisos({ rol: 'cliente', permisos: null }), 'Como Cliente');
  const p = JSON.stringify({ ver: ['tablero'], hacer: ['crear_orden'] });
  assert.equal(resumenPermisos({ rol: 'tecnico', permisos: p }), '1 secciones · 1 acciones');
});

test('las claves que usa el menú existen en el catálogo', () => {
  // Si alguien agrega una sección al menú sin cargarla al catálogo, el menú
  // desaparecería en silencio: este test lo frena.
  const usadas = ['tablero', 'dashboard', 'historial', 'tareas', 'clientes', 'whatsapp', 'cotizador',
    'inventario', 'tecnicos', 'flotillas', 'garantias', 'baja', 'reportes', 'usuarios', 'papelera',
    'mi_cuenta', 'mi_espacio'];
  for (const k of usadas) assert.ok(TODAS_SECCIONES.includes(k), `falta la sección ${k} en el catálogo`);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
