// Tests de los KPIs de clientes (seccion Clientes/CRM). Sin base:  npm test
import assert from 'node:assert/strict';
import {
  ESTADOS_ACTIVOS, esEstadoActivo, aNumero, aFecha, montoCobrado, montoCotizado, garantiaVigente, diasParaVencer,
  kpisCliente, fichaCliente, tipoCliente, resumenClientes, filtrarClientes, ordenarClientes, ORDENES,
} from '../src/data/clientesKpis.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

const HOY = new Date('2026-06-15T12:00:00.000Z');

console.log('\nClientes / CRM: KPIs');

test('los estados activos son todos menos entregada y cancelada', () => {
  assert.equal(ESTADOS_ACTIVOS.includes('received'), true);
  assert.equal(ESTADOS_ACTIVOS.includes('ready'), true);
  assert.equal(ESTADOS_ACTIVOS.includes('delivered'), false);
  assert.equal(ESTADOS_ACTIVOS.includes('cancelled'), false);
  assert.equal(esEstadoActivo('in_repair'), true);
  assert.equal(esEstadoActivo(''), false);
  assert.equal(esEstadoActivo(null), false);
});

test('los números y las fechas raras no rompen nada', () => {
  assert.equal(aNumero(1500), 1500);
  assert.equal(aNumero('1500'), 1500);
  assert.equal(aNumero('$ 15.000'), 15000);
  assert.equal(aNumero(''), 0);
  assert.equal(aNumero(null), 0);
  assert.equal(aNumero(undefined), 0);
  assert.equal(aNumero(NaN), 0);
  assert.equal(aNumero(Infinity), 0);
  assert.equal(aNumero('no es un monto'), 0);
  assert.equal(aFecha('2026-01-01') instanceof Date, true);
  assert.equal(aFecha('cualquier cosa'), null);
  assert.equal(aFecha(''), null);
  assert.equal(aFecha(null), null);
});

test('el monto de una orden sale de lo cobrado o de lo cotizado', () => {
  assert.equal(montoCobrado({ monto_cobrado: 25000 }), 25000);
  assert.equal(montoCobrado({ monto_cobrado: null }), 0);
  assert.equal(montoCotizado({ cotizacion: { monto: 18000 } }), 18000);
  assert.equal(montoCotizado({ cotizacion: null }), 0);
  assert.equal(montoCotizado({}), 0);
  assert.equal(montoCotizado({ cotizacion: { monto: '18.000,50' } }), 18000.5);
});

test('una garantía sin fecha no se cuenta como vigente', () => {
  assert.equal(garantiaVigente({ vence: '2027-01-01' }, HOY), true);
  assert.equal(garantiaVigente({ vence: '2025-01-01' }, HOY), false);
  assert.equal(garantiaVigente({ vence: 'no es fecha' }, HOY), false);
  assert.equal(garantiaVigente({}, HOY), false);
  assert.equal(garantiaVigente(null, HOY), false);
  assert.equal(diasParaVencer({ vence: '2026-06-25T12:00:00.000Z' }, HOY), 10);
  assert.equal(diasParaVencer({ vence: '' }, HOY), null);
});

const clientes = [
  { id: 'cli_01', nombre: 'Juan Garcia', tipo: 'particular', telefono: '11 5555-0101', contacto: 'Juan Garcia' },
  { id: 'cli_03', nombre: 'Logistica del Valle S.A.', tipo: 'flotilla_corporativa', telefono: '11 5555-0103', contacto: 'Ricardo Paredes', email: 'compras@ldv.com' },
  { id: 'cli_09', nombre: 'Cliente sin nada', tipo: 'particular' },
  { id: 'cli_10', nombre: 'Cliente sin telefono', tipo: '' },
];

