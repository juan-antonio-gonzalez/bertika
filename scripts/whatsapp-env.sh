#!/usr/bin/env bash
# Carga las claves de WhatsApp (Meta) en el servidor y en el Llavero de macOS.
#
# Uso:  bash scripts/whatsapp-env.sh
#
# Los valores NUNCA se escriben en el repositorio ni en el historial del shell:
# se piden con "read -s" (oculto), viajan a la VPS por scp a un archivo temporal
# con permisos 600 y se borran al terminar.
#
# Lo que dejes vacío NO se toca: se conserva lo que ya estaba cargado.
# Al terminar llama solo a scripts/whatsapp-activar.sh, que hace por API el
# resto del trámite con Meta (suscribir la cuenta, configurar el webhook).
set -euo pipefail

SSH_HOST="srv1981179.hstgr.cloud"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS=(-i "$SSH_KEY" -o StrictHostKeyChecking=yes)
ENV_REMOTO="/etc/bertika/bertika-api.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$SSH_KEY" ] || { echo "No encuentro la llave $SSH_KEY"; exit 1; }

echo "== Claves de WhatsApp (Meta) =="
echo "Dejá vacío lo que no quieras cambiar (lo que ya está cargado se conserva)."
echo

# Solo se piden los NOMBRES de lo que ya está cargado, nunca los valores.
YA="$(ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" \
  "grep -oE '^WHATSAPP_[A-Z_]+' '$ENV_REMOTO' 2>/dev/null | sort -u | tr '\n' ' '" || true)"
if [ -z "${YA// /}" ]; then
  echo "Ya cargado en el servidor: (todavía nada)"
else
  echo "Ya cargado en el servidor: $YA"
fi
echo

pedir() { # $1 = nombre de la variable, $2 = pista, $3 = oculto (s|n)
  local valor=""
  if [ "$3" = "s" ]; then
    read -r -s -p "$1 ($2): " valor </dev/tty || true
    echo
  else
    read -r -p "$1 ($2): " valor </dev/tty || true
  fi
  printf '%s' "$valor"
}

# Igual que pedir pero con un valor ya sugerido (se usa si apretás Enter).
pedir_def() { # $1 = nombre, $2 = pista, $3 = valor sugerido
  local valor=""
  read -r -p "$1 ($2) [$3]: " valor </dev/tty || true
  printf '%s' "${valor:-$3}"
}

# Los dos IDs no son secretos: son los que se ven en la dirección del navegador
# cuando entrás a la app en Meta. Van sugeridos para que solo aprietes Enter.
APP_ID="$(pedir_def WHATSAPP_APP_ID 'App ID de Meta' '4078360062458683')"
BUSINESS_ID="$(pedir_def WHATSAPP_BUSINESS_ID 'Business ID de Meta' '1390476009903845')"
TOKEN="$(pedir WHATSAPP_TOKEN 'token de Meta (enter = dejar el que está)' s)"
PHONE_ID="$(pedir WHATSAPP_PHONE_ID 'Phone number ID (enter = lo busco solo)' n)"
WABA_ID="$(pedir WHATSAPP_WABA_ID 'WABA ID (enter = lo busco solo)' n)"
VERIFY="$(pedir WHATSAPP_VERIFY_TOKEN 'frase de verificación (enter = la manejo yo)' s)"
SECRET="$(pedir WHATSAPP_APP_SECRET 'App Secret (enter = dejar el que está)' s)"
VERSION="$(pedir WHATSAPP_API_VERSION 'versión de la API (enter = v22.0)' n)"

# La frase de verificación sirve para que Meta confirme que la dirección de
# avisos es nuestra. Si no la inventaste y el servidor tampoco tiene una, la
# generamos nosotros: no hace falta que la anotes.
if [ -z "$VERIFY" ] && ! printf '%s' "$YA" | grep -q 'WHATSAPP_VERIFY_TOKEN'; then
  VERIFY="$(openssl rand -hex 16)"
  echo "(Generé la frase de verificación: no hace falta que la anotes.)"
fi

TMP="$(mktemp)"
chmod 600 "$TMP"
{
  [ -n "$APP_ID" ] && echo "WHATSAPP_APP_ID=$APP_ID"
  [ -n "$BUSINESS_ID" ] && echo "WHATSAPP_BUSINESS_ID=$BUSINESS_ID"
  [ -n "$TOKEN" ] && echo "WHATSAPP_TOKEN=$TOKEN"
  [ -n "$PHONE_ID" ] && echo "WHATSAPP_PHONE_ID=$PHONE_ID"
  [ -n "$WABA_ID" ] && echo "WHATSAPP_WABA_ID=$WABA_ID"
  [ -n "$VERIFY" ] && echo "WHATSAPP_VERIFY_TOKEN=$VERIFY"
  [ -n "$SECRET" ] && echo "WHATSAPP_APP_SECRET=$SECRET"
  [ -n "$VERSION" ] && echo "WHATSAPP_API_VERSION=$VERSION"
} > "$TMP"
trap 'rm -f "$TMP"' EXIT

if [ ! -s "$TMP" ]; then
  echo "No cargaste nada. No se toca el servidor."
  exit 0
fi

bash "$SCRIPT_DIR/lib/whatsapp-subir.sh" "$TMP"

# Copia en el Llavero de macOS (misma convención que el resto de los secretos).
if [ -n "$TOKEN" ]; then security add-generic-password -U -s bertika -a whatsapp-token -w "$TOKEN" 2>/dev/null || echo "(no se pudo guardar el token en el Llavero)"; fi
if [ -n "$SECRET" ]; then security add-generic-password -U -s bertika -a whatsapp-app-secret -w "$SECRET" 2>/dev/null || echo "(no se pudo guardar el secreto en el Llavero)"; fi
if [ -n "$VERIFY" ]; then security add-generic-password -U -s bertika -a whatsapp-verify-token -w "$VERIFY" 2>/dev/null || echo "(no se pudo guardar la frase en el Llavero)"; fi

echo
echo "== Ahora activo el canal con Meta =="
bash "$SCRIPT_DIR/whatsapp-activar.sh" \
  || echo "(La activación automática se cortó. Volvé a correr: bash scripts/whatsapp-activar.sh)"
