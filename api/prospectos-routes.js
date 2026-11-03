// Prospectos comerciales. Es una tabla separada de clientes y oportunidades:
// un prospecto pasa a cliente recién cuando se concreta una venta o reparación.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { query, one, tx } from './db.js';
import { authRequired, permisoRequerido } from './middleware/auth.js';
import { auditar } from './auditoria.js';
import { memoryUpload } from './upload.js';

export const prospectosRouter = Router();
const limStr = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const idNuevo = (prefijo) => `${prefijo}_${randomUUID()}`;
const fechaISO = (v) => {
  const t = limStr(v, 10);
  if (!t) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
};
const normalizar = (v) => limStr(v, 300)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|sas|ltda|group|grupo)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const normalizarEmail = (v) => {
  const email = String(v || '').split(/[,;/]/).map((x) => x.trim()).find((x) => x.includes('@')) || '';
  return email.toLowerCase().slice(0, 200);
};
const normalizarTelefono = (v) => String(v || '').replace(/\D/g, '').slice(-15);
const tokens = (v) => new Set(normalizar(v).split(' ').filter((x) => x.length > 2));
const parecido = (a, b) => {
  const sa = tokens(a); const sb = tokens(b);
  if (!sa.size || !sb.size) return false;
  let comunes = 0;
  for (const t of sa) if (sb.has(t)) comunes += 1;
  return comunes / new Set([...sa, ...sb]).size >= 0.72;
};
const colorValido = (v) => ['gray', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'yellow', 'teal'].includes(v) ? v : 'gray';
const ARCHIVO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const subirExcel = memoryUpload({
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname || '') || file.mimetype === ARCHIVO_XLSX;
    cb(ok ? null : new Error('El archivo tiene que ser .xlsx'), ok);
  },
});

async function duplicadoProspecto(d, exceptoId = null) {
  const filas = await query(
    `SELECT id, empresa, email, telefono FROM prospectos
      WHERE archivado = false
        AND (($1 <> '' AND cuit = $1)
          OR ($2 <> '' AND email_normalizado = $2)
          OR ($3 <> '' AND telefono_normalizado = $3)
          OR ($4 <> '' AND $5 <> '' AND empresa_normalizada = $4 AND lower(COALESCE(localidad,'')) = lower($5)))
        AND ($6::text IS NULL OR id <> $6)
      LIMIT 1`,
    [d.cuit || '', d.email_normalizado || '', d.telefono_normalizado || '', d.empresa_normalizada || '', d.localidad || '', exceptoId]
  );
  return filas[0] || null;
}

async function estados() {
  return query('SELECT * FROM prospecto_estados ORDER BY orden, lower(nombre)');
}
async function estadoValido(clave, activo = true) {
  const e = await one(`SELECT clave FROM prospecto_estados WHERE clave = $1 ${activo ? 'AND activo = true' : ''}`, [clave]);
  return Boolean(e);
}
function datosProspecto(body = {}, parcial = false) {
  const empresa = limStr(body.empresa, 180);
  const email = limStr(body.email, 240);
  const telefono = limStr(body.telefono, 80);
  const fecha = body.fecha_proxima_accion === undefined ? (parcial ? undefined : null) : fechaISO(body.fecha_proxima_accion);
  const salida = {
    empresa,
    empresa_normalizada: normalizar(empresa),
    cuit: limStr(body.cuit, 30) || null,
    localidad: limStr(body.localidad, 120) || null,
    direccion: limStr(body.direccion, 240) || null,
    rubro: limStr(body.rubro, 240) || null,
    perfil_redes: limStr(body.perfil_redes, 240) || null,
    contacto_nombre: limStr(body.contacto_nombre, 180) || null,
    contacto_cargo: limStr(body.contacto_cargo, 180) || null,
    email: email || null,
    telefono: telefono || null,
    tipo_contacto: limStr(body.tipo_contacto, 120) || null,
    estado: limStr(body.estado, 40) || 'nuevo',
    observaciones: limStr(body.observaciones, 4000) || null,
    notas: limStr(body.notas, 4000) || null,
    origen: limStr(body.origen, 60) || 'manual',
    origen_id: limStr(body.origen_id, 80) || null,
    responsable: limStr(body.responsable, 180) || null,
    proxima_accion: limStr(body.proxima_accion, 300) || null,
    fecha_proxima_accion: fecha,
    ultimo_contacto: body.ultimo_contacto ? new Date(body.ultimo_contacto).toISOString() : null,
    email_normalizado: normalizarEmail(email) || null,
    telefono_normalizado: normalizarTelefono(telefono) || null,
  };
  if (parcial) {
    const derivados = { empresa_normalizada: 'empresa', email_normalizado: 'email', telefono_normalizado: 'telefono' };
    for (const clave of Object.keys(salida)) {
      const fuente = derivados[clave] || clave;
      if (body[fuente] === undefined) delete salida[clave];
    }
  }
  return salida;
}

