// Tests del catalogo de permisos por usuario (que ve y que puede hacer).
// Sin dependencias:  npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLUMNAS, PERMISOS, CLAVES, SECCIONES, agruparPermisos, permisosPorDefecto,
  normalizarPermisos, permisosEfectivos, tienePermiso, puedeVer, puedeHacer,
  resumenPermisos, seccionDeRuta, inicioDe,
} from '../api/permisos.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nCatálogo de permisos');

test('el catálogo es coherente: claves únicas y con etiqueta, grupo y operación', () => {
  assert.equal(new Set(CLAVES).size, CLAVES.length, 'no hay claves repetidas');
  const ops = new Set(COLUMNAS.map((c) => c.op));
  for (const p of PERMISOS) {
    assert.ok(p.clave && p.etiqueta && p.grupo && p.detalle, `el permiso ${p.clave} está completo`);
    assert.ok(ops.has(p.op), `la operación de ${p.clave} es una columna válida`);
  }
  assert.deepEqual(COLUMNAS.map((c) => c.op), ['ver', 'crear', 'editar', 'borrar']);
  for (const op of ops) assert.ok(PERMISOS.some((p) => p.op === op), `hay permisos en la columna ${op}`);
});

test('las secciones son los permisos de tipo ver', () => {
  assert.deepEqual(SECCIONES, PERMISOS.filter((p) => p.op === 'ver').map((p) => p.clave));
  for (const s of ['tablero', 'dashboard', 'historial', 'inventario', 'tecnicos', 'flotillas', 'garantias',
    'baja', 'cotizador', 'whatsapp', 'clientes', 'papelera', 'tareas', 'reportes', 'usuarios', 'respaldos', 'sistema', 'mi_cuenta']) {
    assert.ok(SECCIONES.includes(s), `falta la sección ${s}`);
  }
});

test('agrupar deja todos los permisos en su grupo y en orden', () => {
  const grupos = agruparPermisos();
  const total = grupos.reduce((a, g) => a + g.items.length, 0);
  assert.equal(total, PERMISOS.length);
  assert.deepEqual(grupos.map((g) => g.grupo), [...new Set(PERMISOS.map((p) => p.grupo))]);
});

test('los permisos críticos son los peligrosos', () => {
  const criticas = PERMISOS.filter((p) => p.critica).map((p) => p.clave);
  for (const k of ['entregar', 'baja_orden', 'baja_clientes', 'config_cotizador', 'crear_usuarios', 'editar_usuarios', 'borrar_usuarios']) {
    assert.ok(criticas.includes(k), `${k} debería estar marcado como crítico`);
  }
  assert.equal(PERMISOS.find((p) => p.clave === 'tablero').critica, undefined, 'ver el tablero no es crítico');
});

console.log('\nPlantillas por rol');

test('el admin tiene todo y el cliente solo su portal', () => {
  const admin = permisosPorDefecto('admin');
  assert.ok(CLAVES.every((k) => admin[k] === true), 'el admin tiene todos los permisos');
  const cli = permisosPorDefecto('cliente');
  assert.deepEqual(CLAVES.filter((k) => cli[k]).sort(), ['mi_cuenta', 'mi_espacio']);
  const tec = permisosPorDefecto('tecnico');
  assert.ok(tec.tablero && tec.diagnostico && tec.responder_whatsapp);
  assert.ok(!tec.entregar, 'el técnico no entrega ni cobra por plantilla');
  assert.ok(!tec.usuarios && !tec.config_cotizador && !tec.baja_orden);
  assert.ok(!tec.respaldos, 'respaldar la base es solo del administrador');
  assert.equal(Object.keys(tec).length, CLAVES.length, 'la plantilla trae todas las claves');
});