const ordenes = [
  { id: 'ord_01', cliente_id: 'cli_01', estado: 'delivered', monto_cobrado: 25000, bateria_serie: 'BAT-AUT-001', fecha_ingreso: '2026-01-10T10:00:00Z', garantia: { meses: 6, ciclos: 300, vence: '2027-01-10T10:00:00Z' }, cotizacion: { monto: 25000 } },
  { id: 'ord_02', cliente_id: 'cli_01', estado: 'in_repair', bateria_serie: 'BAT-AUT-003', fecha_ingreso: '2026-05-02T10:00:00Z', cotizacion: { monto: 18000 }, garantia: { meses: 6, ciclos: 300 } },
  { id: 'ord_03', cliente_id: 'cli_01', estado: 'cancelled', bateria_serie: 'BAT-AUT-009', fecha_ingreso: '2026-02-02T10:00:00Z' },
  { id: 'ord_04', cliente_id: 'cli_03', estado: 'ready', bateria_serie: 'BAT-MTC-101', fecha_ingreso: '2026-06-01T10:00:00Z', cotizacion: { monto: 120000 }, garantia: { meses: 12, ciclos: 1800, vence: '2026-06-20T10:00:00Z' } },
  { id: 'ord_05', cliente_id: 'cli_03', estado: 'delivered', monto_cobrado: '95000', bateria_serie: 'BAT-MTC-102', fecha_ingreso: '2025-12-01T10:00:00Z' },
  { id: 'ord_06', cliente_id: null, estado: 'delivered', monto_cobrado: 999999, bateria_serie: 'BAT-XXX-001' },
];

const baterias = [
  { id: 'bat_01', cliente_id: 'cli_01', numero_serie: 'BAT-AUT-001', estado_vida: 'activa' },
  { id: 'bat_08', cliente_id: 'cli_01', numero_serie: 'BAT-AUT-003', estado_vida: 'en_garantia' },
  { id: 'bat_09', cliente_id: 'cli_01', numero_serie: 'BAT-AUT-077', estado_vida: 'baja' },
  { id: 'bat_03', cliente_id: 'cli_03', numero_serie: 'BAT-MTC-101', estado_vida: 'activa' },
];

const datos = { ordenes, baterias };

test('los KPIs de un cliente cuentan lo que corresponde', () => {
  const k = kpisCliente(clientes[0], datos, HOY);
  assert.equal(k.ordenes, 3, 'las tres órdenes del cliente');
  assert.equal(k.activas, 1, 'solo la que está en reparación');
  assert.equal(k.entregadas, 1);
  assert.equal(k.cotizadas, 2);
  assert.equal(k.flotilla, 2, 'las de baja no cuentan');
  assert.equal(k.garantias, 1, 'la garantía sin fecha no cuenta como vigente');
  assert.equal(k.garantiasPorVencer, 0);
  assert.equal(k.cobrado, 25000);
  assert.equal(k.cotizado, 43000);
  assert.equal(k.ultimaActividad, '2026-05-02T10:00:00.000Z');
});

test('la garantía por vencer en 60 días queda marcada', () => {
  const k = kpisCliente(clientes[1], datos, HOY);
  assert.equal(k.activas, 1);
  assert.equal(k.entregadas, 1);
  assert.equal(k.flotilla, 1);
  assert.equal(k.garantias, 1);
  assert.equal(k.garantiasPorVencer, 1);
  assert.equal(k.cobrado, 95000, 'el monto cobrado puede venir como texto');
});

test('un cliente sin órdenes no rompe ni muestra NaN', () => {
  for (const c of [clientes[2], clientes[3]]) {
    const k = kpisCliente(c, datos, HOY);
    assert.equal(k.ordenes, 0);
    assert.equal(k.activas, 0);
    assert.equal(k.cobrado, 0);
    assert.equal(k.cotizado, 0);
    assert.equal(k.ultimaActividad, null);
    assert.equal(Object.values(k).some((v) => typeof v === 'number' && Number.isNaN(v)), false);
  }
});

test('un cliente sin datos ni id tampoco rompe', () => {
  for (const entrada of [null, undefined, {}, { id: 'no_existe' }]) {
    const k = kpisCliente(entrada, datos, HOY);
    assert.equal(k.ordenes, 0);
    assert.equal(k.flotilla, 0);
  }
  const k2 = kpisCliente(clientes[0], undefined, HOY);
  assert.equal(k2.ordenes, 0);
  const k3 = kpisCliente(clientes[0], { ordenes: null, baterias: 'nada' }, HOY);
  assert.equal(k3.ordenes, 0);
  assert.equal(k3.flotilla, 0);
});