function whereFiltros(req) {
  const cond = ['archivado = false']; const params = [];
  const add = (sql, valor) => { params.push(valor); cond.push(sql.replace('?', `$${params.length}`)); };
  const q = limStr(req.query?.q, 120);
  if (q) {
    const vals = Array.from({ length: 6 }, () => `%${q}%`);
    const nums = vals.map((v) => { params.push(v); return `$${params.length}`; });
    cond.push(`(empresa ILIKE ${nums[0]} OR localidad ILIKE ${nums[1]} OR rubro ILIKE ${nums[2]} OR contacto_nombre ILIKE ${nums[3]} OR email ILIKE ${nums[4]} OR telefono ILIKE ${nums[5]})`);
  }
  if (req.query?.estado) add('estado = ?', limStr(req.query.estado, 40));
  if (req.query?.responsable) add('responsable = ?', limStr(req.query.responsable, 180));
  if (req.query?.origen) add('origen = ?', limStr(req.query.origen, 60));
  if (req.query?.localidad) add('localidad ILIKE ?', `%${limStr(req.query.localidad, 120)}%`);
  if (req.query?.desde) add('creado_en >= ?::date', limStr(req.query.desde, 10));
  if (req.query?.hasta) add('creado_en < (?::date + interval \'1 day\')', limStr(req.query.hasta, 10));
  return { sql: cond.join(' AND '), params };
}

