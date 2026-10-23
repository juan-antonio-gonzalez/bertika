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
| `GET` | `/public/ordenes?q=...` | Busca por **código de seguimiento de 16 dígitos** (se le quitan los guiones). Devuelve `[{ bateria_serie, estado, fecha_ingreso }]` o `[]`. No acepta id interno ni número de serie: sin esto se podía listar todo el taller sin sesión. |
| `GET` | `/public/ordenes/:codigo` | Seguimiento público (el que ve el cliente, **también si hay sesión abierta**): `id`, `codigo` formateado, `bateria_serie`, `estado`, `falla`, `fecha_ingreso`, `hora_entrega`, `bateria`, `cliente` y `eventos` **sin el autor** de cada uno. Con menos de 16 dígitos responde 403. |
| `GET` | `/public/cotizacion/:orden_id` | Cotización pública (exige el token firmado `?t=`): datos, `codigo` de seguimiento, `cotizacion`, `estado_cotizacion`, `bateria`, `cliente`. |
| `POST` | `/ordenes/:id/cotizacion/aprobar` | Aprueba la cotización (solo si `estado === 'quoted'`). |
| `POST` | `/ordenes/:id/cotizacion/rechazar` | Rechaza la cotización → la orden se **cancela**. |
| `POST` | `/public/contacto` | Envía la consulta por correo a `ventas@bertika.com`. Si viene `serie`, además crea cliente (si no existe por email) + orden en `received`. Body: `{ nombre, email, mensaje, empresa?, telefono?, asunto?, serie?, cotizacion_codigo? }`. |
| `GET` | `/public/dolar` | Cotización del dólar oficial para el cotizador de visitas (proxy con caché de 10 min y respaldo entre proveedores). |
| `GET` | `/public/cotizador` | Configuración vigente del cotizador (`config` normalizada + `actualizado` + `actualizadoPor`). La edita el admin. |
| `POST` | `/public/cotizacion-visita` | Guarda la estimación del cotizador de visitas y devuelve su código (`CV-000123`). |
| `GET` | `/public/cotizacion-visita/:codigo` | Detalle de una estimación por código (sin datos personales). |
| `PUT` | `/cotizador` | **Admin.** Reemplaza la configuración del cotizador. Body: `{ config }`. Se valida con `normalizarConfig()` (franjas que avancen, precios ≥ 0, IVA 0-100%, al menos un tipo) y queda en el historial. |
| `GET` | `/cotizador/historial` | **Admin.** Últimas 50 ediciones de la configuración (fecha y usuario). |

### `POST /public/cotizacion-visita`

Body: `{ km, renglones: [{ tipoId, cantidad }], extrasSel: [{ id, cantidad }], urgencia, turno, nombre?, empresa?,
email?, telefono?, fecha_preferida? }`.

Devuelve `{ ok, codigo, total, moneda, ars, dolar, avisos, resumen }`. El servidor **recalcula** el total con el mismo
módulo que usa la web (`src/data/cotizadorVisita.js`) y con **la configuración vigente de la base** (`cotizador_config`),
guarda la estimación con la cotización del dólar del momento y rechaza distancias mayores a la cobertura configurada
(`fueraDeCobertura: true`).

Modelo de precio (todo editable desde el panel del Hub → pestaña **Cotizador**):

- **Franjas de traslado**: cada franja tiene una `base` que cubre hasta `cubreKm` km y, desde ahí, `kmAdicional` por km extra.
- **Viáticos**: desde `viaticos.desdeKm` se suma `porDia` por día de viaje (1 día y uno más cada `diaCadaKm` km, con tope `maxDias`).
- **Revisión** por tipo de batería, **descuentos** por volumen, **extras** (con `porEquipo`), **recargos** de urgencia/turno, **IVA** y **vigencia**.

### `GET /public/dolar`

`{ disponible, casa, compra, venta, fuente, actualizado, consultado, cacheado?, vencido? }`. Con `?forzar=1` refresca
la caché. Si ningún proveedor responde y hay un valor previo, lo devuelve marcado `vencido: true`.

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
Solo se admite en órdenes en `received` o `diagnosing`: si la orden ya avanzó responde `400` (reenviar el diagnóstico no debe retroceder el estado).

### `POST /ordenes/:id/cotizacion` — para ajustar/regenerar
Body: `{ monto, servicios: [{nombre, monto}], insumos: [{nombre, cantidad, precio}] }` → estado `quoted`, `estado_cotizacion: 'pending'`.

