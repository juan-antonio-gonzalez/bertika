// Bertika - API del motor de listas dinamicas.
//
// Cada lista guarda su definicion (campos y vistas) en tablas de metadatos y
// sus filas en JSONB. Los permisos se resuelven SIEMPRE en el servidor contra
// el area de la lista y la categoria del usuario: el frontend solo dibuja.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query, one, tx } from './db.js';
import { authRequired } from './middleware/auth.js';
import { auditar } from './auditoria.js';
import { normalizarBooleano } from './validaciones.js';
import {
  CLAVES_AREA, TIPOS, normalizarOpciones, permisosArea, validarRegistro,
} from './listas.js';

export const listasRouter = Router();

const limStr = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const idNuevo = (prefijo) => `${prefijo}_${randomUUID()}`;
const TODAS = Object.fromEntries(CLAVES_AREA.map((k) => [k, true]));

function capacidades(req, areaId) {
  if (req.user?.rol === 'admin') return TODAS;
  if (req.user?.rol !== 'tecnico') return Object.fromEntries(CLAVES_AREA.map((k) => [k, false]));
  return permisosArea(req.user.areas, areaId);
}

function sinPermiso(res, mensaje = 'No tenés permiso para esta acción en esta área.') {
  return res.status(403).json({ error: mensaje });
}

async function areasVisibles(user) {
  if (!user || user.rol === 'cliente') return [];
  const areas = await query('SELECT id, slug, nombre, descripcion, icono, orden FROM areas WHERE activo = true ORDER BY orden, nombre');
  const listas = await query(`
    SELECT id, area_id, nombre, descripcion, icono, orden
      FROM listas
     WHERE archivada = false
     ORDER BY orden, lower(nombre)
  `);
  return areas
    .filter((a) => user.rol === 'admin' || permisosArea(user.areas, a.id).ver)
    .map((a) => ({
      ...a,
      puede: user.rol === 'admin' ? TODAS : permisosArea(user.areas, a.id),
      listas: listas.filter((l) => l.area_id === a.id),
    }));
}

// Se exporta para que /api/estado arme el menú dinámico en el mismo request.
export { areasVisibles };

async function listaConArea(id) {
  return one(`
    SELECT l.*, a.slug AS area_slug, a.nombre AS area_nombre
      FROM listas l
      JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1 AND l.archivada = false
  `, [id]);
}

async function camposDe(listaId) {
  return query(`
    SELECT id, lista_id, nombre, tipo, config, requerido, unico, orden, activo,
           creado_en, actualizado_en
      FROM lista_campos
     WHERE lista_id = $1 AND activo = true
     ORDER BY orden, lower(nombre)
  `, [listaId]);
}

async function vistasDe(listaId) {
  return query(`
    SELECT id, lista_id, nombre, tipo, config, visibilidad, creada_por,
           creado_en, actualizado_en, predeterminada
      FROM lista_vistas
     WHERE lista_id = $1
     ORDER BY predeterminada DESC, creado_en
  `, [listaId]);
}

async function validarRelaciones(campos, datos) {
  for (const campo of campos) {
    if (campo.tipo !== 'relacion') continue;
    const rel = datos[campo.id];
    if (!rel?.id) continue;
    const objetivo = await one(`
      SELECT r.id FROM lista_registros r
        JOIN listas l ON l.id = r.lista_id
       WHERE r.id = $1 AND r.lista_id = $2 AND r.archivado = false AND l.archivada = false
    `, [rel.id, campo.config?.lista_id]);
    if (!objetivo) return `“${campo.nombre}”: el registro relacionado no existe o no está disponible.`;
  }
  return null;
}

async function conflictoUnico(listaId, campos, datos, excluirId = null) {
  for (const campo of campos) {
    if (!campo.unico) continue;
    const valor = datos[campo.id];
    if (valor === null || valor === undefined || valor === '') continue;
    const params = [listaId, campo.id, String(valor)];
    let sql = 'SELECT id FROM lista_registros WHERE lista_id = $1 AND archivado = false AND datos->>$2 = $3';
    if (excluirId) { params.push(excluirId); sql += ' AND id <> $4'; }
    const fila = await one(`${sql} LIMIT 1`, params);
    if (fila) return `“${campo.nombre}” debe ser único: ya existe otro registro con ese valor.`;
  }
  return null;
}

