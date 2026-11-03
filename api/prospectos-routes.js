// Prospectos: vista especializada sobre la lista dinámica "Prospectos" del
// área Ventas. No hay una tabla física separada: la fuente única es
// lista_registros. Esto evita duplicar prospectos en dos lugares.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { query, one, tx } from './db.js';
import { authRequired, permisoRequerido } from './middleware/auth.js';
import { auditar } from './auditoria.js';
import { memoryUpload } from './upload.js';

export const prospectosRouter = Router();
const limStr = (v, max = 400) => String(v ?? '').trim().slice(0, max);
const idNuevo = (p) => `${p}_${randomUUID()}`;
const norm = (v) => limStr(v, 300).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const emailsDe = (...valores) => [...new Set(valores.flatMap((v) => String(v || '').split(/[,;/]/)).map((x) => x.trim().toLowerCase()).filter((x) => /^\S+@\S+\.\S+$/.test(x)))];
const emailNorm = (v) => emailsDe(v)[0] || '';
const telNorm = (v) => String(v || '').replace(/\D/g, '').slice(-15);
const fechaISO = (v) => { const t = limStr(v, 10); return !t ? null : (/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined); };
const ARCHIVO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const colorDe = (nombre) => ({ nuevo: 'blue', contactado: 'amber', interesado: 'purple', cotizado: 'orange', negociacion: 'yellow', ganado: 'green', perdido: 'red', convertido: 'teal', convertidoacliente: 'teal' }[norm(nombre).replace(/\s+/g, '')] || 'gray');

const subirExcel = memoryUpload({
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname || '') || file.mimetype === ARCHIVO_XLSX;
    cb(ok ? null : new Error('El archivo tiene que ser .xlsx'), ok);
  },
});

