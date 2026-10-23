# Bertika · Manual de uso

Sistema de gestion para taller de baterias industriales. Esta guia explica como
ejecutar la aplicacion (frontend + API + PostgreSQL), entrar con cada rol y
recorrer el flujo completo del taller.

---

## 1. Requisitos y arranque

El proyecto tiene dos partes que se ejecutan juntas:

| Parte | Carpeta | Que es |
| --- | --- | --- |
| Frontend | `src/` | Vite + React 19 (SPA). Se hidrata desde la API. |
| Backend | `api/` | Express + PostgreSQL (auth JWT, ordenes, insumos, bajas, uploads). |

Requisitos: **Node 22+** y **PostgreSQL 18** (local o en el VPS). No hay datos
demostrativos en el navegador: todo vive en la base de datos.

```bash
# 1) frontend
npm install        # una sola vez

# 2) backend
cd api
cp .env.example .env     # completar DATABASE_URL, JWT_SECRET y DEMO_*_PASS
npm install
npm run seed             # crea las tablas y carga los datos de ejemplo (idempotente)
npm start                # API en http://127.0.0.1:3001

# 3) frontend (en otra terminal, desde la raiz)
npm run dev              # http://localhost:5173 (Vite proxya /api y /uploads al 3001)
```

Comandos adicionales:

| Comando | Uso |
| --- | --- |
| `npm run build` | Genera la version de produccion en `dist/` |
| `npm run preview` | Sirve la version de produccion (despues de `build`) |
| `npx oxlint` | Revisa el codigo (no hay script `lint` en `package.json`) |
| `npm test` | Tests del cotizador de visitas y del proveedor de dolar (sin dependencias) |
| `bash scripts/checkpoint.sh "mensaje"` | Snapshot local: commitea todo (tracked + untracked), sin push |
| `bash scripts/deploy.sh` | Build + deploy a produccion (no existe script `npm run deploy`) |

En produccion nginx sirve `dist/` y hace de proxy de `/api` hacia el servicio
systemd `bertika-api`; los detalles estan en `docs/PRODUCCION.md`.

---

## 2. Acceso (login real)

En `/auth` se entra con **email y contrasena**; el backend valida con bcrypt y
devuelve un JWT de 12 h que se guarda en `localStorage` (clave `bertika-token`).

| Rol | Que ofrece | Quien lo usa |
| --- | --- | --- |
| **Admin** | Operacion completa del taller, reportes y usuarios | Recepcionista / administrador |
| **Tecnico** | Trabajo en el piso del taller (solo sus ordenes asignadas) | Tecnicos (5 disponibles, cada uno con especialidad) |
| **Cliente** | Seguimiento, cotizaciones y garantia (solo sus datos) | Clientes particulares y flotillas |

Las cuentas demo las crea `npm run seed` a partir de `DEMO_ADMIN_PASS`,
`DEMO_TEC01_PASS` y `DEMO_CLI01_PASS` del `.env`. Si esas variables no estan
definidas, el seed genera contrasenas al azar y las imprime por consola (solo en
desarrollo). En la maquina local estan anotadas en `local/credenciales-demo.txt`
(archivo ignorado por git, nunca versionar secretos).

Pasos:

1. Entra a `/auth` (boton **Acceder** en la landing).
2. Escribi email y contrasena.
3. El sistema redirige segun rol: Admin → `/hub` · Tecnico → `/tecnico` · Cliente → `/cliente`.

La sesion se puede cerrar desde `/settings` (**Salir / cambiar de usuario**).

---

## 3. Flujo de negocio (cadena de estados)

Cada bateria que entra al taller genera una **orden de trabajo** que avanza por
esta cadena:

```
Recibida → Diagnosticando → Cotizada → Aprobada → En reparacion → Prueba final → Lista → Entregada
                                                                            ↘ (falla) → En reparacion
```

Reglas importantes:

