# Auditoría de Bertika — seguridad, CRUD, pérdida de datos y CRM

**Fecha:** 23/09/2026 · **Alcance:** todo el proyecto (`api/`, `src/`, `scripts/`, VPS de producción).
**Método:** lectura completa del código (65 endpoints, 20 tablas) + verificación en vivo contra
producción de los hallazgos graves (solo lecturas). Nada se modificó sin decirlo.

---

## 0. Estado de las correcciones (actualizado 23/09/2026 20:30)

Todo lo de acá abajo **ya está implementado, deployado y verificado en producción**:

| Fase | Qué se hizo | Commit |
|---|---|---|
| Urgente | **Fuga pública de órdenes cerrada** (solo por código de 16 dígitos; sin comodines, sin id crudo, sin datos del personal). Verificado en vivo: `?q=%` → `[]`, detalle por id → 403, seguimiento con el código → OK | `ef734b9` |
| Urgente | **Un técnico ya no puede entregar ni cancelar** (403 con mensaje). Verificado con la cuenta de técnico | `ef734b9` |
| Urgente | **El token muere al desactivar/borrar un usuario** (chequeo de `activo` en cada request). Verificado: token válido de usuario inexistente → 401 | `ef734b9` |
| Urgente | **`seed.js` con doble llave** en producción y **reset con confirmación escrita** (`BORRAR TODO`) | `ef734b9` |
| Urgente | **Respaldo arreglado e instalado**: cron 03:17 con validación del dump, fotos incluidas, retención y prueba de restauración (`scripts/backup-db.sh`), más copia fuera del VPS (`--traer`) | — |
| Integridad | **Guardias de estado** (no se cotiza/carga insumo/saca fotos en órdenes entregadas o canceladas), **baja validada y única**, **stock atómico** (no puede quedar negativo), **avisos y webhooks sin duplicados**, **transacciones** en cotización/stock/mensajes/config, **control optimista** de estado, `connectionTimeoutMillis`, **índices UNIQUE** (email de cliente, `wa_message_id`, bajas) | `de3c817` |
| CRUD | **Clientes, técnicos e insumos editables**; **papelera** de clientes con restaurar; **baja lógica de usuarios** (ya no se borran); notas de WhatsApp y notificaciones borrables | `b0e018d` |
| CRM | **Campos comerciales del cliente** (dirección, localidad, CUIT, condición de pago, canal de origen, vendedor); **vincular/crear cliente desde la bandeja**; **motivo de pérdida obligatorio + historial de etapas + métricas del embudo**; **tareas con vencimiento y responsable** | `1498c17` |

**Verificado en producción después del deploy:** servicio activo y sin errores, migraciones aplicadas
(tablas `wa_etapa_historial` y `wa_tareas`, columnas comerciales de `clientes`), endpoints nuevos
respondiendo (métricas, tareas CRUD, papelera, `PATCH` de cliente, motivo obligatorio) y las
validaciones de seguridad rechazando lo que tienen que rechazar.

**Lo que sigue pendiente** (todo de menor urgencia, §6 y §7): etiquetas administrables, respuestas
rápidas, búsqueda dentro de los mensajes, adjuntos/fotos en el chat, consentimiento y baja de
WhatsApp (opt-out), exportación de conversaciones, papelera para el resto de las tablas, auditoría
genérica de cambios, copia de respaldo a otro proveedor y el ensayo de restauración mensual.

## 1. Resumen ejecutivo

| # | Problema | Severidad | Estado |
|---|---|---|---|
| 1 | **Los respaldos estaban rotos desde el 16/09** (archivos de 0 bytes) | 🔴 Crítico | **Arreglado y probado** (falta instalar el cron) |
| 2 | **Fuga pública de datos**: cualquiera lista las órdenes y saca el código de seguimiento | 🔴 Alto | **Verificado en vivo**, sin arreglar |
| 3 | Un **técnico puede entregar y cancelar** órdenes sin registrar cobro ni garantía | 🔴 Alto | Sin arreglar |
| 4 | Desactivar o borrar un usuario **no le quita el acceso** (sigue 12 h) | 🔴 Alto | Sin arreglar |
| 5 | **No se puede editar un cliente, un técnico, una batería ni un insumo** | 🟠 Medio | Sin arreglar |
| 6 | Borrados **físicos y sin papelera**: usuario y notificaciones, sin vuelta atrás | 🟠 Medio | Sin arreglar |
| 7 | Carreras de stock y avisos: **stock negativo** y **aviso duplicado** posibles | 🟠 Medio | Sin arreglar |
| 8 | El CRM no **ata la oportunidad con la orden** ni mide conversión | 🟠 Medio | Propuesta en §6 |