async function listaFiltrada(req) {
  const { sql, params } = whereFiltros(req);
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 100));
  const offset = Math.max(0, Number(req.query?.offset) || 0);
  const filas = await query(`SELECT * FROM prospectos WHERE ${sql} ORDER BY actualizado_en DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  const [total] = await query(`SELECT count(*)::int AS n FROM prospectos WHERE ${sql}`, params);
  return { filas, total: total.n, limit, offset };
}

function camposExcel(headers) {
  const h = headers.map((x) => normalizar(x));
  const buscar = (...opciones) => h.findIndex((x) => opciones.some((o) => x.includes(normalizar(o))));
  return {
    empresa: buscar('empresa / prospecto', 'empresa', 'prospecto'),
    localidad: buscar('zona / localidad', 'zona', 'localidad'),
    direccion: buscar('direccion / ubicacion', 'direccion', 'ubicacion'),
    rubro: buscar('rubro / equipamiento', 'rubro'),
    perfil_redes: buscar('perfil redes', 'redes sociales'),
    contacto: buscar('contacto linkedin', 'nombre y cargo', 'contacto'),
    email: buscar('email de contacto', 'email'),
    telefono: buscar('telefono / whatsapp', 'telefono'),
    tipo_contacto: buscar('tipo de contacto'),
    estado_excel: buscar('estado de contacto', 'estado'),
    observaciones: buscar('observaciones', 'foco comercial'),
    origen_id: buscar('id'),
  };
}

async function leerExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const filas = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    for (let i = 1; i <= Math.max(ws.columnCount, row.cellCount); i += 1) {
      const c = row.getCell(i);
      vals.push(String(c?.text ?? c?.value ?? '').trim());
    }
    if (vals.some(Boolean)) filas.push(vals);
  });
  const headerIdx = filas.findIndex((f) => f.some((v) => normalizar(v).includes('empresa')));
  if (headerIdx < 0) return [];
  const map = camposExcel(filas[headerIdx]);
  if (map.empresa < 0) return [];
  return filas.slice(headerIdx + 1).map((f, i) => {
    const get = (idx) => (idx >= 0 ? (f[idx] || '') : '');
    const contacto = get(map.contacto);
    const partes = contacto.split(/\s+-\s+/);
    return {
      fila: i + headerIdx + 2,
      origen_id: get(map.origen_id) || null,
      empresa: get(map.empresa),
      localidad: get(map.localidad),
      direccion: get(map.direccion),
      rubro: get(map.rubro),
      perfil_redes: get(map.perfil_redes),
      contacto_nombre: (partes[0] || '').trim(),
      contacto_cargo: partes.slice(1).join(' - ').trim(),
      email: get(map.email),
      telefono: get(map.telefono),
      tipo_contacto: get(map.tipo_contacto),
      estado_excel: get(map.estado_excel),
      observaciones: get(map.observaciones),
    };
  }).filter((f) => f.empresa || f.email || f.telefono);
}

async function clasificar(filas) {
  const existentes = await query('SELECT * FROM prospectos WHERE archivado = false');
  const porCuit = new Map(); const porEmail = new Map(); const porTelefono = new Map(); const porEmpresa = new Map();
  for (const p of existentes) {
    if (p.cuit) porCuit.set(String(p.cuit), p);
    if (p.email_normalizado) porEmail.set(p.email_normalizado, p);
    if (p.telefono_normalizado) porTelefono.set(p.telefono_normalizado, p);
    const k = `${p.empresa_normalizada}|${normalizar(p.localidad)}`;
    if (!porEmpresa.has(k)) porEmpresa.set(k, p);
  }
  const vistosArchivo = new Map();
  return filas.map((f) => {
    const empresa = limStr(f.empresa, 180);
    const base = {
      fila: f.fila, datos: {
        empresa, localidad: limStr(f.localidad, 120), direccion: limStr(f.direccion, 240),
        rubro: limStr(f.rubro, 240), perfil_redes: limStr(f.perfil_redes, 240),
        contacto_nombre: limStr(f.contacto_nombre, 180), contacto_cargo: limStr(f.contacto_cargo, 180),
        email: limStr(f.email, 240), telefono: limStr(f.telefono, 80),
        tipo_contacto: limStr(f.tipo_contacto, 120), observaciones: limStr(f.observaciones, 4000),
        estado: 'nuevo', origen: 'excel', origen_id: f.origen_id || null,
      },
    };
    if (!empresa) return { ...base, clasificacion: 'error', error: 'Falta la empresa.' };
    if (!limStr(f.cuit, 30) && !normalizarEmail(f.email) && !normalizarTelefono(f.telefono)) {
      return { ...base, clasificacion: 'error', error: 'Falta CUIT, email o teléfono para identificar el prospecto.' };
    }
    const cuit = limStr(f.cuit, 30) || null;
    const email = normalizarEmail(f.email);
    const telefono = normalizarTelefono(f.telefono);
    const kEmp = `${normalizar(empresa)}|${normalizar(f.localidad)}`;
    let match = null; let tipo = null;
    if (f.origen_id && existentes.some((p) => p.origen === 'excel' && p.origen_id === f.origen_id)) {
      match = existentes.find((p) => p.origen === 'excel' && p.origen_id === f.origen_id); tipo = 'origen_id';
    }
    if (!match && cuit && porCuit.has(cuit)) { match = porCuit.get(cuit); tipo = 'cuit'; }
    if (!match && email && porEmail.has(email)) { match = porEmail.get(email); tipo = 'email'; }
    if (!match && telefono && porTelefono.has(telefono)) { match = porTelefono.get(telefono); tipo = 'telefono'; }
    if (!match && porEmpresa.has(kEmp)) { match = porEmpresa.get(kEmp); tipo = 'empresa_localidad'; }
    const archivo = vistosArchivo.get(`${normalizar(empresa)}|${email}|${telefono}`);
    if (!match && archivo) { match = archivo; tipo = 'archivo'; }
    if (!match) {
      const parecida = existentes.find((p) => normalizar(p.localidad) === normalizar(f.localidad) && parecido(p.empresa, empresa));
      if (parecida) { match = parecida; tipo = 'empresa_parecida'; }
    }
    if (!match) {
      vistosArchivo.set(`${normalizar(empresa)}|${email}|${telefono}`, base.datos);
      return { ...base, clasificacion: 'nuevo' };
    }
    const diferencias = [];
    for (const clave of ['localidad', 'direccion', 'rubro', 'email', 'telefono', 'contacto_nombre', 'contacto_cargo']) {
      const a = normalizar(match[clave]); const b = normalizar(base.datos[clave]);
      if (a && b && a !== b) diferencias.push(clave);
    }
    const clasificacion = tipo === 'empresa_parecida' || (tipo === 'archivo') || diferencias.length ? 'parcial' : 'exacto';
    return {
      ...base,
      clasificacion,
      coincidencia: {
        id: match.id, empresa: match.empresa, estado: match.estado,
        localidad: match.localidad, email: match.email, telefono: match.telefono,
        motivo: tipo, diferencias,
      },
    };
  });
}

async function crearProspecto(datos, req) {
  const d = datosProspecto(datos);
  const id = idNuevo('prs');
  await query(
    `INSERT INTO prospectos
       (id, empresa, empresa_normalizada, cuit, localidad, direccion, rubro, perfil_redes,
        contacto_nombre, contacto_cargo, email, telefono, tipo_contacto, estado, observaciones,
        notas, origen, origen_id, responsable, proxima_accion, fecha_proxima_accion, ultimo_contacto,
        email_normalizado, telefono_normalizado, creado_por, actualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$25)`,
    [id, d.empresa, d.empresa_normalizada, d.cuit, d.localidad, d.direccion, d.rubro, d.perfil_redes,
      d.contacto_nombre, d.contacto_cargo, d.email, d.telefono, d.tipo_contacto, d.estado, d.observaciones,
      d.notas, d.origen, d.origen_id, d.responsable, d.proxima_accion, d.fecha_proxima_accion, d.ultimo_contacto,
      d.email_normalizado, d.telefono_normalizado, req.user.email]
  );
  await auditar({ req, tabla: 'prospectos', registroId: id, accion: 'crear', despues: d });
  return id;
}

async function actualizarProspecto(id, datos, req) {
  const d = datosProspecto(datos, true);
  const campos = ['empresa', 'empresa_normalizada', 'cuit', 'localidad', 'direccion', 'rubro', 'perfil_redes',
    'contacto_nombre', 'contacto_cargo', 'email', 'telefono', 'tipo_contacto', 'estado', 'observaciones', 'notas',
    'origen', 'origen_id', 'responsable', 'proxima_accion', 'fecha_proxima_accion', 'ultimo_contacto',
    'email_normalizado', 'telefono_normalizado'];
  const sets = []; const params = [];
  for (const c of campos) {
    if (datos[c] === undefined) continue;
    params.push(d[c]); sets.push(`${c} = $${params.length}`);
  }
  if (!sets.length) return false;
  params.push(req.user.email); sets.push(`actualizado_por = $${params.length}`);
  params.push(id); sets.push(`actualizado_en = now()`);
  await query(`UPDATE prospectos SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  await auditar({ req, tabla: 'prospectos', registroId: id, accion: 'editar', despues: d });
  return true;
}