- **Cotizacion**: si el cliente **rechaza**, la orden se **cancela**. Tambien se
  puede cancelar desde Recibida, Diagnosticando, Aprobada y En reparacion.
- **No se repara sin aprobacion**: el paso a *En reparacion* exige que el cliente
  haya aprobado la cotizacion (unica excepcion: volver de una prueba final fallida).
- **Prueba final fallida**: la bateria **regresa a reparacion** automaticamente.
  NO se puede entregar sin pasar la prueba de carga.
- **Criterio de aprobacion de la prueba final**: la capacidad medida debe alcanzar el
  **80% de la capacidad nominal** de la bateria (`MIN_CAPACIDAD_PCT` en `src/data/reglas.js`).
  Por debajo de ese minimo la orden **no se puede aprobar** (ni desde la UI ni por API):
  se registra como fallida y vuelve a reparacion.
- **Garantia** se otorga al momento de **entregar** (meses y ciclos).
- Las baterias **no reparables** se pueden **dar de baja** con trazabilidad para reciclaje.
- **Auditoria**: cada evento guarda quien lo hizo (usuario, rol y persona vinculada) y
  cada cotizacion queda versionada con su autor y su monto.

Estas reglas viven en un solo archivo (`src/data/reglas.js`) y las usan **el
frontend y la API**, asi que una transicion permitida en la UI siempre lo es en
la base y viceversa.

### Ejemplo del flujo (de ventanilla a entrega)

| # | Etapa | Rol | Donde |
| --- | --- | --- | --- |
| 1 | Crear orden e ingresar bateria | Admin | Hub → **Crear orden de trabajo** |
| 2 | Asignar tecnico | Admin | Detalle de la orden → pestaña **Acciones admin** |
| 3 | Registrar diagnostico (voltaje, RI, prueba de carga) | Tecnico | Vista operativa → **Diagnosticar** |
| 4 | Cliente aprueba (o rechaza) la cotizacion | Cliente | /cliente → **Aprobar / Rechazar** |
| 5 | Iniciar reparacion | Tecnico | Detalle de la orden → **Iniciar reparacion** |
| 6 | Registrar insumos/celdas (descuenta stock) | Tecnico | Detalle → pestaña **Trabajo** |
| 7 | Iniciar y registrar prueba final | Tecnico | **Iniciar prueba final de carga** → capacidad en Ah |
| 8 | Entregar y cobrar (registra garantia) | Admin | Hub → orden **Lista** → **Entregar y cobrar** |

---

## 4. Hub administrativo (`/hub`)

Panel principal para administrar la operacion. Cada seccion tiene **su propia
direccion** (se puede guardar en favoritos y el menu marca donde estas):

