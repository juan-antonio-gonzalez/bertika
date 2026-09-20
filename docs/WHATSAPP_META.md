# Conectar WhatsApp (Meta) a Bertika — guía paso a paso

Esta guía es para hacerla con el navegador, sin conocimientos técnicos. Son unos 20 minutos.
**No hace falta tocar el WhatsApp del teléfono**: arrancamos con el *número de prueba* que Meta regala.

## Palabras raras, en criollo

| Palabra | Qué es |
| --- | --- |
| **App** (en Meta for Developers) | La "llave técnica" del sistema. No se baja al teléfono. |
| **Token** | La contraseña que usa Bertika para mandar mensajes en tu nombre. |
| **Phone number ID** | El número interno de tu línea dentro de Meta. |
| **WABA ID** | El ID de tu cuenta de WhatsApp Business dentro de Meta. |
| **App Secret** | Una clave secreta de la app, sirve para comprobar que los avisos vienen de Meta y no de un impostor. |
| **Webhook** | La dirección a la que Meta le avisa a Bertika "llegó un mensaje nuevo". |
| **Plantilla** | Un mensaje preaprobado por Meta. Es la única forma de iniciar una conversación vos. |
| **Ventana de 24 h** | Si el cliente te escribió, durante 24 h podés responderle libremente (y no se cobra). Pasado ese tiempo, solo con plantilla. |

---

## Paso 1 — Crear la app técnica (3 min)

1. Entrá a <https://developers.facebook.com/apps/> con la cuenta de Meta Business.
2. Botón **Crear app**.
3. Tipo de app: **Business** (Negocios) → Siguiente.
4. Nombre: `Bertika WhatsApp`. Cuenta de Meta Business: elegí la tuya. → **Crear app**.
5. Te va a pedir la contraseña de Facebook para confirmar: ponela.

## Paso 2 — Agregar el producto WhatsApp (3 min)

1. En el panel de la app, buscá **WhatsApp** y tocá **Configurar** (Set up).
2. Se abre la pantalla **API Setup**. Ahí vas a ver y anotar (o copiar):
   - **From / Número de prueba** → es el número de Meta con el que vamos a probar.
   - **Phone number ID** → copialo.
   - **WhatsApp Business Account ID** (WABA ID) → copialo.
   - **Temporary access token** (token temporal, dura 24 h) → copialo. Sirve para probar hoy; después lo cambiamos por uno permanente (Paso 6).
3. En **To**, agregá hasta **5 números destinatarios autorizados**: tu celular, el del taller y los que quieras.
   A cada número Meta le manda un código; hay que confirmarlo.

## Paso 3 — Probar que anda (1 min)

1. En esa misma pantalla hay un botón para **enviar un mensaje de prueba**. Mandá "hola" a tu número.
2. Si te llega por WhatsApp, el canal funciona. (Todavía no sale desde Bertika: eso es el Paso 4 y 5.)

## Paso 4 — Cargar las claves en el servidor (2 min)

En la carpeta del proyecto, en la Terminal:

```bash
bash scripts/whatsapp-env.sh
```

El script te va a pedir **5 datos** y los guarda en el servidor (y en el Llavero de tu Mac). Nada queda escrito en este chat ni en el repositorio.

| Lo que te pide | De dónde sale |
| --- | --- |
| `WHATSAPP_TOKEN` | El token del Paso 2 (por ahora el temporal). |
| `WHATSAPP_PHONE_ID` | El **Phone number ID** del Paso 2. |
| `WHATSAPP_WABA_ID` | El **WABA ID** del Paso 2. |
| `WHATSAPP_VERIFY_TOKEN` | **Inventá una frase**, por ejemplo `bertika-2026-verificacion`. La vas a pegar también en Meta (Paso 5). |
| `WHATSAPP_APP_SECRET` | Meta: **Configuración de la app → Básica → Clave secreta de la app → Mostrar**. |

Al terminar reinicia el servicio solo. Después entrá al panel: **Hub → pestaña WhatsApp** y tiene que decir **Conectado**.