async function contexto() {
  const lista = await one(`
    SELECT l.* FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE a.slug = 'ventas' AND lower(l.nombre) LIKE '%prospect%' AND l.archivada = false
     ORDER BY l.creado_en LIMIT 1`);
  if (!lista) { const e = new Error('No existe la lista Prospectos en el área Ventas.'); e.status = 503; throw e; }
  const campos = await query('SELECT * FROM lista_campos WHERE lista_id = $1 AND activo = true ORDER BY orden, lower(nombre)', [lista.id]);
  const F = {};
  for (const c of campos) F[norm(c.nombre)] = c;
  return { lista, campos, F };
}
function campo(F, nombre) { return F[norm(nombre)] || null; }
function opciones(F) {
  const c = campo(F, 'Estado');
  return Array.isArray(c?.config?.opciones) ? c.config.opciones : [];
}
function slugEstado(nombre) { const n = norm(nombre).replace(/\s+/g, '_') || 'nuevo'; return n.startsWith('convertido') ? 'convertido' : n; }
function estadoPorSlug(F, slug) { return opciones(F).find((x) => slugEstado(x) === slug) || null; }
function estadoDeFila(F, label) { return slugEstado(label || opciones(F)[0] || 'Nuevo'); }
function getDato(F, datos, nombre) { const c = campo(F, nombre); return c ? datos?.[c.id] : ''; }
function fila(F, r) {
  const d = r.datos || {};
  const estadoLabel = getDato(F, d, 'Estado') || 'Nuevo';
  return {
    id: r.id, empresa: getDato(F, d, 'Empresa') || '',
    contacto_nombre: getDato(F, d, 'Contacto') || getDato(F, d, 'Nombre') || '',
    contacto_cargo: getDato(F, d, 'Cargo') || '', email: getDato(F, d, 'Email') || '',
    telefono: getDato(F, d, 'Teléfono') || '', email_secundario: getDato(F, d, 'Emails adicionales') || '', localidad: getDato(F, d, 'Zona / Localidad') || '',
    direccion: getDato(F, d, 'Dirección / Ubicación') || '', rubro: getDato(F, d, 'Rubro / Equipamiento Principal') || '',
    perfil_redes: getDato(F, d, 'Perfil Redes Sociales') || '', tipo_contacto: getDato(F, d, 'Tipo de Contacto Directo') || '',
    cuit: getDato(F, d, 'CUIT') || '', origen_id: getDato(F, d, 'ID Origen') || '',
    observaciones: getDato(F, d, 'Observaciones / Foco Comercial') || getDato(F, d, 'Notas') || '',
    notas: getDato(F, d, 'Notas') || '', estado: estadoDeFila(F, estadoLabel),
    origen: norm(getDato(F, d, 'Origen')) === 'excel' ? 'excel' : 'manual',
    responsable: getDato(F, d, 'Responsable') || '', proxima_accion: getDato(F, d, 'Próxima acción') || '',
    cliente_id: getDato(F, d, 'Cliente convertido') || '', fecha_proxima_accion: getDato(F, d, 'Próxima acción') || null,
    creado_en: r.creado_en, actualizado_en: r.actualizado_en,
  };
}
function datosLista(F, p, base = {}) {
  const d = { ...base };
  const put = (nombre, valor) => { const c = campo(F, nombre); if (c) d[c.id] = valor; };
  put('Empresa', limStr(p.empresa, 180));
  put('Nombre', limStr(p.contacto_nombre || p.empresa, 180));
  put('Contacto', limStr(p.contacto_nombre, 180));
  put('Cargo', limStr(p.contacto_cargo, 180));
  const emails = emailsDe(p.email, p.email_secundario);
  put('Email', emails[0] || '');
  put('Emails adicionales', emails.slice(1).join(', '));
  put('Teléfono', limStr(p.telefono, 80));
  put('Zona / Localidad', limStr(p.localidad, 120));
  put('Dirección / Ubicación', limStr(p.direccion, 240));
  put('Rubro / Equipamiento Principal', limStr(p.rubro, 240));
  put('Perfil Redes Sociales', limStr(p.perfil_redes, 240));
  put('Tipo de Contacto Directo', limStr(p.tipo_contacto, 120));
  put('CUIT', limStr(p.cuit, 30));
  put('ID Origen', limStr(p.origen_id, 80));
  put('Observaciones / Foco Comercial', limStr(p.observaciones, 4000));
  put('Notas', limStr(p.notas || p.observaciones, 4000));
  put('Origen', p.origen === 'excel' ? 'Excel' : 'Manual');
  put('Cliente convertido', limStr(p.cliente_id, 80));
  const fecha = fechaISO(p.fecha_proxima_accion);
  if (fecha !== undefined) put('Próxima acción', fecha);
  const estadoNombre = estadoPorSlug(F, p.estado) || opciones(F)[0] || 'Nuevo';
  put('Estado', estadoNombre);
  return d;
}
async function filas(F) {
  const rows = await query('SELECT * FROM lista_registros WHERE lista_id = $1 AND archivado = false ORDER BY actualizado_en DESC', [F.__lista.id]);
  return rows.map((r) => fila(F, r));
}
function setLista(F, lista) { F.__lista = lista; }

function filtros(req, filas) {
  const q = norm(req.query?.q);
  return filas.filter((p) => {
    if (q && !norm([p.empresa, p.localidad, p.rubro, p.contacto_nombre, p.email, p.email_secundario, p.telefono, p.observaciones].join(' ')).includes(q)) return false;
    if (req.query?.estado && p.estado !== slugEstado(req.query.estado)) return false;
    if (req.query?.localidad && !norm(p.localidad).includes(norm(req.query.localidad))) return false;
    if (req.query?.responsable && !norm(p.responsable).includes(norm(req.query.responsable))) return false;
    if (req.query?.origen && p.origen !== req.query.origen) return false;
    if (req.query?.desde && new Date(p.creado_en) < new Date(`${req.query.desde}T00:00:00`)) return false;
    if (req.query?.hasta && new Date(p.creado_en) > new Date(`${req.query.hasta}T23:59:59`)) return false;
    return true;
  });
}

