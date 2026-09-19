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
- **Garantia** se otorga al momento de **entregar** (meses y ciclos).
- Las baterias **no reparables** se pueden **dar de baja** con trazabilidad para reciclaje.

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
| **Dashboard** | Indicadores globales del taller. |
| **Historial por serie** | Busca todas las ordenes de una bateria por su numero de serie. |
| **Inventario** | Stock de insumos con valorizacion; **agregar stock** a cada insumo. El stock se descuenta en tiempo real cuando un tecnico registra un insumo. |
| **Tecnicos** | Catalogo de tecnicos, especialidad, certificaciones y carga de trabajo. |
| **Flotillas** | Baterias activas de clientes corporativos + estado de garantia. |
| **Garantias** | Tabla de garantias vigentes y por vencer. |
| **Baja / reciclaje** | Baterias dadas de baja con motivo y disposicion; trazabilidad para reciclaje responsable. |

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
3. Confirma **monto cobrado**, **meses de garantia** y **ciclos** → **Confirmar entrega y cobro**.
4. La bateria pasa a estado **Entregada** y el cliente la ve como **En garantia**.

### Dar de baja (no reparable)

1. Abre la orden en **Acciones admin** → **Dar de baja**.
2. Escribe el **motivo** (viene pre-cargado y es editable) y confirma.
3. La bateria queda `dada_de_baja`, la orden se cancela y la baja aparece en **Baja / reciclaje**
   con su motivo en la trazabilidad.

---

## 5. Vista operativa del tecnico (`/tecnico`)

Muestra las ordenes activas asignadas al tecnico (mas las recibidas sin asignar).
Con el boton **Diagnosticar / Detalle** se abre la orden con 3 pestañas: **Orden**,
**Trabajo** y **Eventos**.

Trabajo dentro de cada etapa:

| Estado de la orden | Que hace el tecnico |
| --- | --- |
| **Recibida / Diagnosticando** | Llena voltaje (V), resistencia interna (mOhm), **prueba de carga** (aprobada/fallida), tipo de servicio a cotizar y notas tecnicas → **Guardar diagnostico y generar cotizacion**. |
| **Cotizada** | Puede ajustar la cotizacion (servicios, insumos, otros) mientras el cliente no haya respondido. |
| **Aprobada** | **Iniciar reparacion**. |
| **En reparacion** | Registra **insumos/celdas** usados (filtra por categoria, el stock se descuenta). Al terminar, **Iniciar prueba final de carga**. |
| **Prueba final** | Registra **capacidad medida (Ah)** y resultado **Aprobada/Fallida**. Si falla, la orden regresa a reparacion automaticamente. |

- La pestaña **Eventos** muestra el historial completo (fecha y responsable) como trazabilidad.
- La pestaña **Orden** muestra lecturas del diagnostico, cotizacion, prueba final, garantia e historial de la serie.

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
aprobar o rechazar sin cuenta. El parametro `t` es una firma HMAC que se obtiene
con `POST /api/ordenes/:id/compartir` (staff con acceso a la orden); sin firma el
endpoint responde 403.

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