| Seccion | Direccion | Funcion |
| --- | --- | --- |
| **Tablero (Kanban)** | `/hub` | Una columna por estado, KPIs arriba y boton **+ Crear orden de trabajo**. |
| **Dashboard** | `/hub/dashboard` | Indicadores del taller: baterias activas, cierres e ingresos, stock critico, reprocesos, garantias por vencer, tiempo medio de reparacion, tasa de reproceso y entregas en fecha. |
| **Historial por serie** | `/hub/historial` | Todas las ordenes de una bateria por su numero de serie. |
| **Clientes (CRM)** | `/hub/clientes` | Cartera con KPIs por cliente (ordenes activas, entregadas, flotilla, garantias, cobrado), buscador, orden por columna, **Editar**, **Dar de baja** y la ficha con ordenes, equipos, garantias y datos comerciales (direccion, CUIT, condicion de pago, como nos conocio, vendedor). |
| **WhatsApp** | `/hub/whatsapp` | Canal oficial: estado de la conexion, envio de prueba, **bandeja** (responsable, etiquetas con color, notas internas, ficha 360, respuestas rapidas), **Embudo comercial** por etapa con monto y **Metricas** (conversion, tasa de cierre, tiempo por etapa y motivos de perdida), **avisos automaticos** y **busqueda dentro de los mensajes**. |
| **Tareas** | `/hub/tareas` | Recordatorios con vencimiento y responsable: pendientes, vencidas (en ambar), para hoy y sin fecha; cerrar, reabrir y crear. |
| **Inventario** | `/hub/inventario` | Stock con valorizacion, **agregar stock**, **editar** datos del insumo (nombre, categoria, precio, minimo), **Movimientos** (auditoria con autor y motivo) y **Ajustar** (recuento fisico con motivo). |
| **Tecnicos** | `/hub/tecnicos` | Catalogo, especialidad, certificaciones, carga de trabajo y **editar / dar de alta o baja**. |
| **Flotillas** | `/hub/flotillas` | Baterias activas de clientes corporativos y estado de garantia. |
| **Garantias** | `/hub/garantias` | Garantias vigentes y por vencer. |
| **Baja / reciclaje** | `/hub/baja` | Baterias dadas de baja con motivo y disposicion; trazabilidad para reciclaje. |
| **Cotizador** | `/hub/cotizador` | Tarifas del cotizador de visitas (traslado, viaticos, precios, descuentos, extras, recargos, IVA, vigencia y limites), con vista previa e historial de cambios. |
| **Papelera** | `/hub/papelera` | Clientes dados de baja, con quien y cuando, y boton **Restaurar**. |
| **Reportes** | `/reportes` | Exportacion a CSV. |
| **Usuarios** | `/usuarios` | Alta, edicion, baja/reactivacion y **matriz de permisos por usuario** (que ve y que puede hacer, con plantillas por rol). |
| **Respaldos** | `/respaldos` | Solo admin. Boton **Respaldar ahora**: respalda la base en el servidor y baja la copia al navegador cuando vos quieras (no hay respaldo programado de tu lado). Abajo, la lista de copias del servidor con su fecha y tamano para bajar cualquiera. |
| **Mi cuenta** | `/settings` | Datos propios y cambio de contrasena. |

El **menu lateral** agrupa todo por rol (Operacion · Comercial · Taller · Sistema) y
**solo muestra lo que el usuario tiene permitido**; si entra por una direccion que no
le corresponde, ve un cartel claro en vez de la pantalla.

### Crear orden de trabajo

1. Pestaña **Kanban** → boton **+ Crear orden de trabajo**.
2. Escribe el **numero de serie**:
   - Si la bateria **ya existe**: el sistema la reconoce y solo pides cliente y falla.
   - Si es **serie nueva**: registra tipo, voltaje, capacidad (Ah), aplicacion, marca, modelo y equipo.
3. Selecciona **cliente** y escribe la **falla reportada**.
4. **Crear orden de trabajo** → la bateria aparece en la columna **Recibidas** con su
   **codigo de seguimiento** de 16 digitos.

### Asignar tecnico

1. Abre la orden (clic en la tarjeta) → pestaña **Acciones admin**.
2. Selecciona tecnico y **Asignar**.
3. Si la especialidad no coincide con la aplicacion de la bateria se muestra una **advertencia (validacion soft)** — se permite operar, pero conviene reasignar.

### Entregar y cobrar

1. Localiza las ordenes **Listas** (pasaron prueba final).
2. Abre la orden → pestaña **Acciones admin** → **Entregar y cobrar**.
3. Confirma **monto cobrado**, **meses de garantia**, **ciclos** y **medio de cobro** → **Confirmar entrega y cobro**.
4. La bateria pasa a estado **Entregada** y el cliente la ve como **En garantia**.
5. En la pestaña **Documentos** queda el **comprobante de entrega** listo para imprimir y firmar,
   con el detalle economico, el medio de cobro y la vigencia de la garantia.

### Dar de baja (no reparable)

1. Abre la orden en **Acciones admin** → **Dar de baja**.
2. Escribe el **motivo** (viene pre-cargado y es editable) y confirma.
3. La bateria queda `dada_de_baja`, la orden se cancela y la baja aparece en **Baja / reciclaje**
   con su motivo en la trazabilidad.