### `POST /ordenes/:id/insumos`
Body: `{ insumo_id, cantidad }`. Valida stock, descuenta, agrega a `insumos_utilizados`. → `{ ok, critico }` (`critico` = nuevo stock < 3). Registra movimiento de inventario.

### `DELETE /ordenes/:id/insumos/:indice`
Devuelve al stock un insumo cargado por error, lo quita de la orden y deja evento `insumo_revertido` + movimiento de inventario. Requiere acceso de escritura a la orden.

### `GET /ordenes/:id/cotizaciones`
Auditoría: todas las versiones guardadas de la cotización (`fecha`, `monto`, `detalle`, `usuario`), más recientes primero.

### `POST /ordenes/:id/prueba-final` — requiere estado `testing`
Body: `{ capacidad, resultado: 'passed'|'failed', obs? }`.
`passed` → `ready`; `failed` → vuelve a `in_repair` (regla de negocio).
La `capacidad` (Ah) es obligatoria y numérica: no se puede aprobar por debajo del `MIN_CAPACIDAD_PCT` (80%) de la capacidad nominal de la batería.

### `POST /ordenes/:id/entregar` — admin, requiere `ready`
Body: `{ monto_cobrado?, garantia_meses?, garantia_ciclos?, medio_pago? }`. Registra cobro y medio de pago, garantía (vence en `vence`), batería → `en_garantia`, estado → `delivered`.

### `POST /ordenes/:id/baja` — admin
Body: `{ motivo? }`. Orden → `cancelled`, batería → `dada_de_baja`, inserta fila en `bajas`.

### `POST /ordenes/:id/transition`
Body: `{ target, detalle? }`. Transición genérica validada por `canTransition()` (`src/data/reglas.js`, reexportada por `api/reglas.js`):
`received→diagnosing`, `received→cancelled`, `diagnosing→quoted|cancelled`, `quoted→approved|cancelled`, `approved→in_repair|cancelled`, `in_repair→testing|cancelled`, `testing→ready|in_repair`, `ready→delivered`.

### `POST /ordenes/:id/compartir`
Staff con acceso a la orden. Devuelve `{ cotizacion, tracker }`: el enlace público del tracker y el de la cotización con la firma HMAC (`?t=`). Es lo que usa el botón **Compartir** de la plataforma (admin y técnico).

## Insumos (admin para escritura)

| Método | Ruta | Body / notas |
| --- | --- | --- |
| `POST` | `/insumos` | `{ nombre, categoria?, stock?, precio?, stock_minimo? }` → `201 { id }` (movimiento de alta) |
| `PATCH` | `/insumos/:id` | `{ nombre?, categoria?, precio?, stock_minimo? }` — edita los datos del insumo. El stock **no** se toca acá (se mueve con `/stock` y `/ajuste`, que dejan el movimiento auditado) |
| `PATCH` | `/insumos/:id/stock` | `{ cantidad, motivo? }` (suma al stock) → `{ ok, stock }` (movimiento de ingreso) |
| `POST` | `/insumos/:id/ajuste` | `{ stock_contado, motivo }` — recuento físico: fija el stock real y audita la diferencia (motivo obligatorio) |
| `GET` | `/insumos/:id/movimientos` | Admin/técnico: `{ insumo, movimientos[] }` con tipo, cantidad, stock resultante, motivo, orden y autor |

`stock_minimo` es el umbral de "stock crítico" de cada insumo (por defecto 3). El panel lo marca en rojo
cuando el stock baja de ese número.

## Auditoría de eventos

Cada evento de una orden (`ordenes.eventos`) incluye `{ id, tipo, detalle, fecha, usuario }`, donde `usuario` es
`{ id, email, rol, ref }` (`ref` = `tecnico_id` o `cliente_id` vinculado) o `null` si lo generó el sistema o el
formulario web. La plataforma lo muestra en la pestaña **Eventos** de cada orden y es la base del documento
imprimible de trazabilidad.