async function existeDuplicado(F, p, excepto = null) {
  const lista = await filas(F);
  return lista.find((x) => x.id !== excepto && (
    (p.cuit && norm(x.cuit) === norm(p.cuit)) ||
    (emailsDe(p.email, p.email_secundario).some((e) => emailsDe(x.email, x.email_secundario).includes(e))) ||
    (telNorm(p.telefono) && telNorm(x.telefono) === telNorm(p.telefono)) ||
    (norm(p.empresa) && norm(x.empresa) === norm(p.empresa) && norm(p.localidad) && norm(x.localidad) === norm(p.localidad))
  )) || null;
}
async function crear(F, p, req) {
  const id = idNuevo('reg');
  const datos = datosLista(F, p);
  await query(
    `INSERT INTO lista_registros (id, lista_id, datos, creado_por, actualizado_por)
     VALUES ($1,$2,$3::jsonb,$4,$4)`,
    [id, F.__lista.id, JSON.stringify(datos), req.user?.email || 'sistema']
  );
  await auditar({ req, tabla: 'lista_registros', registroId: id, accion: 'crear_prospecto', detalle: F.__lista.id });
  return id;
}
async function actualizar(F, id, p, req) {
  const r = await one('SELECT * FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [id, F.__lista.id]);
  if (!r) return false;
  const datos = datosLista(F, p, r.datos || {});
  await query('UPDATE lista_registros SET datos = $2::jsonb, actualizado_por = $3, actualizado_en = now() WHERE id = $1', [id, JSON.stringify(datos), req.user?.email || 'sistema']);
  await auditar({ req, tabla: 'lista_registros', registroId: id, accion: 'editar_prospecto', detalle: F.__lista.id });
  return true;
}

// ---------- Estados ----------
prospectosRouter.get('/prospectos/estados', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const { F } = await contexto();
  return res.json(opciones(F).map((nombre) => ({ clave: slugEstado(nombre), nombre, color: colorDe(nombre), activo: true })));
});
prospectosRouter.post('/prospectos/estados', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const { F } = await contexto();
  const nombre = limStr(req.body?.nombre, 60);
  if (!nombre) return res.status(400).json({ error: 'El estado necesita un nombre.' });
  const c = campo(F, 'Estado');
  if (!c) return res.status(503).json({ error: 'La lista no tiene campo Estado.' });
  const actuales = opciones(F);
  if (actuales.some((x) => slugEstado(x) === slugEstado(nombre))) return res.status(400).json({ error: 'Ese estado ya existe.' });
  const config = { ...c.config, opciones: [...actuales, nombre] };
  await query('UPDATE lista_campos SET config = $2::jsonb WHERE id = $1', [c.id, JSON.stringify(config)]);
  return res.status(201).json({ clave: slugEstado(nombre), nombre, color: colorDe(nombre) });
});
prospectosRouter.patch('/prospectos/estados/:clave', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const { F } = await contexto();
  const c = campo(F, 'Estado');
  if (!c) return res.status(503).json({ error: 'La lista no tiene campo Estado.' });
  const actuales = opciones(F);
  const idx = actuales.findIndex((x) => slugEstado(x) === req.params.clave);
  if (idx < 0) return res.status(404).json({ error: 'Estado no encontrado.' });
  let nuevas = [...actuales];
  if (req.body?.activo === false) nuevas = nuevas.filter((_, i) => i !== idx);
  else if (req.body?.nombre !== undefined) { const n = limStr(req.body.nombre, 60); if (!n) return res.status(400).json({ error: 'Nombre inválido.' }); nuevas[idx] = n; }
  await query('UPDATE lista_campos SET config = $2::jsonb WHERE id = $1', [c.id, JSON.stringify({ ...c.config, opciones: nuevas })]);
  return res.json({ ok: true });
});

