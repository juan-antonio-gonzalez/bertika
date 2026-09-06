# Prompt - Vertika

Usa este prompt para generar una web app navegable en Lovable, Bolt o v0.

---

## Prompt

Desarrolla esta web app:

# Vertika - Sistema de Gestion para Talleres de Baterias Industriales

Aplicacion web para gestionar el ciclo completo de una bateria en el taller: recepcion, diagnostico, cotizacion, reparacion/reacondicionamiento, prueba de carga y entrega al cliente.

Vertika atiende baterias de multiples aplicaciones: **automotrices, autoelevadores (montacargas), ferroviarias (trenes/locomotoras), industriales estacionarias (UPS, plantas, telecom) y marinas.**

La aplicacion debe ser 100% navegable utilizando datos mock en memoria.

En fases posteriores se integrara:

- Supabase para persistencia de datos
- Autenticacion real de usuarios
- Notificaciones WhatsApp automaticas
- Facturacion CFDI
- Pagos online
- Integracion con basculas/equipos de diagnostico (lectura automatica de voltaje y resistencia interna)

## Contexto del negocio

Vertika es el sistema operativo interno de un taller especializado en baterias industriales.

A diferencia de un taller mecanico generico, el "objeto" que fluye por el taller no es un vehiculo sino una **bateria** (o un banco de baterias), que puede pertenecer a un auto particular, a una flotilla de autoelevadores de un cliente corporativo, o a un vagon de tren.

Permite gestionar:

- recepcion e ingreso de baterias
- diagnostico tecnico (voltaje, resistencia interna, prueba de carga, capacidad en Ah)
- cotizacion de reparacion/reacondicionamiento o reemplazo
- ordenes de trabajo y asignacion de tecnicos especializados
- seguimiento de reparaciones y pruebas de carga
- inventario de insumos (celdas, electrolito, bornes, cargadores, EPP)
- historial de baterias y clientes por numero de serie
- gestion de flotillas (clientes con multiples equipos/baterias)
- control de garantia (meses o ciclos de carga)
- trazabilidad de baterias fuera de servicio para reciclaje/disposicion final
- entrega y cobro

Tagline:

`Vertika - Energia bajo control`

La plataforma representa el sistema interno de operacion del taller.

## Objetivo

Implementar el flujo completo de una bateria en el taller para tres roles:

`Admin -> Tecnico -> Cliente`

Flujo operativo:

1. Cliente llega, agenda o solicita recoleccion en planta. Recepcion registra la bateria.
2. Tecnico realiza diagnostico (voltaje, resistencia interna, prueba de carga/descarga) y registra hallazgos con fotos.
3. Sistema genera cotizacion (reparacion, reacondicionamiento o reemplazo). Cliente aprueba.
4. Tecnico ejecuta el servicio (cambio de celdas, relleno de electrolito, limpieza de bornes, recarga profunda) y consume insumos del inventario.
5. Tecnico realiza prueba final de carga y capacidad. Si la bateria no pasa la prueba, regresa a reparacion.
6. Admin revisa y marca la orden como lista.
7. Cliente recibe notificacion. Paga y recoge (o se entrega en planta).
8. Orden se cierra. Historial queda registrado por numero de serie, con garantia activa.

## Requisitos generales

- Todo debe funcionar solo con frontend y estado mock.
- Usar store global reactivo.
- Persistir datos en `localStorage`.
- Incluir boton de reset para volver al estado inicial de demo.
- Validar transiciones de estado.
- Mostrar feedback visual con toast en acciones importantes.
- Diseno responsive mobile y desktop (los tecnicos suelen operar desde tablet/celular en piso de taller).
- Interfaz moderna, limpia y operativa. Estilo industrial/tecnico: fondo oscuro tipo grafito, acentos en amarillo-ambar (energia/carga) y naranja de seguridad para alertas y estados criticos.
- Iconografia orientada a energia/electricidad (rayo, bateria, voltimetro) en vez de iconografia automotriz generica.

## Rutas obligatorias

### `/`

Landing publica del taller.

Debe mostrar:

- nombre del negocio
- lineas de servicio segmentadas por aplicacion (Automotriz, Autoelevadores, Ferroviario, Industrial/UPS, Marino)
- descripcion breve del proceso (diagnostico -> cotizacion -> reparacion -> entrega)
- sello de confianza: años de experiencia, certificaciones, manejo responsable de residuos (reciclaje de plomo/acido)
- boton agendar / solicitar recoleccion en planta

### `/auth`

Pantalla de login mock.

Debe permitir entrar como:

- Admin
- Tecnico
- Cliente