---

## 5. Vista operativa del tecnico (`/tecnico`)

**No hay cartera de clientes asignada: cualquier tecnico puede trabajar con cualquier
orden** (de cualquier cliente). La pestaña **Ordenes del taller** muestra todas las
activas; **Sin asignar** filtra las que todavia no tienen tecnico (util para saber que
nadie tomo); **Completadas** lista las entregadas y canceladas. El campo "tecnico" indica
quien la esta haciendo, no un permiso: no hace falta que te la asignen para trabajar.
Lo unico reservado al administrador es **entregar** (registra el cobro y la garantia),
**cancelar** y **dar de baja**. Arriba hay un **buscador** por serie, equipo, cliente,
falla o N° de orden, y cada tarjeta muestra **hace cuanto esta en el estado actual**
(verde hasta 2 dias, ambar 3-6, rojo 7 o mas); la lista se ordena por antiguedad, lo mas
viejo primero.

Con el boton **Diagnosticar / Detalle** se abre la orden con estas pestañas: **Orden**,
**Trabajo**, **Eventos**, **Documentos** y **Etiqueta**.

Trabajo dentro de cada etapa:

| Estado de la orden | Que hace el tecnico |
| --- | --- |
| **Recibida / Diagnosticando** | Llena voltaje (V) y resistencia interna (mΩ) — validadas en rango, con aviso si el voltaje supera ampliamente el nominal —, **prueba de carga** (aprobada/fallida), tipo de servicio a cotizar, notas tecnicas y hasta 6 **fotos del estado de ingreso** → **Guardar diagnostico y generar cotizacion**. |
| **Cotizada** | Puede ajustar la cotizacion (servicios, insumos, otros) mientras el cliente no haya respondido; el total se muestra desglosado en **mano de obra / materiales / otros**. |
| **Aprobada** | **Iniciar reparacion**. |
| **En reparacion** | Registra **insumos/celdas** usados (buscador, filtro por categoria, stock y precio a la vista; el stock se descuenta). Puede **devolver al stock** un insumo cargado por error. Abajo se ve el **costo de materiales** y una alerta si ya supera lo cotizado. Al terminar, **Iniciar prueba final de carga**. |
| **Prueba final** | Registra **capacidad medida (Ah)** y resultado **Aprobada/Fallida**, con el **% de la capacidad nominal** en vivo: por debajo del 80% no permite aprobar. Si falla, la orden regresa a reparacion automaticamente. |

- La pestaña **Eventos** muestra el historial completo con **fecha y responsable** de cada paso.
- La pestaña **Orden** muestra lecturas del diagnostico (con la **evidencia fotografica**), cotizacion, prueba final, garantia, historial de la serie y la **auditoria de versiones de la cotizacion** (quien, cuando y por cuanto).
- La pestaña **Documentos** emite la **orden de trabajo** (recepcion, falla, diagnostico, presupuesto y firmas) y el **comprobante de entrega y garantia**, ambos listos para imprimir solos.
- La pestaña **Etiqueta** arma la etiqueta de la bateria con un **QR que apunta al seguimiento publico** (`/tracker/<codigo de 16 digitos>`); **Imprimir etiqueta** la manda a la impresora sola, sin el resto de la interfaz.
- Si la bateria ya tuvo una orden con **garantia vigente**, al abrir la orden aparece un aviso de **posible reproceso en garantia** (no se cobra).
- En la tarjeta del cliente hay un boton **Avisar al cliente** que abre WhatsApp con el mensaje y el enlace del tracker.

---

## 6. Cliente (`/cliente`)

Vista segun el tipo de cliente:

- **Particular** → "Mi bateria"
- **Flotilla corporativa** → "Flotilla y servicios"

Secciones:

