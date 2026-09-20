// Bertika - Seed/Reset de la base de datos.
// Carga los datos de la fuente de verdad (src/data/seed.js) en PostgreSQL.
// Uso (directo):  node api/seed.js   (idempotente: crea tablas y rellena)
// Uso (servidor): import { seedDatabase } from './seed.js'  -> POST /api/reset
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import {
  seedTecnicos,
  seedClientes,
  seedBaterias,
  seedInsumos,
  seedOrdenes,
  seedOrdenHistorica,
  seedOrdenEntregadaReciente,
  seedBajas,
} from '../src/data/seed.js';

const SCHEMA_SQL = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')

export async function seedDatabase() {
  const hash = (p) => bcrypt.hashSync(p, 12);
  await pool.query(SCHEMA_SQL);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Limpiar datos de demo (mantiene tablas)
    for (const t of ['usuarios', 'bajas', 'notificaciones', 'ordenes', 'insumos', 'baterias', 'clientes', 'tecnicos', 'contadores']) {
      await client.query(`DELETE FROM ${t}`);
    }

    const ins = async (sql, params) => client.query(sql, params);

    // Tecnicos
    for (const t of seedTecnicos) {
      await ins('INSERT INTO tecnicos (id, nombre, especialidad, certificaciones, activo) VALUES ($1,$2,$3,$4,$5)', [
        t.id, t.nombre, t.especialidad, JSON.stringify(t.certificaciones || []), t.activo ?? true,
      ]);
    }

    // Clientes (seed no trae email; se generan buzones demo)
    for (const c of seedClientes) {
      await ins('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email) VALUES ($1,$2,$3,$4,$5,$6)', [
        c.id, c.nombre, c.tipo, c.telefono, c.contacto, `${c.id}@demo.bertika.com`,
      ]);
    }

    // Baterias
    for (const b of seedBaterias) {
      await ins(
        'INSERT INTO baterias (id, numero_serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, fecha_fabricacion, cliente_id, ciclos_estimados, estado_vida) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [b.id, b.numero_serie, b.tipo, b.voltaje, b.capacidad, b.aplicacion, b.marca, b.modelo, b.equipo, b.fecha_fabricacion, b.cliente_id, b.ciclos_estimados, b.estado_vida]
      );
    }

    // Insumos
    for (const i of seedInsumos) {
      await ins('INSERT INTO insumos (id, nombre, categoria, stock, precio) VALUES ($1,$2,$3,$4,$5)', [
        i.id, i.nombre, i.categoria, i.stock, i.precio,
      ]);
    }

    // Ordenes (todas, incluida la historica y la entregada reciente)
    // Codigos de seguimiento: 16 digitos, deterministas por orden y unicos.
    const usados = new Set();
    const codigoOrden = (id) => {
      let sal = 0;
      let c;
      do {
        const h = createHash('sha256').update(`${id}:${sal}`).digest('hex');
        c = [...h].map((ch) => String(parseInt(ch, 16))).join('').slice(0, 16);
        sal += 1;
      } while (usados.has(c));
      usados.add(c);
      return c;
    };
    const todas = [...seedOrdenes, seedOrdenHistorica, seedOrdenEntregadaReciente];
    for (const o of todas) {
      await ins(
        `INSERT INTO ordenes
          (id, codigo_seguimiento, bateria_serie, cliente_id, tecnico_id, falla, motivo, estado, estado_cotizacion,
           fecha_ingreso, hora_entrega, fecha_entrega, monto_cobrado, garantia, cotizacion,
           insumos_utilizados, prueba_final, diagnostico, eventos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          o.id, codigoOrden(o.id), o.bateria_serie, o.cliente_id, o.tecnico_id, o.falla, o.motivo, o.estado,
          o.estado_cotizacion, o.fecha_ingreso, o.hora_entrega, o.fecha_entrega,
          o.monto_cobrado, JSON.stringify(o.garantia || null) || null, JSON.stringify(o.cotizacion || null),
          JSON.stringify(o.insumos_utilizados || []), JSON.stringify(o.prueba_final || { estado: 'pending' }),
          JSON.stringify(o.diagnostico || null), JSON.stringify(o.eventos || []),
        ]
      );
    }

    // Bajas iniciales (fuente unica: seedBajas)
    for (const b of seedBajas) {
      await ins(
        'INSERT INTO bajas (id, bateria_id, serie, fecha, motivo, disposicion, reciclada) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [b.id, b.bateria_id, b.serie, b.fecha, b.motivo, b.disposicion, b.reciclada ?? false]
      );
    }

    // Usuarios de acceso. Las contraseñas NO viven en el codigo: se leen del
    // entorno (variables DEMO_*) o — si no estan definidas — se generan al azar
    // e informan por consola para poder ingresar por primera vez.
    const randomPass = () =>
      randomBytes(12).toString('base64url').slice(0, 14) + 'K1!';
    // Contrasenas >= 8 caracteres; las del .env demasiado cortas se descartan.
    const envOK = (p) => p && p.length >= 8 && p.length <= 72;
    const demoUsers = [
      { id: 'usr_admin', email: 'admin@bertika.com', rol: 'admin', env: envOK(process.env.DEMO_ADMIN_PASS) ? process.env.DEMO_ADMIN_PASS : undefined },
      { id: 'usr_tec01', email: 'tec01@bertika.com', rol: 'tecnico', tecnico_id: 'tec_01', env: envOK(process.env.DEMO_TEC01_PASS) ? process.env.DEMO_TEC01_PASS : undefined },
      { id: 'usr_cli01', email: 'cli01@bertika.com', rol: 'cliente', cliente_id: 'cli_01', env: envOK(process.env.DEMO_CLI01_PASS) ? process.env.DEMO_CLI01_PASS : undefined },
    ];
    const usuarios = demoUsers.map((u) => ({ ...u, pass: u.env || randomPass() }));
    const requierePrint = demoUsers.some((u) => !u.env) && process.env.NODE_ENV !== 'production';
    if (requierePrint) {
      console.log('[seed] DEMO credenciales no configuradas en el .env. Se generaron:');
      for (const u of usuarios) if (!u.env) console.log(`[seed]   ${u.email} / ${u.pass}`);
      console.log('[seed] Defini DEMO_ADMIN_PASS, DEMO_TEC01_PASS y DEMO_CLI01_PASS para fijar las cuentas.');
    }
    for (const u of usuarios) {
      await ins(
        'INSERT INTO usuarios (id, email, password_hash, rol, tecnico_id, cliente_id, activo) VALUES ($1,$2,$3,$4,$5,$6,true)',
        [u.id, u.email, hash(u.pass), u.rol, u.tecnico_id || null, u.cliente_id || null]
      );
    }

    // Contadores (para seguir generando ids tipo ord_100+, ev_100+, bat_100+)
    const contadores = [['ord', 100], ['bat', 100], ['ev', 100], ['cli', 100], ['ins', 100], ['baja', 100], ['nt', 100], ['usr', 100]];
    for (const [nombre, valor] of contadores) {
      await ins('INSERT INTO contadores (nombre, valor) VALUES ($1,$2) ON CONFLICT (nombre) DO UPDATE SET valor = EXCLUDED.valor', [nombre, valor]);
    }

    await client.query('COMMIT');
    return { ok: true, ordenes: todas.length, clientes: seedClientes.length, tecnicos: seedTecnicos.length, baterias: seedBaterias.length, insumos: seedInsumos.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Solo se autoejecuta cuando el archivo se corre directo (node api/seed.js)
const esDirecto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esDirecto) {
  console.log('== Bertika seed ==');
  seedDatabase()
    .then((r) => { console.log('Seed completado:', r.ordenes, 'ordenes,', r.clientes, 'clientes,', r.tecnicos, 'tecnicos,', r.baterias, 'baterias,', r.insumos, 'insumos'); })
    .catch((e) => { console.error('Seed fallo:', e); process.exit(1); })
    .finally(() => pool.end());
}