**Lo que está bien hecho** (verificado): permisos por rol en el 90 % de los endpoints, control de
pertenencia en todas las escrituras de órdenes, cotización pública firmada con HMAC, webhook de
WhatsApp con firma y "falla cerrado", SQL siempre parametrizado (sin inyección), historial
append-only de cotizaciones y movimientos de stock, fotos validadas por *magic bytes*, y límites
de intentos en login/contacto/cotizador.

---

## 2. Pérdida de información, borrado por error y recuperación

### 2.1 Lo que encontré (y ya arreglé)

**El respaldo diario nunca funcionó.** El cron corría todas las noches a las 03:17, pero
`pg_dump` no tenía contraseña en ese contexto y **fallaba en silencio**, dejando un archivo de
**0 bytes** que *parecía* un respaldo:

```
bertika_2026-09-16_0317.sql   0 bytes
bertika_2026-09-17_0317.sql   0 bytes
...                           0 bytes   (8 días seguidos)
```

Nadie lo notó porque el cron no avisa, no había log y no había verificación. El único respaldo
bueno era del 15/09 (hecho a mano durante la puesta en marcha).

**Qué hice:**

1. **Respaldo real ahora mismo** (2 copias: `bertika_manual_…` y `bertika_2026-09-23_2155.sql.gz`,
   ~10 KB comprimido).
2. **Script versionado** `scripts/backup-db.sh` que: usa la cadena de conexión de la app, valida
   que el dump pese más de 2 KB **y** traiga las tablas del taller, borra los respaldos viejos
   (14 días) y los `.sql` vacíos, y deja el resultado en `/var/log/bertika-backup.log`.
3. **Prueba de restauración** (`--verificar`): restaura el último respaldo en una base de prueba
   y cuenta filas. Corrida real: `ordenes=8 clientes=6 usuarios=3` → **el respaldo se recupera
   completo** ✅
4. Documentación corregida (`docs/PRODUCCION.md` §8), que antes describía el respaldo que no andaba.

**Falta (1 comando):** `bash scripts/backup-db.sh --instalar` para reemplazar el cron roto.

### 2.2 Lo que sigue faltando en respaldos

| Problema | Riesgo concreto |
|---|---|
| Los respaldos viven **en el mismo VPS** | Si se pierde el servidor, se pierde la base **y** los respaldos |
| **Las fotos de diagnóstico no se respaldan** (`/var/www/bertika/uploads`, 3 archivos hoy) | Se pierde la evidencia fotográfica de los diagnósticos |
| Solo 14 días de retención | Un error detectado al día 15 ya no se puede recuperar |
| Nunca se probó una restauración **real** sobre la base viva | Ahora hay un procedimiento probado en base de prueba, pero no un ensayo de recuperación total |

### 2.3 Borrado por error

| Operación | Qué pasa | ¿Se puede recuperar? |
|---|---|---|
| `DELETE /api/usuarios/:id` (admin) | Borra la fila **de verdad** (existe `activo` sin usar) y **no registra quién** lo hizo | Solo desde un respaldo |
| `DELETE /api/notificaciones` (cualquiera) | Un admin borra **todas** las notificaciones (incluidas las de WhatsApp entrante), sin confirmación | No |
| `node api/seed.js` en el VPS | **Borra usuarios, clientes, órdenes, baterías, insumos, bajas, notificaciones y contadores** sin ninguna guarda | Solo desde un respaldo |
| `POST /api/reset` (admin, requiere `ALLOW_RESET=1`) | Igual que el anterior, disparado desde el panel, sin confirmación ni respaldo previo | Solo desde un respaldo |
| Revertir un insumo de una orden | Devuelve stock; si dos personas lo hacen a la vez, el stock queda **inflado** (mercadería fantasma) | Se puede corregir con un ajuste de stock |

**No hay papelera, ni `deleted_at`, ni deshacer, en ninguna tabla.** Los únicos borrados lógicos
que existen son `usuarios.activo`, `baterias.estado_vida`, `bajas.reciclada` y
`ordenes.estado='cancelled'`.