| Seccion | Funcion |
| --- | --- |
| **Seguimiento** | Tracker tipo paqueteria con los pasos del proceso (Recibida → Entregada). |
| **Cotizaciones** | Aprobar o **Rechazar** el presupuesto (rechazar cancela la orden). |
| **Historial** | Ordenes anteriores de tu bateria/flotilla. |
| **Garantia** | Baterias bajo garantia, vigencia y cobertura. |
| **Agenda** | Agendar proxima visita o mantenimiento (**simulado**: registra la intencion, sin backend todavia). |

---

## 7. Seguimiento publico (sin login)

**Por enlace:** `/tracker/:codigo` — el enlace lleva el **codigo de seguimiento de
16 digitos** (con o sin guiones). Ideal para compartir por WhatsApp.

**Por busqueda:** `/seguimiento` acepta **solo el codigo de seguimiento de 16
digitos** (se formatea solo, `XXXX-XXXX-XXXX-XXXX`). No acepta el numero de serie
ni el id interno: eso permitia listar todas las ordenes del taller sin sesion.

**Siempre se ve como el cliente, aunque estes logueado.** La pantalla de
seguimiento no se abre dentro del panel: muestra solo lo publico (estado, pasos,
bateria, historial de eventos **sin el nombre de quien lo cargo**). Si entraste
con una cuenta, aparece igual el boton **Ir a la plataforma** para volver.

**Cotizacion publica:** `/cotizacion/:orden_id?t=<firma>` permite al cliente
aprobar o rechazar sin cuenta. El parametro `t` es una firma HMAC: en la
plataforma el boton **Compartir seguimiento y cotizacion** (pestaña *Acciones
admin*) o **Compartir cotizacion con el cliente** (vista del tecnico, orden
cotizada) pide ambos enlaces al servidor y los envia por WhatsApp o los copia.
Sin firma valida el endpoint responde 403.

### Cotizador de visita (`/cotizador`)

- **Cobertura configurable** (700 km por defecto). Por encima de ese tope **no se cotiza**: la pagina ofrece
  hablar con un vendedor (WhatsApp o formulario) para analizar la viabilidad del servicio.
- **Traslado por franjas + precio por km** (el km declarado ya contempla la ida y vuelta): cada franja tiene una
  base que cubre hasta X km y, desde ahi, un valor por km extra. Por defecto: **USD 120 hasta 200 km** (los
  primeros 100 km ya estan cubiertos por esa base) y **USD 3 por km** desde los 200 km.
- **Viaticos** para visitas largas: desde los 300 km se suma un dia de viaje y uno mas cada 200 km
  (por defecto USD 150 por dia, tope 5 dias).
- **Revision** por tipo y cantidad de baterias, con **descuento por volumen** (5/10/25 unidades → 5/10/15%).
- **Servicios adicionales**: los que dicen "por equipo" se multiplican por la cantidad de baterias
  cargadas (cantidad editable). Todos quedan **sujetos a analisis del comercial**.
- **Urgencia** express 48 h (+25%) y **turno** de fin de semana (+30%).
- **Estimacion en USD** con equivalente informativo en pesos al **dolar oficial (venta)** en tiempo
  real: la cotizacion la resuelve el servidor (proxy con cache de 10 minutos y respaldo entre
  proveedores), y si no hay dato se muestran solo los importes en USD.
- Al pedir atencion personalizada se guarda una **cotizacion con codigo** (`CV-000123`), se puede
  **imprimir o guardar en PDF** (con vigencia configurable) y el correo a ventas llega con el
  **detalle completo de importes** y la cotizacion del dolar del momento.
- **Todas las variables se editan desde el panel** (Hub → pestaña **Cotizador**): franjas de traslado,
  viaticos, precios por tipo, descuentos, extras, recargos, IVA, vigencia, cobertura y limites. Hay vista
  previa en vivo y "valores de fabrica"; cada cambio queda auditado con usuario y fecha.
