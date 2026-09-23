#!/usr/bin/env bash
# Bertika - Activa y verifica el canal de WhatsApp contra Meta.
#
# Uso:  bash scripts/whatsapp-activar.sh [telefono-de-prueba]
#
# Hace por API todo lo que normalmente se hace a mano en el panel de Meta:
#   1. revisa que la clave (token) sirva
#   2. averigua solo el ID de la cuenta (WABA) y el del numero si no estan
#   3. le avisa a Meta que la app atiende esa cuenta (llegan los mensajes)
#   4. configura la direccion de avisos (webhook) y la deja verificada
#   5. prueba la puerta de entrada de Bertika
#   6. opcional: manda un mensaje de prueba al telefono que le pases
#
# Las claves se leen en el servidor desde /etc/bertika/bertika-api.env y NUNCA
# viajan a esta maquina, ni se imprimen, ni quedan en el historial.
#
# Ejemplos:
#   bash scripts/whatsapp-activar.sh
#   bash scripts/whatsapp-activar.sh 11 5555-0101
set -euo pipefail

SSH_HOST="srv1981179.hstgr.cloud"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS=(-i "$SSH_KEY" -o StrictHostKeyChecking=yes)
ENV_REMOTO="/etc/bertika/bertika-api.env"
TELEFONO="${1:-}"

[ -f "$SSH_KEY" ] || { echo "No encuentro la llave $SSH_KEY"; exit 1; }

echo "== Activando el canal de WhatsApp de Bertika =="
echo

ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s -- '$ENV_REMOTO' '$TELEFONO'" <<'REMOTO'
set -uo pipefail

ENV="$1"
TEL="${2:-}"
[ -f "$ENV" ] || { echo "  x No existe $ENV en el servidor"; exit 1; }

leer() { grep -E "^$1=" "$ENV" 2>/dev/null | tail -1 | cut -d= -f2-; }

TOKEN="$(leer WHATSAPP_TOKEN)"
PHONE_ID="$(leer WHATSAPP_PHONE_ID)"
WABA_ID="$(leer WHATSAPP_WABA_ID)"
VERIFY="$(leer WHATSAPP_VERIFY_TOKEN)"
SECRET="$(leer WHATSAPP_APP_SECRET)"
APP_ID="$(leer WHATSAPP_APP_ID)"
BUSINESS_ID="$(leer WHATSAPP_BUSINESS_ID)"
VERSION="$(leer WHATSAPP_API_VERSION)"; [ -n "$VERSION" ] || VERSION=v22.0
SITIO="$(leer PUBLIC_URL)"; [ -n "$SITIO" ] || SITIO=https://bertika.com

if [ -z "$TOKEN" ]; then
  echo "  x Falta WHATSAPP_TOKEN."
  echo "    Corré primero:  bash scripts/whatsapp-env.sh"
  exit 1
fi

TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
umask 077
printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" > "$TMP/t.cfg"
HAY_APP_CFG=0
if [ -n "$SECRET" ] && [ -n "$APP_ID" ]; then
  printf 'header = "Authorization: Bearer %s|%s"\n' "$APP_ID" "$SECRET" > "$TMP/app.cfg"
  HAY_APP_CFG=1
fi

ok()   { echo "  OK   $1"; }
no()   { echo "  FALLA $1"; }
dato() { echo "       $1"; }

campo() { # $1 = json, $2 = ruta (data.0.id)
  printf '%s' "$1" | node -e '
let d="";process.stdin.setEncoding("utf8");
process.stdin.on("data",c=>d+=c).on("end",()=>{
  let o;try{o=JSON.parse(d||"{}");}catch(e){process.stdout.write("");return;}
  for(const k of String(process.argv[1]).split(".")){ if(o==null)break; o=o[/^\d+$/.test(k)?Number(k):k]; }
  process.stdout.write(o==null||typeof o==="object"?"":String(o));
});' "$2"
}

# Para meter valores en una dirección (los tokens traen caracteres especiales).
urlenc() {
  printf '%s' "$1" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(encodeURIComponent(d)))'
}

# Devuelve el cuerpo en $CUERPO y el codigo HTTP en $CODIGO.
llamar() { # $1 = archivo de auth, $2 = metodo, $3 = ruta, $4 = json opcional
  local cfg="$1" metodo="$2" ruta="$3" datos="${4:-}" salida
  if [ -n "$datos" ]; then
    printf '%s' "$datos" > "$TMP/b.json"
    salida="$(curl -sS --max-time 25 -K "$cfg" -X "$metodo" -H 'Content-Type: application/json' \
      --data-binary @"$TMP/b.json" -w $'\n%{http_code}' "https://graph.facebook.com/$VERSION/$ruta" 2>&1)" || true
  else
    salida="$(curl -sS --max-time 25 -K "$cfg" -X "$metodo" \
      -w $'\n%{http_code}' "https://graph.facebook.com/$VERSION/$ruta" 2>&1)" || true
  fi
  CODIGO="${salida##*$'\n'}"
  CUERPO="${salida%$'\n'*}"
}

