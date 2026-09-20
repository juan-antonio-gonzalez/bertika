// Tests del cotizador de visitas y del proveedor de dólar.
// Sin dependencias:  npm test
import assert from 'node:assert/strict';
import {
  calcularVisita, zonaParaKm, normalizarExtras, normalizarRenglones, normalizarConfig,
  textoFueraCobertura, COTIZADOR_VISITA, MAX_KM,
} from '../src/data/cotizadorVisita.js';
import { obtenerDolar, resetCacheDolar } from '../api/dolar.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try {
    fn();
    pasaron += 1;
    console.log(`  ok  ${nombre}`);
  } catch (e) {
    console.error(`FALLA  ${nombre}\n      ${e.message}`);
    process.exitCode = 1;
  }
};
const asyncTest = async (nombre, fn) => {
  try {
    await fn();
    pasaron += 1;
    console.log(`  ok  ${nombre}`);
  } catch (e) {
    console.error(`FALLA  ${nombre}\n      ${e.message}`);
    process.exitCode = 1;
  }
};
const T = (km, extra = {}) => calcularVisita({ km, renglones: [], ...extra });

console.log('\nZonas y traslado (fronteras, incluye decimales)');
// Regresión: 25,5 y 50,9 caían en "Hasta 25 km" por el hueco entre franjas.
// Base por franja + $/km pasado lo cubierto (por defecto, $3/km desde 200 km).
const casos = [
  [0.5, 'z1', 180], [25, 'z1', 180], [25.5, 'z2', 280], [50, 'z2', 280],
  [50.9, 'z3', 420], [100, 'z3', 420], [100.9, 'z4', 600], [150, 'z4', 600],
  [200, 'z4', 600], [250, 'z4', 750], [300, 'z4', 900], [400, 'z4', 1200],
  [500, 'z4', 1500], [700, 'z4', 2100],
];
for (const [km, zona, traslado] of casos) {
  test(`${km} km → ${zona} · traslado USD ${traslado}`, () => {
    const r = T(km);
    assert.equal(r.zona.id, zona);
    assert.equal(r.traslado, traslado);
  });
}
test('km 0 no cobra traslado', () => assert.equal(T(0).traslado, 0));
test(`más de ${MAX_KM} km queda fuera de cobertura y sin total`, () => {
  const r = T(MAX_KM + 1);
  assert.equal(r.fueraDeZona, true);
  assert.equal(r.ok, false);
  assert.equal(r.total, null);
  assert.equal(r.zonas, undefined);
  assert.equal(zonaParaKm(5000), null);
});
test('aviso de fuera de cobertura menciona al vendedor', () => {
  const r = T(800);
  assert.ok(r.avisos.some((a) => a.id === 'fuera_cobertura' && /vendedor/i.test(a.texto)));
});
test('más de 100 km avisa que el traslado queda sujeto a revisión', () => {
  assert.ok(T(180).avisos.some((a) => a.id === 'larga_distancia'));
});

console.log('\nRevisión y descuentos por volumen');
test('12 unidades de tracción: 14.400 con 10% de descuento', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'traccion', cantidad: 12 }] });
  assert.equal(r.revision, 14400);
  assert.equal(r.descPct, 0.1);
  assert.equal(r.descuentoVol, 1440);
});
test('tramos de descuento: 4 → 0%, 5 → 5%, 10 → 10%, 25 → 15%', () => {
  const pct = (n) => calcularVisita({ km: 10, renglones: [{ tipoId: 'plomo', cantidad: n }] }).descPct;
  assert.equal(pct(4), 0);
  assert.equal(pct(5), 0.05);
  assert.equal(pct(10), 0.1);
  assert.equal(pct(25), 0.15);
});
test('tipos inválidos y cantidades fuera de rango se descartan/acotan', () => {
  const r = calcularVisita({ km: 10, renglones: [{ tipoId: 'nope', cantidad: 5 }, { tipoId: 'plomo', cantidad: 9999 }] });
  assert.equal(r.detalle.length, 1);
  assert.equal(r.detalle[0].cantidad, COTIZADOR_VISITA.maxUnidadesPorRenglon);
});
test('más de 20 renglones se recortan', () => {
  const muchos = Array.from({ length: 30 }, () => ({ tipoId: 'plomo', cantidad: 1 }));
  assert.equal(normalizarRenglones(muchos).length, COTIZADOR_VISITA.maxRenglones);
});