test('la ficha trae órdenes, equipos y garantías ordenadas', () => {
  const f = fichaCliente(clientes[0], datos, HOY);
  assert.equal(f.cliente.id, 'cli_01');
  assert.equal(f.ordenes.length, 3);
  assert.equal(f.ordenes[0].id, 'ord_02', 'la más reciente primero');
  assert.equal(f.baterias.length, 3, 'las baterías incluyen las dadas de baja');
  assert.equal(f.garantias.length, 2, 'las garantías se listan siempre, vigentes o no');
  assert.equal(f.garantias[0].vigente, true, 'la vigente primero');
  assert.equal(f.garantias[0].dias > 0, true);
  assert.equal(f.garantias[1].vigente, false);
  assert.equal(f.garantias[1].dias, null, 'sin fecha no se inventan días');
  assert.equal(f.kpis.cobrado, 25000);
  const vacia = fichaCliente(clientes[2], datos, HOY);
  assert.deepEqual(vacia.ordenes, []);
  assert.deepEqual(vacia.garantias, []);
});

test('los totales de la cabecera suman todos los clientes', () => {
  const { filas, totales } = resumenClientes(clientes, datos, HOY);
  assert.equal(filas.length, 4);
  assert.equal(totales.clientes, 4);
  assert.equal(totales.activas, 2);
  assert.equal(totales.flotilla, 3);
  assert.equal(totales.garantias, 2);
  assert.equal(totales.cobrado, 120000, 'los 999999 de la orden sin cliente no entran');
  const sinNada = resumenClientes(null, datos, HOY);
  assert.deepEqual(sinNada.filas, []);
  assert.equal(sinNada.totales.clientes, 0);
});

test('el buscador encuentra por nombre, contacto, email y tipo', () => {
  const { filas } = resumenClientes(clientes, datos, HOY);
  assert.equal(filtrarClientes(filas, 'juan').length, 1);
  assert.equal(filtrarClientes(filas, 'LOGISTICA').length, 1);
  assert.equal(filtrarClientes(filas, 'ricardo').length, 1);
  assert.equal(filtrarClientes(filas, 'compras@ldv.com').length, 1);
  assert.equal(filtrarClientes(filas, 'flotilla').length, 1);
  assert.equal(filtrarClientes(filas, '5555-0103').length, 1);
  assert.equal(filtrarClientes(filas, 'no existe').length, 0);
  assert.equal(filtrarClientes(filas, '   ').length, 4, 'sin texto devuelve todo');
  assert.deepEqual(filtrarClientes(null, 'juan'), []);
});

test('el orden por columna deja primero el número más alto', () => {
  const { filas } = resumenClientes(clientes, datos, HOY);
  assert.equal(ordenarClientes(filas, 'cobrado')[0].cliente.id, 'cli_03');
  assert.equal(ordenarClientes(filas, 'flotilla')[0].cliente.id, 'cli_01');
  assert.equal(ordenarClientes(filas, 'activas')[0].cliente.id, 'cli_01');
  const porNombre = ordenarClientes(filas, 'nombre').map((f) => f.cliente.nombre);
  assert.deepEqual(porNombre, ['Cliente sin nada', 'Cliente sin telefono', 'Juan Garcia', 'Logistica del Valle S.A.']);
  assert.deepEqual(ordenarClientes(filas, 'criterio_raro').length, 4, 'un criterio raro no rompe');
  assert.deepEqual(ordenarClientes(null, 'nombre'), []);
  assert.equal(ORDENES.every((o) => o.key && o.label), true);
});

test('el tipo de cliente se muestra en palabras', () => {
  assert.equal(tipoCliente('particular'), 'Particular');
  assert.equal(tipoCliente('flotilla_corporativa'), 'Flotilla');
  assert.equal(tipoCliente(''), 'Sin tipo');
  assert.equal(tipoCliente('otro_tipo'), 'otro tipo');
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