# Traduce el codigo de error de Meta a algo entendible.
traducir() { # $1 = code, $2 = message
  local msg="${2:-Meta no dio detalles}"
  case "${1:-}" in
    190|102) echo "la clave (token) venció o es de otra app: hay que generar una nueva";;
    200)     echo "a la app le falta un permiso ($msg)";;
    803)     echo "ese ID no existe o la clave no tiene acceso a él ($msg)";;
    100)     echo "Meta rechazó un dato del pedido: $msg";;
    '')      echo "$msg";;
    *)       echo "código ${1}: $msg";;
  esac
}

# Explica el ultimo error usando $CODIGO y $CUERPO.
explicar() {
  if ! printf '%s' "$CODIGO" | grep -qE '^[0-9]{3}$'; then
    echo "no hubo respuesta de Meta (revisá la salida a internet del servidor)"
    return
  fi
  traducir "$(campo "$CUERPO" error.code)" "$(campo "$CUERPO" error.message)"
}

guardar_var() { # $1 = nombre, $2 = valor (agrega o reemplaza una linea del env)
  grep -v -E "^$1=" "$ENV" > "$ENV.tmp" 2>/dev/null || true
  printf '%s=%s\n' "$1" "$2" >> "$ENV.tmp"
  cat "$ENV.tmp" > "$ENV"
  rm -f "$ENV.tmp"
  chmod 600 "$ENV"
}

FALLOS=0
GUARDE=""

# ---------------------------------------------------------------- 1. La clave
echo "== 1. La clave (token) =="
llamar "$TMP/t.cfg" GET "/me?fields=id,name"
if [ "$CODIGO" != "200" ] && [ -n "$APP_ID" ]; then
  llamar "$TMP/t.cfg" GET "$APP_ID?fields=name"
fi
if [ "$CODIGO" = "200" ]; then
  ok "La clave funciona ($(campo "$CUERPO" name))."
else
  no "La clave no funciona: $(explicar)"
  echo
  echo "Sin clave no se puede seguir. Generá una nueva en Meta y volvé a correr"
  echo "scripts/whatsapp-env.sh."
  exit 1
fi

# Que clase de clave es. La clave "de la aplicacion" (APP) sirve para leer la
# app, pero NO para mandar ni recibir mensajes: conviene avisarlo al toque y no
# dejar que el resto de los pasos fallen uno por uno sin explicacion.
TIPO_CLAVE=""
if [ "$HAY_APP_CFG" = "1" ]; then
  llamar "$TMP/app.cfg" GET "debug_token?input_token=$(urlenc "$TOKEN")"
  TIPO_CLAVE="$(campo "$CUERPO" data.type)"
  case "$CUERPO" in *whatsapp_business_messaging*) TIENE_PERMISO=1;; *) TIENE_PERMISO="";; esac
  if [ "$TIPO_CLAVE" = "APP" ]; then
    FALLOS=$((FALLOS+1))
    no "Esa clave es la de la APLICACIÓN, no la de WhatsApp Business."
    dato "Alcanza para leer datos de la app, pero Meta NO deja mandar ni recibir"
    dato "mensajes con ella: hay que generar una clave de usuario (Paso 2 de"
    dato "docs/WHATSAPP_META.md, en el Explorador de la API Graph)."
  elif [ -z "$TIENE_PERMISO" ]; then
    FALLOS=$((FALLOS+1))
    no "La clave es de usuario pero no trae el permiso whatsapp_business_messaging."
    dato "Generala otra vez marcando los permisos de WhatsApp."
  else
    ok "La clave es de usuario y trae los permisos de WhatsApp."
  fi
fi

# ------------------------------------------------------- 2. Cuenta (WABA)
echo "== 2. La cuenta de WhatsApp (WABA) =="
if [ -n "$WABA_ID" ]; then
  llamar "$TMP/t.cfg" GET "$WABA_ID?fields=id,name"
  if [ "$CODIGO" = "200" ]; then
    ok "Cuenta: $(campo "$CUERPO" name) ($WABA_ID)"
  else
    dato "El WABA guardado no responde, lo busco de nuevo..."
    WABA_ID=""
  fi