### `/home`

Redireccion automatica segun rol.

| Rol | Redireccion |
| --- | --- |
| Admin | `/hub` |
| Tecnico | `/tecnico` |
| Cliente | `/cliente` |

### `/hub`

Panel administrativo del taller.

Funciones:

- ver todas las ordenes activas
- ver ordenes del dia (kanban por estado)
- gestionar tecnicos
- gestionar inventario de insumos y celdas
- crear orden manual
- ver historial de baterias por numero de serie
- gestionar clientes y sus flotillas (multiples baterias/equipos por cliente corporativo)
- dashboard de ingresos del dia
- panel de garantias activas y proximas a vencer
- panel de baterias dadas de baja / pendientes de reciclaje

### `/tecnico`

Aplicacion operativa para tecnicos.

Permite:

- ver ordenes asignadas
- registrar diagnostico con lecturas (voltaje, resistencia interna, resultado de prueba de carga) y notas
- marcar inicio de reparacion/reacondicionamiento
- registrar insumos y celdas utilizadas
- ejecutar y registrar resultado de la prueba final de carga/capacidad
- marcar reparacion completada

### `/cliente`

Vista del cliente.

Permite:

- ver estado actual de su bateria/equipo (tipo "rastreo de paquete")
- ver cotizacion y aprobarla
- ver historial de servicios por numero de serie
- ver sus equipos/flotilla registrada (si es cliente corporativo)
- ver garantia vigente de cada bateria
- agendar proxima visita o mantenimiento preventivo

### `/tracker/:orden_id`

Vista publica de seguimiento (sin login).

Muestra:

- estado actual de la bateria con barra de progreso visual
- tipo de equipo / numero de serie
- ultimo evento registrado
- hora estimada de entrega

### `/settings`

Configuracion de perfil.

Incluye:

- nombre
- rol
- informacion basica

## Sistema de roles

### Admin

Acceso completo al sistema. Responsable de la operacion comercial y de la relacion con clientes corporativos (flotillas).

Puede:

- ver y gestionar todas las ordenes
- asignar tecnicos segun especialidad (plomo-acido, litio, ferroviario, industrial pesado)
- gestionar inventario de insumos y celdas
- ver reportes de ingresos y garantias
- cerrar ordenes y registrar cobro
- dar de baja baterias y marcarlas para reciclaje

### Tecnico

Acceso limitado a lo operativo en piso de taller. Requiere que el sistema sea rapido de usar con guantes/en movimiento.

Puede:

- ordenes asignadas
- registro de diagnostico tecnico (mediciones)
- ejecucion de la reparacion/reacondicionamiento
- consumo de insumos y celdas
- registro de prueba final de carga/capacidad

### Cliente

Puede ser un particular (una bateria de auto) o una empresa con flotilla (decenas de autoelevadores o un parque vehicular).

Acceso a:

- estado en tiempo real de su bateria/equipo
- aprobar o rechazar cotizacion
- historial de servicios por numero de serie
- vigencia de garantia
- vista consolidada de flotilla (si aplica)

## Estructura de datos

El sistema debe manejar estado global para:

- ordenes de trabajo
- baterias
- clientes
- tecnicos
- insumos y celdas (inventario)
- eventos por orden

Todos los datos iniciales deben generarse como mock data en memoria.

Persistencia mock usando:

- `localStorage`

## Entidades principales

### Ordenes de trabajo

Cada orden incluye:

- id
- bateria (numero de serie, tipo, voltaje, capacidad, aplicacion/equipo)
- cliente
- tecnico asignado
- motivo de ingreso / falla reportada por el cliente
- diagnostico tecnico (voltaje medido, resistencia interna, resultado de prueba de carga, notas)
- lista de servicios a realizar
- insumos/celdas utilizados
- cotizacion (monto total)
- estado_cotizacion: `pending` | `approved` | `rejected`
- estado: ver estados de orden
- resultado de prueba final: `pending` | `passed` | `failed`
- eventos (historial)
- fecha de ingreso
- hora estimada de entrega
- monto final cobrado
- garantia otorgada (meses y/o ciclos de carga)

### Baterias

Informacion de cada bateria:

- id
- numero de serie
- tipo: `Plomo-Acido` | `AGM` | `Gel` | `Litio (Ion-Litio)` | `Ni-Cd`
- voltaje (6V, 12V, 24V, 36V, 48V, 72V, etc.)
- capacidad (Ah)
- aplicacion/equipo: `Automotriz` | `Autoelevador` | `Ferroviario` | `Industrial/UPS` | `Marino`
- marca y modelo
- fecha de fabricacion
- cliente_id
- equipo asociado (ej. "Montacargas Toyota 8FGU25 - Unidad 4", "Locomotora GE ES44 - Banco 2")
- historial de ordenes
- ciclos de carga estimados
- estado de vida util: `activa` | `en_garantia` | `dada_de_baja`

