// Middleware multipart compatible con el subconjunto de Multer que usa Bertika
// (`single` y `array`). Usa busboy para no depender de una versión de Multer
// sin fix de seguridad. Mantiene `req.file`/`req.files` y los límites.
import Busboy from 'busboy';

function crearError(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

function parsear(req, opciones) {
  const { campo, maxArchivos, fileFilter, limits } = opciones;
  if (!/^multipart\/form-data/i.test(req.headers['content-type'] || '')) {
    throw crearError('Se esperaba un formulario multipart/form-data.');
  }
  const bb = Busboy({ headers: req.headers, limits: { files: maxArchivos, fileSize: limits.fileSize } });
  const archivos = [];
  let error = null;

  bb.on('file', (nombre, stream, info) => {
    if (error) { stream.resume(); return; }
    if (nombre !== campo) { error = crearError(`Campo de archivo inesperado: ${nombre}`); stream.resume(); return; }
    if (archivos.length >= maxArchivos) { error = crearError('Se subieron demasiados archivos.'); stream.resume(); return; }

    const archivo = {
      fieldname: nombre,
      originalname: info.filename || 'archivo',
      mimetype: info.mimeType || 'application/octet-stream',
      size: 0,
      buffer: null,
    };
    let permitido = true;
    try {
      fileFilter?.(req, archivo, (err, ok) => {
        if (err) { error = err; permitido = false; }
        else if (!ok) { error = crearError('Tipo de archivo no permitido.'); permitido = false; }
      });
    } catch (e) { error = e; permitido = false; }
    if (!permitido) { stream.resume(); return; }

    const partes = [];
    stream.on('limit', () => { error = crearError('El archivo supera el tamaño máximo.'); });
    stream.on('data', (parte) => { archivo.size += parte.length; if (!error) partes.push(parte); });
    stream.on('end', () => {
      if (!error) { archivo.buffer = Buffer.concat(partes); archivos.push(archivo); }
    });
  });
  bb.on('error', (e) => { error = error || crearError(e.message || 'Error leyendo el archivo.'); });
  bb.on('close', () => {
    if (error) return opciones.next(error);
    if (maxArchivos === 1) req.file = archivos[0] || null;
    req.files = archivos;
    return opciones.next();
  });
  req.pipe(bb);
}

function middleware(opciones) {
  return (req, _res, next) => {
    try { parsear(req, { ...opciones, next }); } catch (e) { next(e); }
  };
}

export function memoryUpload({ limits = {}, fileFilter } = {}) {
  const maxBytes = limits.fileSize || 8 * 1024 * 1024;
  return {
    single(campo) {
      return middleware({ campo, maxArchivos: 1, limits: { fileSize: maxBytes }, fileFilter });
    },
    array(campo, maxArchivos = 1) {
      return middleware({ campo, maxArchivos, limits: { fileSize: maxBytes }, fileFilter });
    },
  };
}