console.log('\nExtras (multiplican por equipo cuando corresponde)');
test('extras por equipo: 12 unidades → preventivo 8.400 + informe 3.600', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'traccion', cantidad: 12 }], extrasSel: ['preventivo', 'informe'] });
  assert.equal(r.extras, 12000);
  const preventivo = r.detExtras.find((e) => e.id === 'preventivo');
  assert.equal(preventivo.cantidad, 12);
  assert.equal(preventivo.subtotal, 8400);
});
test('extra que no es por equipo se cobra una sola vez', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'traccion', cantidad: 12 }], extrasSel: ['cargadores'] });
  assert.equal(r.extras, 600);
});
test('cantidad de extra explícita manda sobre la sugerida', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'traccion', cantidad: 12 }], extrasSel: [{ id: 'preventivo', cantidad: 3 }] });
  assert.equal(r.extras, 2100);
});
test('sin baterías cargadas, un extra por equipo se cobra mínimo 1 vez', () => {
  const r = calcularVisita({ km: 35, renglones: [], extrasSel: ['informe'] });
  assert.equal(r.extras, 300);
});
test('extras desconocidos se ignoran y el aviso comercial está presente', () => {
  const r = calcularVisita({ km: 35, renglones: [], extrasSel: ['noexiste', 'informe'] });
  assert.equal(r.detExtras.length, 1);
  assert.ok(r.avisos.some((a) => a.id === 'extras'));
  assert.equal(normalizarExtras(['noexiste']).length, 0);
});

console.log('\nRecargos, IVA y total');
test('el total es subtotal + recargos + IVA (todo redondeado)', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'traccion', cantidad: 12 }], extrasSel: ['preventivo', 'informe'], urgencia: 'express' });
  assert.equal(r.subtotal, r.traslado + r.revision - r.descuentoVol + r.extras);
  assert.equal(r.recargo, Math.round(r.subtotal * r.recargoPct));
  assert.equal(r.iva, Math.round((r.subtotal + r.recargo) * COTIZADOR_VISITA.iva));
  assert.equal(r.total, r.subtotal + r.recargo + r.iva);
  assert.equal(r.recargoPct, 0.25);
});
test('express + fin de semana acumula 55%', () => {
  assert.equal(calcularVisita({ km: 10, renglones: [], urgencia: 'express', turno: 'finde' }).recargoPct, 0.55);
});
test('todos los importes quedan enteros', () => {
  const r = calcularVisita({ km: 37.4, renglones: [{ tipoId: 'nicd', cantidad: 7 }], extrasSel: ['pruebaCap'], turno: 'finde' });
  for (const k of ['traslado', 'revision', 'descuentoVol', 'extras', 'subtotal', 'recargo', 'iva', 'total']) {
    assert.ok(Number.isInteger(r[k]), `${k} no es entero (${r[k]})`);
  }
});

console.log('\nResumen y equivalente en pesos');
test('el resumen incluye el total y el desglose de extras', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'traccion', cantidad: 12 }], extrasSel: ['preventivo'] });
  assert.match(r.resumen, /TOTAL ESTIMADO/);
  assert.match(r.resumen, /Mantenimiento preventivo por equipo × 12/);
  assert.match(r.resumen, /Vigencia de la estimación: 15 días/);
});
test('con cotización del dólar agrega el equivalente informativo', () => {
  const r = calcularVisita({ km: 35, renglones: [{ tipoId: 'plomo', cantidad: 1 }], dolar: { venta: 1535, casa: 'oficial', fuente: 'test', actualizado: '2026-09-18T18:55:00.000Z' } });
  assert.equal(r.ars, Math.round(r.total * 1535));
  assert.match(r.resumen, /Equivalente informativo/);
  assert.match(r.resumenCorto, /TOTAL ESTIMADO/);
});
test('fuera de cobertura el resumen avisa y no hay equivalente', () => {
  const r = calcularVisita({ km: 900, renglones: [], dolar: { venta: 1535 } });
  assert.equal(r.ars, null);
  assert.match(r.resumen, /fuera de la cobertura/);
});

