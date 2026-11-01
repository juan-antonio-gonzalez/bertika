# Bertika - Sistema de Gestion para Talleres de Baterias Industriales

Aplicacion web para gestionar el ciclo completo de una bateria en el taller: recepcion, diagnostico, cotizacion, reparacion/reacondicionamiento, prueba de carga y entrega.

**Tagline:** `Bertika - Energia bajo control`

## Estado

- **Fase 1 — Robustez:** ✅ implementada y en producción (cola de salida de WhatsApp, auditoría, salud/alertas, CSV seguro, tests y CI).
- **Fase 2 — CRM comercial:** ✅ implementada y en producción (cotizar desde el chat, embudo automático, SLA/reparto, automatizaciones de seguimiento).
- **Privacidad, cookies y legales:** ✅ implementada (páginas legales, banner de consentimiento, registro con hash, retiro de derechos, versionado y panel de privacidad). Ver [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md).
- **Listas dinámicas (tipo SharePoint/MS Lists):** ✅ implementada y en producción. Áreas, listas, campos, vistas, formularios públicos, permisos por lista/categoría/campo, aprobaciones, plantillas, adjuntos privados, búsqueda global y automatizaciones. Ver [docs/API.md](docs/API.md) y el [manual](INSTRUCTIVO_USO.md).
- **Ventas V2 (oportunidades + cotizaciones):** ✅ MVP en producción. Pipeline `/ventas`, oportunidades sin depender de WhatsApp, cotizaciones con ítems y link público, pronóstico, seguimiento y conversión a orden.
- **Fase 3 y pendientes de infraestructura:** ver [docs/FUTURO.md](docs/FUTURO.md).

## Como ejecutar

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # produccion en dist/
npm run preview  # servir el build
npm run lint     # oxlint sobre src, api y scripts
```

## Tests y CI

```bash
npm test                  # lógica pura: cotizador, CRM, permisos, CSV, auditoría/outbox
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bertika_test \
  npm run test:integracion  # API + PostgreSQL real (la base se borra y recrea)

