// Cliente HTTP de Bertika.
// En produccion la API se sirve desde el mismo origen via nginx (/api -> 127.0.0.1:3001).
// En desarrollo Vite redirige /api y /uploads hacia el backend local (puerto 3001).

const TOKEN_KEY = 'bertika-token';
export const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    // GET/HEAD no admiten body: si algun caller lo pasa, se ignora.
    const opciones = { method, headers };
    if (method !== 'GET' && method !== 'HEAD' && payload !== undefined) opciones.body = payload;
    res = await fetch(BASE_URL + path, opciones);
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sin cuerpo JSON */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}