fi
if [ -z "$WABA_ID" ] && [ -n "$BUSINESS_ID" ]; then
  for relacion in owned_whatsapp_business_accounts client_whatsapp_business_accounts; do
    llamar "$TMP/t.cfg" GET "$BUSINESS_ID/$relacion?fields=id,name&limit=10"
    [ "$CODIGO" = "200" ] || continue
    CANDIDATO="$(campo "$CUERPO" data.0.id)"
    [ -n "$CANDIDATO" ] && { WABA_ID="$CANDIDATO"; break; }
  done
  if [ -z "$WABA_ID" ]; then
    llamar "$TMP/t.cfg" GET "$BUSINESS_ID/phone_numbers?fields=id&limit=1"
    [ "$CODIGO" = "200" ] && WABA_ID="$BUSINESS_ID"
  fi
fi
if [ -z "$WABA_ID" ] && [ -n "$PHONE_ID" ]; then
  llamar "$TMP/t.cfg" GET "$PHONE_ID?fields=account_id"
  [ "$CODIGO" = "200" ] && WABA_ID="$(campo "$CUERPO" account_id)"
fi
if [ -n "$WABA_ID" ]; then
  if [ "$WABA_ID" != "$(leer WHATSAPP_WABA_ID)" ]; then
    guardar_var WHATSAPP_WABA_ID "$WABA_ID"
    GUARDE=1
    ok "Cuenta de WhatsApp: $WABA_ID (la guardé en el servidor)."
  fi
else
  FALLOS=$((FALLOS+1))
  no "No pude encontrar el ID de la cuenta de WhatsApp (WABA)."
  dato "Dos causas posibles:"
  dato "  a) la cuenta de WhatsApp todavía no existe. Se crea desde la app:"
  dato "     WhatsApp → Configuración de la API → botón Comenzar / Empezar."
  dato "  b) a la clave le falta el permiso business_management."
fi

# ----------------------------------------------------------- 3. El numero
echo "== 3. El número =="
NUMERO=""
if [ -n "$PHONE_ID" ]; then
  llamar "$TMP/t.cfg" GET "$PHONE_ID?fields=display_phone_number,verified_name,quality_rating"
  if [ "$CODIGO" = "200" ]; then
    NUMERO="$(campo "$CUERPO" display_phone_number)"
    ok "Número: $(campo "$CUERPO" verified_name) $NUMERO"
  else
    dato "El número guardado no responde, lo busco de nuevo..."
    PHONE_ID=""
  fi
fi
if [ -z "$PHONE_ID" ] && [ -n "$WABA_ID" ]; then
  llamar "$TMP/t.cfg" GET "$WABA_ID/phone_numbers?fields=id,display_phone_number,verified_name&limit=10"
  PHONE_ID="$(campo "$CUERPO" data.0.id)"
  NUMERO="$(campo "$CUERPO" data.0.display_phone_number)"
  if [ -n "$PHONE_ID" ]; then
    guardar_var WHATSAPP_PHONE_ID "$PHONE_ID"
  GUARDE=1
    ok "Número: $NUMERO"
    dato "Lo guardé en el servidor."
  fi
fi
if [ -n "$PHONE_ID" ]; then
  [ -n "$NUMERO" ] || NUMERO="(sin nombre visible)"
else
  FALLOS=$((FALLOS+1))
  no "La cuenta no tiene ningún número cargado."
  dato "En Meta: WhatsApp → Números de teléfono → Agregar número de teléfono."
fi

# ------------------------------------- 4. Que la app atienda esta cuenta
if [ -n "$WABA_ID" ]; then
  echo "== 4. Le aviso a Meta que la app atiende esta cuenta =="
  llamar "$TMP/t.cfg" POST "$WABA_ID/subscribed_apps"
  if [ "$CODIGO" = "200" ] && [ "$(campo "$CUERPO" success)" = "true" ]; then
    ok "Listo: los mensajes que entren van a llegar a Bertika."
  else
    FALLOS=$((FALLOS+1))
    no "No se pudo suscribir: $(explicar)"
  fi
fi

# ------------------------------------------------------ 5. El webhook
echo "== 5. La dirección de avisos (webhook) =="
if [ -z "$VERIFY" ]; then
  # La frase la generamos nosotros: el dueño del negocio no tiene por qué inventarla.
  VERIFY="$(openssl rand -hex 16)"
  guardar_var WHATSAPP_VERIFY_TOKEN "$VERIFY"
  GUARDE=1
  ok "Generé la frase de verificación y la guardé en el servidor."
  systemctl restart bertika-api
  sleep 2
fi
if ! printf '%s' "$VERIFY" | grep -qE '^[A-Za-z0-9._-]+$'; then
  FALLOS=$((FALLOS+1))
  no "La frase de verificación tiene símbolos raros."
  dato "Volvé a cargarla usando solo letras, números, guiones y puntos."
elif [ -z "$APP_ID" ]; then
  FALLOS=$((FALLOS+1))
  no "Falta WHATSAPP_APP_ID (el ID de la app de Meta)."