test('respaldos queda para el admin (el botón no se le habilita a nadie más)', () => {
  assert.equal(permisosPorDefecto('admin').respaldos, true);
  assert.equal(permisosPorDefecto('tecnico').respaldos, false);
  assert.equal(permisosPorDefecto('cliente').respaldos, false);
  assert.ok(SECCIONES.includes('respaldos'), 'es una pantalla del panel');
  assert.equal(inicioDe({ rol: 'tecnico', permisos: null }) === '/respaldos', false, 'nunca es el inicio de un técnico');
});

test('permisosEfectivos usa la plantilla cuando el usuario no tiene nada guardado', () => {
  assert.deepEqual(permisosEfectivos({ rol: 'tecnico', permisos: null }), permisosPorDefecto('tecnico'));
  assert.deepEqual(permisosEfectivos({ rol: 'admin' }), permisosPorDefecto('admin'));
  const propios = { tablero: true, entregar: true };
  const ef = permisosEfectivos({ rol: 'tecnico', permisos: propios });
  assert.equal(ef.entregar, true, 'respeta lo que le dieron');
  assert.equal(ef.diagnostico, true, 'lo no especificado cae en la plantilla del rol');
});

console.log('\nNormalización');

test('null, basura o texto roto caen en la plantilla del rol', () => {
  assert.deepEqual(normalizarPermisos(null, 'tecnico'), permisosPorDefecto('tecnico'));
  assert.deepEqual(normalizarPermisos(undefined, 'tecnico'), permisosPorDefecto('tecnico'));
  assert.deepEqual(normalizarPermisos('[1,2]', 'tecnico'), permisosPorDefecto('tecnico'));
  assert.deepEqual(normalizarPermisos('no es json', 'tecnico'), permisosPorDefecto('tecnico'));
  assert.deepEqual(normalizarPermisos(42, 'tecnico'), permisosPorDefecto('tecnico'));
});

test('acepta el formato guardado en la base (texto JSON)', () => {
  const guardado = JSON.stringify({ tablero: false, entregar: true });
  const p = normalizarPermisos(guardado, 'tecnico');
  assert.equal(p.tablero, false);
  assert.equal(p.entregar, true);
  assert.equal(p.diagnostico, true, 'lo que no viene queda como la plantilla');
});

test('ignora claves desconocidas y valores que no son booleanos', () => {
  const p = normalizarPermisos({ inventado: true, tablero: 'si', entregar: true, baja_orden: 0 }, 'tecnico');
  assert.equal(p.inventado, undefined, 'una clave de mentira no entra al mapa');
  assert.equal(p.tablero, true, 'un valor que no es booleano se ignora (queda la plantilla)');
  assert.equal(p.entregar, true);
  assert.equal(p.baja_orden, false, 'un 0 tampoco es booleano: queda la plantilla');
  assert.equal(Object.keys(p).length, CLAVES.length);
});

test('el admin no se puede auto-bloquear y el cliente no se puede elevar', () => {
  assert.ok(CLAVES.every((k) => normalizarPermisos({ [k]: false }, 'admin')[k] === true));
  const cli = normalizarPermisos({ tablero: true, entregar: true, usuarios: true }, 'cliente');
  assert.ok(!cli.tablero && !cli.entregar && !cli.usuarios, 'el cliente sigue viendo solo su portal');
  assert.equal(cli.mi_espacio, true);
});

console.log('\nConsultas y pantallas');

test('tienePermiso es una consulta directa sobre el mapa', () => {
  assert.equal(tienePermiso({ entregar: true }, 'entregar'), true);
  assert.equal(tienePermiso({ entregar: false }, 'entregar'), false);
  assert.equal(tienePermiso({}, 'entregar'), false);
  assert.equal(tienePermiso(null, 'entregar'), false);
  assert.equal(tienePermiso({ entregar: 'si' }, 'entregar'), false, 'solo acepta true');
  assert.equal(tienePermiso({}, ''), true, 'sin clave no restringe');
});