// ---------- Estados ----------
prospectosRouter.get('/prospectos/estados', authRequired, permisoRequerido('ventas'), async (req, res) => res.json(await estados()));

prospectosRouter.post('/prospectos/estados', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const nombre = limStr(req.body?.nombre, 60);
  if (!nombre) return res.status(400).json({ error: 'El estado necesita un nombre.' });
  const clave = normalizar(nombre).replace(/\s+/g, '_').slice(0, 50);
  if (!clave) return res.status(400).json({ error: 'Nombre de estado inválido.' });
  const color = colorValido(req.body?.color);
  const [max] = await query('SELECT COALESCE(MAX(orden),0)::int AS n FROM prospecto_estados');
  try {
    await query('INSERT INTO prospecto_estados (clave,nombre,color,orden) VALUES ($1,$2,$3,$4)', [clave, nombre, color, max.n + 10]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un estado con ese nombre.' });
    throw e;
  }
  await auditar({ req, tabla: 'prospecto_estados', registroId: clave, accion: 'crear', despues: { nombre, color } });
  return res.status(201).json({ clave, nombre, color });
});

prospectosRouter.patch('/prospectos/estados/:clave', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const sets = []; const params = [];
  if (req.body?.nombre !== undefined) { const n = limStr(req.body.nombre, 60); if (!n) return res.status(400).json({ error: 'Nombre inválido.' }); params.push(n); sets.push(`nombre = $${params.length}`); }
  if (req.body?.color !== undefined) { params.push(colorValido(req.body.color)); sets.push(`color = $${params.length}`); }
  if (req.body?.activo !== undefined) { params.push(Boolean(req.body.activo)); sets.push(`activo = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Sin cambios.' });
  params.push(req.params.clave);
  const r = await query(`UPDATE prospecto_estados SET ${sets.join(', ')} WHERE clave = $${params.length} RETURNING *`, params);
  if (!r.length) return res.status(404).json({ error: 'Estado no encontrado.' });
  return res.json(r[0]);
});

// ---------- CRUD ----------
prospectosRouter.get('/prospectos', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const data = await listaFiltrada(req);
  return res.json({ ...data, estados: await estados() });
});

prospectosRouter.post('/prospectos', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const d = datosProspecto(req.body);
  if (!d.empresa) return res.status(400).json({ error: 'La empresa es obligatoria.' });
  if (!d.cuit && !d.email && !d.telefono) return res.status(400).json({ error: 'Cargá CUIT, email o teléfono para poder identificar el prospecto y evitar duplicados.' });
  if (d.fecha_proxima_accion === undefined) return res.status(400).json({ error: 'Fecha de próxima acción inválida.' });
  if (!(await estadoValido(d.estado, false))) return res.status(400).json({ error: 'Estado inválido.' });
  const repetido = await duplicadoProspecto(d);
  if (repetido) return res.status(409).json({ error: `Ya existe un prospecto similar: ${repetido.empresa}.`, existente_id: repetido.id });
  const id = await crearProspecto(req.body, req);
  return res.status(201).json({ id });
});

prospectosRouter.patch('/prospectos/:id', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const p = await one('SELECT * FROM prospectos WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Prospecto no encontrado.' });
  if (req.body?.empresa !== undefined && !limStr(req.body.empresa, 180)) return res.status(400).json({ error: 'La empresa es obligatoria.' });
  if (req.body?.estado !== undefined && !(await estadoValido(limStr(req.body.estado, 40), false))) return res.status(400).json({ error: 'Estado inválido.' });
  const f = fechaISO(req.body?.fecha_proxima_accion);
  if (req.body?.fecha_proxima_accion !== undefined && f === undefined) return res.status(400).json({ error: 'Fecha inválida.' });
  if (['empresa', 'cuit', 'email', 'telefono', 'localidad'].some((k) => req.body?.[k] !== undefined)) {
    const posible = datosProspecto({ ...p, ...req.body });
    const repetido = await duplicadoProspecto(posible, p.id);
    if (repetido) return res.status(409).json({ error: `Ya existe un prospecto similar: ${repetido.empresa}.`, existente_id: repetido.id });
  }
  if (!(await actualizarProspecto(p.id, req.body, req))) return res.status(400).json({ error: 'Sin cambios.' });
  return res.json({ ok: true });
});

prospectosRouter.delete('/prospectos/:id', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const p = await one('SELECT id FROM prospectos WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Prospecto no encontrado.' });
  await query('UPDATE prospectos SET archivado = true, actualizado_en = now(), actualizado_por = $2 WHERE id = $1', [p.id, req.user.email]);
  await auditar({ req, tabla: 'prospectos', registroId: p.id, accion: 'archivar' });
  return res.json({ ok: true });
});

// ---------- Importación XLSX ----------
prospectosRouter.post('/prospectos/importar/preview', authRequired, permisoRequerido('ventas_editar'), subirExcel.single('archivo'), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ error: 'Subí un archivo .xlsx.' });
  let filas;
  try { filas = await leerExcel(req.file.buffer); }
  catch { return res.status(400).json({ error: 'No se pudo leer el Excel. Verificá que sea un .xlsx válido.' }); }
  if (!filas.length) return res.status(400).json({ error: 'No se encontraron prospectos en la primera hoja.' });
  if (filas.length > 2000) return res.status(400).json({ error: 'El archivo supera los 2000 prospectos por importación.' });
  const clasificados = await clasificar(filas);
  const resumen = {
    total: clasificados.length,
    nuevos: clasificados.filter((f) => f.clasificacion === 'nuevo').length,
    exactos: clasificados.filter((f) => f.clasificacion === 'exacto').length,
    parciales: clasificados.filter((f) => f.clasificacion === 'parcial').length,
    errores: clasificados.filter((f) => f.clasificacion === 'error').length,
  };
  const id = idNuevo('imp');
  await query(
    `INSERT INTO prospecto_importaciones (id, usuario_email, nombre_archivo, filas, resumen)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [id, req.user.email, limStr(req.file.originalname, 180), JSON.stringify(clasificados), JSON.stringify(resumen)]
  );
  await query("DELETE FROM prospecto_importaciones WHERE creado_en < now() - interval '1 day' AND usado = true");
  return res.json({ importacion_id: id, archivo: limStr(req.file.originalname, 180), resumen, filas: clasificados });
});