// ---------- CRUD ----------
prospectosRouter.get('/prospectos', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const { lista, F } = await contexto(); setLista(F, lista);
  const todas = filtros(req, await filas(F));
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 100));
  const offset = Math.max(0, Number(req.query?.offset) || 0);
  return res.json({ filas: todas.slice(offset, offset + limit), total: todas.length, limit, offset, estados: opciones(F).map((n) => ({ clave: slugEstado(n), nombre: n, color: colorDe(n), activo: true })) });
});
prospectosRouter.post('/prospectos', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const { lista, F } = await contexto(); setLista(F, lista);
  const p = { ...req.body, estado: req.body?.estado || slugEstado(opciones(F)[0] || 'Nuevo') };
  if (!limStr(p.empresa, 180)) return res.status(400).json({ error: 'La empresa es obligatoria.' });
  if (!p.cuit && !emailNorm(p.email) && !telNorm(p.telefono)) return res.status(400).json({ error: 'Cargá CUIT, email o teléfono para identificarlo y evitar duplicados.' });
  if (!estadoPorSlug(F, p.estado)) return res.status(400).json({ error: 'Estado inválido.' });
  if (fechaISO(p.fecha_proxima_accion) === undefined) return res.status(400).json({ error: 'Fecha inválida.' });
  const dup = await existeDuplicado(F, p);
  if (dup) return res.status(409).json({ error: `Ya existe un prospecto similar: ${dup.empresa}.`, existente_id: dup.id });
  const id = await crear(F, p, req);
  return res.status(201).json({ id });
});
prospectosRouter.patch('/prospectos/:id', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const { lista, F } = await contexto(); setLista(F, lista);
  const actual = (await filas(F)).find((x) => x.id === req.params.id);
  if (!actual) return res.status(404).json({ error: 'Prospecto no encontrado.' });
  const p = { ...actual, ...req.body, fecha_proxima_accion: req.body?.fecha_proxima_accion ?? actual.fecha_proxima_accion };
  if (req.body?.empresa !== undefined && !limStr(req.body.empresa, 180)) return res.status(400).json({ error: 'La empresa es obligatoria.' });
  if (req.body?.estado !== undefined && !estadoPorSlug(F, req.body.estado)) return res.status(400).json({ error: 'Estado inválido.' });
  if (fechaISO(p.fecha_proxima_accion) === undefined) return res.status(400).json({ error: 'Fecha inválida.' });
  if (['empresa', 'cuit', 'email', 'telefono', 'localidad'].some((k) => req.body?.[k] !== undefined)) {
    const dup = await existeDuplicado(F, p, actual.id);
    if (dup) return res.status(409).json({ error: `Ya existe un prospecto similar: ${dup.empresa}.`, existente_id: dup.id });
  }
  await actualizar(F, actual.id, p, req);
  return res.json({ ok: true });
});
prospectosRouter.delete('/prospectos/:id', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const { lista, F } = await contexto(); setLista(F, lista);
  const r = await one('SELECT id FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.id, lista.id]);
  if (!r) return res.status(404).json({ error: 'Prospecto no encontrado.' });
  await query('UPDATE lista_registros SET archivado = true, actualizado_en = now(), actualizado_por = $2 WHERE id = $1', [r.id, req.user.email]);
  return res.json({ ok: true });
});

