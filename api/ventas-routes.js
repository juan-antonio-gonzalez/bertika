// Ventas V2: oportunidad comercial independiente de WhatsApp y de la orden.
// La conversación es un canal; la cotización es un documento con ítems.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { authRequired, permisoRequerido } from './middleware/auth.js';
import { query, one, tx } from './db.js';
import { auditar } from './auditoria.js';
import { ETAPAS, normalizarEtapa, normalizarMonto } from '../src/data/crm.js';

const idNuevo = (p) => `${p}_${randomUUID()}`;
const limStr = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v, min = 0, max = 1e9) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
};
const abiertas = ['nuevo', 'presupuestado', 'negociando'];
const veTodas = (req) => req.user?.rol === 'admin' || req.user?.permisos?.ventas_todos === true;

export const ventasRouter = Router();

const ventasPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas de cotización. Esperá unos minutos.' },
});

// Devuelve null si viene vacío, undefined si es inválida, o la fecha YYYY-MM-DD.
function fechaISO(valor) {
  const texto = limStr(valor, 10);
  if (!texto) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined;
  const d = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) return undefined;
  return texto;
}

function cotizacionVencida(q, ahora = Date.now()) {
  if (!q || !['enviada', 'vista'].includes(q.estado) || !q.enviada_en) return false;
  const dias = Math.max(1, Number(q.validez_dias) || 15);
  return new Date(q.enviada_en).getTime() + dias * 86400000 < ahora;
}

async function evento(oportunidadId, tipo, detalle, usuario) {
  try {
    await query(
      'INSERT INTO oportunidad_eventos (id, oportunidad_id, tipo, detalle, usuario) VALUES ($1,$2,$3,$4,$5)',
      [idNuevo('oev'), oportunidadId, tipo, detalle || null, usuario || null]
    );
  } catch { /* el timeline no debe romper la operación */ }
}

async function oportunidadVisible(req, id) {
  const fila = await one(
    `SELECT o.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.email AS cliente_email
       FROM oportunidades o LEFT JOIN clientes c ON c.id = o.cliente_id
      WHERE o.id = $1 AND o.archivada = false`,
    [id]
  );
  if (!fila) return null;
  if (!veTodas(req) && fila.responsable && fila.responsable !== req.user.email) return null;
  return fila;
}

function sumarItems(items, descuentoGlobal = 0, ivaPct = 0) {
  let subtotal = 0;
  const limpios = (items || []).slice(0, 100).map((it, i) => {
    const cantidad = num(it.cantidad, 0.01, 1e6);
    const precio = num(it.precio_unitario ?? it.precio, 0, 1e9);
    const descuento = num(it.descuento, 0, 1e9);
    const total = Math.max(0, Math.round((cantidad * precio - descuento) * 100) / 100);
    subtotal += total;
    return {
      descripcion: limStr(it.descripcion, 240) || `Ítem ${i + 1}`,
      cantidad,
      precio_unitario: precio,
      descuento,
      total,
      orden: i * 10,
    };
  });
  subtotal = Math.round(subtotal * 100) / 100;
  const descuento = Math.min(subtotal, num(descuentoGlobal, 0, 1e9));
  const base = Math.max(0, subtotal - descuento);
  const iva = Math.round(base * (num(ivaPct, 0, 100) / 100) * 100) / 100;
  return { items: limpios, subtotal, descuento, iva_pct: num(ivaPct, 0, 100), total: Math.round((base + iva) * 100) / 100 };
}