prospectosRouter.post('/prospectos/importar', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const imp = await one('SELECT * FROM prospecto_importaciones WHERE id = $1 AND usuario_email = $2 AND usado = false', [req.body?.importacion_id, req.user.email]);
  if (!imp) return res.status(404).json({ error: 'Previsualización no encontrada o ya utilizada.' });
  const decisiones = req.body?.decisiones && typeof req.body.decisiones === 'object' ? req.body.decisiones : {};
  const filas = Array.isArray(imp.filas) ? imp.filas : [];
  const conteo = { creados: 0, actualizados: 0, omitidos: 0, errores: 0 };
  const errores = [];
  for (let i = 0; i < filas.length; i += 1) {
    const fila = filas[i];
    if (fila.clasificacion === 'error') { conteo.errores += 1; errores.push({ fila: fila.fila, error: fila.error }); continue; }
    let decision = decisiones[String(i)] || decisiones[i];
    if (!decision) decision = fila.clasificacion === 'nuevo' ? 'crear' : 'omitir';
    if (fila.clasificacion === 'parcial' && !decisiones[String(i)] && !decisiones[i]) { conteo.omitidos += 1; continue; }
    if (decision === 'omitir') { conteo.omitidos += 1; continue; }
    try {
      if (decision === 'actualizar' && fila.coincidencia?.id) {
        await actualizarProspecto(fila.coincidencia.id, fila.datos, req);
        conteo.actualizados += 1;
      } else if (decision === 'crear') {
        await crearProspecto(fila.datos, req);
        conteo.creados += 1;
      } else {
        conteo.omitidos += 1;
      }
    } catch (e) {
      conteo.errores += 1; errores.push({ fila: fila.fila, error: e.message });
    }
  }
  await query('UPDATE prospecto_importaciones SET usado = true WHERE id = $1', [imp.id]);
  await auditar({ req, tabla: 'prospecto_importaciones', registroId: imp.id, accion: 'importar', detalle: JSON.stringify(conteo) });
  return res.json({ ok: true, ...conteo, errores });
});

