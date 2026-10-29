// Siembra inicial del área Ventas: tres listas base, campos y vistas.
// Se ejecuta una sola vez, cuando el área no tiene ninguna lista (ni archivada).
import { randomUUID } from 'node:crypto';
import { query, tx } from './db.js';

const id = (prefijo) => `${prefijo}_${randomUUID()}`;

const PROSPECTOS = {
  nombre: 'Prospectos',
  descripcion: 'Contactos comerciales que todavía no son clientes del taller.',
  icono: 'users',
  campos: [
    { nombre: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'Empresa', tipo: 'texto' },
    { nombre: 'Email', tipo: 'email' },
    { nombre: 'Teléfono', tipo: 'telefono' },
    { nombre: 'Origen', tipo: 'seleccion', config: { opciones: ['Web', 'WhatsApp', 'Recomendación', 'Redes', 'Otro'] } },
    { nombre: 'Estado', tipo: 'seleccion', config: { opciones: ['Nuevo', 'Contactado', 'Calificado', 'Descartado'] } },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Próxima acción', tipo: 'fecha' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Todos los prospectos', tipo: 'grid', predeterminada: true, config: {} },
    { nombre: 'Para contactar', tipo: 'grid', config: ({ Estado }) => ({ filtros: [{ campo: Estado, op: 'igual', valor: 'Nuevo' }] }) },
  ],
};

const OPORTUNIDADES = {
  nombre: 'Oportunidades',
  descripcion: 'Pipeline comercial: etapas, montos y próximos cierres.',
  icono: 'dollar',
  campos: [
    { nombre: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'Prospecto', tipo: 'texto' },
    { nombre: 'Etapa', tipo: 'seleccion', config: { opciones: ['Prospección', 'Contacto', 'Propuesta', 'Negociación', 'Ganada', 'Perdida'] } },
    { nombre: 'Monto', tipo: 'moneda', config: { min: 0 } },
    { nombre: 'Probabilidad', tipo: 'numero', config: { min: 0, max: 100 } },
    { nombre: 'Cierre estimado', tipo: 'fecha' },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Pipeline', tipo: 'kanban', predeterminada: true, config: ({ Etapa, Nombre }) => ({ kanban: Etapa, titulo: Nombre }) },
    { nombre: 'Mis oportunidades', tipo: 'grid', config: ({ Responsable }) => ({ mis: 'responsable', responsable: Responsable }) },
    { nombre: 'Todas', tipo: 'grid', config: {} },
  ],
};

const ACTIVIDADES = {
  nombre: 'Actividades',
  descripcion: 'Llamadas, mensajes, reuniones y visitas del equipo comercial.',
  icono: 'calendar',
  campos: [
    { nombre: 'Título', tipo: 'texto', requerido: true },
    { nombre: 'Tipo', tipo: 'seleccion', config: { opciones: ['Llamada', 'Email', 'Reunión', 'WhatsApp', 'Visita'] } },
    { nombre: 'Fecha', tipo: 'fecha' },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Estado', tipo: 'seleccion', config: { opciones: ['Pendiente', 'Hecha', 'Cancelada'] } },
    { nombre: 'Referencia', tipo: 'texto' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Pendientes', tipo: 'grid', predeterminada: true, config: ({ Estado }) => ({ filtros: [{ campo: Estado, op: 'igual', valor: 'Pendiente' }] }) },
    { nombre: 'Todas', tipo: 'grid', config: {} },
  ],
};

const LISTAS = [PROSPECTOS, OPORTUNIDADES, ACTIVIDADES];

export async function sembrarListasVentas() {
  const [uso] = await query("SELECT count(*)::int AS n FROM listas WHERE area_id = 'area_ventas'");
  if (Number(uso?.n) > 0) return { creadas: 0 };

  let creadas = 0;
  await tx(async (client) => {
    for (const def of LISTAS) {
      const listaId = id('lst');
      await client.query(
        `INSERT INTO listas (id, area_id, nombre, descripcion, icono, orden, creada_por)
         VALUES ($1,'area_ventas',$2,$3,$4,$5,'sistema')`,
        [listaId, def.nombre, def.descripcion, def.icono, (creadas + 1) * 10]
      );
      const campos = {};
      let orden = 0;
      for (const campo of def.campos || []) {
        orden += 10;
        const campoId = id('cam');
        campos[campo.nombre] = campoId;
        await client.query(
          `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, orden)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
          [campoId, listaId, campo.nombre, campo.tipo, campo.config || {}, campo.requerido === true, orden]
        );
      }
      let primera = true;
      for (const vista of def.vistas || []) {
        const config = typeof vista.config === 'function' ? vista.config(campos) : (vista.config || {});
        const predeterminada = vista.predeterminada === true || (primera && !def.vistas.some((v) => v.predeterminada));
        await client.query(
          `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
           VALUES ($1,$2,$3,$4,$5::jsonb,'compartida','sistema',$6)`,
          [id('vis'), listaId, vista.nombre, vista.tipo || 'grid', config, predeterminada]
        );
        primera = false;
      }
      creadas += 1;
    }
  });
  return { creadas };
}