### Clientes

Informacion de cada cliente:

- id
- nombre / razon social
- tipo: `particular` | `flotilla_corporativa`
- telefono
- contacto (para clientes corporativos)
- baterias/equipos registrados

### Tecnicos

Informacion de cada tecnico:

- id
- nombre
- especialidad: `Plomo-Acido` | `Litio / Ion-Litio` | `Ferroviario` | `Industrial Pesado`
- certificaciones (ej. manejo de materiales peligrosos, alta tension)
- activo

### Insumos y celdas (Inventario)

Cada insumo incluye:

- id
- nombre
- stock disponible
- precio unitario
- categoria: `Celdas` | `Electrolito` | `Bornes y Conectores` | `Cargadores` | `Cables` | `EPP y Seguridad`

## Estados de la orden

Estados posibles:

- `received` - Bateria ingresada al taller
- `diagnosing` - Tecnico realizando diagnostico
- `quoted` - Cotizacion enviada al cliente
- `approved` - Cliente aprobo la cotizacion
- `in_repair` - Reparacion/reacondicionamiento en proceso
- `testing` - Prueba final de carga y capacidad
- `ready` - Bateria lista para entregar
- `delivered` - Bateria entregada y cobrada
- `cancelled` - Orden cancelada

## Transiciones de estado

Transiciones validas:

- `received -> diagnosing`
- `diagnosing -> quoted`
- `quoted -> approved` (accion del cliente)
- `quoted -> cancelled` (cliente rechaza)
- `approved -> in_repair`
- `in_repair -> testing`
- `testing -> ready` (prueba aprobada)
- `testing -> in_repair` (prueba fallida, regresa a reparacion)
- `ready -> delivered`
- `received -> cancelled`

Transiciones invalidas deben bloquearse y mostrar toast de error.

Esta ultima regla (`testing -> in_repair`) es central del negocio: una bateria no puede entregarse sin pasar la prueba de carga/capacidad final.

## Eventos de orden

Cada orden mantiene historial de eventos con timestamp:

- bateria ingresada
- diagnostico registrado (con lecturas de voltaje/resistencia)
- cotizacion enviada
- cotizacion aprobada / rechazada
- reparacion iniciada
- insumo/celda utilizado (nombre + cantidad)
- prueba de carga iniciada
- resultado de prueba (aprobada / fallida, con lectura de capacidad)
- reparacion completada
- bateria entregada

## Modulo cliente (`/cliente`)

### Tracker de bateria

Vista principal: barra de progreso visual con los pasos del flujo.

```
Recibida -> Diagnostico -> Cotizacion -> En reparacion -> Prueba final -> Lista -> Entregada
```

Cada paso muestra:

- icono del estado
- fecha/hora del evento
- descripcion breve

### Cotizacion

Cuando el estado es `quoted`:

- Mostrar lista de servicios e insumos/celdas
- Mostrar monto total
- Boton: Aprobar cotizacion
- Boton: Rechazar cotizacion

### Historial

Lista de servicios pasados por numero de serie.

Incluye:

- descripcion del servicio
- tecnico
- fecha
- monto cobrado
- garantia otorgada y vigencia

### Vista de flotilla (clientes corporativos)

Para clientes tipo `flotilla_corporativa`:

- listado de todos los equipos/baterias registrados
- estado actual de cada uno
- alertas de baterias con garantia por vencer o con baja capacidad detectada

## Modulo tecnico (`/tecnico`)

El tecnico ve solo sus ordenes asignadas.

### Lista de ordenes

Filtros:

- Activas
- Completadas

Cada orden incluye:

- numero de serie + tipo/aplicacion de bateria
- falla reportada
- estado actual

### Acciones disponibles segun estado

- Iniciar diagnostico: `received -> diagnosing`
- Registrar lecturas (voltaje, resistencia interna) y generar cotizacion: `diagnosing -> quoted`
- Iniciar reparacion: `approved -> in_repair`
- Registrar insumos/celdas utilizadas (descontar del inventario)
- Iniciar y registrar resultado de prueba final: `in_repair -> testing`, luego `testing -> ready` o `testing -> in_repair`

### Registro de insumos y celdas

Al marcar insumos utilizados:

