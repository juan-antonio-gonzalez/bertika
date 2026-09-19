# Bertika · Referencia de la API

Base URL en producción: `https://bertika.com/api` (en dev local: `http://localhost:5173/api`, que proxya a `http://localhost:3001`).

Formato: JSON. Autenticación con `Authorization: Bearer <token>` (obtenido en `POST /auth/login`). Los errores responden `{ "error": "mensaje" }` con su código HTTP.

## Autenticación

### `POST /auth/login`
Body: `{ "email", "password" }` → `200 { token, user }`, donde `user = { id, email, rol, tecnico_id, cliente_id }`.

### `GET /auth/me`
Requiere token. Devuelve el usuario actual (`{ id, email, rol, tecnico_id, cliente_id }`).

### `POST /auth/password`
Requiere token (cualquier rol). Body: `{ password_actual, password }`. Cambia la contraseña de la **propia** cuenta; exige la contraseña actual y valida que la nueva tenga entre 8 y 72 caracteres. `PATCH /usuarios/:id` sigue siendo exclusivo de admin.

## Estado global (sincronización del store)

### `GET /estado`
Requiere token. Devuelve `{ tecnicos[], clientes[], baterias[], insumos[], ordenes[], bajas[], notificaciones[], seq{} }`. Es la fuente que el frontend usa para hidratar el store tras cada acción.

## Endpoints públicos (sin token)

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/public/stats` | `{ clientes, baterias, activas, entregadas }` para la landing. |
| `GET` | `/public/ordenes?q=...` | Búsqueda por id de orden, número de serie o código de seguimiento (ILIKE, top 10). |
| `GET` | `/public/ordenes/:id` | Seguimiento público: orden + `bateria` + `cliente` + `eventos`. |
| `GET` | `/public/cotizacion/:orden_id` | Cotización pública: datos, `cotizacion`, `estado_cotizacion`, `bateria`, `cliente`. |
| `POST` | `/ordenes/:id/cotizacion/aprobar` | Aprueba la cotización (solo si `estado === 'quoted'`). |
| `POST` | `/ordenes/:id/cotizacion/rechazar` | Rechaza la cotización → la orden se **cancela**. |
| `POST` | `/public/contacto` | Envía la consulta por correo a `ventas@bertika.com`. Si viene `serie`, además crea cliente (si no existe por email) + orden en `received`. Body: `{ nombre, email, mensaje, empresa?, telefono?, asunto?, serie? }`. |

## Órdenes (requieren token)

### `POST /ordenes`
Body: `{ serie, tipo?, voltaje?, capacidad?, aplicacion?, marca?, modelo?, equipo?, cliente_id, falla, tecnico_id? }`.
Crea la batería si la serie no existe. → `201 { id }`.

### `GET /ordenes/:id`
Devuelve la orden completa.

### `GET /clientes`, `GET /tecnicos`, `GET /bajas`
Listados completos (requieren token; `/bajas` incluye reciclables).

### `PATCH /ordenes/:id/tecnico` — admin
Body: `{ tecnico_id }`. Asigna técnico y registra evento.

### `POST /ordenes/:id/diagnostico`
Body: `{ voltaje, resistencia, pruebaCarga, notas?, servicioTipo?, fotos?: string[] }` (`fotos` = base64, máx. ~2 MB total).
Guarda el diagnóstico, avanza a `diagnosing` y genera cotización (estado `quoted`).

### `POST /ordenes/:id/cotizacion` — para ajustar/regenerar
Body: `{ monto, servicios: [{nombre, monto}], insumos: [{nombre, cantidad, precio}] }` → estado `quoted`, `estado_cotizacion: 'pending'`.

### `POST /ordenes/:id/insumos`
Body: `{ insumo_id, cantidad }`. Valida stock, descuenta, agrega a `insumos_utilizados`. → `{ ok, critico }` (`critico` = nuevo stock < 3).

### `POST /ordenes/:id/prueba-final` — requiere estado `testing`
Body: `{ capacidad, resultado: 'passed'|'failed', obs? }`.
`passed` → `ready`; `failed` → vuelve a `in_repair` (regla de negocio).

### `POST /ordenes/:id/entregar` — admin, requiere `ready`
Body: `{ monto_cobrado?, garantia_meses?, garantia_ciclos? }`. Registra cobro, garantía (vence en `vence`), batería → `en_garantia`, estado → `delivered`.

### `POST /ordenes/:id/baja` — admin
Body: `{ motivo? }`. Orden → `cancelled`, batería → `dada_de_baja`, inserta fila en `bajas`.

### `POST /ordenes/:id/transition`
Body: `{ target, detalle? }`. Transición genérica validada por `canTransition()` en `api/reglas.js`:
`received→diagnosing`, `received→cancelled`, `diagnosing→quoted|cancelled`, `quoted→approved|cancelled`, `approved→in_repair|cancelled`, `in_repair→testing|cancelled`, `testing→ready|in_repair`, `ready→delivered`.

## Insumos (admin para escritura)

| Método | Ruta | Body / notas |
| --- | --- | --- |
| `POST` | `/insumos` | `{ nombre, categoria?, stock?, precio? }` → `201 { id }` |
| `PATCH` | `/insumos/:id/stock` | `{ cantidad }` (suma al stock) → `{ ok, stock }` |

## Clientes

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/clientes` | `{ nombre, email, empresa?, telefono? }` → `201 { id }` |
| `POST` | `/clientes/find-or-create` | `{ nombre?, email, empresa?, telefono? }` → `{ id }` (reusa por email) |

## Técnicos (admin para escritura)

| Método | Ruta | Body |
| --- | --- | --- |
| `POST` | `/tecnicos` | `{ nombre, especialidad, certificaciones? }` → `201 { id }` |

## Notificaciones

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/notificaciones/leidas` | Marca todas como leídas |
| `DELETE` | `/notificaciones` | Elimina todas |

## Usuarios (admin)

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/usuarios` | Lista (sin password_hash) |
| `POST` | `/usuarios` | `{ email, password, rol, tecnico_id?, cliente_id? }` (`rol` ∈ admin/tecnico/cliente) → `201 { id }` |
| `PATCH` | `/usuarios/:id` | Campos opcionales: `email, password, rol, tecnico_id, cliente_id, activo` |
| `DELETE` | `/usuarios/:id` | Borra el usuario |

## Bajas / reciclaje (admin)

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/bajas/:id/reciclar` | Marca `reciclada: true` y `fecha_reciclaje` |

## Reset demo (admin)

### `POST /reset`
Limpia todas las tablas de demo y re-siembra desde `src/data/seed.js` (corre `node api/seed.js` como proceso hijo). → `{ ok: true }`. Cuidado: **destruye los datos actuales**; en producción solo debe usarse en entornos de demostración.

## Fotos de diagnóstico (multer)

### `POST /diagnostico/:orden_id/fotos`
Requiere token. Multipart `fotos` (hasta 6 archivos, imágenes jpg/png/webp/gif, máx. 8 MB c/u). Guarda en `UPLOAD_DIR`, actualiza `diagnostico.fotos` y devuelve `{ fotos: [urls] }`. Las fotos se sirven en `GET /uploads/<archivo>` vía nginx.