// ---------- Exportación ----------
const COLUMNAS_EXPORT = [
  ['Empresa / Prospecto', 'empresa'], ['CUIT', 'cuit'], ['Zona / Localidad', 'localidad'],
  ['Dirección / Ubicación', 'direccion'], ['Rubro / Equipamiento', 'rubro'], ['Perfil Redes Sociales', 'perfil_redes'],
  ['Contacto', 'contacto_nombre'], ['Cargo', 'contacto_cargo'], ['Email', 'email'], ['Teléfono / WhatsApp', 'telefono'],
  ['Tipo de Contacto', 'tipo_contacto'], ['Estado', 'estado'], ['Observaciones', 'observaciones'],
  ['Responsable', 'responsable'], ['Próxima acción', 'proxima_accion'], ['Fecha próxima acción', 'fecha_proxima_accion'],
  ['Último contacto', 'ultimo_contacto'], ['Origen', 'origen'], ['Creado', 'creado_en'],
];

prospectosRouter.get('/prospectos/exportar', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const { sql, params } = whereFiltros(req);
  const filas = await query(`SELECT * FROM prospectos WHERE ${sql} ORDER BY actualizado_en DESC`, params);
  const formato = String(req.query?.formato || 'xlsx').toLowerCase();
  const nombre = `prospectos-${new Date().toISOString().slice(0, 10)}.${formato === 'csv' ? 'csv' : 'xlsx'}`;
  if (formato === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const texto = [COLUMNAS_EXPORT.map(([h]) => esc(h)).join(',')]
      .concat(filas.map((f) => COLUMNAS_EXPORT.map(([, k]) => esc(f[k])).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    return res.send(`\uFEFF${texto}`);
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Prospectos');
  ws.addRow(COLUMNAS_EXPORT.map(([h]) => h));
  for (const f of filas) ws.addRow(COLUMNAS_EXPORT.map(([, k]) => f[k] ?? ''));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 22; });
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', ARCHIVO_XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  return res.send(Buffer.from(buffer));
});