- **Responsive**: en notebook y tablet horizontal (desde 900 px) entra en dos columnas, sin scroll de pagina;
  en celular y tablet vertical se apila en una columna con una **barra fija abajo** que muestra el total y el
  boton **Solicitar**, asi no hay que scrollear para pedir la visita.
- Los calculos estan cubiertos por **`npm test`** (zonas, viaticos, descuentos, extras por equipo, recargos, IVA,
  validacion de la configuracion y proveedor de dolar).

---

## 8. Settings (`/settings`)

- Muestra el **usuario activo** (rol, especialidad o cliente) y el resumen de datos sincronizados.
- **Cambiar contrasena**: pide la contrasena actual y la nueva (minimo 8 caracteres).
  Funciona para los tres roles (`POST /api/auth/password`); los cambios de
  contrasena de terceros los hace un admin desde `/usuarios`.

---

## 9. Datos de ejemplo incluidos

- **5 tecnicos** con especialidades: Plomo-Acido, Litio, Industrial Pesado, Ferroviario.
- **5 clientes**: 2 particulares y 3 flotillas corporativas.
- **9 baterias** en distintas aplicaciones: Automotriz, Autoelevador, Ferroviario, Industrial/UPS, Marino.
- **8 ordenes** en todos los estados (Recibida, Diagnostico, Cotizada, En reparacion, Prueba final, Lista, Entregadas).
- **11 insumos** con stock inicial.

> Fuente de verdad: `src/data/seed.js`; se cargan en PostgreSQL con `node api/seed.js`
> (idempotente: recrea tablas vacias y reinserta). Para volver al estado inicial en
> un entorno de demo, **con respaldo previo**, se puede usar `POST /api/reset`, que
> solo funciona si el backend corre con `ALLOW_RESET=1` (nunca en produccion).

---

## 10. Notas y limites actuales

- La autenticacion es **real** (JWT + bcrypt) y los datos viven en PostgreSQL.
- Las **notificaciones** se registran en la base (`notificaciones`). El **formulario de
  contacto** envia correo real (SMTP) y el **canal de WhatsApp** envia mensajes reales
  por la API de Meta cuando las claves estan cargadas (`scripts/whatsapp-env.sh`).
  Los avisos automaticos por estado de la orden (plantillas) tambien existen y salen por
  la **cola de salida**: si Meta no responde, se reintentan solos y quedan visibles en
  **Sistema → Salud y auditoría → Envíos**.
- La **agenda** de visitas y la emision de **CFDI/facturacion** estan pendientes;
  tampoco hay pagos ni lecturas automaticas del equipo de diagnostico.
- **Fases 1 y 2 completas.** Lo que falta (recompra, campanas, cobros, portal de
  flotillas, email/agenda, IA y pendientes de infraestructura) esta listado y priorizado
  en `docs/FUTURO.md`.
- El **cotizador de visita** usa tarifas provisorias en USD (`src/data/cotizadorVisita.js`).

---

## 11. Salud y auditoría (`/sistema`)

Solo la ve quien tenga el permiso **Sistema → Salud y auditoría** (`sistema`; por
plantilla, el administrador). Tiene tres pestanas:

- **Estado**: si la base responde, cuantos envios esperan/fallaron, cuando fue el ultimo
  respaldo, memoria y uptime del servidor, y si las alertas tienen email o webhook.
  Se actualiza solo cada 30 segundos.
- **Envios**: la cola de WhatsApp. Muestra que se mando, que espera reintento y que fallo,
  con el error de Meta. El boton **Reintentar** vuelve a intentar un envio fallido o
  "sin confirmar"; **Procesar cola** fuerza un tick del worker.
- **Auditoria**: quien cambio que y cuando, con el antes y el despues. Se puede filtrar
  por tabla, usuario y fecha. Nunca guarda contrasenas, hashes ni tokens.

