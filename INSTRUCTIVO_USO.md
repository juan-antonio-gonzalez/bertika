# Vertika · Manual de uso

Sistema de gestion para taller de baterias industriales. Esta guia explica como
ejecutar la aplicacion, entrar con cada rol y recorrer el flujo completo del taller.

---

## 1. Requisitos y arranque

El proyecto es una app web 100% frontend (Vite + React). No requiere backend ni base de datos:
todos los datos demostrativos viven en el navegador (localStorage).

```bash
# desde la carpeta del proyecto
npm install        # una sola vez
npm run dev        # abre http://localhost:5173/
```

Comandos adicionales:

| Comando | Uso |
| --- | --- |
| `npm run build` | Genera la version de produccion en `dist/` |
| `npm run preview` | Sirve la version de produccion (despues de `build`) |
| `npm run lint` | Revisa el codigo (oxlint) |

---

## 2. Acceso (login simulado)

En `/auth` se elige un rol con un clic — no hay contrasenas reales.

| Rol | Que ofrece | Quien lo usa |
| --- | --- | --- |
| **Admin** | Operacion completa del taller | Recepcionista / administrador |
| **Tecnico** | Trabajo en el piso del taller | Tecnicos (5 disponibles, cada uno con especialidad) |
| **Cliente** | Seguimiento, cotizaciones y garantia | Clientes particulares y flotillas |

Pasos:

1. Entra a `/auth` (boton **Acceder** en la landing).
2. Clic en la tarjeta del rol deseado.
3. Selecciona la persona (Tecnico o Cliente) — o entra directo en el caso de Admin.
4. Aceptado, `/home` te manda a tu panel segun rol:
   - Admin → `/hub`  ·  Tecnico → `/tecnico`  ·  Cliente → `/cliente`

Truco: se puede "cambiar de rol" volviendo a `/auth` en cualquier momento
los datos mostrados son los mismos para todos.

---

## 3. Flujo de negocio (cadena de estados)

Cada bateria que entra al taller genera una **orden de trabajo** que avanza por
esta cadena:

```
Recibida → Diagnostico → Cotizada → Aprobada → En reparacion → Prueba final → Lista → Entregada
```

Reglas importantes:

- **Cotizacion**: si el cliente **rechaza**, la orden se **cancela**.
- **Prueba final fallida**: la bateria **regresa a reparacion** automaticamente.
  NO se puede entregar sin pasar la prueba de carga.
- **Garantia** se otorga al momento de **entregar** (meses y ciclos).
- Las baterias **no reparables** se pueden **dar de baja** con trazabilidad para reciclaje.

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
| **Kanban** | Tablero con las 8 columnas de estado. Arrastra visualmente el estado de cada orden; abre detalles con clic. KPIs arriba (ordenes recibidas, en piso, listas, garantias por vencer, tecnicos activos). |
| **Dashboard** | Indicadores globales del taller. |
| **Historial** | Todas las ordenes (abiertas y cerradas). |
| **Inventario** | Stock de insumos con valorizacion; **agregar stock** a cada insumo. El stock se descuenta en tiempo real cuando un tecnico registra un insumo. |
| **Tecnicos** | Catalogo de tecnicos, especialidad, certificaciones y carga de trabajo. |
| **Flotillas** | Baterias activas de clientes corporativos + estado de garantia. |
| **Garantias** | Tabla de garantias vigentes y por vencer. |
| **Baja / reciclaje** | Baterias dadas de baja con motivo y disposicion; trazabilidad para reciclaje responsable. |

### Crear orden de trabajo

1. Pestaña **Kanban** → boton **+ Crear orden de trabajo**.
2. Escribe el **numero de serie**:
   - Si la bateria **ya existe**: el sistema la reconoce y solo pides cliente y falla.
   - Si es **serie nueva**: registra tipo, voltaje, capacidad (Ah), aplicacion, marca, modelo y equipo.
3. Selecciona **cliente** y escribe la **falla reportada**.
4. **Crear orden de trabajo** → la bateria aparece en la columna **Recibida**.

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

1. Abre una orden en estado **Recibida** → pestaña **Acciones admin** → **Dar de baja**.
2. Indica el motivo y confirma. La bateria queda `dada_de_baja` y aparece en **Baja / reciclaje**.

---

## 5. Vista operativa del tecnico (`/tecnico`)

Muestra las ordenes activas con su estado. Con el boton **Diagnosticar / Detalle** se abre la orden con 3 pestañas: **Orden**, **Trabajo** y **Eventos**.

Trabajo dentro de cada etapa:

| Estado de la orden | Que hace el tecnico |
| --- | --- |
| **Recibida / Diagnostico** | Llena voltaje (V), resistencia interna (mOhm), **prueba de carga** (aprobada/fallida), tipo de servicio a cotizar y notas tecnicas → **Guardar diagnostico y generar cotizacion**. |
| **Cotizada** | Puede ajustar la cotizacion (servicios, insumos, otros) mientras el cliente no haya respondido. |
| **Aprobada** | **Iniciar reparacion**. |
| **En reparacion** | Registra **insumos/celdas** usados (filtra por categoria, el stock se descuenta). Al terminar, **Iniciar prueba final de carga**. |
| **Prueba final** | Registra **capacidad medida (Ah)** y resultado **Aprobada/Fallida**. Si falla, la orden regresa a reaparacion automaticamente. |

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
| **Agenda** | Agendar proxima visita o mantenimiento (simulado). |

---

## 7. Seguimiento publico (`/tracker/:orden_id`)

Cualquier persona con el enlace puede ver el avance sin iniciar sesion
(ideal para compartir por WhatsApp). Ejemplo:

```
http://localhost:5173/tracker/ord_01
```

Prueba con las ordenes de ejemplo: `ord_01` … `ord_08`.

---

## 8. Settings (`/settings`)

- Muestra el **usuario activo** (rol, especialidad o cliente).
- Algunas acciones permiten **Restablecer demo** (limpia cambios y vuelve a los datos de inicio).

---

## 9. Datos de ejemplo incluidos

- **5 tecnicos** con especialidades: Plomo-Acido, Litio, Industrial Pesado, Ferroviario.
- **5 clientes**: 2 particulares y 3 flotillas corporativas.
- **9 baterias** en distintas aplicaciones: Automotriz, Autoelevador, Ferroviario, Industrial/UPS, Marino.
- **8 ordenes** en todos los estados (Recibida, Diagnostico, Cotizada, En reparacion, Prueba final, Lista, Entregadas).
- **11 insumos** con stock inicial.

> Los cambios que hagas se persisten en el navegador (localStorage, clave `vertika-db`).
> Usa **Restablecer demo** para volver al estado inicial cuando quieras.

---

## 10. Notas y limites de la demo

- El login es **simulado** (sin backend ni seguridad real).
- La agenda y el envio de cotizaciones son **simulados** (no envian correos/WhatsApp).
- La persistencia es local: al borrar datos del navegador, la app vuelve al estado de fábrica.
- Fases futuras previstas: Supabase (auth real + datos en la nube), WhatsApp/email, CFDI/facturacion, pagos y lecturas automaticas del equipo de diagnostico.