- Selector de insumo del inventario
- Cantidad utilizada
- El stock se descuenta en tiempo real
- Se agrega al evento de la orden

### Registro de prueba final

Formulario simple con:

- capacidad medida (Ah) vs capacidad nominal
- resultado: aprobada / fallida
- notas tecnicas

## Modulo admin (`/hub`)

Panel operativo completo.

### Kanban de ordenes

Columnas por estado:

- Recibidas
- Diagnosticando
- Cotizadas
- En reparacion
- Prueba final
- Listas
- Entregadas

Cada card muestra:

- numero de serie + tipo de bateria/equipo
- cliente
- tecnico asignado
- hora de ingreso
- monto cotizado (si aplica)

### Dashboard del dia

Metricas en tiempo real:

- baterias activas en taller
- ordenes cerradas hoy
- ingresos del dia
- insumos/celdas con stock bajo (menos de 3 unidades)
- baterias con prueba final fallida pendientes de reproceso
- garantias por vencer en los proximos 30 dias

### Gestion de inventario

Tabla de insumos con:

- nombre
- stock actual
- precio
- categoria
- boton agregar stock

### Historial por numero de serie

Buscar numero de serie -> ver todas las ordenes historicas de la bateria.

### Gestion de clientes y flotillas

Vista de clientes corporativos con el listado completo de equipos/baterias asociados y su estado.

### Asignar tecnico

Desde cualquier orden en estado `received` o `diagnosing`, el admin puede asignar o reasignar tecnico segun especialidad requerida (ej. una bateria ferroviaria debe asignarse a un tecnico con especialidad `Ferroviario`).

### Baterias dadas de baja / reciclaje

Listado de baterias marcadas como `dada_de_baja` (no reparables), con registro de fecha de baja para trazabilidad de disposicion final responsable (plomo-acido es material peligroso regulado).

## Reglas de negocio

- Una orden debe tener bateria, cliente y motivo de ingreso para crearse.
- La cotizacion debe ser aprobada por el cliente antes de iniciar la reparacion.
- Solo se pueden registrar insumos/celdas si hay stock disponible.
- El stock se descuenta en tiempo real al registrar un insumo.
- La orden solo puede marcarse como `ready` si paso por `testing` con resultado aprobado.
- Si la prueba final falla, la orden regresa automaticamente a `in_repair` y se registra el evento.
- Un tecnico solo deberia poder ser asignado a ordenes que coincidan con su especialidad (validacion soft: mostrar advertencia si no coincide, no bloquear).
- El tracker publico (`/tracker/:orden_id`) es accesible sin login.
- Toda bateria dada de baja debe quedar trazable con fecha, para fines de disposicion responsable.

## Datos mock iniciales

Taller:

`Vertika Demo - Taller de Baterias Industriales`

### Tecnicos

- `tec_01` - Carlos Ruiz (Plomo-Acido)
- `tec_02` - Luis Hernandez (Litio / Ion-Litio)
- `tec_03` - Andres Morales (Industrial Pesado)
- `tec_04` - Sofia Ramirez (Ferroviario)

### Clientes

- `cli_01` - Juan Garcia | Particular | Tel: 5512345678
- `cli_02` - Maria Lopez | Particular | Tel: 5598765432
- `cli_03` - Logistica del Valle S.A. de C.V. | Flotilla corporativa (autoelevadores) | Tel: 5567891234
- `cli_04` - Ferrocarriles del Norte | Flotilla corporativa (ferroviario) | Tel: 5543219876

### Baterias / Equipos

- Serie `BAT-AUT-001` - AGM 12V 60Ah - Auto Nissan Sentra - Juan Garcia
- Serie `BAT-AUT-002` - Plomo-Acido 12V 45Ah - Auto Toyota Corolla - Maria Lopez
- Serie `BAT-MTC-101` - Litio 48V 400Ah - Montacargas Toyota 8FGU25 Unidad 4 - Logistica del Valle
- Serie `BAT-MTC-102` - Plomo-Acido 36V 300Ah - Montacargas Hyster Unidad 7 - Logistica del Valle
- Serie `BAT-TRN-201` - Ni-Cd 72V 200Ah - Locomotora GE ES44 Banco 2 - Ferrocarriles del Norte

### Inventario inicial