console.log('\nConfiguración editable (validación y uso)');
const cfgBase = normalizarConfig(COTIZADOR_VISITA);
test('la config de fábrica queda normalizada y con cobertura 700 km', () => {
  assert.equal(cfgBase.maxKm, 700);
  assert.equal(cfgBase.zonas.length, 4);
  assert.deepEqual(cfgBase.zonas.map((z) => z.desdeKm), [0, 25, 50, 100]);
  assert.equal(cfgBase.zonas[3].kmAdicional, 3);
});
test('las franjas se ordenan y el desdeKm se deriva de la anterior', () => {
  const c = normalizarConfig({ zonas: [
    { nombre: 'Lejos', hastaKm: 500, base: 900, kmAdicional: 2 },
    { nombre: 'Cerca', hastaKm: 30, base: 150 },
    { nombre: 'Medio', hastaKm: 120, base: 400 },
  ] });
  assert.deepEqual(c.zonas.map((z) => z.nombre), ['Cerca', 'Medio', 'Lejos']);
  assert.deepEqual(c.zonas.map((z) => z.desdeKm), [0, 30, 120]);
  assert.equal(c.maxKm, 500);
  assert.equal(c.zonas[0].cubreKm, 30); // sin cubreKm explícito cubre toda la franja
});
test('rechaza franjas que no avanzan', () => {
  assert.throws(() => normalizarConfig({ zonas: [{ nombre: 'A', hastaKm: 50, base: 100 }, { nombre: 'B', hastaKm: 50, base: 200 }] }), /no avanza/);
});
test('rechaza cubreKm fuera de la franja', () => {
  assert.throws(() => normalizarConfig({ zonas: [{ nombre: 'A', hastaKm: 50, base: 100, cubreKm: 80 }] }), /km cubiertos/);
});
test('rechaza IVA fuera de 0-100% y config sin tipos', () => {
  assert.throws(() => normalizarConfig({ ...COTIZADOR_VISITA, iva: 1.5 }), /IVA/);
  assert.throws(() => normalizarConfig({ ...COTIZADOR_VISITA, tipos: [] }), /al menos un tipo/);
});
test('la config editada manda en el cálculo (base y $/km propios)', () => {
  const cfg = normalizarConfig({
    ...COTIZADOR_VISITA,
    zonas: [{ nombre: 'Zona única', hastaKm: 400, base: 1000, cubreKm: 100, kmAdicional: 5 }],
    iva: 0,
    descuentos: [],
    viaticos: { desdeKm: 400, porDia: 0 }, // sin viáticos para aislar el traslado
  });
  const r = calcularVisita({ km: 300, renglones: [], config: cfg });
  assert.equal(r.traslado, 1000 + 200 * 5);
  assert.equal(r.viaticos, 0);
  assert.equal(r.total, 2000);
  assert.equal(r.iva, 0);
  assert.equal(zonaParaKm(401, cfg), null);
  assert.match(textoFueraCobertura(cfg.maxKm), /400 km/);
});
test('la config editada cambia precios de tipos, extras y recargos', () => {
  const cfg = normalizarConfig({
    ...COTIZADOR_VISITA,
    zonas: [{ nombre: 'Z', hastaKm: 100, base: 0 }],
    tipos: [{ id: 'x', nombre: 'Tipo X', precioUnidad: 100 }],
    extras: [{ id: 'y', nombre: 'Extra Y', precio: 50, porEquipo: true }],
    descuentos: [{ desde: 2, pct: 0.5 }],
    urgencia: { normal: 0, express: 1 },
    turno: { comercial: 0, finde: 0 },
    viaticos: { desdeKm: 50, porDia: 0 },
    iva: 0.1,
  });
  const r = calcularVisita({ km: 10, renglones: [{ tipoId: 'x', cantidad: 2 }], extrasSel: ['y'], urgencia: 'express', config: cfg });
  assert.equal(r.revision, 200);
  assert.equal(r.descuentoVol, 100);
  assert.equal(r.extras, 100);
  assert.equal(r.subtotal, 200);
  assert.equal(r.recargo, 200);
  assert.equal(r.iva, 40);
  assert.equal(r.total, 440);
  assert.equal(cfg.maxCantidadExtra, COTIZADOR_VISITA.maxCantidadExtra);
});

