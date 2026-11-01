import express from 'express';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Rutas del botón manual de respaldos. Se ejecutan en el servidor donde vive
// la base; el nombre de archivo se valida con un patrón fijo.
export function crearRespaldosRouter({ authRequired, permisoRequerido }) {
  const router = express.Router();
  const RESPALDO_DIR = process.env.BACKUP_DIR || '/var/backups/bertika';
  const RESPALDO_SCRIPT = process.env.BACKUP_SCRIPT || '/usr/local/bin/bertika-backup.sh';
  const RESPALDO_RETENCION = Number(process.env.BACKUP_RETENCION_DIAS || 14);
  const RESPALDO_ARCHIVO_RE = /^(bertika|uploads)_[A-Za-z0-9_-]+\.(sql\.gz|tar\.gz)$/;
  let respaldoEnCurso = false;
  let ultimoRespaldo = null;
// El respaldo corre EN EL SERVIDOR donde vive la base: no hay tarea programada
// del lado de la Mac, el administrador lo dispara desde el panel cuando quiere.
// El endpoint ejecuta el script de respaldo con argumentos FIJOS (nunca texto
// del pedido), asi que el boton no puede convertirse en ejecucion arbitraria.
// Cuantos dias se conservan (el script usa 14; es solo para mostrarlo en el panel).
// El nombre del archivo se valida contra este patron: no hay forma de pedir
// otra ruta del servidor.

// El script devuelve el motivo como JSON en stderr: se muestra el texto y no
// el JSON crudo (el panel lo enseña tal cual).
function mensajeDeError(stderr, err) {
  const texto = String(stderr || '');
  const linea = texto.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).pop();
  try {
    const d = JSON.parse(linea || '');
    if (d?.error) return d.error;
  } catch { /* stderr no era JSON */ }
  return texto.trim() || err.message;
}

function listarRespaldos() {
  let nombres = [];
  try {
    nombres = readdirSync(RESPALDO_DIR);
  } catch {
    return [];
  }
  const archivos = [];
  for (const nombre of nombres) {
    if (!RESPALDO_ARCHIVO_RE.test(nombre)) continue;
    try {
      const st = statSync(path.join(RESPALDO_DIR, nombre));
      archivos.push({
        nombre,
        tipo: nombre.startsWith('uploads_') ? 'fotos' : 'base',
        bytes: st.size,
        fecha: st.mtime.toISOString(),
      });
    } catch { /* archivo que se borro mientras listabamos */ }
  }
  return archivos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

router.get('/respaldos', authRequired, permisoRequerido('respaldos'), async (req, res) => {
  const archivos = listarRespaldos();
  return res.json({
    archivos,
    carpeta: RESPALDO_DIR,
    retencionDias: RESPALDO_RETENCION,
    corriendo: respaldoEnCurso,
    ultimo: ultimoRespaldo,
    base: archivos.find((a) => a.tipo === 'base') || null,
  });
});

router.post('/respaldos', authRequired, permisoRequerido('respaldos'), async (req, res) => {
  if (respaldoEnCurso) return res.status(409).json({ error: 'Ya hay un respaldo en curso. Esperá a que termine.' });
  respaldoEnCurso = true;
  try {
    const { execFile } = await import('node:child_process');
    const salida = await new Promise((resolve, reject) => {
      execFile(
        RESPALDO_SCRIPT,
        ['--en-servidor', '--json'],
        { timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => (err ? reject(new Error(mensajeDeError(stderr, err))) : resolve(String(stdout)))
      );
    });
    // El script imprime UNA linea JSON; si algo mas ensució la salida, se busca
    // la ultima linea que sea JSON valido.
    const linea = salida.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).pop();
    let datos;
    try { datos = JSON.parse(linea || ''); } catch { datos = null; }
    if (!datos?.ok || !datos.archivo) {
      throw new Error(datos?.error || 'El respaldo no devolvió un resultado válido');
    }
    const archivos = listarRespaldos();
    ultimoRespaldo = { ok: true, cuando: new Date().toISOString(), archivo: datos.archivo, bytes: datos.bytes, fotos: datos.fotos || null };
    return res.json({ ok: true, ...ultimoRespaldo, archivos, base: archivos.find((a) => a.tipo === 'base') || null });
  } catch (e) {
    ultimoRespaldo = { ok: false, cuando: new Date().toISOString(), error: e.message };
    console.error('[respaldos] fallo el respaldo:', e.message);
    return res.status(500).json({ error: 'No se pudo respaldar: ' + e.message });
  } finally {
    respaldoEnCurso = false;
  }
});

// Bajada del respaldo por el navegador (el .sql.gz que baja el boton).
router.get('/respaldos/:archivo', authRequired, permisoRequerido('respaldos'), async (req, res) => {
  const { archivo } = req.params;
  if (!RESPALDO_ARCHIVO_RE.test(archivo)) return res.status(400).json({ error: 'Nombre de respaldo inválido' });
  const ruta = path.join(RESPALDO_DIR, archivo);
  let info;
  try {
    info = statSync(ruta);
  } catch {
    return res.status(404).json({ error: 'Ese respaldo ya no está en el servidor' });
  }
  if (!info.isFile()) return res.status(404).json({ error: 'Ese respaldo ya no está en el servidor' });
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Length', String(info.size));
  res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
  const stream = createReadStream(ruta);
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'No se pudo leer el respaldo' }); else res.destroy(); });
  stream.pipe(res);
});

  return router;
}