async function crearOrdenDesdeOportunidad(oportunidad, req, cotizacion = null) {
  if (!oportunidad.cliente_id) throw Object.assign(new Error('La oportunidad no tiene cliente asociado.'), { status: 400 });
  if (!limStr(oportunidad.serie, 80)) throw Object.assign(new Error('Cargá el número de serie para crear la orden.'), { status: 400 });
  if (oportunidad.orden_id) {
    const existente = await one('SELECT id FROM ordenes WHERE id = $1', [oportunidad.orden_id]);
    if (existente) return existente.id;
  }
  const serie = limStr(oportunidad.serie, 80);
  const clienteId = oportunidad.cliente_id;
  const cliente = await one('SELECT id FROM clientes WHERE id = $1 AND deleted_at IS NULL', [clienteId]);
  if (!cliente) throw Object.assign(new Error('El cliente de la oportunidad no existe.'), { status: 400 });
  const ordId = idNuevo('ord');
  const codigo = `VEN-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 5).toUpperCase()}`;
  const evId = idNuevo('ev');
  await tx(async (client) => {
    const bat = (await client.query('SELECT id FROM baterias WHERE numero_serie = $1', [serie])).rows[0];
    if (!bat) {
      await client.query(
        `INSERT INTO baterias (id, numero_serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, fecha_fabricacion, cliente_id, ciclos_estimados, estado_vida)
         VALUES ($1,$2,'Plomo-Acido','12V',60,'Automotriz','Generica','Estandar',$3,$4,$5,300,'activa')`,
        [idNuevo('bat'), serie, serie, new Date().toISOString().slice(0, 10), clienteId]
      );
    }
    const cotizacionJson = cotizacion
      ? JSON.stringify({ monto: cotizacion.total, moneda: cotizacion.moneda || 'ARS', origen: 'ventas', cotizacion_id: cotizacion.id })
      : null;
    await client.query(
      `INSERT INTO ordenes (id, codigo_seguimiento, bateria_serie, cliente_id, tecnico_id, falla, motivo, estado, fecha_ingreso, hora_entrega, eventos, cotizacion, estado_cotizacion, insumos_utilizados, prueba_final, diagnostico, oportunidad_id, cotizacion_id)
       VALUES ($1,$2,$3,$4,NULL,$5,$5,'received',$6,$7,$8::jsonb,$9::jsonb,$10,'[]'::jsonb,'{"estado":"pending"}',NULL,$11,$12)`,
      [
        ordId, codigo, serie, clienteId, oportunidad.titulo || 'Ingreso por oportunidad ganada', new Date().toISOString(),
        new Date(Date.now() + 24 * 3600000).toISOString(),
        JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Ingreso generado desde la oportunidad "${oportunidad.titulo}".`, fecha: new Date().toISOString(), usuario: req.user.email }]),
        cotizacionJson, cotizacion ? (cotizacion.estado === 'aceptada' ? 'approved' : 'pending') : null, oportunidad.id, cotizacion?.id || null,
      ]
    );
    await client.query('UPDATE oportunidades SET orden_id = $2, cotizacion_actual_id = COALESCE($3, cotizacion_actual_id), etapa = $4, etapa_desde = now(), actualizado_en = now(), actualizado_por = $5 WHERE id = $1', [oportunidad.id, ordId, cotizacion?.id || oportunidad.cotizacion_actual_id || null, 'ganado', req.user.email]);
  });
  await evento(oportunidad.id, 'orden_creada', `Orden ${ordId}`, req.user.email);
  await auditar({ req, tabla: 'oportunidades', registroId: oportunidad.id, accion: 'crear_orden', detalle: ordId });
  return ordId;
}

// ---------- Pipeline ----------
ventasRouter.get('/oportunidades', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const q = limStr(req.query?.q, 100);
  const etapa = req.query?.etapa ? normalizarEtapa(req.query.etapa) : null;
  const params = [];
  const cond = ['o.archivada = false'];
  if (!veTodas(req)) {
    params.push(req.user.email);
    cond.push(`(o.responsable = $${params.length} OR o.responsable IS NULL)`);
  }
  if (etapa) { params.push(etapa); cond.push(`o.etapa = $${params.length}`); }
  if (q) { params.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); cond.push(`(o.titulo ILIKE $${params.length} OR c.nombre ILIKE $${params.length} OR o.prospecto_nombre ILIKE $${params.length})`); }
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 100));
  const offset = Math.max(0, Number(req.query?.offset) || 0);
  params.push(limit, offset);
  const filas = await query(
    `SELECT o.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            q.estado AS cotizacion_estado, q.total AS cotizacion_total, q.token AS cotizacion_token,
            GREATEST(0, floor(extract(epoch FROM (now() - o.etapa_desde)) / 86400))::int AS dias_etapa
       FROM oportunidades o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN cotizaciones q ON q.id = o.cotizacion_actual_id
      WHERE ${cond.join(' AND ')}
      ORDER BY o.actualizado_en DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.json(filas);
});

ventasRouter.post('/oportunidades', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const titulo = limStr(req.body?.titulo, 160);
  if (!titulo) return res.status(400).json({ error: 'La oportunidad necesita un título.' });
  const clienteId = limStr(req.body?.cliente_id, 80) || null;
  if (clienteId) {
    const c = await one('SELECT id FROM clientes WHERE id = $1 AND deleted_at IS NULL', [clienteId]);
    if (!c) return res.status(400).json({ error: 'El cliente no existe.' });
  }
  const etapa = normalizarEtapa(req.body?.etapa);
  const cierre = fechaISO(req.body?.cierre_estimado);
  const proximaFecha = fechaISO(req.body?.fecha_proxima_accion);
  if (cierre === undefined) return res.status(400).json({ error: 'La fecha de cierre no es válida.' });
  if (proximaFecha === undefined) return res.status(400).json({ error: 'La fecha de próxima acción no es válida.' });
  if (etapa === 'perdido' && !limStr(req.body?.motivo_perdida, 200)) return res.status(400).json({ error: 'Para perder una oportunidad cargá el motivo.' });
  const id = idNuevo('op');
  const fila = await one(
    `INSERT INTO oportunidades (id, titulo, cliente_id, prospecto_nombre, prospecto_telefono, prospecto_email, etapa, monto_estimado, probabilidad, cierre_estimado, responsable, origen, canal, serie, activo_id, proxima_accion, fecha_proxima_accion, motivo_perdida, notas, creado_por, actualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20) RETURNING *`,
    [
      id, titulo, clienteId, limStr(req.body?.prospecto_nombre, 160) || null, limStr(req.body?.prospecto_telefono, 40) || null,
      limStr(req.body?.prospecto_email, 200) || null, etapa, normalizarMonto(req.body?.monto_estimado), req.body?.probabilidad !== undefined ? num(req.body.probabilidad, 0, 100) : (etapa === 'nuevo' ? 10 : 50),
      cierre, limStr(req.body?.responsable, 200) || req.user.email,
      limStr(req.body?.origen, 80) || null, limStr(req.body?.canal, 80) || 'manual', limStr(req.body?.serie, 80) || null,
      limStr(req.body?.activo_id, 80) || null, limStr(req.body?.proxima_accion, 240) || null,
      proximaFecha, limStr(req.body?.motivo_perdida, 200) || null, limStr(req.body?.notas, 2000) || null, req.user.email,
    ]
  );
  await evento(id, 'creada', titulo, req.user.email);
  await auditar({ req, tabla: 'oportunidades', registroId: id, accion: 'crear', despues: fila });
  return res.status(201).json(fila);
});

ventasRouter.get('/oportunidades/:id', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const o = await oportunidadVisible(req, req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const [cotizaciones, eventos] = await Promise.all([
    query('SELECT * FROM cotizaciones WHERE oportunidad_id = $1 ORDER BY version DESC, creado_en DESC', [o.id]),
    query('SELECT * FROM oportunidad_eventos WHERE oportunidad_id = $1 ORDER BY creado_en DESC LIMIT 100', [o.id]),
  ]);
  return res.json({ ...o, cotizaciones, eventos });
});

ventasRouter.patch('/oportunidades/:id', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const o = await oportunidadVisible(req, req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const etapa = req.body?.etapa !== undefined ? normalizarEtapa(req.body.etapa) : o.etapa;
  const cierre = req.body?.cierre_estimado !== undefined ? fechaISO(req.body.cierre_estimado) : o.cierre_estimado;
  const proximaFecha = req.body?.fecha_proxima_accion !== undefined ? fechaISO(req.body.fecha_proxima_accion) : o.fecha_proxima_accion;
  if (cierre === undefined) return res.status(400).json({ error: 'La fecha de cierre no es válida.' });
  if (proximaFecha === undefined) return res.status(400).json({ error: 'La fecha de próxima acción no es válida.' });
  if (etapa === 'perdido' && !limStr(req.body?.motivo_perdida ?? o.motivo_perdida, 200)) return res.status(400).json({ error: 'Para perder una oportunidad cargá el motivo.' });
  const clienteId = req.body?.cliente_id !== undefined ? (limStr(req.body.cliente_id, 80) || null) : o.cliente_id;
  if (clienteId && clienteId !== o.cliente_id) {
    const c = await one('SELECT id FROM clientes WHERE id = $1 AND deleted_at IS NULL', [clienteId]);
    if (!c) return res.status(400).json({ error: 'El cliente no existe.' });
  }
  const fila = await one(
    `UPDATE oportunidades SET
       titulo=$2, cliente_id=$3, prospecto_nombre=$4, prospecto_telefono=$5, prospecto_email=$6,
       etapa=$7, monto_estimado=$8, probabilidad=$9, cierre_estimado=$10, responsable=$11,
       origen=$12, canal=$13, serie=$14, activo_id=$15, proxima_accion=$16, fecha_proxima_accion=$17,
       motivo_perdida=$18, notas=$19, actualizado_por=$20, actualizado_en=now(),
       etapa_desde=CASE WHEN etapa <> $7 THEN now() ELSE etapa_desde END
     WHERE id=$1 RETURNING *`,
    [
      o.id, limStr(req.body?.titulo ?? o.titulo, 160), clienteId, limStr(req.body?.prospecto_nombre ?? o.prospecto_nombre, 160) || null,
      limStr(req.body?.prospecto_telefono ?? o.prospecto_telefono, 40) || null, limStr(req.body?.prospecto_email ?? o.prospecto_email, 200) || null,
      etapa, req.body?.monto_estimado !== undefined ? normalizarMonto(req.body.monto_estimado) : o.monto_estimado,
      req.body?.probabilidad !== undefined ? num(req.body.probabilidad, 0, 100) : o.probabilidad,
      cierre, limStr(req.body?.responsable ?? o.responsable, 200) || req.user.email,
      limStr(req.body?.origen ?? o.origen, 80) || null, limStr(req.body?.canal ?? o.canal, 80) || 'manual',
      limStr(req.body?.serie ?? o.serie, 80) || null, limStr(req.body?.activo_id ?? o.activo_id, 80) || null,
      limStr(req.body?.proxima_accion ?? o.proxima_accion, 240) || null, proximaFecha,
      limStr(req.body?.motivo_perdida ?? o.motivo_perdida, 200) || null, limStr(req.body?.notas ?? o.notas, 2000) || null, req.user.email,
    ]
  );
  if (etapa !== o.etapa) await evento(o.id, 'etapa', `${o.etapa} → ${etapa}${etapa === 'perdido' ? ` · ${fila.motivo_perdida || ''}` : ''}`, req.user.email);
  await auditar({ req, tabla: 'oportunidades', registroId: o.id, accion: 'editar', antes: o, despues: fila });
  return res.json(fila);
});

ventasRouter.post('/oportunidades/:id/perder', authRequired, permisoRequerido('ventas_cerrar'), async (req, res) => {
  const o = await oportunidadVisible(req, req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const motivo = limStr(req.body?.motivo, 200);
  if (!motivo) return res.status(400).json({ error: 'El motivo de pérdida es obligatorio.' });
  const fila = await one("UPDATE oportunidades SET etapa='perdido', motivo_perdida=$2, etapa_desde=now(), actualizado_en=now(), actualizado_por=$3 WHERE id=$1 RETURNING *", [o.id, motivo, req.user.email]);
  await evento(o.id, 'perdida', motivo, req.user.email);
  await auditar({ req, tabla: 'oportunidades', registroId: o.id, accion: 'perder', antes: o, despues: fila });
  return res.json(fila);
});

ventasRouter.post('/oportunidades/:id/orden', authRequired, permisoRequerido('ventas_cerrar'), permisoRequerido('crear_orden'), async (req, res) => {
  const o = await oportunidadVisible(req, req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  if (o.etapa === 'perdido') return res.status(400).json({ error: 'Una oportunidad perdida no puede generar una orden.' });
  try {
    const cotizacion = o.cotizacion_actual_id ? await one('SELECT * FROM cotizaciones WHERE id = $1', [o.cotizacion_actual_id]) : null;
    const ordId = await crearOrdenDesdeOportunidad(o, req, cotizacion);
    return res.status(201).json({ id: ordId });
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
});

// ---------- Cotizaciones ----------
ventasRouter.get('/oportunidades/:id/cotizaciones', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const o = await oportunidadVisible(req, req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const filas = await query('SELECT * FROM cotizaciones WHERE oportunidad_id = $1 ORDER BY version DESC, creado_en DESC', [o.id]);
  return res.json(filas);
});

ventasRouter.post('/oportunidades/:id/cotizaciones', authRequired, permisoRequerido('ventas_cotizar'), async (req, res) => {
  const o = await oportunidadVisible(req, req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  if (o.etapa === 'perdido') return res.status(400).json({ error: 'No se puede cotizar una oportunidad perdida.' });
  const calculo = sumarItems(req.body?.items, req.body?.descuento, req.body?.iva_pct);
  if (!calculo.items.length) return res.status(400).json({ error: 'Agregá al menos un ítem.' });
  const version = Number((await one('SELECT COALESCE(MAX(version),0)::int AS n FROM cotizaciones WHERE oportunidad_id=$1', [o.id])).n) + 1;
  const id = idNuevo('cot');
  const fila = await one(
    `INSERT INTO cotizaciones (id, oportunidad_id, cliente_id, version, estado, moneda, subtotal, descuento, iva_pct, total, validez_dias, creada_por)
     VALUES ($1,$2,$3,$4,'borrador',$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [id, o.id, o.cliente_id, version, limStr(req.body?.moneda, 3) || 'ARS', calculo.subtotal, calculo.descuento, calculo.iva_pct, calculo.total, Math.max(1, Math.min(365, Number(req.body?.validez_dias) || 15)), req.user.email]
  );
  for (const it of calculo.items) {
    await query(
      'INSERT INTO cotizacion_items (id, cotizacion_id, descripcion, cantidad, precio_unitario, descuento, total, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [idNuevo('citem'), id, it.descripcion, it.cantidad, it.precio_unitario, it.descuento, it.total, it.orden]
    );
  }
  await query('UPDATE oportunidades SET cotizacion_actual_id=$2, monto_estimado=$3, etapa=CASE WHEN etapa=\'nuevo\' THEN \'presupuestado\' ELSE etapa END, etapa_desde=CASE WHEN etapa=\'nuevo\' THEN now() ELSE etapa_desde END, actualizado_en=now(), actualizado_por=$4 WHERE id=$1', [o.id, id, calculo.total, req.user.email]);
  await evento(o.id, 'cotizacion', `Cotización v${version} · $ ${calculo.total}`, req.user.email);
  await auditar({ req, tabla: 'cotizaciones', registroId: id, accion: 'crear', despues: fila });
  return res.status(201).json({ ...fila, items: calculo.items });
});

ventasRouter.get('/cotizaciones/:id', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const q = await one('SELECT * FROM cotizaciones WHERE id = $1', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  const o = await oportunidadVisible(req, q.oportunidad_id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const items = await query('SELECT * FROM cotizacion_items WHERE cotizacion_id = $1 ORDER BY orden, id', [q.id]);
  return res.json({ ...q, items, oportunidad: o });
});

ventasRouter.patch('/cotizaciones/:id', authRequired, permisoRequerido('ventas_cotizar'), async (req, res) => {
  const q = await one('SELECT * FROM cotizaciones WHERE id = $1', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  const o = await oportunidadVisible(req, q.oportunidad_id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  if (q.estado !== 'borrador') return res.status(400).json({ error: 'Solo se puede editar un borrador.' });
  const calculo = sumarItems(req.body?.items, req.body?.descuento, req.body?.iva_pct);
  if (!calculo.items.length) return res.status(400).json({ error: 'Agregá al menos un ítem.' });
  await query('DELETE FROM cotizacion_items WHERE cotizacion_id = $1', [q.id]);
  for (const it of calculo.items) {
    await query('INSERT INTO cotizacion_items (id, cotizacion_id, descripcion, cantidad, precio_unitario, descuento, total, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [idNuevo('citem'), q.id, it.descripcion, it.cantidad, it.precio_unitario, it.descuento, it.total, it.orden]);
  }
  const fila = await one('UPDATE cotizaciones SET subtotal=$2, descuento=$3, iva_pct=$4, total=$5, validez_dias=$6, actualizado_en=now() WHERE id=$1 RETURNING *', [q.id, calculo.subtotal, calculo.descuento, calculo.iva_pct, calculo.total, Math.max(1, Math.min(365, Number(req.body?.validez_dias) || q.validez_dias))]);
  await query('UPDATE oportunidades SET monto_estimado=$2, actualizado_en=now() WHERE id=$1', [o.id, calculo.total]);
  await auditar({ req, tabla: 'cotizaciones', registroId: q.id, accion: 'editar', antes: q, despues: fila });
  return res.json({ ...fila, items: calculo.items });
});

ventasRouter.post('/cotizaciones/:id/enviar', authRequired, permisoRequerido('ventas_cotizar'), async (req, res) => {
  const q = await one('SELECT * FROM cotizaciones WHERE id = $1', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  const o = await oportunidadVisible(req, q.oportunidad_id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  if (['aceptada', 'rechazada'].includes(q.estado)) return res.status(400).json({ error: 'La cotización ya fue decidida.' });
  const token = q.token || randomUUID().replace(/-/g, '').slice(0, 32);
  const fila = await one("UPDATE cotizaciones SET estado='enviada', token=$2, enviada_en=now(), actualizado_en=now() WHERE id=$1 RETURNING *", [q.id, token]);
  await query('UPDATE oportunidades SET etapa=CASE WHEN etapa=\'nuevo\' THEN \'presupuestado\' ELSE etapa END, etapa_desde=CASE WHEN etapa=\'nuevo\' THEN now() ELSE etapa_desde END, actualizado_en=now() WHERE id=$1', [o.id]);
  await evento(o.id, 'cotizacion_enviada', `Cotización v${q.version}`, req.user.email);
  await auditar({ req, tabla: 'cotizaciones', registroId: q.id, accion: 'enviar', despues: fila });
  return res.json({ ...fila, url: `/cotizacion-venta/${token}` });
});

ventasRouter.post('/cotizaciones/:id/decision', authRequired, permisoRequerido('ventas_cerrar'), async (req, res) => {
  const q = await one('SELECT * FROM cotizaciones WHERE id = $1', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  const o = await oportunidadVisible(req, q.oportunidad_id);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  return decidirCotizacion(req, res, q, o, req.body?.decision, req.body?.motivo);
});

async function decidirCotizacion(req, res, q, o, decision, motivo) {
  const estado = decision === 'aceptada' ? 'aceptada' : decision === 'rechazada' ? 'rechazada' : null;
  if (!estado) return res.status(400).json({ error: 'Elegí aceptar o rechazar.' });
  if (cotizacionVencida(q)) {
    await query("UPDATE cotizaciones SET estado='vencida', actualizado_en=now() WHERE id=$1", [q.id]);
    return res.status(410).json({ error: 'La cotización venció. Pedí una nueva versión.' });
  }
  if (q.estado !== 'enviada' && q.estado !== 'vista') return res.status(400).json({ error: 'La cotización no está pendiente de decisión.' });
  const fila = await one('UPDATE cotizaciones SET estado=$2, decidida_en=now(), motivo_rechazo=$3, actualizado_en=now() WHERE id=$1 RETURNING *', [q.id, estado, estado === 'rechazada' ? limStr(motivo, 300) || 'Sin motivo' : null]);
  if (estado === 'aceptada') {
    await query("UPDATE oportunidades SET etapa='ganado', etapa_desde=now(), actualizado_en=now() WHERE id=$1", [o.id]);
    await evento(o.id, 'ganada', `Cotización v${q.version} aceptada`, req.user?.email || 'cliente');
  } else {
    await query("UPDATE oportunidades SET etapa='perdido', motivo_perdida=$2, etapa_desde=now(), actualizado_en=now() WHERE id=$1", [o.id, limStr(motivo, 200) || 'Cotización rechazada']);
    await evento(o.id, 'perdida', limStr(motivo, 200) || 'Cotización rechazada', req.user?.email || 'cliente');
  }
  await auditar({ req, tabla: 'cotizaciones', registroId: q.id, accion: estado, despues: fila });
  return res.json(fila);
}

// ---------- Resumen / hoy ----------
ventasRouter.get('/ventas/resumen', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const cond = ['archivada = false'];
  const params = [];
  if (!veTodas(req)) { params.push(req.user.email); cond.push(`(responsable = $${params.length} OR responsable IS NULL)`); }
  const filas = await query(
    `SELECT etapa,
            count(*)::int AS cantidad,
            COALESCE(sum(monto_estimado),0) AS monto,
            COALESCE(sum(monto_estimado * (COALESCE(probabilidad,0) / 100.0)),0) AS ponderado,
            count(*) FILTER (WHERE etapa IN ('nuevo','presupuestado','negociando') AND etapa_desde < now() - interval '7 days')::int AS estancadas
       FROM oportunidades WHERE ${cond.join(' AND ')} GROUP BY etapa`,
    params
  );
  const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e.key, { cantidad: 0, monto: 0 }]));
  let total = 0;
  let abiertasN = 0;
  let pipeline = 0;
  let ponderado = 0;
  let estancadas = 0;
  for (const f of filas) {
    const etapa = normalizarEtapa(f.etapa);
    const monto = Number(f.monto) || 0;
    porEtapa[etapa].cantidad += Number(f.cantidad) || 0;
    porEtapa[etapa].monto += monto;
    total += Number(f.cantidad) || 0;
    if (abiertas.includes(etapa)) {
      abiertasN += Number(f.cantidad) || 0;
      pipeline += monto;
      ponderado += Number(f.ponderado) || 0;
      estancadas += Number(f.estancadas) || 0;
    }
  }
  const condCotis = ['o.archivada = false'];
  const paramsCotis = [];
  if (!veTodas(req)) { paramsCotis.push(req.user.email); condCotis.push(`(o.responsable = $${paramsCotis.length} OR o.responsable IS NULL)`); }
  const [cotis] = await query(`SELECT count(*) FILTER (WHERE q.estado IN ('enviada','vista'))::int AS pendientes, count(*) FILTER (WHERE q.estado='aceptada')::int AS aceptadas, COALESCE(sum(q.total) FILTER (WHERE q.estado='aceptada'),0) AS total_aceptado FROM cotizaciones q JOIN oportunidades o ON o.id=q.oportunidad_id WHERE ${condCotis.join(' AND ')}`, paramsCotis);
  return res.json({
    total,
    abiertas: abiertasN,
    porEtapa,
    pipeline: Math.round(pipeline * 100) / 100,
    ponderado: Math.round(ponderado * 100) / 100,
    estancadas,
    cotizaciones: cotis,
  });
});

ventasRouter.get('/ventas/hoy', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const cond = ['o.archivada = false', "o.etapa IN ('nuevo','presupuestado','negociando')"];
  const params = [];
  if (!veTodas(req)) { params.push(req.user.email); cond.push(`(o.responsable = $${params.length} OR o.responsable IS NULL)`); }
  const acciones = await query(`SELECT o.*, c.nombre AS cliente_nombre FROM oportunidades o LEFT JOIN clientes c ON c.id=o.cliente_id WHERE ${cond.join(' AND ')} AND (o.fecha_proxima_accion IS NOT NULL AND o.fecha_proxima_accion <= CURRENT_DATE OR o.proxima_accion IS NOT NULL AND o.fecha_proxima_accion IS NULL) ORDER BY o.fecha_proxima_accion NULLS LAST LIMIT 50`, params);
  const condHoy = [];
  const paramsHoy = [];
  if (!veTodas(req)) { paramsHoy.push(req.user.email); condHoy.push(`(o.responsable = $${paramsHoy.length} OR o.responsable IS NULL)`); }
  const extraHoy = condHoy.length ? ` AND ${condHoy.join(' AND ')}` : '';
  const sinRespuesta = await query(`SELECT q.*, o.titulo, o.id AS oportunidad_id, c.nombre AS cliente_nombre FROM cotizaciones q JOIN oportunidades o ON o.id=q.oportunidad_id LEFT JOIN clientes c ON c.id=o.cliente_id WHERE q.estado IN ('enviada','vista') AND q.enviada_en < now() - interval '3 days' AND o.archivada=false${extraHoy} ORDER BY q.enviada_en LIMIT 50`, paramsHoy);
  const estancadas = await query(`SELECT o.*, c.nombre AS cliente_nombre, GREATEST(0, floor(extract(epoch FROM (now()-o.etapa_desde))/86400))::int AS dias FROM oportunidades o LEFT JOIN clientes c ON c.id=o.cliente_id WHERE o.archivada=false AND o.etapa IN ('nuevo','presupuestado','negociando') AND o.etapa_desde < now() - interval '7 days'${extraHoy} ORDER BY o.etapa_desde LIMIT 50`, paramsHoy);
  return res.json({ acciones, sinRespuesta, estancadas });
});

// ---------- Público ----------
ventasRouter.get('/public/cotizacion-venta/:token', ventasPublicLimiter, async (req, res) => {
  const q = await one('SELECT * FROM cotizaciones WHERE token = $1', [req.params.token]);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  const o = await one('SELECT id, titulo, cliente_id, prospecto_nombre FROM oportunidades WHERE id = $1', [q.oportunidad_id]);
  const cliente = q.cliente_id ? await one('SELECT nombre, empresa, email, telefono FROM clientes WHERE id = $1', [q.cliente_id]) : null;
  const items = await query('SELECT descripcion, cantidad, precio_unitario, descuento, total FROM cotizacion_items WHERE cotizacion_id=$1 ORDER BY orden,id', [q.id]);
  if (cotizacionVencida(q)) {
    await query("UPDATE cotizaciones SET estado='vencida', actualizado_en=now() WHERE id=$1", [q.id]);
    q.estado = 'vencida';
  } else if (q.estado === 'enviada') {
    await query("UPDATE cotizaciones SET estado='vista', vista_en=now() WHERE id=$1", [q.id]);
    q.estado = 'vista';
  }
  return res.json({ cotizacion: q, items, oportunidad: o, cliente });
});

ventasRouter.post('/public/cotizacion-venta/:token', ventasPublicLimiter, async (req, res) => {
  const q = await one('SELECT * FROM cotizaciones WHERE token = $1', [req.params.token]);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  const o = await one('SELECT * FROM oportunidades WHERE id=$1', [q.oportunidad_id]);
  if (!o) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const fakeReq = { user: null, headers: req.headers, ip: req.ip };
  let codigo = 200;
  let cuerpo = null;
  const fakeRes = {
    status(code) { codigo = code; return this; },
    json(body) { cuerpo = body; return body; },
  };
  await decidirCotizacion(fakeReq, fakeRes, q, o, req.body?.decision, req.body?.motivo);
  return res.status(codigo).json(cuerpo);
});