console.log('\nViáticos (a partir de 300 km por defecto)');
test('hasta 300 km no hay viáticos', () => {
  assert.equal(T(299).viaticos, 0);
  assert.equal(T(150).viaticosDias, 0);
});
test('300 km = 1 día; +1 día cada 200 km', () => {
  const d = (km) => T(km).viaticosDias;
  assert.equal(d(300), 1);
  assert.equal(d(499), 1);
  assert.equal(d(500), 2);
  assert.equal(d(700), 3);
  assert.equal(T(500).viaticos, 2 * COTIZADOR_VISITA.viaticos.porDia);
});
test('los viáticos entran en el subtotal', () => {
  const r = calcularVisita({ km: 500, renglones: [{ tipoId: 'plomo', cantidad: 1 }] });
  assert.equal(r.subtotal, r.traslado + r.viaticos + r.revision - r.descuentoVol + r.extras);
  assert.match(r.resumen, /Viáticos: 2 día\(s\)/);
});
test('config de viáticos propia: umbral, valor por día y tope de días', () => {
  const cfg = normalizarConfig({ ...COTIZADOR_VISITA, viaticos: { desdeKm: 100, porDia: 100, diaCadaKm: 50, maxDias: 2 } });
  assert.equal(calcularVisita({ km: 99, renglones: [], config: cfg }).viaticosDias, 0);
  assert.equal(calcularVisita({ km: 100, renglones: [], config: cfg }).viaticosDias, 1);
  assert.equal(calcularVisita({ km: 150, renglones: [], config: cfg }).viaticosDias, 2);
  assert.equal(calcularVisita({ km: 700, renglones: [], config: cfg }).viaticosDias, 2); // tope
  assert.equal(calcularVisita({ km: 150, renglones: [], config: cfg }).viaticos, 200);
});
test('porDia = 0 desactiva los viáticos', () => {
  const cfg = normalizarConfig({ ...COTIZADOR_VISITA, viaticos: { ...COTIZADOR_VISITA.viaticos, porDia: 0 } });
  assert.equal(calcularVisita({ km: 600, renglones: [], config: cfg }).viaticos, 0);
});
test('valida la config de viáticos', () => {
  assert.throws(() => normalizarConfig({ ...COTIZADOR_VISITA, viaticos: { desdeKm: 900 } }), /viáticos/);
  const cfg = normalizarConfig({ ...COTIZADOR_VISITA, viaticos: { desdeKm: 300, porDia: 150, diaCadaKm: 0, maxDias: 99 } });
  assert.equal(cfg.viaticos.diaCadaKm, 1);
  assert.equal(cfg.viaticos.maxDias, 30);
});
test('fuera de cobertura no hay viáticos ni total', () => {
  const r = T(701);
  assert.equal(r.fueraDeZona, true);
  assert.equal(r.viaticos, 0);
  assert.equal(r.total, null);
});

console.log('\nRevisión en nuestro taller (sin traslado, con bonificación)');
test('en taller no hay traslado ni viáticos y la revisión se bonifica', () => {
  const r = calcularVisita({ km: 500, renglones: [{ tipoId: 'plomo', cantidad: 2 }], modo: 'taller' });
  assert.equal(r.modo, 'taller');
  assert.equal(r.zona, null);
  assert.equal(r.traslado, 0);
  assert.equal(r.viaticos, 0);
  assert.equal(r.revisionBruta, 1700);
  assert.equal(r.descuentoTaller, Math.round(1700 * COTIZADOR_VISITA.modoTaller.descuentoRevisionPct));
  assert.equal(r.revision, 1445);
  assert.equal(r.subtotal, 1445);
  assert.equal(r.total, 1445 + Math.round(1445 * COTIZADOR_VISITA.iva));
  assert.match(r.resumen, /revisión en nuestro taller/i);
});
test('la bonificación de taller y el descuento por volumen se acumulan', () => {
  const r = calcularVisita({ km: 10, renglones: [{ tipoId: 'plomo', cantidad: 10 }], modo: 'taller' });
  assert.equal(r.revisionBruta, 8500);
  assert.equal(r.descuentoTaller, 1275);
  assert.equal(r.revision, 7225);
  assert.equal(r.descuentoVol, Math.round(7225 * 0.1));
});
test('en taller una distancia enorme no cae en fuera de cobertura', () => {
  const r = calcularVisita({ km: 5000, renglones: [{ tipoId: 'plomo', cantidad: 1 }], modo: 'taller' });
  assert.equal(r.fueraDeZona, false);
  assert.equal(r.ok, true);
  assert.equal(r.traslado, 0);
  assert.equal(r.avisos.some((a) => a.id === 'fuera_cobertura'), false);
});
test('si el admin deshabilita el modo taller, se cotiza como visita', () => {
  const cfg = normalizarConfig({ ...COTIZADOR_VISITA, modoTaller: { habilitado: false, descuentoRevisionPct: 0.15 } });
  const r = calcularVisita({ km: 100, renglones: [{ tipoId: 'plomo', cantidad: 1 }], modo: 'taller', config: cfg });
  assert.equal(r.modo, 'sitio');
  assert.equal(r.traslado, 420);
});