function normalizarConfigCampo(tipo, config) {
  const entrada = esObjeto(config) ? config : {};
  const salida = {};
  if (tipo === 'seleccion' || tipo === 'multiseleccion') {
    salida.opciones = normalizarOpciones(entrada.opciones);
  }
  if (tipo === 'numero' || tipo === 'moneda') {
    if (entrada.min !== undefined && entrada.min !== null && entrada.min !== '') salida.min = Number(entrada.min);
    if (entrada.max !== undefined && entrada.max !== null && entrada.max !== '') salida.max = Number(entrada.max);
  }
  if (tipo === 'relacion' && entrada.lista_id) salida.lista_id = limStr(entrada.lista_id, 80);
  if (entrada.defecto !== undefined && entrada.defecto !== null && entrada.defecto !== '') {
    salida.defecto = entrada.defecto;
  }
  if (entrada.ayuda) salida.ayuda = limStr(entrada.ayuda, 240);
  if (entrada.placeholder) salida.placeholder = limStr(entrada.placeholder, 120);
  return salida;
}

function normalizarVistaConfig(valor) {
  const c = esObjeto(valor) ? valor : {};
  const columnas = Array.isArray(c.columnas)
    ? [...new Set(c.columnas.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 80)
    : [];
  const filtros = Array.isArray(c.filtros)
    ? c.filtros
      .filter((f) => esObjeto(f) && f.campo)
      .slice(0, 20)
      .map((f) => ({
        campo: String(f.campo).trim(),
        op: ['contiene', 'igual', 'distinto', 'mayor', 'menor', 'vacio'].includes(f.op) ? f.op : 'contiene',
        valor: f.valor === undefined || f.valor === null ? '' : String(f.valor).slice(0, 200),
      }))
    : [];
  const orden = esObjeto(c.orden) && c.orden.campo
    ? { campo: String(c.orden.campo).trim(), dir: c.orden.dir === 'asc' ? 'asc' : 'desc' }
    : null;
  const agrupar = c.agrupar ? String(c.agrupar).trim() : null;
  const q = c.q ? String(c.q).slice(0, 120) : '';
  const kanban = c.kanban ? String(c.kanban).trim() : null;
  const titulo = c.titulo ? String(c.titulo).trim() : null;
  const mis = ['creado_por', 'responsable'].includes(c.mis) ? c.mis : null;
  const responsable = c.responsable ? String(c.responsable).trim() : null;
  return { columnas, filtros, orden, agrupar, q, kanban, titulo, mis, responsable };
}

// ---------- Navegación visible ----------
listasRouter.get('/listas/nav', authRequired, async (req, res) => {
  return res.json(await areasVisibles(req.user));
});

// ---------- Listas ----------
// Papelera de listas (antes de /listas/:id para que no la capture el comodín).
listasRouter.get('/listas/archivadas', authRequired, async (req, res) => {
  const where = [];
  const params = [];
  if (req.user.rol !== 'admin') {
    const areas = Object.entries(req.user.areas || {}).filter(([, caps]) => caps?.borrar_listas).map(([id]) => id);
    if (!areas.length) return res.json([]);
    params.push(areas);
    where.push(`l.area_id = ANY($${params.length})`);
  }
  const filas = await query(`
    SELECT l.id, l.area_id, l.nombre, l.descripcion, l.icono, l.archivada_en, l.archivada_por,
           a.nombre AS area_nombre
      FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE l.archivada = true ${where.length ? `AND ${where.join(' AND ')}` : ''}
     ORDER BY l.archivada_en DESC NULLS LAST
     LIMIT 200
  `, params);
  return res.json(filas);
});

listasRouter.patch('/listas/:id/restaurar', authRequired, async (req, res) => {
  const lista = await one(`
    SELECT l.*, a.slug AS area_slug FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1 AND l.archivada = true
  `, [req.params.id]);
  if (!lista) return res.status(404).json({ error: 'Lista archivada no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_listas) return sinPermiso(res);
  try {
    await query('UPDATE listas SET archivada = false, archivada_en = NULL, archivada_por = NULL, actualizado_en = now() WHERE id = $1', [lista.id]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya hay una lista activa con ese nombre en el área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: lista.id, accion: 'restaurar' });
  return res.json({ ok: true });
});

listasRouter.get('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  const cap = capacidades(req, lista.area_id);
  if (!cap.ver) return sinPermiso(res, 'No tenés acceso a esta área.');
  const [campos, vistas] = await Promise.all([camposDe(lista.id), vistasDe(lista.id)]);
  return res.json({ ...lista, campos, vistas, puede: cap });
});

listasRouter.post('/listas', authRequired, async (req, res) => {
  const areaId = limStr(req.body?.area_id, 60);
  const area = await one('SELECT id, nombre FROM areas WHERE id = $1 AND activo = true', [areaId]);
  if (!area) return res.status(400).json({ error: 'Elegí un área válida.' });
  if (!capacidades(req, areaId).crear_listas) return sinPermiso(res, 'No tenés permiso para crear listas en esta área.');
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 2) return res.status(400).json({ error: 'El nombre de la lista debe tener al menos 2 caracteres.' });
  const descripcion = limStr(req.body?.descripcion, 240) || null;
  const icono = limStr(req.body?.icono, 30) || 'clipboard';
  const id = idNuevo('lst');
  try {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO listas (id, area_id, nombre, descripcion, icono, creada_por)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, areaId, nombre, descripcion, icono, req.user.email]
      );
      await client.query(
        `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
         VALUES ($1,$2,'Vista principal','grid','{}'::jsonb,'compartida',$3,true)`,
        [idNuevo('vis'), id, req.user.email]
      );
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en esta área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: id, accion: 'crear', despues: { id, areaId, nombre, descripcion } });
  return res.status(201).json({ id });
});

