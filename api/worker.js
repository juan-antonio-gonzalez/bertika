// Bertika - worker de la outbox de WhatsApp.
//
// Se ejecuta como proceso separado de la API para poder escalar varias
// instancias HTTP sin que cada una procese la misma cola. La API debe correr
// con OUTBOX_WORKER=0; este proceso es el único que llama procesarPendientes.
import { iniciarOutbox, detenerOutbox } from './outbox.js';
import { closePool } from './db.js';

const intervalo = Number(process.env.OUTBOX_INTERVALO_MS) || 30000;
iniciarOutbox({ intervaloMs: intervalo });
console.log(`[worker] outbox iniciada (cada ${intervalo} ms)`);

// Mantener vivo el proceso aunque el timer de la outbox sea unref.
const latido = setInterval(() => {}, 60 * 1000);

let cerrando = false;
async function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  console.log(`[worker] ${senal}: cerrando...`);
  detenerOutbox();
  clearInterval(latido);
  try { await closePool(); } catch (e) { console.error('[worker] pool:', e.message); }
  process.exit(0);
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
process.on('uncaughtException', (e) => { console.error('[worker] uncaught:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('[worker] unhandled:', e); process.exit(1); });