- Celda de repuesto 2V (plomo-acido) | stock: 15 | $650 MXN | Celdas
- Electrolito acido sulfurico (1L) | stock: 20 | $95 MXN | Electrolito
- Borne/terminal universal | stock: 25 | $45 MXN | Bornes y Conectores
- Conector Anderson industrial | stock: 10 | $180 MXN | Bornes y Conectores
- Cargador industrial 24V/48V | stock: 3 | $8,500 MXN | Cargadores
- Cargador de banco ferroviario 72V | stock: 1 | $22,000 MXN | Cargadores
- Cable calibre 2/0 (metro) | stock: 30 | $120 MXN | Cables
- Guantes dielectricos (par) | stock: 6 | $650 MXN | EPP y Seguridad
- Careta facial anti-acido | stock: 4 | $380 MXN | EPP y Seguridad

### Ordenes iniciales

Genera 5 ordenes en distintos estados para que el kanban se vea vivo:

- 1 orden en `received` (bateria automotriz)
- 1 orden en `diagnosing` (bateria de autoelevador)
- 1 orden en `quoted` (bateria automotriz, con cotizacion lista esperando aprobacion)
- 1 orden en `in_repair` (bateria de autoelevador, con celdas ya registradas)
- 1 orden en `testing` (bateria ferroviaria, en prueba final de carga)

## UX

La aplicacion debe incluir:

- barra de progreso visual en el tracker del cliente
- badges de estado con colores consistentes (ambar para activo/en proceso, verde para listo, rojo/naranja de seguridad para prueba fallida o stock critico, gris para cerrado)
- kanban en el hub admin
- feedback con toast en cada transicion
- responsive mobile (en movil el kanban colapsa a lista filtrable)
- cards escaneables con info clave visible sin abrir detalle (numero de serie, tipo, aplicacion, cliente)
- alerta visual cuando el stock de un insumo baja de 3 unidades
- alerta visual cuando una prueba final resulta fallida
- indicador de garantia vigente/vencida en historial de baterias

## Roles y prioridades

### Resumen de roles

| Rol | Enfoque principal | Dispositivo tipico |
| --- | --- | --- |
| Admin | Operacion comercial, asignacion, inventario, reportes, flotillas | Desktop |
| Tecnico | Diagnostico, reparacion, prueba final, consumo de insumos | Tablet / celular en piso de taller |
| Cliente | Seguimiento, aprobacion de cotizacion, historial y garantias | Celular |

### Prioridades de implementacion (MoSCoW)

**P0 - Debe existir (MVP funcional):**

- Flujo completo de estados (`received` -> ... -> `delivered`) incluyendo el ciclo `testing` <-> `in_repair`
- Los tres roles con login mock y navegacion funcional
- Kanban admin y lista de ordenes del tecnico
- Tracker publico sin login
- Cotizacion con aprobacion/rechazo del cliente
- Inventario con descuento de stock en tiempo real
- Datos mock completos, sin pantallas vacias

**P1 - Deberia existir (diferenciadores del negocio de baterias):**

- Gestion de flotillas corporativas (multiples equipos por cliente)
- Registro de lecturas tecnicas (voltaje, resistencia interna, capacidad medida)
- Panel de garantias activas/por vencer
- Validacion soft de especialidad de tecnico al asignar orden
- Alertas de stock bajo y de prueba fallida

**P2 - Podria existir (siguiente iteracion):**

- Trazabilidad de baterias dadas de baja para reciclaje/disposicion responsable
- Reportes historicos por tipo de aplicacion (automotriz vs autoelevador vs ferroviario)
- Mantenimiento preventivo programado para flotillas
- Exportar historial de una bateria a PDF

## Objetivo final

Construir una aplicacion web completamente navegable que permita ejecutar el flujo completo de una bateria industrial en el taller, con tres roles diferenciados, gestion de flotillas corporativas, control de garantia, y un tracker publico accesible sin login, utilizando datos mock en memoria.

## Restricciones tecnicas

- No implementar backend real.
- No depender de APIs externas.
- No dejar pantallas vacias.
- Incluir datos seed y navegacion funcional entre todas las rutas.
- Cualquier accion importante debe reflejarse en la UI inmediatamente.

## Nota importante para la landing

Para elevar la calidad visual de la landing, prioriza generar imagenes propias con modelos de Gemini cuando la herramienta lo permita, especialmente para hero sections, mockups conceptuales y escenas de taller de baterias industriales: bancos de baterias, autoelevadores en carga, tecnicos con EPP realizando mantenimiento, primeros planos de celdas y cargadores industriales.

Si no es viable generar imagenes dentro del flujo, usar una libreria externa como Pexels para poblar la landing con fotos consistentes de talleres industriales, baterias, montacargas, trenes de carga y equipo electrico.

La landing no debe depender solo de bloques de color o placeholders genericos. Necesita apoyo visual real desde la primera version, y debe transmitir seriedad tecnica e industrial (no un taller mecanico generico).