## Clientes

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/clientes` | Admin/técnico: clientes **sin** los dados de baja |
| `GET` | `/clientes?papelera=1` | Admin: solo los dados de baja (papelera) |
| `POST` | `/clientes` | `{ nombre, email, empresa?, telefono?, tipo?, contacto?, notas? }` → `201 { id }`. `409` si el email ya existe (o está en la papelera) |
| `POST` | `/clientes/find-or-create` | `{ nombre?, email, empresa?, telefono? }` → `{ id }` (reusa por email; `409` si el email está en la papelera) |
| `PATCH` | `/clientes/:id` | Admin: `{ nombre?, contacto?, empresa?, telefono?, email?, tipo?, notas? }` → cliente actualizado. `409` si el email lo usa otro; `400` si está dado de baja |
| `DELETE` | `/clientes/:id` | Admin: **baja lógica** (guarda `deleted_at` y `deleted_by`). `400` si tiene órdenes en curso |
| `POST` | `/clientes/:id/restaurar` | Admin: recupera un cliente de la papelera. `409` si otro cliente activo ya tiene ese email |

`tipo` acepta `particular` (por defecto) o `flotilla_corporativa` (cualquier otra cosa cae en `particular`).
Los clientes dados de baja no aparecen en `GET /estado`.

## Técnicos (admin para escritura)

> **Regla del taller:** no se asignan clientes a los técnicos. Cualquier técnico puede
> leer y escribir cualquier orden (`puedeLeerOrden` / `puedeEscribirOrden` devuelven true
> para el rol `tecnico`); `tecnico_id` es informativo. Entregar, cancelar y dar de baja
> siguen siendo solo de admin.

| Método | Ruta | Body |
| --- | --- | --- |
| `GET` | `/tecnicos` | Por defecto solo los activos; `?todos=1` (admin) incluye los inactivos |
| `POST` | `/tecnicos` | `{ nombre, especialidad, certificaciones? }` → `201 { id }` |
| `PATCH` | `/tecnicos/:id` | `{ nombre?, especialidad?, certificaciones?, activo? }` → técnico actualizado. `400` si se quiere desactivar a alguien con órdenes en curso |

## Notificaciones

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/notificaciones/leidas` | Marca todas como leídas |
| `DELETE` | `/notificaciones/:id` | Borra **una** notificación (respeta el alcance por rol) |
| `DELETE` | `/notificaciones` | Elimina todas las del alcance del usuario |

## Usuarios (admin)
| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/usuarios` | Lista (sin password_hash) |
| `POST` | `/usuarios` | `{ email, password, rol, tecnico_id?, cliente_id? }` (`rol` ∈ admin/tecnico/cliente) → `201 { id }` |
| `PATCH` | `/usuarios/:id` | Campos opcionales: `email, password, rol, tecnico_id, cliente_id, activo` |
| `DELETE` | `/usuarios/:id` | **Baja lógica**: pone `activo = false` (conserva la ficha y el historial) y el token de ese usuario deja de servir al instante. Se reactiva con `PATCH { activo: true }` |

## Bajas / reciclaje (admin)

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/bajas/:id/reciclar` | Marca `reciclada: true` y `fecha_reciclaje` |

## Respaldos (admin)

El respaldo **no** es programado desde el panel: el administrador lo dispara con el botón
**Sistema → Respaldos → «Respaldar ahora»**. Requieren el permiso `respaldos` (por plantilla
solo lo tiene el admin) y ejecutan `bertika-backup.sh --en-servidor --json` en el VPS, con
argumentos fijos.

| Método | Ruta | Efecto |
| --- | --- | --- |
| `GET` | `/respaldos` | `{ archivos[{nombre,tipo,bytes,fecha}], carpeta, retencionDias, corriendo, ultimo, base }` |
| `POST` | `/respaldos` | Corre el respaldo **ahora** y devuelve `{ ok, archivo, bytes, fotos, cuando, archivos, base }`. `409` si ya hay uno en curso; `500 { error }` con el motivo si el dump falla la validación |
| `GET` | `/respaldos/:archivo` | Baja el `.sql.gz` (o el `.tar.gz` de fotos) como adjunto. El nombre se valida contra `^(bertika\|uploads)_[A-Za-z0-9_-]+\.(sql\.gz\|tar\.gz)$`: no se puede pedir otra ruta |

Sin el script instalado en el VPS (`/usr/local/bin/bertika-backup.sh`), `POST` responde `500`
y el panel muestra el comando para instalarlo (`bash scripts/backup-db.sh --instalar`).

## Reset demo (admin)

### `POST /reset`
Limpia todas las tablas de demo y re-siembra desde `src/data/seed.js` (corre `node api/seed.js` como proceso hijo). → `{ ok: true }`. Cuidado: **destruye los datos actuales**; en producción solo debe usarse en entornos de demostración.