### 2.4 Integridad: dónde se pueden "romper" los datos

- **Stock sin bloqueo**: el descuento lee, valida en JavaScript y después actualiza. Dos pedidos
  simultáneos con stock 10 y cantidad 8 pasan los dos → **stock −6**.
- **Avisos duplicados**: se consulta si el aviso ya salió, después se envía y recién al final se
  registra. Si dos procesos coinciden (o si el server se reinicia en el medio), **el cliente
  recibe el mensaje dos veces**.
- **Clientes duplicados**: `clientes.email` no es `UNIQUE` y el "buscar o crear" no es atómico.
- **Escrituras a medias**: la cotización, el stock y los mensajes de WhatsApp se guardan con
  sentencias sueltas (sin transacción): si falla la segunda, queda el cambio sin su historial.
- **Solo hay 2 claves foráneas** en todo el esquema (y sin `ON DELETE`): los borrados dejan datos
  huérfanos silenciosos (conversaciones de WhatsApp apuntando a clientes que ya no existen, etc.).
- **El reset reutiliza IDs**: los contadores vuelven a 100, así que los próximos `cli_101`,
  `ord_101` chocan con IDs viejos que quedaron en las tablas que el reset no limpia → datos
  cruzados entre personas distintas.
- **Pool de conexiones**: máximo 10, sin timeout, y el generador de IDs abre su propia conexión
  dentro de cada transacción → con ~10 operaciones simultáneas el servicio puede **quedarse colgado**.

---

## 3. Permisos: quién puede borrar y editar datos críticos

**Respuesta corta: sí, en lo importante.** Las operaciones críticas están restringidas a admin:

| Operación | Quién puede |
|---|---|
| Crear orden | **admin** |
| Asignar técnico | **admin** |
| Entregar la batería (cobro + garantía) | **admin** |
| Dar de baja / reciclar | **admin** |
| Crear/editar/borrar usuarios | **admin** |
| Crear insumos, cambiar stock y ajustar | **admin** |
| Crear/editar clientes y técnicos | **admin** |
| Configurar el cotizador y los avisos | **admin** |
| Diagnóstico, cotización, insumos, prueba final, fotos | admin **o el técnico asignado** (o cualquiera si la orden está sin asignar y recién recibida) |
| Cliente | **solo lectura** de lo suyo (nunca escribe) |

**Pero hay dos agujeros que rompen esa regla:**

1. **`POST /api/ordenes/:id/transition` no tiene control de rol.** Un técnico asignado puede
   pasar la orden a **entregada** o **cancelada**. Al hacerlo por ahí, **no se registra el monto
   cobrado, ni la garantía, ni el medio de pago**, y la batería no queda "en garantía" (eso solo
   lo hace el endpoint de admin). Es la puerta por la que se pierde plata y trazabilidad.
2. **Desactivar o borrar un usuario no le quita el acceso.** El token dura 12 h y la API nunca
   consulta si el usuario sigue activo: un admin al que le sacaste el acceso sigue entrando
   (y puede borrar) hasta que venza el token.

Otros permisos a revisar:

- `GET /api/estado` le entrega a **cualquier técnico todas las fichas de clientes** (email,
  teléfono, empresa), todas las baterías y todas las notificaciones.
- Un técnico puede mandar WhatsApp a **cualquier número** (`POST /api/whatsapp/enviar`), sin
  límite propio (riesgo de costo/spam con la cuenta de Meta).
- `asignado_a` en el CRM acepta cualquier texto, no solo usuarios reales.

---

## 4. Fuga de datos pública (verificada en vivo)

Esto no es teórico: lo probé contra producción **sin ninguna sesión**:

```
GET /api/public/ordenes?q=%      → devuelve 8 órdenes con su CÓDIGO DE SEGUIMIENTO
GET /api/public/ordenes/<código> → devuelve cliente ("Juan Garcia"), falla reportada y eventos
GET /api/public/ordenes/ord_01   → HTTP 200 (¡acepta el ID crudo, sin firma!)
```

Como los IDs son secuenciales (`ord_100`, `ord_101`, …) y el buscador acepta el comodín `%`,
cualquiera puede listar el taller completo —qué baterías entraron, cuándo y en qué estado— y con
el código de seguimiento ver el nombre del cliente y la falla. **Es información de tus clientes
expuesta a internet.**

