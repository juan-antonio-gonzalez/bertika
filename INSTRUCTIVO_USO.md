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

Panel principal para administrar la operacion. Pestañas:

| Pestaña | Funcion |
| --- | --- |
| **Kanban** | Tablero con **una columna por estado** (Recibidas, Diagnostico, Cotizadas, Aprobadas, En reparacion, Prueba final, Listas, Entregadas, Canceladas). KPIs arriba y boton **+ Crear orden de trabajo**. |
| **Dashboard** | Indicadores del taller: baterias activas, cierres e ingresos del dia, stock critico, reprocesos, garantias por vencer, **tiempo medio de reparacion**, **tasa de reproceso** y **entregas en fecha**. |
| **Historial por serie** | Busca todas las ordenes de una bateria por su numero de serie. |
| **Inventario** | Stock de insumos con valorizacion; **agregar stock** a cada insumo. El stock se descuenta en tiempo real cuando un tecnico registra un insumo. Cada insumo tiene **Movimientos** (auditoria completa: alta, ingreso, consumo, devolucion, ajuste, con autor y motivo) y **Ajustar** (recuento fisico: fija el stock real y exige un motivo). |
| **Tecnicos** | Catalogo de tecnicos, especialidad, certificaciones y carga de trabajo. |
| **Flotillas** | Baterias activas de clientes corporativos + estado de garantia. |
| **Garantias** | Tabla de garantias vigentes y por vencer. |
| **Baja / reciclaje** | Baterias dadas de baja con motivo y disposicion; trazabilidad para reciclaje responsable. |
| **Cotizador** | Tarifas del cotizador de visitas: franjas de traslado, viaticos, precios por tipo de bateria, descuentos, extras, recargos, IVA, vigencia y limites. Vista previa en vivo y valores de fabrica. |
| **WhatsApp** | Canal oficial de WhatsApp: estado de la conexion, envio de prueba y la bandeja de conversaciones (con la ficha del cliente y sus ultimas ordenes al lado). Guia del tramite en Meta: `docs/WHATSAPP_META.md`. |

El admin tambien tiene `/reportes` (exporta CSV) y `/usuarios` (alta, edicion de
rol/estado y reseteo de contrasenas de cualquier cuenta).

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

Tres pestañas de trabajo: **Activas** (lo asignado a vos), **Sin asignar** (lo que entro
al taller y todavia no tiene tecnico: podes diagnosticarlo; para repararlo el admin debe
asignartelo) y **Completadas**. Arriba hay un **buscador** por serie, equipo, cliente,
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
- La pestaña **Etiqueta** arma la etiqueta de la bateria con un **QR que apunta al seguimiento publico** (`/tracker/<orden>`); **Imprimir etiqueta** la manda a la impresora sola, sin el resto de la interfaz.
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

**Por enlace:** `/tracker/:orden_id` — cualquiera con el enlace ve el avance.
Ideal para compartir por WhatsApp.

**Por busqueda:** `/seguimiento` acepta el **codigo de seguimiento de 16 digitos**
(se formatea solo, `XXXX-XXXX-XXXX-XXXX`) o el **numero de serie** de la bateria.

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
- Las **notificaciones** se registran en la base (`notificaciones`) pero el envio por
  WhatsApp/email es simulado: solo el formulario de contacto envia correo real (SMTP).
- La **agenda** de visitas y la emision de **CFDI/facturacion** estan pendientes;
  tampoco hay pagos ni lecturas automaticas del equipo de diagnostico.
- El **cotizador de visita** usa tarifas provisorias en USD (`src/data/cotizadorVisita.js`).
