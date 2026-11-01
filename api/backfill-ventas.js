// Backfill de Ventas V2: conversaciones de WhatsApp y lista de Oportunidades.
//
// Uso:
//   node api/backfill-ventas.js           # modo seco (no escribe)
//   node api/backfill-ventas.js --aplicar # migra de verdad
//
// Es idempotente: usa (origen_dato, origen_id) y se puede volver a correr.
import { randomUUID } from 'node:crypto';
import { query, one } from './db.js';
import { normalizarEtapa, normalizarMonto } from '../src/data/crm.js';

const APLICAR = process.argv.includes('--aplicar');
const idNuevo = (p) => `${p}_${randomUUID()}`;
const lim = (v, n = 200) => String(v ?? '').trim().slice(0, n);

const mapaEtapa = {
  prospeccion: 'nuevo', prospección: 'nuevo', contacto: 'nuevo', nuevo: 'nuevo',
  propuesta: 'presupuestado', presupuestado: 'presupuestado',
  negociacion: 'negociando', negociación: 'negociando', negociando: 'negociando',
  ganada: 'ganado', ganado: 'ganado', perdida: 'perdido', perdido: 'perdido',
};
const etapaDe = (v) => mapaEtapa[String(v || '').trim().toLowerCase()] || normalizarEtapa(v);

async function clientePorDatos({ nombre, email, telefono }) {
  const candidatos = [];
  if (email) candidatos.push(await one('SELECT id FROM clientes WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1', [email]));
  if (telefono) candidatos.push(await one("SELECT id FROM clientes WHERE regexp_replace(COALESCE(telefono,''), '\\D', '', 'g') LIKE '%' || regexp_replace($1, '\\D', '', 'g') || '%' AND deleted_at IS NULL LIMIT 1", [telefono]));
  if (nombre) candidatos.push(await one('SELECT id FROM clientes WHERE lower(nombre)=lower($1) AND deleted_at IS NULL LIMIT 1', [nombre]));
  return candidatos.find(Boolean)?.id || null;
}

async function existe(origenDato, origenId) {
  return one('SELECT id FROM oportunidades WHERE origen_dato=$1 AND origen_id=$2', [origenDato, origenId]);
}

async function crear({ origenDato, origenId, titulo, clienteId, nombre, telefono, email, etapa, monto, responsable, notas, conversacionId = null }) {
  if (await existe(origenDato, origenId)) return null;
  const id = idNuevo('op');
  if (APLICAR) {
    await query(
      `INSERT INTO oportunidades (id, titulo, cliente_id, prospecto_nombre, prospecto_telefono, prospecto_email, etapa, monto_estimado, probabilidad, responsable, canal, conversacion_id, notas, origen_dato, origen_id, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'backfill','backfill')`,
      [id, lim(titulo || nombre || telefono || 'Oportunidad migrada', 160), clienteId, nombre || null, telefono || null, email || null, etapa, monto, 10, responsable || null, origenDato === 'whatsapp' ? 'WhatsApp' : 'Lista', conversacionId, notas || null, origenDato, origenId]
    );
    if (conversacionId) await query('UPDATE wa_conversaciones SET oportunidad_id=$2 WHERE id=$1', [conversacionId, id]);
  }
  return id;
}

async function main() {
  console.log(APLICAR ? '== Aplicando backfill ==' : '== Modo seco (usar --aplicar para escribir) ==');

  const convs = await query('SELECT id, cliente_id, nombre_perfil, telefono, etapa, monto_estimado, asignado_a, oportunidad_id FROM wa_conversaciones ORDER BY creado_en');
  let nuevasConv = 0;
  for (const c of convs) {
    if (c.oportunidad_id) continue;
    const cliente = c.cliente_id ? await one('SELECT id, nombre, email, telefono FROM clientes WHERE id=$1', [c.cliente_id]) : null;
    const nombre = cliente?.nombre || c.nombre_perfil || c.telefono;
    const id = await crear({
      origenDato: 'whatsapp', origenId: c.id, titulo: `Oportunidad de ${nombre}`, clienteId: cliente?.id || null,
      nombre, telefono: cliente?.telefono || c.telefono, email: cliente?.email || null,
      etapa: etapaDe(c.etapa), monto: normalizarMonto(c.monto_estimado), responsable: c.asignado_a,
      notas: 'Migrada desde la conversación de WhatsApp.', conversacionId: c.id,
    });
    if (id) nuevasConv += 1;
  }
  console.log(`Conversaciones: ${convs.length} · oportunidades nuevas: ${nuevasConv}`);

  const listas = await query("SELECT id, nombre FROM listas WHERE area_id='area_ventas' AND archivada=false AND lower(nombre) LIKE '%oportunidad%'");
  let nuevasLista = 0;
  for (const lista of listas) {
    const campos = await query('SELECT id, nombre FROM lista_campos WHERE lista_id=$1 AND activo=true', [lista.id]);
    const campo = (nombre) => campos.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase())?.id;
    const idNombre = campo('Nombre'); const idEtapa = campo('Etapa'); const idMonto = campo('Monto'); const idResp = campo('Responsable'); const idProspecto = campo('Prospecto'); const idNotas = campo('Notas');
    const registros = await query('SELECT id, datos FROM lista_registros WHERE lista_id=$1 AND archivado=false', [lista.id]);
    for (const r of registros) {
      const d = r.datos || {};
      const nombre = lim(d[idNombre], 160) || `Oportunidad ${r.id}`;
      const clienteId = await clientePorDatos({ nombre: d[idProspecto] || nombre });
      const id = await crear({
        origenDato: 'lista_ventas', origenId: r.id, titulo: nombre, clienteId,
        nombre: d[idProspecto] || null, etapa: etapaDe(d[idEtapa]), monto: normalizarMonto(d[idMonto]),
        responsable: lim(d[idResp], 200) || null, notas: d[idNotas] || 'Migrada desde la lista de Oportunidades.',
      });
      if (id) nuevasLista += 1;
    }
  }
  console.log(`Listas de Oportunidades: ${listas.length} · oportunidades nuevas: ${nuevasLista}`);
  console.log(APLICAR ? 'Backfill aplicado.' : 'No se escribió nada.');
  process.exit(0);
}

main().catch((e) => { console.error('Fallo el backfill:', e.message); process.exit(1); });