else
  URL_AVISOS="$SITIO/api/whatsapp/webhook"
  PEDIDO="$(printf '{"object":"whatsapp_business_account","callback_url":"%s","verify_token":"%s","fields":"messages"}' "$URL_AVISOS" "$VERIFY")"
  llamar "$TMP/t.cfg" POST "$APP_ID/subscriptions" "$PEDIDO"
  if [ "$CODIGO" != "200" ] && [ "$HAY_APP_CFG" = "1" ]; then
    llamar "$TMP/app.cfg" POST "$APP_ID/subscriptions" "$PEDIDO"
  fi
  if [ "$CODIGO" = "200" ]; then
    ok "Meta aceptó la dirección $URL_AVISOS"
    llamar "$TMP/t.cfg" GET "$APP_ID/subscriptions"
    if [ "$(campo "$CUERPO" data.0.object)" = "whatsapp_business_account" ]; then
      ok "Quedó guardada y activa (campo: $(campo "$CUERPO" data.0.fields.0))."
    fi
  else
    FALLOS=$((FALLOS+1))
    no "Meta rechazó el webhook: $(explicar)"
  fi
fi

# --------------------------- 6. La puerta de entrada de Bertika responde
echo "== 6. Pruebo la puerta de entrada de Bertika =="
if [ -n "$VERIFY" ]; then
  RESPUESTA="$(curl -sS --max-time 20 "$SITIO/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY&hub.challenge=bertika-ok" 2>&1)" || true
  if [ "$RESPUESTA" = "bertika-ok" ]; then
    ok "La puerta de entrada contesta bien."
  else
    FALLOS=$((FALLOS+1))
    no "La puerta de entrada no contestó como esperaba (contestó: ${RESPUESTA:0:80})."
    dato "Revisá que el servicio esté andando: systemctl status bertika-api"
  fi
fi

# ------------------------------------------- 7. Mensaje de prueba (opcional)
if [ -n "$TEL" ]; then
  echo "== 7. Mensaje de prueba =="
  DEST="$(printf '%s' "$TEL" | tr -cd '0-9')"
  case "$DEST" in
    54*) ;;
    9*)  DEST="54$DEST";;
    ??????????) DEST="549$DEST";;
  esac
  if [ -z "$PHONE_ID" ]; then
    no "No hay número configurado para enviar."
  else
    MENSAJE="$(printf '{"messaging_product":"whatsapp","to":"%s","type":"template","template":{"name":"hello_world","language":{"code":"en_US"}}}' "$DEST")"
    llamar "$TMP/t.cfg" POST "$PHONE_ID/messages" "$MENSAJE"
    if [ "$CODIGO" = "200" ]; then
      ok "Enviado a $DEST. Fijate que te haya llegado por WhatsApp."
    else
      no "No se pudo enviar: $(explicar)"
      dato "Si dice que el número no está autorizado, agregalo en Meta → API Setup → To."
    fi
  fi
fi

# ------------------------------------------------------------- Resumen
echo
if [ -n "$GUARDE" ]; then
  echo "== Reinicio el servicio para que tome los datos nuevos =="
  systemctl restart bertika-api
  sleep 2
  echo "  Servicio: $(systemctl is-active bertika-api)"
  echo
fi
if [ "$FALLOS" = "0" ]; then
  echo "== Todo listo =="
  echo "  Número ......... $NUMERO"
  echo "  Cuenta (WABA) .. ${WABA_ID:-(sin dato)}"
  echo "  Versión API .... $VERSION"
  echo
  echo "Entrá al panel: Hub → pestaña WhatsApp. Tiene que decir CONECTADO."
  echo "Después escribile desde uno de los números autorizados y la conversación"
  echo "aparece sola en la bandeja."
else
  if [ "$FALLOS" = "1" ]; then
    echo "== Quedó 1 cosa por resolver (ver arriba) =="
  else
    echo "== Quedaron $FALLOS cosas por resolver (ver arriba) =="
  fi
  if [ "$TIPO_CLAVE" = "APP" ]; then
    echo
    echo "Lo principal: la clave que está cargada es la de la aplicación."
    echo "Generá una clave de usuario (docs/WHATSAPP_META.md, Paso 2):"
    echo "  1. Entrá a https://developers.facebook.com/tools/explorer/"
    echo "  2. Arriba a la derecha, elegí la app Bertika Mensajeria."
    echo "  3. En Permisos marcá: whatsapp_business_messaging, whatsapp_business_management"
    echo "     y business_management."
    echo "  4. Botón 'Generar token de acceso' → Continuar."
    echo "  5. Copiá el texto largo (empieza con EAA) y corré:"
    echo "     bash scripts/whatsapp-token.sh"
  fi
fi
exit 0
REMOTO
