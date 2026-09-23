// Bertika - Crea las plantillas de WhatsApp en Meta.
//
// Se ejecuta EN EL SERVIDOR, leyendo las claves de /etc/bertika/bertika-api.env:
//   ssh root@srv1981179.hstgr.cloud "node -" < scripts/lib/plantillas.mjs
// (o con el envoltorio: bash scripts/whatsapp-plantillas.sh)
//
// Es idempotente: si la plantilla ya existe, no la toca.
import { readFileSync } from 'node:fs';

const ENV = '/etc/bertika/bertika-api.env';

// Los textos son los de docs/WHATSAPP_PLANTILLAS.md (categoria Utilidad).
export const PLANTILLAS = [
  {
    name: 'bateria_recibida',
    texto: 'Hola {{1}}, recibimos tu batería {{2}} en el taller Bertika. Podés seguir el avance en tiempo real desde este enlace: {{3}}. Respondé este mensaje si necesitás algo.',
    ejemplos: ['Juan', 'BAT-AUT-001', 'https://bertika.com/seguimiento'],
  },
  {
    name: 'cotizacion_lista',
    texto: 'Hola {{1}}, ya está listo el presupuesto para tu batería {{2}}. Podés verlo y aprobarlo desde este enlace: {{3}}. Si tenés dudas, respondé este mensaje.',
    ejemplos: ['Juan', 'BAT-AUT-001', 'https://bertika.com/cotizacion/ord_01'],
  },
  {
    name: 'bateria_lista',
    texto: 'Hola {{1}}, tu batería {{2}} pasó la prueba final y está lista para retirar. Te esperamos en el taller. Cualquier consulta respondé este mensaje.',
    ejemplos: ['Juan', 'BAT-AUT-001'],
  },
  {
    name: 'garantia_por_vencer',
    texto: 'Hola {{1}}, te escribimos del taller Bertika: la garantía de tu batería {{2}} vence el {{3}}. Si querés, coordinamos una revisión preventiva.',
    ejemplos: ['Juan', 'BAT-AUT-001', '15/03/2027'],
  },
  {
    name: 'visita_coordinada',
    texto: 'Hola {{1}}, recibimos tu pedido de visita técnica a {{2}} km. La estimación que te enviamos es la {{3}}: un vendedor te contacta para confirmar la fecha.',
    ejemplos: ['Juan', '60', 'CV-000123'],
  },
];

const leerEnv = (clave) => {
  const linea = readFileSync(ENV, 'utf8').split('\n').find((l) => l.startsWith(`${clave}=`));
  return linea ? linea.slice(clave.length + 1).trim() : '';
};

async function llamar(ruta, cuerpo) {
  const { token, version } = { token: leerEnv('WHATSAPP_TOKEN'), version: leerEnv('WHATSAPP_API_VERSION') || 'v22.0' };
  const res = await fetch(`https://graph.facebook.com/${version}/${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

async function listar() {
  const { token, version } = { token: leerEnv('WHATSAPP_TOKEN'), version: leerEnv('WHATSAPP_API_VERSION') || 'v22.0' };
  const waba = leerEnv('WHATSAPP_WABA_ID');
  const res = await fetch(`https://graph.facebook.com/${version}/${waba}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return json?.data || [];
}

const yaEstan = await listar();
const waba = leerEnv('WHATSAPP_WABA_ID');

if (!leerEnv('WHATSAPP_TOKEN') || !waba) {
  console.log('  x Falta la clave o el WABA ID en ' + ENV);
  process.exit(1);
}

console.log(`== Plantillas de WhatsApp (${yaEstan.length} ya cargadas en Meta) ==`);
for (const p of PLANTILLAS) {
  const existente = yaEstan.find((t) => t.name === p.name && t.language === 'es_AR');
  if (existente) {
    console.log(`  = ${p.name.padEnd(20)} ya estaba (${existente.status})`);
    continue;
  }
  const r = await llamar(`${waba}/message_templates`, {
    name: p.name,
    language: 'es_AR',
    category: 'UTILITY',
    components: [{ type: 'BODY', text: p.texto, example: { body_text: [p.ejemplos] } }],
  });
  if (r.ok) {
    console.log(`  + ${p.name.padEnd(20)} creada (${r.json?.status || 'PENDING'})`);
  } else {
    const e = r.json?.error || {};
    console.log(`  x ${p.name.padEnd(20)} error ${e.code || ''}: ${e.message || 'Meta rechazó la plantilla'}`);
    if (e.error_user_msg) console.log(`      ${e.error_user_msg}`);
  }
}
console.log('\nMeta revisa las plantillas nuevas: suelen aprobarse en minutos u horas.');
console.log('Se pueden ver en Meta: WhatsApp → Plantillas de mensajes.');