// ---------- Parser XLSX ----------
function mapHeaders(headers) {
  const h = headers.map((x) => norm(x));
  const buscar = (...ops) => h.findIndex((x) => ops.some((o) => x.includes(norm(o))));
  return { empresa: buscar('empresa / prospecto', 'empresa'), localidad: buscar('zona / localidad', 'zona', 'localidad'), direccion: buscar('direccion / ubicacion', 'direccion'), rubro: buscar('rubro / equipamiento', 'rubro'), perfil_redes: buscar('perfil redes', 'redes sociales'), contacto: buscar('contacto linkedin', 'nombre y cargo', 'contacto'), email: buscar('email de contacto', 'email'), telefono: buscar('telefono / whatsapp', 'telefono'), tipo_contacto: buscar('tipo de contacto'), observaciones: buscar('observaciones', 'foco comercial'), origen_id: buscar('id') };
}
async function leerExcel(buffer) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0]; if (!ws) return { filas: [], columnas: [], nuevas: [] };
  const filas = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = []; for (let i = 1; i <= Math.max(ws.columnCount, row.cellCount); i += 1) vals.push(String(row.getCell(i)?.text ?? '').trim());
    if (vals.some(Boolean)) filas.push(vals);
  });
  const hi = filas.findIndex((f) => f.some((v) => norm(v).includes('empresa'))); if (hi < 0) return { filas: [], columnas: [], nuevas: [] };
  const headers = filas[hi];
  const m = mapHeaders(headers); if (m.empresa < 0) return { filas: [], columnas: [], nuevas: [] };
  const usadas = new Set(Object.values(m).filter((i) => i >= 0));
  const conocidas = new Set(['id']);
  const nuevas = headers.filter((h, i) => h && !usadas.has(i) && !conocidas.has(norm(h)));
  const data = filas.slice(hi + 1).map((f, i) => {
    const g = (k) => (k >= 0 ? (f[k] || '') : '');
    const c = g(m.contacto).split(/\s+-\s+/);
    return { fila: i + hi + 2, origen_id: g(m.origen_id) || null, empresa: g(m.empresa), localidad: g(m.localidad), direccion: g(m.direccion), rubro: g(m.rubro), perfil_redes: g(m.perfil_redes), contacto_nombre: (c[0] || '').trim(), contacto_cargo: c.slice(1).join(' - ').trim(), email: g(m.email), telefono: g(m.telefono), tipo_contacto: g(m.tipo_contacto), observaciones: g(m.observaciones) };
  }).filter((f) => f.empresa || f.email || f.telefono);
  return { filas: data, columnas: headers.filter(Boolean), nuevas };
}
async function clasificar(filas, existentes) {
  return filas.map((f) => {
    const base = { fila: f.fila, datos: { ...f, estado: slugEstado(opciones(F)[0] || 'Nuevo'), origen: 'excel' } };
    if (!f.empresa) return { ...base, clasificacion: 'error', error: 'Falta la empresa.' };
    if (!emailNorm(f.email) && !telNorm(f.telefono)) return { ...base, clasificacion: 'error', error: 'Falta email o teléfono.' };
    let match = existentes.find((p) => (emailsDe(f.email).some((e) => emailsDe(p.email, p.email_secundario).includes(e))) || (telNorm(f.telefono) && telNorm(p.telefono) === telNorm(f.telefono)) || (norm(f.origen_id) && norm(p.origen_id) === norm(f.origen_id)));
    let tipo = match ? 'clave' : null;
    if (!match) { match = existentes.find((p) => norm(p.empresa) === norm(f.empresa) && norm(p.localidad) === norm(f.localidad)); tipo = match ? 'empresa_localidad' : null; }
    if (!match) { match = existentes.find((p) => norm(p.localidad) === norm(f.localidad) && norm(p.empresa).includes(norm(f.empresa)) || norm(f.empresa).includes(norm(p.empresa))); tipo = match ? 'parecida' : null; }
    return { ...base, clasificacion: match ? (tipo === 'parecida' || ['email', 'telefono', 'empresa_localidad'].includes(tipo) ? 'parcial' : 'exacto') : 'nuevo', coincidencia: match ? { id: match.id, empresa: match.empresa, estado: match.estado, email: match.email, telefono: match.telefono } : null };
  });
}
let F = {};

prospectosRouter.post('/prospectos/importar/preview', authRequired, permisoRequerido('ventas_editar'), subirExcel.single('archivo'), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ error: 'Subí un archivo .xlsx.' });
  let parsed; try { parsed = await leerExcel(req.file.buffer); } catch { return res.status(400).json({ error: 'Excel inválido.' }); }
  if (!parsed.filas.length) return res.status(400).json({ error: 'No se encontraron prospectos.' });
  const { lista, F: campos } = await contexto(); F = campos; setLista(F, lista);
  const clasificados = await clasificar(parsed.filas, await filas(F));
  const resumen = { total: clasificados.length, nuevos: clasificados.filter((x) => x.clasificacion === 'nuevo').length, exactos: clasificados.filter((x) => x.clasificacion === 'exacto').length, parciales: clasificados.filter((x) => x.clasificacion === 'parcial').length, errores: clasificados.filter((x) => x.clasificacion === 'error').length };
  const id = idNuevo('imp');
  await query('INSERT INTO prospecto_importaciones (id,usuario_email,nombre_archivo,filas,resumen) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)', [id, req.user.email, limStr(req.file.originalname, 180), JSON.stringify(clasificados), JSON.stringify(resumen)]);
  return res.json({ importacion_id: id, resumen, columnas: parsed.columnas, columnas_nuevas: parsed.nuevas, filas: clasificados });
});
prospectosRouter.post('/prospectos/importar', authRequired, permisoRequerido('ventas_editar'), async (req, res) => {
  const imp = await one('SELECT * FROM prospecto_importaciones WHERE id=$1 AND usuario_email=$2 AND usado=false', [req.body?.importacion_id, req.user.email]);
  if (!imp) return res.status(404).json({ error: 'Previsualización no encontrada.' });
  const { lista, F: campos } = await contexto(); F = campos; setLista(F, lista);
  const conteo = { creados: 0, actualizados: 0, omitidos: 0, errores: 0 }; const decisiones = req.body?.decisiones || {};
  for (let i = 0; i < (imp.filas || []).length; i += 1) {
    const f = imp.filas[i]; if (f.clasificacion === 'error') { conteo.errores += 1; continue; }
    const d = decisiones[String(i)] || (f.clasificacion === 'nuevo' ? 'crear' : 'omitir');
    if (d === 'omitir' || (f.clasificacion === 'parcial' && !decisiones[String(i)])) { conteo.omitidos += 1; continue; }
    try {
      if (d === 'actualizar' && f.coincidencia?.id) { await actualizar(F, f.coincidencia.id, f.datos, req); conteo.actualizados += 1; }
      else { await crear(F, f.datos, req); conteo.creados += 1; }
    } catch { conteo.errores += 1; }
  }
  await query('UPDATE prospecto_importaciones SET usado=true WHERE id=$1', [imp.id]);
  return res.json({ ok: true, ...conteo });
});

