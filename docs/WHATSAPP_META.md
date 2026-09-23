# Conectar WhatsApp (Meta) a Bertika — guía paso a paso

Esta guía es para hacerla con el navegador, sin conocimientos técnicos. Son unos 15 minutos.
**No hace falta tocar el WhatsApp del teléfono**: arrancamos con el *número de prueba* que Meta regala.

Casi todo el trámite técnico lo hace un script por vos. Vos solo tenés que
**copiar 3 datos** de una pantalla de Meta y correr **1 comando**.

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
2. Se abre la pantalla **API Setup** (también llegás directo con
   `https://developers.facebook.com/apps/<App ID>/whatsapp-business/wa-dev-console/`).
   De ahí vas a **copiar 3 cosas** y anotar 1:
   - **Temporary access token** (token temporal, dura 24 h) → copialo. Sirve para probar hoy; después lo cambiamos por uno permanente (Paso 5).
   - **Phone number ID** → copialo.
   - **App Secret**: está en **Configuración de la app → Básica → Clave secreta de la app → Mostrar** → copialo.
   - El **App ID** y el **Business ID** son los números que aparecen en la dirección
     del navegador (`/apps/<App ID>/…` y `business_id=<Business ID>`). No son secretos.
3. En **To**, agregá hasta **5 números destinatarios autorizados**: tu celular, el del taller y los que quieras.
   A cada número Meta le manda un código; hay que confirmarlo.
4. En **From** podés probar con el botón de mensaje de prueba para ver que el número anda.

> El **WABA ID** y el **Phone number ID** ya no hace falta buscarlos: si los dejás
> vacíos, el script los averigua solo con el token.

### Cómo sacar el token (la parte que se complica)

El token **no es la clave de la app**: la clave de la app (la que tiene un palito
`|` en el medio y es corta) sirve para leer datos de la app, pero Meta **no deja**
mandar ni recibir mensajes con ella. Hace falta una **clave de usuario**, que es
larga y empieza con `EAA`. La forma más estable de sacarla:

1. Entrá a <https://developers.facebook.com/tools/explorer/> (Explorador de la API Graph).
2. Arriba a la derecha, en **Aplicación de Meta**, elegí tu app (`Bertika Mensajeria`).
3. Al lado, en **Permisos**, marcá estos tres:
   - `whatsapp_business_messaging` (mandar y recibir mensajes)
   - `whatsapp_business_management` (ver la cuenta de WhatsApp)
   - `business_management` (que el script pueda encontrar la cuenta solo)
4. Botón **Generar token de acceso** → aparece un aviso → **Continuar**.
5. Copiá el texto largo de la caja. **Ese** es el token.

Ese token dura 1-2 horas: alcanza para dejar todo funcionando hoy. Para el que no
vence nunca, ver el Paso 5.

## Paso 3 — Un solo comando (2 min)

En la carpeta del proyecto, en la Terminal:

```bash
bash scripts/whatsapp-env.sh
```

Te va a pedir los datos (el token y el App Secret son **invisibles** mientras los
pegás: es normal). Nada queda escrito en el chat ni en el repositorio.

| Lo que te pide | De dónde sale |
| --- | --- |
| `WHATSAPP_APP_ID` | Viene puesto: apretá Enter. |
| `WHATSAPP_BUSINESS_ID` | Viene puesto: apretá Enter. |
| `WHATSAPP_TOKEN` | El *Temporary access token* del Paso 2 (por ahora el temporal). |
| `WHATSAPP_PHONE_ID` | El **Phone number ID** del Paso 2. |
| `WHATSAPP_WABA_ID` | Enter (lo busca solo). |
| `WHATSAPP_VERIFY_TOKEN` | Enter (lo genera solo; no hace falta que lo anotes). |
| `WHATSAPP_APP_SECRET` | La *Clave secreta de la app* del Paso 2. |
| `WHATSAPP_API_VERSION` | Enter. |

Si ya habías cargado algo, **dejar vacío no lo borra**: se conserva lo que estaba.

El mismo script, al terminar, hace todo esto contra Meta (no lo tenés que hacer a mano):

1. revisa que el token sirva;
2. averigua la cuenta (WABA) y el número;
3. le avisa a Meta que la app atiende esa cuenta (**sin esto no llega ningún mensaje**);
4. configura la dirección de avisos (webhook) `https://bertika.com/api/whatsapp/webhook` y la deja **verificada**;
5. reinicia el servicio y prueba la puerta de entrada.

Vas a ver un resumen con `OK` en cada punto. Si querés además recibir un mensaje
de prueba:

```bash
bash scripts/whatsapp-activar.sh 11 5555-0101
```

(Ese mismo script se puede volver a correr cuando quieras: no rompe nada, revisa
todo de nuevo.)