## WhatsApp (canal oficial de Meta)

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/whatsapp/estado` | Admin. Si el canal está configurado, qué falta y las estadísticas (recibidos, enviados, con error, conversaciones, sin leer) + la URL del webhook. Nunca devuelve el token. |
| `GET` | `/whatsapp/conversaciones` | Admin/técnico. Bandeja: conversaciones con último mensaje, no leídos y el cliente vinculado. |
| `GET` | `/whatsapp/conversaciones/:id` | Admin/técnico. Hilo completo + ficha del cliente + sus últimas 5 órdenes. Marca la conversación como leída. |
| `POST` | `/whatsapp/conversaciones/:id/responder` | Admin/técnico. Body `{ texto }`. Mensaje libre (vale dentro de las 24 h desde el último mensaje del cliente). |
| `POST` | `/whatsapp/enviar` | Admin/técnico. Body `{ telefono, texto }`. Envía a un número suelto (pruebas del canal). |
| `PATCH` | `/whatsapp/conversaciones/:id` | Admin/técnico. `{ asignado_a?, etiquetas?, etapa?, monto_estimado? }` (CRM de la conversación). |
| `POST` | `/whatsapp/conversaciones/:id/notas` | Admin/técnico. Body `{ texto }`. Nota interna (no se le envía al cliente). |
| `DELETE` | `/whatsapp/conversaciones/:id/notas/:notaId` | Admin/técnico. Borra una nota: **solo el autor o un admin**. |
| `GET` | `/whatsapp/webhook` | Público. Verificación del webhook de Meta (`hub.verify_token` → `hub.challenge`). |
| `POST` | `/whatsapp/webhook` | Público. Avisos de Meta: mensajes entrantes y estados de entrega. Valida la firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET` antes de procesar. |
| `GET/POST/PATCH/DELETE` | `/whatsapp/etiquetas` | Admin (lectura admin/técnico). Catálogo de etiquetas con color; el `DELETE` es baja lógica (`activo=false`). |
| `GET/POST/PATCH/DELETE` | `/whatsapp/respuestas` | Admin. Respuestas rápidas con atajo y variables `{{nombre}}`, `{{telefono}}`, `{{serie}}`, `{{link}}`. |
| `GET` | `/whatsapp/buscar?q=` | Admin/técnico. Busca dentro del texto de los mensajes (escapando `%` y `_`) y devuelve fragmento, fecha y conversación. |
| `GET` | `/whatsapp/export?desde=&hasta=&conversacion=` | Admin. CSV (con BOM) de las conversaciones; deja registro de quién exportó en el log. |
| `GET` | `/whatsapp/metricas` | Admin. Embudo: conversión por etapa, tasa de cierre, tiempo medio y motivos de pérdida. |
| `GET/POST/PATCH/DELETE` | `/whatsapp/tareas` | Admin/técnico. Tareas con vencimiento y responsable. |
| `GET` | `/permisos/catalogo` | Admin. Filas agrupadas, columnas y plantillas para la matriz de permisos. |

Configuración: `WHATSAPP_APP_ID`, `WHATSAPP_BUSINESS_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WABA_ID`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` y (opcional) `WHATSAPP_API_VERSION`. Se cargan con
`bash scripts/whatsapp-env.sh` (los valores no pasan por el chat ni por el repositorio); ese script llama al final a
`bash scripts/whatsapp-activar.sh`, que por API suscribe la app al WABA (`POST /{waba-id}/subscribed_apps`), registra el
webhook (`POST /{app-id}/subscriptions`) y verifica la puerta de entrada. Un solo comando hace todo el trámite de Meta.
Guía del trámite: `docs/WHATSAPP_META.md`; textos de plantillas: `docs/WHATSAPP_PLANTILLAS.md`.

Sin claves cargadas el canal queda apagado y el resto de la API funciona igual.

## Fotos de diagnóstico (multer)

### `POST /diagnostico/:orden_id/fotos`
Requiere token. Multipart `fotos` (hasta 6 archivos, imágenes jpg/png/webp/gif, máx. 8 MB c/u). Guarda en `UPLOAD_DIR`, actualiza `diagnostico.fotos` y devuelve `{ fotos: [urls] }`. Las fotos se sirven en `GET /uploads/<archivo>` vía nginx.