BERTIKA_UI_EMAIL=... BERTIKA_UI_PASSWORD=... npm run test:ui  # smoke E2E con Chrome
```

Los tests de integración levantan la API, usan un **Meta simulado** (no gastan mensajes)
y cubren login, permisos, auditoría, outbox con reintentos, export CSV, webhook, Listas
y Ventas (oportunidad, cotización, link público y orden). En GitHub Actions corre todo
(`.github/workflows/ci.yml`) con un servicio PostgreSQL 16.

La suite completa se ejecutó contra una base `_test` descartable: **37 pruebas OK**.

El smoke E2E de navegador verifica login, menú, Ventas, las listas de Taller, la búsqueda
global y el buscador del menú. Es **solo lectura**: no crea ni modifica datos.

## Seguridad y operación

- Deploy con **verificación estricta**: falla si el frontend, las tarjetas, `/api/health` o
  `/api/public/stats` no responden 200, y exige que el servicio esté activo.
- **CSP y cabeceras de seguridad** en nginx para el SPA, además de Helmet en la API.
- **Rate limit** en login, formularios públicos, cotizaciones públicas y contacto.
- **Migraciones versionadas** para el hardening de Ventas y schema `schema_migrations`.
- Cotizaciones con **vencimiento**, nueva versión y link público.
- Respuesta **410** para cotizaciones vencidas.
- **Índices** para oportunidades, cotizaciones y búsqueda de listas.
- **CI** con auditoría de dependencias críticas.

## Robustez operativa (Fase 1)

- **Outbox de WhatsApp**: todo mensaje se guarda antes de enviarse; los errores de red,
  429 y 5xx se reintentan con espera creciente. Los errores de datos no se insisten y los
  timeouts quedan "sin confirmar" para no duplicar. Panel: **Sistema → Salud y auditoría → Envíos**.
- **Auditoría genérica**: quién cambió qué, con antes/después, IP y `request-id`; nunca guarda
  contraseñas, hashes ni tokens. Panel: **Sistema → Salud y auditoría → Auditoría**.
- **Salud y alertas**: `GET /api/health` público para uptime; monitoreo cada 5 min de base,
  cola, respaldo y errores 500, con aviso por email (`ALERTAS_EMAIL`) o webhook.
- **Export CSV seguro**: neutraliza fórmulas de Excel (`=`, `+`, `-`, `@`) en Reportes y en
  el export de WhatsApp.

## CRM comercial (Fase 2)

- **Conversación → cotización → orden**: desde el hilo de WhatsApp se elige una orden del
  cliente (o se crea una nueva), se carga el monto y se manda el **link firmado** para aprobar.
  La oportunidad pasa a «Presupuestado»; al aprobar el cliente pasa a «Ganado» y al rechazar a
  «Perdido» con motivo. Las métricas muestran cotizado, cobrado y conversión real.
- **Atención (SLA)**: primera respuesta promedio y p90, porcentaje respondido en 30 minutos,
  conversaciones sin responder (con filtro en la bandeja) y carga por responsable, más un
  botón de **reparto por carga** para el admin.
- **Automatizaciones de seguimiento**: reglas configurables (presupuesto sin respuesta y
  batería lista sin retirar) que crean **tareas** idempotentes cada 6 horas; no mandan
  mensajes solas. Se revisan también a mano desde la bandeja.

## Ventas V2

El módulo `/ventas` ordena la venta alrededor de la **oportunidad**, no de la conversación:

- Pipeline con etapas, monto, probabilidad, cierre, responsable y próxima acción.
- Oportunidades que existen sin WhatsApp y sin orden.
- Cotizaciones con ítems, descuento, IVA, validez y link público.
- Seguimiento de cotizaciones enviadas, vistas, aceptadas y rechazadas.
- Bandeja **Hoy** con próximas acciones, cotizaciones sin respuesta y oportunidades estancadas.
- Conversión de una oportunidad ganada en orden de taller.
- Pronóstico ponderado y monto abierto.
- Migración de conversaciones y de la lista de Oportunidades con
  `node api/backfill-ventas.js` (modo seco) y `--aplicar`.

La conversación de WhatsApp sigue siendo el canal de atención, pero ya no es la fuente
única del pipeline.

## Listas dinámicas

El módulo `/listas` permite crear tablas y formularios por área sin tocar código:

- **Áreas y listas** separadas para Taller, Ventas y Administración.
- **Campos**: texto, número, moneda, fecha, selección, checkbox, email, teléfono, URL,
  persona, cliente, adjunto, imagen, relación con otra lista y calculado.
- **Vistas**: grilla, formulario, Kanban, calendario y galería; compartidas o privadas.
- **Permisos**: por área, por lista y por categoría (incluido solo lectura y permisos
  granulares), por fila y por campo (un campo puede ocultarse a una categoría).
- **Aprobaciones**: aprobador asignado, plazo y cadena de aprobadores.
- **Formularios públicos** con token, confirmación por email y aprobación automática.
- **Adjuntos privados**: se guardan fuera de `/uploads` y se descargan con token y permiso
  de lista.
- **Plantillas**: seis base y plantillas propias guardadas desde una lista.
- **Automatizaciones**: email, WhatsApp, cambio de campo, webhook HTTPS y creación
  automática de una orden de taller con el campo Cliente + serie.
- **Búsqueda global**, favoritos y recientes del menú sincronizados por usuario.
- **Activos/arrancadores** del cliente, seleccionables al crear una orden.

La API completa está en [docs/API.md](docs/API.md); el recorrido de uso, en
[INSTRUCTIVO_USO.md](INSTRUCTIVO_USO.md).

## Privacidad y legales

- **Páginas públicas**: `/legal/privacidad`, `/legal/cookies`, `/legal/terminos`,
  `/legal/privacidad/retirar` y `/legal/versiones`.
- **Banner de cookies** con aceptar todas, rechazar todas o elegir por categoría. Nada
  premarcado; medición y marketing apagados por defecto. La decisión se guarda en el
  navegador y en la base con versión e IP.
- **Registro de consentimientos** en PostgreSQL, firmado con HMAC. Incluye versión, URL y
  hash del texto aceptado. Se conserva 5 años y luego se anonimiza.
- **Checkboxes separados** de términos y privacidad en contacto y cotizador, y formulario
  de retiro/derechos. Panel: **Sistema → Privacidad**.
- **Versiones congeladas** de cada documento con su hash, para acreditar qué texto aceptó
  cada persona. Detalle técnico: [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md).

## Sitio público y videos de portada

- **Home**: hero con video 3D propio (nave de baterías) y título **«Salud energética para que tu operación nunca se detenga»**. «Salud energética» va en naranja.
- **Heroes internos**: cada página arranca con video o imagen de fondo, un rótulo chico con el nombre de la página, una frase de impacto (con una palabra en naranja) y el breadcrumb.

| Página | Frase de portada |
| --- | --- |
| Nuestra Empresa | Iniciamos un viaje con mucha Energía |
| Productos | Energía para cada aplicación industrial |
| Servicios | Devolvemos la energía a tu operación |
| Política Ecológica | Cerramos el ciclo de la energía |
| Cómo Llegar | Estamos cerca de tu operación |
| Seguimiento | Tu batería, en tiempo real |

`/contacto` usa un layout de formulario sin hero; no lleva frase de portada.

- **Componente**: `src/components/SectionVideo.jsx` monta el video con poster, `preload="none"` e `IntersectionObserver`: reproduce solo cuando la sección entra en pantalla, pausa al salir, respeta `prefers-reduced-motion` y cae al poster si el video falla. La home usa su propio `<video>` con la misma lógica.
- **Archivos**: videos en `public/video/` y posters en `public/img/` (`hero-bateria-3d.mp4`, `vitrina-productos.mp4`, `servicios-nave.mp4`, `empresa-industria.mp4`, `seccion-ecologia.mp4`). Para reemplazar uno, mantener el nombre o actualizar la ruta en la página y rebuild/deploy.
- **Contenido y licencias**: la nave, la vitrina y el banco de prueba son renders 3D propios; el tren es de Mixkit (licencia libre, sin atribución obligatoria); el video del mundo en la mano lo aportó el cliente. Ningún asset lleva marca de agua.

## Stack

- Frontend: Vite + React 19, Zustand (store global reactivo) con persistencia en `localStorage`, React Router (rutas SPA), CSS propio.
- Backend: Express + PostgreSQL en `api/` (auth JWT, RBAC, ordenes, insumos, bajas, uploads públicos y adjuntos privados de listas).
- En desarrollo, Vite redirige `/api` y `/uploads` al backend en `http://127.0.0.1:3001`.
- En produccion, nginx sirve el `dist/` y hace de proxy de `/api` hacia el servicio `bertika-api`.