listasRouter.patch('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const sets = [];
  const params = [];
  if (req.body?.nombre !== undefined) {
    const nombre = limStr(req.body.nombre, 80);
    if (nombre.length < 2) return res.status(400).json({ error: 'El nombre de la lista debe tener al menos 2 caracteres.' });
    params.push(nombre); sets.push(`nombre = $${params.length}`);
  }
  if (req.body?.descripcion !== undefined) {
    params.push(limStr(req.body.descripcion, 240) || null); sets.push(`descripcion = $${params.length}`);
  }
  if (req.body?.icono !== undefined) {
    params.push(limStr(req.body.icono, 30) || 'clipboard'); sets.push(`icono = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(new Date()); sets.push(`actualizado_en = $${params.length}`);
  params.push(lista.id);
  try {
    await query(`UPDATE listas SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en esta área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: lista.id, accion: 'editar', antes: lista, despues: req.body });
  return res.json({ ok: true });
});

// Duplicar una lista copia SU ESTRUCTURA (campos y vistas), no los registros.
// Sirve como plantilla: Materiales, Herramientas, Insumos, etc.
listasRouter.post('/listas/:id/duplicar', authRequired, async (req, res) => {
  const origen = await listaConArea(req.params.id);
  if (!origen) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, origen.area_id).crear_listas) return sinPermiso(res, 'No tenés permiso para crear listas en esta área.');
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 2) return res.status(400).json({ error: 'Poné un nombre de al menos 2 caracteres.' });
  const nuevoId = idNuevo('lst');
  try {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO listas (id, area_id, nombre, descripcion, icono, creada_por)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [nuevoId, origen.area_id, nombre, origen.descripcion, origen.icono, req.user.email]
      );
      const campos = await client.query(
        'SELECT * FROM lista_campos WHERE lista_id = $1 AND activo = true ORDER BY orden, lower(nombre)',
        [origen.id]
      );
      const mapa = new Map();
      for (const c of campos.rows) {
        const nuevo = idNuevo('cam');
        mapa.set(c.id, nuevo);
        await client.query(
          `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, orden)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [nuevo, nuevoId, c.nombre, c.tipo, c.config || {}, c.requerido, c.unico, c.orden]
        );
      }
      const vistas = await client.query('SELECT * FROM lista_vistas WHERE lista_id = $1 ORDER BY creado_en', [origen.id]);
      let primera = true;
      for (const v of vistas.rows) {
        let config = v.config || {};
        if (config.kanban && mapa.has(config.kanban)) config = { ...config, kanban: mapa.get(config.kanban) };
        if (config.titulo && mapa.has(config.titulo)) config = { ...config, titulo: mapa.get(config.titulo) };
        if (config.responsable && mapa.has(config.responsable)) config = { ...config, responsable: mapa.get(config.responsable) };
        if (Array.isArray(config.columnas)) config = { ...config, columnas: config.columnas.map((x) => mapa.get(x) || x) };
        if (Array.isArray(config.filtros)) config = { ...config, filtros: config.filtros.map((f) => ({ ...f, campo: mapa.get(f.campo) || f.campo })) };
        if (config.orden?.campo && mapa.has(config.orden.campo)) config = { ...config, orden: { ...config.orden, campo: mapa.get(config.orden.campo) } };
        if (config.agrupar && mapa.has(config.agrupar)) config = { ...config, agrupar: mapa.get(config.agrupar) };
        await client.query(
          `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [idNuevo('vis'), nuevoId, v.nombre, v.tipo, config, v.visibilidad, req.user.email, primera ? true : false]
        );
        primera = false;
      }
      if (primera) {
        await client.query(
          `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
           VALUES ($1,$2,'Vista principal','grid','{}'::jsonb,'compartida',$3,true)`,
          [idNuevo('vis'), nuevoId, req.user.email]
        );
      }
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en esta área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: nuevoId, accion: 'duplicar', detalle: `origen ${origen.id}` });
  return res.status(201).json({ id: nuevoId });
});