**Arreglo (bajo esfuerzo):** escapar `%` y `_` en la búsqueda, no devolver el código salvo
coincidencia exacta, exigir siempre el código de 16 dígitos (o un token firmado como el de las
cotizaciones) en el detalle, y sacar los datos internos de los eventos.

---

## 5. CRUD: qué existe y qué falta (tabla por tabla)

| Tabla | Crear | Leer | Editar | Borrar | Comentario |
|---|---|---|---|---|---|
| **usuarios** | ✅ admin | ✅ admin | ✅ admin | ⚠️ admin, **físico** | Existe `activo` (baja lógica) sin usar |
| **clientes** | ✅ admin | ✅ admin/técnico | ❌ **NO** | ❌ **NO** | Un teléfono o email mal cargado **no se puede corregir** |
| **tecnicos** | ✅ admin | ✅ | ❌ **NO** | ❌ **NO** | No se corrige especialidad ni se desactiva |
| **baterias** | ⚠️ indirecto (al crear orden) | ✅ | ⚠️ solo estado de vida | ❌ **NO** | No se corrige capacidad, marca ni cliente |
| **insumos** | ✅ admin | ✅ | ⚠️ **solo stock** | ❌ **NO** | No se edita nombre, categoría ni precio |
| **ordenes** | ✅ admin | ✅ por rol | ✅ por rol | ❌ (cancelar = estado) | Bien que no se borre |
| **bajas** | ✅ admin | ✅ admin | ⚠️ solo reciclar | ❌ | No se corrige motivo |
| **notificaciones** | automático | ✅ | ✅ marcar leídas | ⚠️ borrado masivo | Sin vuelta atrás |
| **cotizaciones_historial** | automático | ✅ | ❌ | ❌ | Append-only: correcto |
| **insumos_movimientos** | automático | ✅ | ❌ | ❌ | Append-only: correcto |
| **cotizaciones_visita** | ✅ público | ⚠️ **sin lectura admin** | ⚠️ público puede cambiar estado | ❌ | Código enumerable |
| **cotizador_config** | ✅ admin | ✅ público | ✅ admin | ❌ | Un guardado parcial pisa precios con los de fábrica |
| **wa_conversaciones** | automático | ✅ | ✅ (etapa, etiquetas, responsable) | ❌ | Sin historial de cambios |
| **wa_mensajes** | automático | ✅ | ⚠️ solo estado de entrega | ❌ | Correcto para auditar |
| **wa_notas** | ✅ admin/técnico | ✅ | ❌ **NO** | ❌ **NO** | Una nota mal tipeada queda para siempre |
| **wa_avisos_config / log** | ✅ | ⚠️ log sin lectura | ✅ | ❌ | El log pisa el intento anterior |

**Resumen:** el CRUD está **completo solo en usuarios**; en el resto falta la "U" (editar) y la
"D" (borrar). Lo más urgente por uso diario: **clientes** (corregir teléfonos es cotidiano),
**insumos** (cambiar precios) y **técnicos** (desactivar a alguien que se va).

---

## 6. CRM: qué agregar (y en qué orden)

Hoy el CRM tiene: bandeja de WhatsApp con filtros y búsqueda, responsable por conversación,
etiquetas, notas internas, ficha 360° en el hilo, embudo de 5 etapas con monto estimado, sección
de Clientes con KPIs, avisos automáticos (recibida / presupuesto / lista / garantía) y plantillas
aprobadas en Meta.

**Los 4 huecos que más cuestan plata:**

| # | Falta | Por qué importa | Esfuerzo |
|---|---|---|---|
| A | **La oportunidad no se ata a la orden real** | Ganás el "sí" por WhatsApp y después la orden vive en otro lado: no podés ver el estado de esa venta desde el embudo | Medio |
| B | **No hay historial de etapa ni motivo de pérdida** | Hoy no se puede saber en qué etapa se caen las ventas ni por qué | Medio |
| C | **No hay tareas ni recordatorios** | El presupuesto que no se sigue se enfría y se pierde | Medio |
| D | **Clientes sin editar ni campos comerciales** | No se corrige un teléfono, no se guarda dirección/CUIT/condición de pago/cómo nos conoció | Bajo |

**Después (operación diaria):**