## Paso 5 — Decirle a Meta dónde avisar (2 min)

1. En Meta: **WhatsApp → Configuración (Configuration) → Webhook → Editar**.
2. **URL de devolución de llamada** (*Callback URL*):
   ```
   https://bertika.com/api/whatsapp/webhook
   ```
3. **Token de verificación**: la misma frase que cargaste en `WHATSAPP_VERIFY_TOKEN`.
4. **Verificar y guardar**. Tiene que quedar en **Verificado**.
5. En **Campos del webhook** (*Webhook fields*), activá **messages**.
6. Si da error: casi siempre es que la frase no es idéntica (ojo con los espacios) o que el Paso 4 no se hizo todavía.

## Paso 6 — Token permanente (para que no se venza cada 24 h) (5 min)

1. Entrá a <https://business.facebook.com/settings> → **Usuarios → Usuarios del sistema** → **Agregar**.
   - Nombre: `bertika-api` · Rol: **Empleado** → Crear.
2. Con ese usuario seleccionado: **Agregar activos** → **Apps** → elegí tu app → activá el acceso → Guardar.
3. **Generar token** → elegí tu app → vencimiento **Nunca** → marcá los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management` → **Generar**.
4. Copiá el token (es largo) y volvé a correr:
   ```bash
   bash scripts/whatsapp-env.sh
   ```
   Esta vez pegá ese token como `WHATSAPP_TOKEN` y dejá los otros valores como estaban (el script te muestra qué ya está cargado).

## Paso 7 — Pasar tu número real (cuando ya lo veas funcionando)

Mientras estés en el número de prueba, **solo se puede escribir a los 5 números autorizados**. Para atender clientes reales hay que dar de alta tu número:

1. Meta: **WhatsApp → Números de teléfono → Agregar número de teléfono**.
   - El número **no puede estar en uso en la app de WhatsApp** (ni normal ni Business). Si querés usar el que ya tenés, hay que **borrar la cuenta de la app del teléfono**; los chats viejos quedan en el teléfono como respaldo, no se pasan al sistema.
   - Nombre visible: `Bertika` (Meta lo revisa).
2. **Verificación del negocio**: en Meta Business → **Configuración del negocio → Centro de seguridad** → iniciar la verificación con los papeles de la empresa. Puede tardar unos días; conviene arrancarla en paralelo.
3. **Medio de pago**: en **WhatsApp → Configuración de facturación** cargá una tarjeta. Los mensajes que iniciás vos se cobran por mensaje (centavos de dólar); los que responde el cliente dentro de las 24 h no se cobran.
4. **Plantillas**: para avisos que inicia el taller ("tu batería está lista") hay que crear plantillas y que Meta las apruebe.
   Te dejo los textos listos para copiar en `docs/WHATSAPP_PLANTILLAS.md`.

---

## Problemas frecuentes

| Mensaje | Qué significa | Qué hacer |
| --- | --- | --- |
| *El cliente tiene que escribirnos primero (pasaron más de 24 h)* | Quisiste mandar un mensaje libre fuera de la ventana de 24 h. | Usar una plantilla aprobada (Paso 7.4). |
| *La clave (token) de WhatsApp venció o es inválida* | El token temporal duró 24 h. | Generar el permanente (Paso 6) y recargarlo. |
| *Ese número no puede recibir mensajes* | El número no tiene WhatsApp o está mal escrito. | Revisar el teléfono del cliente. |
| *La plantilla no está aprobada todavía* | Meta está revisando el texto. | Esperar la aprobación o revisar el nombre/idioma. |
| *La firma no coincide* (en los logs del servidor) | El `WHATSAPP_APP_SECRET` no es el de esa app. | Volver a copiarlo (Paso 4) y reintentar. |

## Qué NO cambia
- Tu WhatsApp del teléfono sigue funcionando igual hasta el Paso 7.
- El resto de la plataforma (órdenes, taller, cotizador) funciona aunque el canal esté apagado: si faltan las claves, el panel simplemente muestra "Falta configurar".