listasRouter.delete('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_listas) return sinPermiso(res);
  await query(
    'UPDATE listas SET archivada = true, archivada_en = now(), archivada_por = $2 WHERE id = $1',
    [lista.id, req.user.email]
  );
  await auditar({ req, tabla: 'listas', registroId: lista.id, accion: 'archivar', antes: lista });
  return res.json({ ok: true });
});

// ---------- Campos ----------
listasRouter.post('/listas/:id/campos', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 1) return res.status(400).json({ error: 'El campo necesita un nombre.' });
  const tipo = String(req.body?.tipo || 'texto');
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de campo inválido.' });
  const config = normalizarConfigCampo(tipo, req.body?.config);
  if ((tipo === 'seleccion' || tipo === 'multiseleccion') && !config.opciones.length) {
    return res.status(400).json({ error: 'Agregá al menos una opción para este campo.' });
  }
  if (tipo === 'relacion') {
    if (!config.lista_id) return res.status(400).json({ error: 'Elegí la lista con la que se relaciona este campo.' });
    const objetivo = await one('SELECT id, area_id FROM listas WHERE id = $1 AND archivada = false', [config.lista_id]);
    if (!objetivo) return res.status(400).json({ error: 'La lista relacionada no existe.' });
    if (objetivo.area_id !== lista.area_id) return res.status(400).json({ error: 'La lista relacionada tiene que ser del mismo área.' });
  }
  const requerido = normalizarBooleano(req.body?.requerido) === true;
  const unico = normalizarBooleano(req.body?.unico) === true;
  const [max] = await query('SELECT COALESCE(MAX(orden), 0)::int AS n FROM lista_campos WHERE lista_id = $1', [lista.id]);
  const id = idNuevo('cam');
  try {
    await query(
      `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, orden)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [id, lista.id, nombre, tipo, config, requerido, unico, Number(max.n) + 10]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un campo con ese nombre en la lista.' });
    throw e;
  }
  await auditar({ req, tabla: 'lista_campos', registroId: id, accion: 'crear', despues: { listaId: lista.id, nombre, tipo, config, requerido, unico } });
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-campos/:id', authRequired, async (req, res) => {
  const campo = await one('SELECT * FROM lista_campos WHERE id = $1 AND activo = true', [req.params.id]);
  if (!campo) return res.status(404).json({ error: 'Campo no encontrado' });
  const lista = await listaConArea(campo.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const sets = [];
  const params = [];
  if (req.body?.nombre !== undefined) {
    const nombre = limStr(req.body.nombre, 80);
    if (!nombre) return res.status(400).json({ error: 'El campo necesita un nombre.' });
    params.push(nombre); sets.push(`nombre = $${params.length}`);
  }
  if (req.body?.tipo !== undefined) {
    const tipo = String(req.body.tipo);
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de campo inválido.' });
    params.push(tipo); sets.push(`tipo = $${params.length}`);
  }
  if (req.body?.config !== undefined) {
    const tipo = req.body?.tipo !== undefined ? String(req.body.tipo) : campo.tipo;
    params.push(normalizarConfigCampo(tipo, req.body.config)); sets.push(`config = $${params.length}::jsonb`);
  }
  if (req.body?.requerido !== undefined) {
    params.push(normalizarBooleano(req.body.requerido) === true); sets.push(`requerido = $${params.length}`);
  }
  if (req.body?.unico !== undefined) {
    params.push(normalizarBooleano(req.body.unico) === true); sets.push(`unico = $${params.length}`);
  }
  if (req.body?.orden !== undefined) {
    params.push(Math.max(0, Number(req.body.orden) || 0)); sets.push(`orden = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  if ((req.body?.tipo || campo.tipo) === 'relacion') {
    const objetivoId = req.body?.config?.lista_id ?? campo.config?.lista_id;
    if (!objetivoId) return res.status(400).json({ error: 'Elegí la lista con la que se relaciona este campo.' });
    const objetivo = await one('SELECT id, area_id FROM listas WHERE id = $1 AND archivada = false', [objetivoId]);
    if (!objetivo) return res.status(400).json({ error: 'La lista relacionada no existe.' });
    if (objetivo.area_id !== lista.area_id) return res.status(400).json({ error: 'La lista relacionada tiene que ser del mismo área.' });
  }
  params.push(new Date()); sets.push(`actualizado_en = $${params.length}`);
  params.push(campo.id);
  try {
    await query(`UPDATE lista_campos SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un campo con ese nombre en la lista.' });
    throw e;
  }
  await auditar({ req, tabla: 'lista_campos', registroId: campo.id, accion: 'editar', antes: campo, despues: req.body });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-campos/:id', authRequired, async (req, res) => {
  const campo = await one('SELECT * FROM lista_campos WHERE id = $1 AND activo = true', [req.params.id]);
  if (!campo) return res.status(404).json({ error: 'Campo no encontrado' });
  const lista = await listaConArea(campo.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  await query('UPDATE lista_campos SET activo = false, actualizado_en = now() WHERE id = $1', [campo.id]);
  await auditar({ req, tabla: 'lista_campos', registroId: campo.id, accion: 'archivar', antes: campo });
  return res.json({ ok: true });
});

// ---------- Vistas ----------
listasRouter.post('/listas/:id/vistas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).administrar_vistas) return sinPermiso(res);
  const nombre = limStr(req.body?.nombre, 80);
  if (!nombre) return res.status(400).json({ error: 'La vista necesita un nombre.' });
  const tipo = ['grid', 'kanban', 'form'].includes(req.body?.tipo) ? req.body.tipo : 'grid';
  const visibilidad = req.body?.visibilidad === 'personal' ? 'personal' : 'compartida';
  const config = normalizarVistaConfig(req.body?.config);
  const predeterminada = normalizarBooleano(req.body?.predeterminada) === true;
  const id = idNuevo('vis');
  await tx(async (client) => {
    if (predeterminada) await client.query('UPDATE lista_vistas SET predeterminada = false WHERE lista_id = $1', [lista.id]);
    await client.query(
      `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [id, lista.id, nombre, tipo, config, visibilidad, req.user.email, predeterminada]
    );
  });
  await auditar({ req, tabla: 'lista_vistas', registroId: id, accion: 'crear', despues: { listaId: lista.id, nombre, tipo, config } });
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-vistas/:id', authRequired, async (req, res) => {
  const vista = await one('SELECT * FROM lista_vistas WHERE id = $1', [req.params.id]);
  if (!vista) return res.status(404).json({ error: 'Vista no encontrada' });
  const lista = await listaConArea(vista.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).administrar_vistas) return sinPermiso(res);
  const sets = [];
  const params = [];
  if (req.body?.nombre !== undefined) {
    const nombre = limStr(req.body.nombre, 80);
    if (!nombre) return res.status(400).json({ error: 'La vista necesita un nombre.' });
    params.push(nombre); sets.push(`nombre = $${params.length}`);
  }
  if (req.body?.tipo !== undefined) {
    params.push(['grid', 'kanban', 'form'].includes(req.body.tipo) ? req.body.tipo : 'grid'); sets.push(`tipo = $${params.length}`);
  }
  if (req.body?.config !== undefined) {
    params.push(normalizarVistaConfig(req.body.config)); sets.push(`config = $${params.length}::jsonb`);
  }
  if (req.body?.visibilidad !== undefined) {
    params.push(req.body.visibilidad === 'personal' ? 'personal' : 'compartida'); sets.push(`visibilidad = $${params.length}`);
  }
  if (req.body?.predeterminada !== undefined) {
    const pred = normalizarBooleano(req.body.predeterminada) === true;
    if (pred) await query('UPDATE lista_vistas SET predeterminada = false WHERE lista_id = $1', [lista.id]);
    params.push(pred); sets.push(`predeterminada = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(new Date()); sets.push(`actualizado_en = $${params.length}`);
  params.push(vista.id);
  await query(`UPDATE lista_vistas SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  await auditar({ req, tabla: 'lista_vistas', registroId: vista.id, accion: 'editar', antes: vista, despues: req.body });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-vistas/:id', authRequired, async (req, res) => {
  const vista = await one('SELECT * FROM lista_vistas WHERE id = $1', [req.params.id]);
  if (!vista) return res.status(404).json({ error: 'Vista no encontrada' });
  const lista = await listaConArea(vista.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).administrar_vistas) return sinPermiso(res);
  await query('DELETE FROM lista_vistas WHERE id = $1', [vista.id]);
  await auditar({ req, tabla: 'lista_vistas', registroId: vista.id, accion: 'borrar', antes: vista });
  return res.json({ ok: true });
});

