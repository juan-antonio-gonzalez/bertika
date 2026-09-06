# BateriaOS - Sistema de Gestion para Talleres de Baterias Industriales

Aplicacion web navegable 100% frontend para gestionar el ciclo completo de una bateria en el taller: recepcion, diagnostico, cotizacion, reparacion/reacondicionamiento, prueba de carga y entrega.

**Tagline:** `BateriaOS - Energia bajo control`

## Como ejecutar

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # produccion en dist/
npm run preview  # servir el build
npm run lint     # oxlint
```

## Stack

- Vite + React 19
- Zustand (store global reactivo) con persistencia en `localStorage`
- React Router (rutas SPA)
- CSS propio (grafito + acero ambar), responsive mobile/desktop

## Rutas

| Ruta | Descripcion |
| --- | --- |
| `/` | Landing publica del taller |
| `/auth` | Login mock (Admin / Tecnico / Cliente) |
| `/home` | Redireccion segun rol |
| `/hub` | Panel administrativo (kanban, dashboard, inventario, flotillas, garantias, reciclaje) |
| `/tecnico` | Vista operativa (diagnostico, reparacion, insumos, prueba final) |
| `/cliente` | Tracker, cotizaciones, historial, flotilla, garantias, agenda |
| `/tracker/:orden_id` | Seguimiento publico sin login |
| `/settings` | Perfil del usuario activo |

## Estados de la orden

`received -> diagnosing -> quoted -> approved -> in_repair -> testing -> ready -> delivered`

Regla central de negocio: `testing -> in_repair` (si la prueba final falla, la bateria regresa a reparacion y NO puede entregarse sin pasar la prueba).

## Datos demo

Datos semilla precargados (5 tecnicos, 5 clientes, 9 baterias, 10+ insumos, 8 ordenes en distintos estados). Los cambios persisten en `localStorage` (`bateriaos-db`). Usa el boton **Restablecer demo** para volver al estado inicial.

## Flujos de ejemplo

1. Admin crea/recibe una bateria > asigna tecnico.
2. Tecnico registra diagnostico (voltaje, resistencia interna, prueba de carga) > se genera cotizacion.
3. Cliente aprueba la cotizacion (o la rechaza, cancelando la orden).
4. Tecnico registra insumos/celdas (el stock se descuenta) > inicia prueba final.
5. Si la prueba falla, regresa a reparacion; si pasa, queda lista.
6. Admin entrega, registra cobro y garantia (meses/ciclos) > la bateria pasa a `en_garantia`.
7. Baterias no reparables se dan de baja con trazabilidad para reciclaje responsable.

> Nota: en fases posteriores se integraran Supabase, auth real, WhatsApp, CFDI, pagos y lecturas automaticas de equipo de diagnostico.