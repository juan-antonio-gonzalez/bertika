// Pruebas del motor de listas: normalización de áreas y validación de datos.
import assert from 'node:assert/strict';
import {
  AREAS_SEMILLA, normalizarAreas, permisosArea, validarRegistro, valorVisible,
} from '../src/data/listas.js';

let ok = 0;
const prueba = (nombre, fn) => { fn(); ok += 1; console.log('  ok ', nombre); };

console.log('Listas dinámicas');

prueba('las áreas semilla tienen ids y slugs únicos', () => {
  assert.ok(AREAS_SEMILLA.length >= 2);
  assert.equal(new Set(AREAS_SEMILLA.map((a) => a.id)).size, AREAS_SEMILLA.length);
  assert.equal(new Set(AREAS_SEMILLA.map((a) => a.slug)).size, AREAS_SEMILLA.length);
});

prueba('normaliza áreas y no deja capacidades sin ver', () => {
  const r = normalizarAreas({
    area_ventas: { ver: true, crear_listas: true, editar_registros: true },
    area_taller: { ver: false, crear_listas: true },
    'area mala': { ver: true },
  });
  assert.equal(r.area_ventas.ver, true);
  assert.equal(r.area_ventas.crear_listas, true);
  assert.equal(r.area_ventas.editar_registros, true);
  assert.equal(r.area_taller.ver, false);
  assert.equal(r.area_taller.crear_listas, false);
  assert.equal(r['area mala'], undefined);
});

prueba('permisosArea devuelve todas las capacidades apagadas si no hay ver', () => {
  const caps = permisosArea({ area_ventas: { ver: false, crear_listas: true } }, 'area_ventas');
  assert.equal(caps.ver, false);
  assert.equal(caps.crear_listas, false);
  assert.equal(caps.borrar_registros, false);
});

const campos = [
  { id: 'c_nombre', nombre: 'Nombre', tipo: 'texto', requerido: true, activo: true },
  { id: 'c_estado', nombre: 'Estado', tipo: 'seleccion', config: { opciones: ['Nuevo', 'Ganado'] }, activo: true },
  { id: 'c_monto', nombre: 'Monto', tipo: 'moneda', config: { min: 0 }, activo: true },
  { id: 'c_email', nombre: 'Email', tipo: 'email', activo: true },
  { id: 'c_tags', nombre: 'Tags', tipo: 'multiseleccion', config: { opciones: ['A', 'B'] }, activo: true },
  { id: 'c_activo', nombre: 'Activo', tipo: 'checkbox', activo: true },
];

prueba('rechaza un campo obligatorio vacío', () => {
  const r = validarRegistro(campos, { c_nombre: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /obligatorio/i);
});

prueba('rechaza opciones inexistentes y emails inválidos', () => {
  assert.equal(validarRegistro(campos, { c_nombre: 'Uno', c_estado: 'Otro' }).ok, false);
  assert.equal(validarRegistro(campos, { c_nombre: 'Uno', c_email: 'no-es-email' }).ok, false);
  assert.equal(validarRegistro(campos, { c_nombre: 'Uno', c_tags: ['A', 'Z'] }).ok, false);
});

prueba('normaliza números, moneda y checkbox', () => {
  const r = validarRegistro(campos, {
    c_nombre: '  Cliente  ', c_estado: 'Nuevo', c_monto: '1500.556', c_tags: ['A'], c_activo: 'true',
  });
  assert.equal(r.ok, true);
  assert.equal(r.datos.c_nombre, 'Cliente');
  assert.equal(r.datos.c_monto, 1500.56);
  assert.deepEqual(r.datos.c_tags, ['A']);
  assert.equal(r.datos.c_activo, true);
});

prueba('ignora claves que no son campos de la lista', () => {
  const r = validarRegistro(campos, { c_nombre: 'Uno', hacker: 'x' });
  assert.equal(r.ok, true);
  assert.equal(r.datos.hacker, undefined);
});

prueba('valorVisible formatea moneda, fecha y checkbox', () => {
  assert.match(valorVisible({ tipo: 'moneda' }, 1500), /1.500/);
  assert.equal(valorVisible({ tipo: 'checkbox' }, true), 'Sí');
  assert.match(valorVisible({ tipo: 'fecha' }, '2026-10-29'), /29.10.2026|2026/);
});

console.log(`\n${ok} pruebas de listas OK`);