// ---------- Registros ----------
listasRouter.get('/listas/:id/registros', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const q = limStr(req.query?.q, 120);
  const params = [lista.id];
  let sql = `SELECT id, lista_id, datos, creado_por, actualizado_por, creado_en, actualizado_en
               FROM lista_registros
              WHERE lista_id = $1 AND archivado = false`;
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    sql += ` AND datos::text ILIKE $${params.length}`;
  }
  sql += ' ORDER BY creado_en DESC LIMIT 500';
  const registros = await query(sql, params);
  const [total] = await query('SELECT count(*)::int AS n FROM lista_registros WHERE lista_id = $1 AND archivado = false', [lista.id]);
  return res.json({ registros, total: total.n });
});

listasRouter.post('/listas/:id/registros', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).crear_registros) return sinPermiso(res, 'No tenés permiso para crear registros en esta lista.');
  const campos = await camposDe(lista.id);
  const validado = validarRegistro(campos, req.body?.datos);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  const relError = await validarRelaciones(campos, validado.datos);
  if (relError) return res.status(400).json({ error: relError });
  const conflicto = await conflictoUnico(lista.id, campos, validado.datos);
  if (conflicto) return res.status(400).json({ error: conflicto });
  const id = idNuevo('reg');
  await query(
    `INSERT INTO lista_registros (id, lista_id, datos, creado_por, actualizado_por)
     VALUES ($1,$2,$3::jsonb,$4,$5)`,
    [id, lista.id, validado.datos, req.user.email, req.user.email]
  );
  await auditar({ req, tabla: 'lista_registros', registroId: id, accion: 'crear', despues: { listaId: lista.id, datos: validado.datos } });
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-registros/:id', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_registros) return sinPermiso(res, 'No tenés permiso para editar registros en esta lista.');
  const campos = await camposDe(lista.id);
  const combinados = { ...(esObjeto(registro.datos) ? registro.datos : {}), ...(esObjeto(req.body?.datos) ? req.body.datos : {}) };
  const validado = validarRegistro(campos, combinados);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  const relError = await validarRelaciones(campos, validado.datos);
  if (relError) return res.status(400).json({ error: relError });
  const conflicto = await conflictoUnico(lista.id, campos, validado.datos, registro.id);
  if (conflicto) return res.status(400).json({ error: conflicto });
  await query(
    'UPDATE lista_registros SET datos = $2::jsonb, actualizado_por = $3, actualizado_en = now() WHERE id = $1',
    [registro.id, validado.datos, req.user.email]
  );
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'editar', antes: registro.datos, despues: validado.datos });
  return res.json({ ok: true });
});

listasRouter.get('/listas/:id/registros-archivados', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_registros && !capacidades(req, lista.area_id).editar_registros) {
    return sinPermiso(res);
  }
  const filas = await query(`
    SELECT id, lista_id, datos, creado_por, actualizado_por, creado_en, actualizado_en, archivado_en, archivado_por
      FROM lista_registros
     WHERE lista_id = $1 AND archivado = true
     ORDER BY archivado_en DESC NULLS LAST
     LIMIT 200
  `, [lista.id]);
  return res.json(filas);
});

listasRouter.patch('/lista-registros/:id/restaurar', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = true', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro archivado no encontrado' });
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_registros) return sinPermiso(res);
  await query('UPDATE lista_registros SET archivado = false, archivado_en = NULL, archivado_por = NULL, actualizado_por = $2, actualizado_en = now() WHERE id = $1', [registro.id, req.user.email]);
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'restaurar' });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-registros/:id', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_registros) return sinPermiso(res, 'No tenés permiso para archivar registros en esta lista.');
  await query(
    'UPDATE lista_registros SET archivado = true, archivado_en = now(), archivado_por = $2 WHERE id = $1',
    [registro.id, req.user.email]
  );
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'archivar', antes: registro.datos });
  return res.json({ ok: true });
});
