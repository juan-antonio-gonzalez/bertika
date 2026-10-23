# Bertika · Lo que falta (roadmap)

**Actualizado:** 23/10/2026. Este documento tiene **solo los pendientes**. Lo ya implementado
está en [README](../README.md), [INSTRUCTIVO_USO](../INSTRUCTIVO_USO.md) y [API](API.md).

---

## Prioridad 1 — plata rápida

### Recompra por vida útil de la batería
- [ ] Calcular el recambio según la fecha de entrega y el tipo de batería (3–5 años).
- [ ] Crear una tarea o aviso antes del vencimiento, sin mandar mensajes masivos.
- [ ] Medir la tasa de recompra por cliente y por tipo de batería.

**Por qué:** es el ingreso repetido más grande de un taller de baterías.
**Esfuerzo:** bajo. **Primer candidato de la Fase 3.**

### Segmentos y campañas
- [ ] Guardar filtros: flotillas, garantías por vencer, perdidos por precio, clientes inactivos.
- [ ] Enviar campañas con plantilla aprobada y opt-in, con resultado por campaña
      (enviados, respondidos, visitas, ventas).

**Por qué:** venderle a la cartera existente sin hacerlo a mano.
**Esfuerzo:** medio. **Ojo:** respetar las reglas de WhatsApp (plantilla, consentimiento, límites).

---

## Prioridad 2 — caja

### Cobros y facturación
- [ ] Link de pago (MercadoPago u otro) para señar o pagar la cotización.
- [ ] Registrar pagos parciales y saldo pendiente.
- [ ] Cierre de caja por medio de pago (efectivo, transferencia, tarjeta, link).
- [ ] Facturación AFIP, si el volumen lo justifica.

**Por qué:** menos mora, menos planillas y menos diferencias de caja.
**Esfuerzo:** alto (depende de integraciones externas).

---

## Prioridad 3 — cuentas grandes

### Portal de flotillas
- [ ] Usuario para el encargado de flota: baterías, garantías, historial y próximos services.
- [ ] Botón para pedir una visita.
- [ ] Resumen mensual para el que paga la factura.

**Por qué:** fideliza contratos corporativos y diferencia al taller.
**Esfuerzo:** medio-alto.

---

## Prioridad 4 — comodidad

### Email y agenda
- [ ] Enviar cotizaciones y recordatorios por email (el envío ya está instalado).
- [ ] Agendar visitas en Google Calendar o con un archivo ICS.

**Esfuerzo:** medio.

### IA acotada
- [ ] Resumen de un hilo largo de WhatsApp.
- [ ] Respuesta sugerida a partir de las respuestas rápidas.
- [ ] Leer la etiqueta de la batería desde una foto (OCR).

**Por qué:** acelera la atención. **Hacerlo después** de ordenar bien los datos.
**Esfuerzo:** medio.

---

## Infraestructura y seguridad (no es Fase 3, pero falta)

- [ ] **Respaldo fuera del VPS** (S3/R2) y simulacro de restauración mensual.
- [ ] **Monitor externo de uptime** apuntando a `/api/health`.
- [ ] **2FA para admin** y revocación de sesiones a distancia.
- [ ] **Auto-respuesta fuera de horario** (con horario configurable).
- [ ] **Papelera y retención** para el resto de las tablas, y política de datos
      (cuánto se guardan mensajes, auditoría y logs).
- [ ] Limpieza programada de auditoría y logs viejos.

---

## Lo que NO haría todavía

- Sumar Instagram o Messenger antes de estabilizar WhatsApp.
- Un armador genérico de automatizaciones (fácil de romper, difícil de mantener).
- Una app nativa: primero una web que funcione bien en el celular (PWA).
- Multi-sucursal o multi-taller, salvo que haya un plan concreto de abrir otro local.

---

## Orden sugerido

1. **Recompra** (rápido y con retorno directo).
2. **Segmentos y campañas** (se apoya en la recompra y en las etiquetas actuales).
3. **Cobros y facturación** (impacto en caja; requiere integraciones).
4. **Portal de flotillas** (si el negocio depende de cuentas corporativas).
5. **Email, agenda e IA** (comodidad).
6. **Infraestructura y seguridad** en paralelo.

## Cómo elegir

- Si el objetivo es **vender más rápido**: empezar por 1 y 2.
- Si el objetivo es **ordenar la caja**: empezar por 3.
- Si el negocio depende de **flotillas**: hacer 4 antes que 2.