| # | Falta | Valor |
|---|---|---|
| E | Etiquetas administrables (hoy texto libre) | Reportes confiables por tema |
| F | Respuestas rápidas con atajos y variables | Contestar en segundos, siempre igual de bien |
| G | Mandar la cotización por WhatsApp desde la bandeja | Cierra la venta ahí mismo (el link firmado ya existe) |
| H | Buscar **dentro** de los mensajes | Encontrar "lo que te pasé por teléfono" sin scrollear |
| I | Cerrar/archivar conversación + alerta "sin responder hace X" | Bandeja limpia y control de atención |
| J | Vincular conversación ↔ cliente (hoy solo por teléfono) | Las conversaciones huérfanas no tienen ficha |

**Más adelante (cumplimiento y escala):** fotos/adjuntos en el chat (la mayoría de las consultas
de taller llegan con foto), consentimiento y baja de WhatsApp (BAJA/STOP) —hoy `wa_optin` se
marca solo al recibir y **nunca se puede revocar**, con riesgo de bloqueo del número—,
exportación de conversaciones, multi-número/derivación y fusión de clientes duplicados.

**Orden sugerido de entregas:**
1. **Cimientos comerciales:** clientes editables + campos + vincular/crear desde la bandeja + etiquetas administrables.
2. **Cerrar el círculo venta→orden:** oportunidad↔orden, historial de etapa, motivo de pérdida y métricas de conversión.
3. **Seguimiento:** tareas con fecha y responsable, respuestas rápidas, búsqueda en mensajes.
4. **Cumplimiento:** adjuntos, opt-out, exportación.

---

## 7. Plan de acción recomendado

### Fase 0 — Urgente (hoy, poco esfuerzo, mucho riesgo evitado)
1. **Instalar el respaldo arreglado**: `bash scripts/backup-db.sh --instalar` (1 comando).
2. **Cerrar la fuga pública** de `/api/public/ordenes` (§4).
3. **Que un técnico no pueda entregar ni cancelar**: bloquear `delivered` y `cancelled` en
   `/transition` para no-admin.
4. **Revocar el token al desactivar/borrar un usuario** (chequear `activo` en el middleware).
5. **Guarda en `seed.js`** (`NODE_ENV=production` → abortar salvo `--si-borrar-todo`) y respaldo
   previo obligatorio en `/api/reset`.

### Fase 1 — Poder recuperar
6. **Papelera (baja lógica)** en usuarios, clientes, órdenes, baterías, insumos y notificaciones:
   `deleted_at` + pantalla "Papelera" con restaurar; purga física aparte y auditada.
7. **Respaldo fuera del VPS** + incluir `uploads/` + prueba de restauración mensual.
8. **Auditoría de cambios** (tabla `auditoria` con antes/después y autor) para usuarios, clientes
   y configuración.

### Fase 2 — Integridad
9. Estados bloqueados: no cotizar/agregar insumos/sacar fotos en órdenes entregadas o canceladas.
10. Claves foráneas con `ON DELETE` explícito y `UNIQUE` en `clientes.email`.
11. Transacciones en cotización, stock y mensajes; descuento de stock atómico (`WHERE stock >= n`)
    y `FOR UPDATE` donde se lee y escribe.
12. `wa_avisos_log` y `wa_message_id` con `UNIQUE` para que no se dupliquen avisos ni mensajes;
    timeout de conexión en el pool.

### Fase 3 — CRUD y CRM
13. **Editar/desactivar**: clientes, técnicos, insumos (datos), baterías.
14. **CRM**: entregas 1 a 4 de §6.

---

## 8. Anexo: verificaciones hechas en vivo

| Prueba | Resultado |
|---|---|
| `GET /api/public/ordenes?q=%` sin sesión | **8 órdenes con su código de seguimiento** (fuga) |
| `GET /api/public/ordenes/<código>` sin sesión | cliente, falla y eventos (fuga) |
| `GET /api/public/ordenes/ord_01` sin firma | HTTP 200 |
| `authRequired` consulta la base | No (solo verifica el token) |
| Respaldo del cron | 8 archivos de **0 bytes** (16/09 al 23/09) |
| `pg_dump` con credenciales de la app | OK (9.7 KB) |
| Restauración en base de prueba | OK (`ordenes=8 clientes=6 usuarios=3`) |
| `npx oxlint` / `npm test` / `npm run build` | 0 errores · 99 tests · build OK |
