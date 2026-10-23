// Huellas HMAC de un consentimiento. Viven aparte del servidor para que el
// verificador use exactamente la misma formula.
import { createHmac } from 'node:crypto';

export const CAMPOS_HASH_CONSENT = [
  'tipo', 'nombre', 'email', 'ip', 'user_agent', 'origen', 'pagina',
  'acepta_terminos', 'terminos_version', 'terminos_url', 'terminos_hash',
  'acepta_privacidad', 'privacidad_version', 'privacidad_url', 'privacidad_hash',
  'cookies_necesarias', 'cookies_analiticas', 'cookies_marketing', 'cookies_version',
  'accion', 'canal', 'motivo', 'idempotency_key', 'hash_version',
];

// Campos que siguen siendo verificables después de anonimizar: no incluyen
// nombre, email, IP ni navegador. Prueban qué texto y qué cookies se aceptaron.
export const CAMPOS_HASH_LEGAL = [
  'tipo', 'acepta_terminos', 'terminos_version', 'terminos_url', 'terminos_hash',
  'acepta_privacidad', 'privacidad_version', 'privacidad_url', 'privacidad_hash',
  'cookies_necesarias', 'cookies_analiticas', 'cookies_marketing', 'cookies_version',
  'accion', 'canal', 'hash_version',
];

function firmar(fila, campos, secreto) {
  if (!secreto) throw new Error('Falta el secreto para firmar el consentimiento');
  const base = {};
  for (const campo of campos) base[campo] = fila?.[campo] ?? null;
  return createHmac('sha256', secreto)
    .update(JSON.stringify(base, Object.keys(base).sort()), 'utf8')
    .digest('hex');
}

export function hashConsentimiento(fila, secreto) {
  return firmar(fila, CAMPOS_HASH_CONSENT, secreto);
}

export function hashLegalConsentimiento(fila, secreto) {
  return firmar(fila, CAMPOS_HASH_LEGAL, secreto);
}