> **Si el punto 4 del script falla** (Meta rechaza el webhook), se puede hacer a mano
> en 1 minuto: Meta → **WhatsApp → Configuración (Configuration) → Webhook → Editar** →
> **URL de devolución de llamada**: `https://bertika.com/api/whatsapp/webhook` →
> **Token de verificación**: la frase que quedó guardada, la podés ver con este comando
> en la Terminal (queda solo en tu pantalla, no se comparte):
> `security find-generic-password -s bertika -a whatsapp-verify-token -w`
> → **Verificar y guardar**, y en **Campos del webhook** activá **messages**.

## Paso 4 — Verlo en el panel

1. Entrá a Bertika → **Hub → pestaña WhatsApp**. Tiene que decir **Conectado**.
2. En "Enviar prueba" poné tu número y mandá un mensaje.
3. Escribile al número de prueba de Meta desde tu celular: la conversación
   aparece sola en la bandeja, y desde ahí le podés contestar.

## Paso 5 — Token permanente (para que no se venza cada 24 h) (5 min)

1. Entrá a <https://business.facebook.com/settings> → **Usuarios → Usuarios del sistema** → **Agregar**.
   - Nombre: `bertika-api` · Rol: **Empleado** → Crear.
2. Con ese usuario seleccionado: **Agregar activos** → **Apps** → elegí tu app → activá el acceso → Guardar.
3. **Generar token** → elegí tu app → vencimiento **Nunca** → marcá los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management` → **Generar**.
4. Copiá el token (es largo) y volvé a correr:
   ```bash
   bash scripts/whatsapp-env.sh
   ```
   Esta vez pegá ese token como `WHATSAPP_TOKEN` y **apretá Enter en todo lo demás**.

## Paso 6 — Pasar tu número real (cuando ya lo veas funcionando)

Mientras estés en el número de prueba, **solo se puede escribir a los 5 números autorizados**. Para atender clientes reales hay que dar de alta tu número:

1. Meta: **WhatsApp → Números de teléfono → Agregar número de teléfono**.
   - El número **no puede estar en uso en la app de WhatsApp** (ni normal ni Business). Si querés usar el que ya tenés, hay que **borrar la cuenta de la app del teléfono**; los chats viejos quedan en el teléfono como respaldo, no se pasan al sistema.
   - Nombre visible: `Bertika` (Meta lo revisa).
2. Después de agregarlo, corré otra vez:
   ```bash
   bash scripts/whatsapp-activar.sh
   ```
   El script detecta el número nuevo, lo guarda y lo deja andando.
3. **Verificación del negocio**: en Meta Business → **Configuración del negocio → Centro de seguridad** → iniciar la verificación con los papeles de la empresa. Puede tardar unos días; conviene arrancarla en paralelo.
4. **Medio de pago**: en **WhatsApp → Configuración de facturación** cargá una tarjeta. Los mensajes que iniciás vos se cobran por mensaje (centavos de dólar); los que responde el cliente dentro de las 24 h no se cobran.
5. **Plantillas**: para avisos que inicia el taller ("tu batería está lista") hay que crear plantillas y que Meta las apruebe.
   Te dejo los textos listos para copiar en `docs/WHATSAPP_PLANTILLAS.md`.

---

## Problemas frecuentes

| Mensaje | Qué significa | Qué hacer |
| --- | --- | --- |
| *Esa clave es la de la APLICACIÓN, no la de WhatsApp Business* | Pegaste la clave de la app (corta, con un palito `\|` en el medio). Meta no deja mandar ni recibir mensajes con esa. | Generar la clave de usuario: Paso 2 → "Cómo sacar el token". |
| *La clave (token) de WhatsApp venció o es inválida* | El token temporal duró 24 h (o 1-2 h si es del Explorador). | Generar el permanente (Paso 5) y recargarlo. |
| *No pude encontrar el ID de la cuenta de WhatsApp (WABA)* | Al token le falta el permiso `business_management`, o la cuenta todavía no tiene ningún número. | Marcá `business_management` al generar el token. Si sigue igual, revisá en Meta que el número de prueba exista (**WhatsApp → Números de teléfono**). |
| *No hubo respuesta de Meta* | El servidor no salió a internet. | Probar de nuevo en unos minutos; si sigue, avisar. |
| *El cliente tiene que escribirnos primero (pasaron más de 24 h)* | Quisiste mandar un mensaje libre fuera de la ventana de 24 h. | Usar una plantilla aprobada (Paso 6.5). |
| *Ese número no puede recibir mensajes* | El número no tiene WhatsApp, está mal escrito o no está autorizado. | Revisar el teléfono y la lista **To** del Paso 2. |
| *La plantilla no está aprobada todavía* | Meta está revisando el texto. | Esperar la aprobación o revisar el nombre/idioma. |
| *La firma no coincide* (en los logs del servidor) | El `WHATSAPP_APP_SECRET` no es el de esa app. | Volver a copiarlo (Paso 3) y reintentar. |

## Qué NO cambia
- Tu WhatsApp del teléfono sigue funcionando igual hasta el Paso 6.
- El resto de la plataforma (órdenes, taller, cotizador) funciona aunque el canal esté apagado: si faltan las claves, el panel simplemente muestra "Falta configurar".
- Los scripts se pueden volver a correr las veces que haga falta: lo que no completes se conserva como estaba.
