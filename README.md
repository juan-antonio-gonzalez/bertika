# Bertika - Sistema de Gestion para Talleres de Baterias Industriales

Aplicacion web para gestionar el ciclo completo de una bateria en el taller: recepcion, diagnostico, cotizacion, reparacion/reacondicionamiento, prueba de carga y entrega.

**Tagline:** `Bertika - Energia bajo control`

## Como ejecutar

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # produccion en dist/
npm run preview  # servir el build
npx oxlint       # lint
```

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

> Nota: en fases posteriores se integraran WhatsApp/email transaccionales, CFDI, pagos y lecturas automaticas de equipo de diagnostico.