// ---------- Conversión ----------
prospectosRouter.post('/prospectos/:id/convertir', authRequired, permisoRequerido('ventas_cerrar'), async (req, res) => {
  const p = await one('SELECT * FROM prospectos WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Prospecto no encontrado.' });
  if (p.cliente_id) return res.json({ cliente_id: p.cliente_id, ya_convertido: true });
  let cliente = p.email_normalizado
    ? await one('SELECT id FROM clientes WHERE LOWER(email) = $1 AND deleted_at IS NULL', [p.email_normalizado])
    : null;
  let nuevo = false;
  await tx(async (client) => {
    if (!cliente) {
      const id = idNuevo('cli');
      await client.query(
        `INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa)
         VALUES ($1,$2,'empresa',$3,$4,$5,$6)`,
        [id, p.empresa, p.telefono || '', p.contacto_nombre || '', p.email || '', p.empresa]
      );
      cliente = { id }; nuevo = true;
    }
    await client.query(
      "UPDATE prospectos SET estado = 'convertido', cliente_id = $2, convertido_en = now(), actualizado_en = now(), actualizado_por = $3 WHERE id = $1",
      [p.id, cliente.id, req.user.email]
    );
  });
  await auditar({ req, tabla: 'prospectos', registroId: p.id, accion: 'convertir_cliente', detalle: cliente.id });
  return res.json({ cliente_id: cliente.id, nuevo });
});
