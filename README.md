# Bertika - Sistema de Gestion para Talleres de Baterias Industriales

Aplicacion web para gestionar el ciclo completo de una bateria en el taller: recepcion, diagnostico, cotizacion, reparacion/reacondicionamiento, prueba de carga y entrega.

**Tagline:** `Bertika - Energia bajo control`

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
```

Los tests de integración levantan la API, usan un **Meta simulado** (no gastan mensajes)
y cubren login, permisos, auditoría, outbox con reintentos, export CSV y webhook. En GitHub
Actions corre todo (`.github/workflows/ci.yml`) con un servicio PostgreSQL 16.

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

## Stack

- Frontend: Vite + React 19, Zustand (store global reactivo) con persistencia en `localStorage`, React Router (rutas SPA), CSS propio.
- Backend: Express + PostgreSQL en `api/` (auth JWT, RBAC, ordenes, insumos, bajas, uploads).
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