console.log('\nCosto interno y margen (solo para el admin)');
test('el costo suma viaje ida y vuelta, días de técnico y viáticos reales', () => {
  const r = calcularVisita({ km: 500, renglones: [{ tipoId: 'plomo', cantidad: 1 }] });
  assert.equal(r.viaticosDias, 2);
  assert.equal(r.diasTecnico, 3);
  assert.equal(r.costoViaje, Math.round(500 * 2 * COTIZADOR_VISITA.costos.porKm));
  assert.equal(r.costoDias, 3 * COTIZADOR_VISITA.costos.tecnicoPorDia);
  assert.equal(r.costoViaticos, 2 * COTIZADOR_VISITA.costos.viaticoPorDia);
  assert.equal(r.costoInterno, r.costoViaje + r.costoDias + r.costoViaticos);
  assert.equal(r.margen, r.subtotal - r.costoInterno);
  assert.equal(r.margenPct, Math.round((r.margen / r.subtotal) * 100));
});
test('en taller el costo interno no incluye viaje', () => {
  const r = calcularVisita({ km: 400, renglones: [{ tipoId: 'plomo', cantidad: 1 }], modo: 'taller' });
  assert.equal(r.costoViaje, 0);
  assert.equal(r.costoViaticos, 0);
  assert.equal(r.diasTecnico, 1);
  assert.equal(r.costoInterno, COTIZADOR_VISITA.costos.tecnicoPorDia);
});

console.log('\nProveedor de dólar (proxy con caché y fallback)');
const respuesta = (obj, ok = true) => ({ ok, json: async () => obj });
const dolarapi = respuesta({ compra: 1485, venta: 1535, fechaActualizacion: '2026-09-18T18:55:00.000Z' });
const bluelytics = respuesta({ oficial: { value_buy: 1482, value_sell: 1534 }, last_update: '2026-09-18T19:45:56-03:00' });

await asyncTest('usa el primer proveedor y normaliza el valor', async () => {
  resetCacheDolar();
  const d = await obtenerDolar({ fetchImpl: async () => dolarapi });
  assert.equal(d.disponible, true);
  assert.equal(d.venta, 1535);
  assert.equal(d.fuente, 'dolarapi.com');
  assert.equal(d.compra, 1485);
});
await asyncTest('si el primero falla, cae al segundo', async () => {
  resetCacheDolar();
  const d = await obtenerDolar({ fetchImpl: async (url) => (url.includes('dolarapi') ? Promise.reject(new Error('sin red')) : bluelytics) });
  assert.equal(d.disponible, true);
  assert.equal(d.venta, 1534);
  assert.equal(d.fuente, 'bluelytics');
});
await asyncTest('si todos fallan y no hay caché, queda no disponible', async () => {
  resetCacheDolar();
  const d = await obtenerDolar({ fetchImpl: async () => { throw new Error('sin red'); } });
  assert.equal(d.disponible, false);
  assert.ok(d.motivo);
});
await asyncTest('el segundo llamado dentro de la ventana usa la caché', async () => {
  resetCacheDolar();
  let llamados = 0;
  const fetchContador = async () => { llamados += 1; return dolarapi; };
  await obtenerDolar({ fetchImpl: fetchContador });
  const d2 = await obtenerDolar({ fetchImpl: fetchContador });
  assert.equal(llamados, 1);
  assert.equal(d2.cacheado, true);
});
await asyncTest('con forzar y proveedores caídos sirve el valor previo marcado vencido', async () => {
  resetCacheDolar();
  await obtenerDolar({ fetchImpl: async () => dolarapi });
  const d = await obtenerDolar({ fetchImpl: async () => { throw new Error('sin red'); }, forzar: true });
  assert.equal(d.disponible, true);
  assert.equal(d.vencido, true);
  assert.equal(d.venta, 1535);
});
await asyncTest('descarta respuestas con venta inválida', async () => {
  resetCacheDolar();
  const d = await obtenerDolar({ fetchImpl: async () => respuesta({ venta: 0 }) });
  assert.equal(d.disponible, false);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
