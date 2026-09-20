# Plantillas de WhatsApp — textos listos para cargar en Meta

Las **plantillas** son mensajes preaprobados por Meta y son la única forma de
**iniciar** una conversación (o de escribir después de 24 h sin respuesta del
cliente). Se cargan en Meta: **WhatsApp → Plantillas de mensajes → Crear
plantilla**.

Recomendaciones para que las aprueben rápido y no las reclasifiquen:

- Categoría: **Utilidad** (Utility). Nada de promociones ni descuentos acá: si
  Meta lo lee como publicidad, lo pasa a *Marketing* y sale más caro.
- Idioma: **Español (Argentina) / es_AR**.
- Los `{{1}}`, `{{2}}` son variables que completa Bertika al enviar.
- No prometer plazos ni precios que no estén en la orden.
- En cada casilla de "muestra" (sample) poner un valor de ejemplo.

---

## 1. `bateria_recibida` — Ingreso al taller

**Cuerpo:**
```
Hola {{1}}, recibimos tu batería {{2}} en el taller Bertika. Podés seguir el avance en tiempo real acá: {{3}}
```
**Muestras:** `{{1}}` = Juan · `{{2}}` = BAT-AUT-001 · `{{3}}` = https://bertika.com/seguimiento

## 2. `cotizacion_lista` — Presupuesto para aprobar

**Cuerpo:**
```
Hola {{1}}, ya está listo el presupuesto para tu batería {{2}}. Podés verlo y aprobarlo desde este enlace: {{3}}
```
**Muestras:** `{{1}}` = Juan · `{{2}}` = BAT-AUT-001 · `{{3}}` = https://bertika.com/cotizacion/ord_01?t=…

## 3. `bateria_lista` — Lista para retirar (la más útil)

**Cuerpo:**
```
Hola {{1}}, tu batería {{2}} pasó la prueba final y está lista para retirar. Te esperamos en el taller. Cualquier consulta respondé este mensaje.
```
**Muestras:** `{{1}}` = Juan · `{{2}}` = BAT-AUT-001

## 4. `garantia_por_vencer` — Aviso de garantía

**Cuerpo:**
```
Hola {{1}}, te escribimos del taller Bertika: la garantía de tu batería {{2}} vence el {{3}}. Si querés, coordinamos una revisión preventiva.
```
**Muestras:** `{{1}}` = Juan · `{{2}}` = BAT-AUT-001 · `{{3}}` = 15/03/2027

## 5. `visita_coordinada` — Cotizador de visitas (opcional)

**Cuerpo:**
```
Hola {{1}}, recibimos tu pedido de visita técnica a {{2}} km. Un vendedor te contacta para confirmar la fecha. Estimación enviada: {{3}}
```
**Muestras:** `{{1}}` = Juan · `{{2}}` = 60 · `{{3}}` = CV-000123

---

## Cuándo se usa cada una (automático)

| Evento del taller | Plantilla | Cuándo |
| --- | --- | --- |
| Se crea la orden | `bateria_recibida` | Al ingresar la batería |
| El técnico genera la cotización | `cotizacion_lista` | Al quedar en estado *Cotizada* |
| La prueba final se aprueba | `bateria_lista` | Al quedar en estado *Lista* |
| 30 días antes del vencimiento | `garantia_por_vencer` | Tarea diaria |
| Se pide una visita desde el cotizador | `visita_coordinada` | Al guardar la estimación |

> Mientras una plantilla no esté aprobada, el sistema avisa con un error claro
> ("La plantilla no está aprobada todavía") y no rompe nada: el aviso queda
> registrado como error en la bandeja.