## Backend (api/)

```bash
cd api
cp .env.example .env     # completar DATABASE_URL, JWT_SECRET, etc.
npm install
npm run seed             # carga datos demo (opcional)
npm start                # http://127.0.0.1:3001
```

Las paginas publicas (contacto, seguimiento, tracker, cotizacion) y los paneles de plataforma (admin/tecnico/cliente) consumen la API real: el store del frontend se hidrata desde `GET /api/estado` y se re-sincroniza tras cada accion.

## Rutas

| Ruta | Descripcion |
| --- | --- |
| `/` | Landing publica del taller |
| `/empresa`, `/productos`, `/servicios`, `/politica-ecologica`, `/como-llegar`, `/contacto` | Sitio publico institucional |
| `/cotizador` | Cotizador de visita tecnica (tarifas en `src/data/cotizadorVisita.js`) |
| `/seguimiento` | Busqueda publica por codigo de 16 digitos o N° de serie |
| `/cotizacion/:orden_id` | Cotizacion publica con enlace firmado (`?t=`) para aprobar/rechazar |
| `/auth` | Login real (JWT) de Admin / Tecnico / Cliente |
| `/home` | Redireccion segun rol |
| `/ventas` | Pipeline de oportunidades y cotizaciones |
| `/ventas/:tab` | Pipeline, cotizaciones o bandeja Hoy |
| `/cotizacion-venta/:token` | Cotización pública para aceptar o rechazar |
| `/listas` | Inicio del módulo de listas por área |
| `/listas/:area` | Listas de un área (Taller, Ventas, Administración) |
| `/listas/:area/:listaId` | Lista, registros y vistas |
| `/f/:token` | Formulario público de una lista |
| `/hub` | Panel administrativo (kanban, dashboard, historial, inventario, tecnicos, flotillas, garantias, reciclaje) |
| `/tecnico` | Vista operativa (diagnostico, reparacion, insumos, prueba final) |
| `/cliente` | Tracker, cotizaciones, historial, flotilla, garantias, agenda |
| `/tracker/:orden_id` | Seguimiento publico sin login |
| `/reportes`, `/usuarios` | Reportes y alta/edicion de usuarios (solo admin) |
| `/respaldos` | Respaldo manual de la base (solo admin) |
| `/sistema` | Salud del servidor, cola de envíos de WhatsApp y auditoría (permiso `sistema`) |
| `/settings` | Perfil y cambio de contrasena del usuario activo |

## Estados de la orden

`received -> diagnosing -> quoted -> approved -> in_repair -> testing -> ready -> delivered`

Regla central de negocio: `testing -> in_repair` (si la prueba final falla, la bateria regresa a reparacion y NO puede entregarse sin pasar la prueba).

## Datos demo

Datos semilla precargados (5 tecnicos, 5 clientes, 9 baterias, 10+ insumos, 8 ordenes en distintos estados), cargados en PostgreSQL con `node api/seed.js` (idempotente). Los cambios persisten en la base de datos. `POST /api/reset` vuelve al estado inicial, pero solo si el backend corre con `ALLOW_RESET=1` (nunca en produccion).

## Flujos de ejemplo

1. Admin crea/recibe una bateria > asigna tecnico.
2. Tecnico registra diagnostico (voltaje, resistencia interna, prueba de carga) > se genera cotizacion.
3. Cliente aprueba la cotizacion (o la rechaza, cancelando la orden).
4. Tecnico registra insumos/celdas (el stock se descuenta) > inicia prueba final.
5. Si la prueba falla, regresa a reparacion; si pasa, queda lista.
6. Admin entrega, registra cobro y garantia (meses/ciclos) > la bateria pasa a `en_garantia`.
7. Baterias no reparables se dan de baja con trazabilidad para reciclaje responsable.

> Nota: WhatsApp (Meta Cloud API) y email transaccional ya están integrados. La agenda de
> visitas, CFDI/facturación, pagos y lecturas automáticas del equipo siguen pendientes.
> El detalle y el orden sugerido están en [docs/FUTURO.md](docs/FUTURO.md).

## Servicios

- `bertika-api.service`: HTTP.
- `bertika-worker.service`: outbox de WhatsApp y reintentos.
- `RATE_LIMIT_STORE=postgres`: contadores compartidos entre instancias.
- `GET /api/estado?paginado=1`: bootstrap por páginas; el store une las páginas.

- Adjuntos multipart procesados con `busboy` (`api/upload.js`).

- Almacenamiento local o S3/R2 (`STORAGE_DRIVER`).