El monitor publico es `GET /api/health` (para un servicio de uptime). El servidor revisa
cada 5 minutos la base, la cola, el respaldo y los errores 500, y avisa por email
(`ALERTAS_EMAIL`, usa el SMTP de las consultas) o por webhook (`ALERTAS_WEBHOOK`).

---

## 12. CRM comercial de WhatsApp (cotizar, atender y seguir)

### Cotizar desde el chat
En el hilo de una conversación vinculada a un cliente aparece la tarjeta **Orden**:

- Si no hay orden, **Cotizar / vincular orden** abre el formulario. Se puede elegir una
  orden existente del cliente o **crear una orden nueva** (esto ultimo solo lo puede hacer
  un administrador, porque crear ordenes es su permiso).
- Se carga el monto, se puede escribir el mensaje y se deja tildado **Enviar el link
  firmado por WhatsApp**. Si se deja vacio el mensaje, se manda solo con el monto y el link.
- Al crear la cotizacion, la oportunidad pasa a **Presupuestado** (si estaba en Nuevo) y
  queda el monto en el embudo. Cuando el cliente aprueba desde el link, pasa sola a
  **Ganado**; si rechaza, pasa a **Perdido** con el motivo «Cotizacion rechazada».
- La tarjeta muestra el estado de la orden, el monto cotizado y lo cobrado, y permite
  **copiar el link** para mandarlo por otro medio o **recotizar**.

### Atencion (SLA)
La pestana **Atencion** de la bandeja muestra:

- Cuantas conversaciones estan **sin responder** (el ultimo mensaje es del cliente) y hace
  cuanto espera la mas vieja.
- Primera respuesta promedio y p90, y que porcentaje se respondio en 30 minutos.
- Una tabla por responsable con asignadas, sin responder, primera respuesta y ganadas.
- El boton **Repartir sin asignar por carga** (admin) distribuye las conversaciones sin
  responsable entre quienes pueden responder WhatsApp, empezando por el que tiene menos.

En la bandeja hay un filtro **Sin responder** y un distintivo en cada conversacion.

### Automatizaciones de seguimiento
La tarjeta **Seguimiento automatico (tareas)** (admin) tiene dos reglas:

- **Presupuesto sin respuesta**: si una oportunidad presupuestada queda X dias sin
  movimiento, crea una tarea para retomarla.
- **Bateria lista sin retirar**: si una orden lleva X dias lista, crea una tarea para
  avisarle al cliente.

Se revisan solas cada 6 horas y con **Revisar ahora**. Crean **tareas** (no mandan mensajes
solos) y no se duplican: una misma oportunidad/orden no genera dos veces la misma tarea.
Las tareas aparecen en **Tareas** con el distintivo `auto`.

---

## 13. Privacidad, cookies y documentos legales

En el pie del sitio hay enlaces a **Privacidad**, **Términos**, **Cookies**, **Tus datos**
y **Cambiar preferencias**.

- **Banner de cookies**: al entrar por primera vez se puede **aceptar todas**, **rechazar
  todas** o **elegir por categoría**. Nada viene premarcado. Las categorías Medición y
  Marketing están apagadas hasta que se autoricen; hoy no hay herramientas de medición
  instaladas.
- **Formularios**: contacto y cotizador piden dos aceptaciones separadas, términos y
  privacidad, con enlaces a los textos. Sin las dos no se envía.
- **Tus datos**: formulario para pedir acceso, rectificación, supresión u oposición, o
  retirar el consentimiento. La solicitud queda registrada y se avisa a
  `admin@bertika.com`.
- **Panel**: en **Sistema → Privacidad** (admin) se ven los consentimientos, se filtran,
  se exportan a CSV y se pueden anonimizar. Se conservan 5 años.
- **Versiones**: cada cambio de texto se publica con fecha y versión, y queda el archivo
  con el hash de lo que se aceptó.

Los datos registrales que faltan (razón social, CUIT, domicilio legal e inscripción en la
AAIP) figuran **en trámite** en los textos hasta que se completen.