const COLS = [['Empresa / Prospecto','empresa'],['CUIT','cuit'],['Zona / Localidad','localidad'],['Dirección / Ubicación','direccion'],['Rubro / Equipamiento','rubro'],['Perfil Redes Sociales','perfil_redes'],['Contacto','contacto_nombre'],['Cargo','contacto_cargo'],['Email','email'],['Emails adicionales','email_secundario'],['Teléfono / WhatsApp','telefono'],['Tipo de Contacto','tipo_contacto'],['Estado','estado'],['Observaciones','observaciones'],['Responsable','responsable'],['Próxima acción','proxima_accion'],['Fecha próxima acción','fecha_proxima_accion'],['Origen','origen'],['Creado','creado_en']];
prospectosRouter.get('/prospectos/exportar', authRequired, permisoRequerido('ventas'), async (req, res) => {
  const { lista, F: campos } = await contexto(); F = campos; setLista(F, lista);
  const todas = filtros(req, await filas(F)); const formato = String(req.query?.formato || 'xlsx');
  const nombre = `prospectos-${new Date().toISOString().slice(0, 10)}.${formato === 'csv' ? 'csv' : 'xlsx'}`;
  if (formato === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const texto = [COLS.map(([h]) => esc(h)).join(',')].concat(todas.map((f) => COLS.map(([, k]) => esc(f[k])).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`); return res.send(`\uFEFF${texto}`);
  }
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Prospectos');
  ws.addRow(COLS.map(([h]) => h)); for (const f of todas) ws.addRow(COLS.map(([, k]) => f[k] ?? ''));
  ws.getRow(1).font = { bold: true }; ws.columns.forEach((c) => { c.width = 22; });
  const buffer = await wb.xlsx.writeBuffer(); res.setHeader('Content-Type', ARCHIVO_XLSX); res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`); return res.send(Buffer.from(buffer));
});

prospectosRouter.post('/prospectos/:id/convertir', authRequired, permisoRequerido('ventas_cerrar'), async (req, res) => {
  const { lista, F: campos } = await contexto(); F = campos; setLista(F, lista);
  const actual = (await filas(F)).find((x) => x.id === req.params.id); if (!actual) return res.status(404).json({ error: 'Prospecto no encontrado.' });
  if (actual.cliente_id) return res.json({ cliente_id: actual.cliente_id, ya_convertido: true });
  let cliente = emailNorm(actual.email) ? await one('SELECT id FROM clientes WHERE LOWER(email)=$1 AND deleted_at IS NULL', [emailNorm(actual.email)]) : null;
  let nuevo = false;
  await tx(async (client) => {
    if (!cliente) { const id = idNuevo('cli'); await client.query("INSERT INTO clientes (id,nombre,tipo,telefono,contacto,email,empresa) VALUES ($1,$2,'empresa',$3,$4,$5,$6)", [id, actual.empresa || 'Cliente sin nombre', actual.telefono || '', actual.contacto_nombre || '', emailNorm(actual.email) || null, actual.empresa || '']); cliente = { id }; nuevo = true; }
    const datos = datosLista(F, { ...actual, estado: 'convertido', cliente_id: cliente.id }, (await one('SELECT datos FROM lista_registros WHERE id=$1', [actual.id])).datos || {});
    await client.query('UPDATE lista_registros SET datos=$2::jsonb, actualizado_en=now(), actualizado_por=$3 WHERE id=$1', [actual.id, JSON.stringify(datos), req.user.email]);
  });
  return res.json({ cliente_id: cliente.id, nuevo });
});

// Convierte el prospecto asociado a una oportunidad cuando se acepta la
// cotización. La oportunidad puede traer el id de la fila de la lista o solo
// los datos de contacto; en ambos casos se busca en Ventas → Prospectos.
export async function convertirProspectoDeOportunidad(o, req) {
  try {
    const { lista, F: campos } = await contexto();
    F = campos; setLista(F, lista);
    const todas = await filas(F);
    let prospecto = o.prospecto_id ? todas.find((x) => x.id === o.prospecto_id) : null;
    if (!prospecto) {
      const emails = emailsDe(o.prospecto_email);
      const tel = telNorm(o.prospecto_telefono);
      prospecto = todas.find((x) => emails.some((e) => emailsDe(x.email, x.email_secundario).includes(e)) || (tel && telNorm(x.telefono) === tel) || (o.prospecto_nombre && norm(x.empresa) === norm(o.prospecto_nombre)));
    }
    if (o.cliente_id) {
      if (prospecto && prospecto.cliente_id !== o.cliente_id) {
        const datos = datosLista(F, { ...prospecto, estado: 'convertido', cliente_id: o.cliente_id }, (await one('SELECT datos FROM lista_registros WHERE id=$1', [prospecto.id])).datos || {});
        await query('UPDATE lista_registros SET datos=$2::jsonb, actualizado_en=now(), actualizado_por=$3 WHERE id=$1', [prospecto.id, JSON.stringify(datos), req.user?.email || 'cliente']);
      }
      return { cliente_id: o.cliente_id, ya_existia: true, prospecto };
    }
    const empresa = prospecto?.empresa || o.prospecto_nombre || o.titulo || '';
    const emails = emailsDe(prospecto?.email, prospecto?.email_secundario, o.prospecto_email);
    const email = emails[0] || '';
    const tel = telNorm(prospecto?.telefono || o.prospecto_telefono);
    if (!empresa && !emails.length && !tel) return null;
    let cliente = null;
    for (const e of emails) { cliente = await one('SELECT id FROM clientes WHERE LOWER(email)=$1 AND deleted_at IS NULL', [e]); if (cliente) break; }
    if (!cliente && tel) cliente = await one("SELECT id FROM clientes WHERE regexp_replace(COALESCE(telefono,''), '\\\\D', '', 'g')=$1 AND deleted_at IS NULL", [tel]);
    if (!cliente && empresa) cliente = await one('SELECT id FROM clientes WHERE LOWER(TRIM(nombre))=LOWER(TRIM($1)) AND deleted_at IS NULL', [empresa]);
    let nuevo = false;
    await tx(async (client) => {
      if (!cliente) {
        const cid = idNuevo('cli');
        await client.query("INSERT INTO clientes (id,nombre,tipo,telefono,contacto,email,empresa) VALUES ($1,$2,'empresa',$3,$4,$5,$6)", [cid, empresa || 'Cliente sin nombre', prospecto?.telefono || o.prospecto_telefono || '', prospecto?.contacto_nombre || '', email || null, empresa || '']);
        cliente = { id: cid }; nuevo = true;
      }
      if (prospecto) {
        const actual = (await client.query('SELECT datos FROM lista_registros WHERE id=$1', [prospecto.id])).rows[0];
        const datos = datosLista(F, { ...prospecto, estado: 'convertido', cliente_id: cliente.id }, actual?.datos || {});
        await client.query('UPDATE lista_registros SET datos=$2::jsonb, actualizado_en=now(), actualizado_por=$3 WHERE id=$1', [prospecto.id, JSON.stringify(datos), req.user?.email || 'cliente']);
      }
      await client.query('UPDATE oportunidades SET cliente_id=$2, prospecto_id=COALESCE(prospecto_id,$3), actualizado_en=now(), actualizado_por=$4 WHERE id=$1', [o.id, cliente.id, prospecto?.id || null, req.user?.email || 'cliente']);
    });
    return { cliente_id: cliente.id, nuevo, prospecto };
  } catch (e) {
    console.error('[prospectos] no se pudo convertir al aceptar:', e.message);
    return null;
  }
}