test('puedeVer y puedeHacer respetan lo que le dieron', () => {
  const u = { rol: 'tecnico', permisos: { inventario: true, clientes: false, mover_stock: true } };
  assert.equal(puedeVer(u, 'inventario'), true);
  assert.equal(puedeVer(u, 'clientes'), false);
  assert.equal(puedeHacer(u, 'mover_stock'), true);
  assert.equal(puedeHacer(u, 'entregar'), false);
});

test('el resumen dice plantilla o cuántos permisos tiene', () => {
  assert.equal(resumenPermisos({ rol: 'admin' }), 'Administrador (todo)');
  assert.equal(resumenPermisos({ rol: 'tecnico', permisos: null }), 'Técnico (plantilla)');
  assert.equal(resumenPermisos({ rol: 'cliente', permisos: null }), 'Cliente (plantilla)');
  // Un permiso de mas que la plantilla ya lo marca como personalizado.
  assert.match(resumenPermisos({ rol: 'tecnico', permisos: { entregar: true } }), /^\d+ permisos$/);
});

test('cada ruta del panel tiene su sección y el inicio siempre es alcanzable', () => {
  assert.equal(seccionDeRuta('/hub/whatsapp'), 'whatsapp');
  assert.equal(seccionDeRuta('/hub/inventario/'), 'inventario');
  assert.equal(seccionDeRuta('/reportes'), 'reportes');
  assert.equal(seccionDeRuta('/respaldos'), 'respaldos');
  assert.equal(seccionDeRuta('/sistema'), 'sistema');
  assert.equal(seccionDeRuta('/ruta-inexistente'), null);
  const tec = { rol: 'tecnico', permisos: null };
  assert.equal(inicioDe(tec), '/hub', 'el técnico por plantilla arranca en el tablero');
  // Sin tablero ni dashboard, el inicio tiene que caer en una pantalla habilitada.
  const soloInv = { rol: 'tecnico', permisos: { tablero: false, dashboard: false, inventario: true } };
  const ruta = inicioDe(soloInv);
  assert.ok(ruta, 'siempre devuelve una ruta');
  assert.ok(puedeVer(soloInv, seccionDeRuta(ruta)), `el inicio (${ruta}) tiene que ser una pantalla habilitada`);
  // Sin ningun permiso (mapa todo en false), cae en su espacio de trabajo.
  const sinNada = { rol: 'tecnico', permisos: Object.fromEntries(CLAVES.map((k) => [k, false])) };
  assert.equal(inicioDe(sinNada), '/tecnico/mis-ordenes');
  assert.equal(inicioDe({ rol: 'cliente', permisos: null }), '/cliente/rastreo');
});

console.log('\nCoherencia con la API');

test('todas las claves que exige la API existen en el catálogo', () => {
  // Evita el error silencioso de escribir mal una clave en un endpoint: eso
  // dejaría el endpoint inaccesible para todos menos el admin.
  const fuente = readFileSync(new URL('../api/server.js', import.meta.url), 'utf8');
  const usadas = new Set();
  for (const m of fuente.matchAll(/permisoRequerido\(([^)]*)\)/g)) {
    for (const k of m[1].matchAll(/'([^']+)'/g)) usadas.add(k[1]);
  }
  assert.ok(usadas.size > 20, `se esperaban muchas claves, se encontraron ${usadas.size}`);
  for (const k of usadas) assert.ok(CLAVES.includes(k), `la clave ${k} de la API no está en el catálogo`);
});

test('los permisos del catálogo no quedan sin uso en la API', () => {
  const fuente = readFileSync(new URL('../api/server.js', import.meta.url), 'utf8');
  const huerfanos = CLAVES.filter((k) => !fuente.includes(`'${k}'`));
  // Las secciones se usan para el menu y los filtros, no siempre en un require.
  const sinUso = huerfanos.filter((k) => !SECCIONES.includes(k));
  assert.deepEqual(sinUso, [], `estos permisos no los usa ningún endpoint: ${sinUso.join(', ')}`);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
