# Privacidad, cookies y documentos legales

**Estado:** implementado el 23/10/2026, adaptado del paquete que ya usa Makerapps.
**Fuente única de los textos:** [`src/data/legal.js`](../src/data/legal.js).
**Archivo congelado:** [`public/legal/archivo/`](../public/legal/archivo/).
**Tabla:** `consentimientos` (PostgreSQL).

---

## 1. Qué incluye

| Pieza | Dónde |
| --- | --- |
| Política de privacidad | `/legal/privacidad` |
| Política de cookies | `/legal/cookies` |
| Términos y condiciones | `/legal/terminos` |
| Retiro de consentimiento y derechos | `/legal/privacidad/retirar` |
| Historial de versiones | `/legal/versiones` |
| Banner de cookies | `src/components/CookieConsent.jsx` |
| Checkboxes de formularios | `src/pages/Contacto.jsx` y `src/pages/Cotizador.jsx` |
| Panel de privacidad | `/sistema` → pestaña **Privacidad** |

El banner aparece en el sitio público y en el cotizador. No aparece en el panel
interno: ahí solo se usa el almacenamiento necesario para la sesión.

## 2. Cómo funciona el consentimiento

1. La persona elige **aceptar todas**, **rechazar todas** o **elegir cuáles**.
2. La decisión queda en `localStorage` (`bertika-consent-v1`) y se registra en
   `POST /api/consentimiento` con: fecha, IP, navegador, página, versión de cookies,
   acción y categorías.
3. El servidor valida la versión contra `src/data/legal.js`. Si el texto cambió y
   la persona tiene una versión vieja, se le pide aceptar de nuevo.
4. Cada fila guarda dos **HMAC-SHA256** (con `PRIVACY_HASH_SECRET` o, si no está
   definido, `JWT_SECRET`): uno completo (incluye identidad) y uno **legal** (solo
   versiones/hashes/cookies). Si alguien edita la base, el hash no coincide. El
   legal sigue siendo verificable después de anonimizar.
5. Los formularios de contacto y cotizador exigen dos aceptaciones separadas:
   términos y privacidad. Se guardan antes de crear la orden o mandar el correo.
6. El formulario de retiro guarda la solicitud y avisa a `PRIVACY_EMAIL`
   (`admin@bertika.com` por defecto).

## 3. Datos que se guardan

`consentimientos`: `tipo` (`cookies`, `formulario`, `retiro`), nombre, email, IP,
navegador, origen, página, aceptación y versión/hash de términos y privacidad,
categorías de cookies, acción, canal, motivo, `idempotency_key`, `hash_version`,
`hash`, `anonimizado_en`.

No se guardan contraseñas, tokens ni datos de tarjetas.

## 4. Retención (5 años)

- Los consentimientos y las versiones legales se conservan **5 años**.
- Pasado ese plazo se **anonimizan** (se quitan nombre, email, IP y navegador),
  pero se conservan fecha, versión y hash como prueba.
- Comando:

```bash
# muestra qué haría
npm run privacidad:retencion
# lo aplica
node scripts/retencion-privacidad.mjs --aplicar
# verifica que ninguna fila haya sido alterada
npm run privacidad:verificar
```

Requiere `DATABASE_URL`. En producción está programado en `/etc/cron.d/bertika-privacidad`
(el día 1 de cada mes a las 04:17) y el deploy sincroniza el script a `/var/www/bertika/scripts/`.

## 5. Variables de entorno

```env
PRIVACY_EMAIL=admin@bertika.com
PRIVACY_HASH_SECRET=<openssl rand -hex 32>
```

Si `PRIVACY_HASH_SECRET` queda vacío, se usa `JWT_SECRET`. En producción conviene
un secreto propio.

## 6. Cómo actualizar un texto legal

1. Editá el documento en `src/data/legal.js`.
2. Subí `LEGAL_META.version` y `LEGAL_META.actualizado`.
3. Corré:

```bash
npm run legal:archivar   # congela la versión y actualiza el manifiesto
npm run legal:verificar  # valida hashes y contenido mínimo
```

4. Commiteá los cambios de `src/data/legal.js` y de `public/legal/archivo/`.
5. Si cambia el texto, el consentimiento anterior sigue apuntando a la versión
   vieja: eso es correcto y es la prueba de lo que la persona aceptó.

## 7. Analítica

Hoy **no hay** GTM, GA ni píxeles. `ANALYTICS` en `src/data/siteData.js` está vacío.
El banner ya tiene la categoría **Medición** apagada. Cuando se carguen los IDs,
`CookieConsent` los inyecta **solo** si la persona autorizó esa categoría.

## 8. Pendientes legales (marcados “en trámite”)

- Razón social, CUIT y domicilio legal.
- Inscripción de la base ante la AAIP.
- Revisión final por un abogado matriculado.
- Portal de flotillas: se sumará con una versión nueva de la política.

Mientras tanto, los textos usan la marca **BERTIKA®**, el domicilio
“Buenos Aires, Argentina”, los teléfonos y correos existentes, y `admin@bertika.com`
como correo de privacidad.

## 9. Tests

```bash
npm run legal:verificar   # documentos, hashes y archivo
npm test                  # incluye los tests legales
npm run test:integracion  # consentimientos, formularios, retiro, panel y anonimización
```

## 10. Panel de privacidad

En `/sistema` → **Privacidad** (permiso `sistema`): lista, filtra, exporta CSV y
anonimiza. Cada fila muestra su **ID**, la **integridad** (hash completo y hash legal)
y un botón **Ver detalle**: ahí se ve quién aceptó, cuándo, desde qué IP/página, qué
versiones y hashes, el enlace al **texto exacto archivado** y una **constancia
descargable en JSON**. La misma constancia se abre desde la **ficha del cliente**
(aceptaciones con su email) y desde la **orden** creada por el formulario web
(campo `consentimiento_id`). La exportación CSV incluye esos mismos campos y usa el escape
de fórmulas del resto de los CSV. Cada acción queda en la auditoría.
