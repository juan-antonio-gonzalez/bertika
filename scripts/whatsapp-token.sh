#!/usr/bin/env bash
# Bertika - Carga SOLO el token de Meta (y, si querés, el App Secret) y deja el
# canal de WhatsApp andando.
#
# Uso:  bash scripts/whatsapp-token.sh
#
# Pensado para pegar con Cmd+V VIENDO lo que pegás: nada oculto, nada raro.
# Lo que pegues no queda en el historial de la Terminal ni se guarda en el
# proyecto: viaja directo al servidor. Al terminar podés limpiar la pantalla
# con Cmd+K.
#
# El resto del trámite (IDs, suscripción de la cuenta, webhook) lo hace solo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Los dos IDs no son secretos: son los de la app que ya usás en Meta.
APP_ID="4078360062458683"
BUSINESS_ID="1390476009903845"

# Saca espacios, enters y comillas: un pegote de más rompe el token.
limpiar() { printf '%s' "$1" | tr -d '[:space:]' | tr -d "\"'"; }

echo "== Token de WhatsApp (Meta) =="
echo
echo "Pegá el TOKEN con Cmd+V y apretá Enter."
echo "Se va a ver en pantalla (es normal: así confirmás que pegaste todo)."
echo "No queda guardado en el historial ni en el proyecto."
echo

read -r -p "TOKEN de Meta: " TOKEN </dev/tty || true
TOKEN="$(limpiar "$TOKEN")"

if [ -z "$TOKEN" ]; then
  echo
  echo "No pegaste nada. No se toca el servidor."
  exit 0
fi

echo
echo "Token recibido: ${#TOKEN} caracteres, empieza con ${TOKEN:0:4}… ✔"
echo
echo "Ahora el APP SECRET (Meta: Configuración de la app → Básica →"
echo "Clave secreta de la app → Mostrar). Sirve para comprobar que los mensajes"
echo "que llegan son de Meta. Si todavía no lo tenés, apretá Enter y lo sumamos después."
echo

read -r -p "APP SECRET: " SECRET </dev/tty || true
SECRET="$(limpiar "$SECRET")"

TMP="$(mktemp)"
chmod 600 "$TMP"
{
  echo "WHATSAPP_APP_ID=$APP_ID"
  echo "WHATSAPP_BUSINESS_ID=$BUSINESS_ID"
  echo "WHATSAPP_TOKEN=$TOKEN"
  [ -n "$SECRET" ] && echo "WHATSAPP_APP_SECRET=$SECRET"
} > "$TMP"
trap 'rm -f "$TMP"' EXIT

if [ -n "$SECRET" ]; then
  echo "App Secret recibido: ${#SECRET} caracteres ✔"
else
  echo "Sin App Secret: el envío va a andar, pero los mensajes que ENTREN no van a"
  echo "aparecer en la bandeja hasta que lo cargues."
fi
echo

bash "$SCRIPT_DIR/lib/whatsapp-subir.sh" "$TMP"
echo

# Copia en el Llavero de macOS (misma convención que el resto de los secretos).
security add-generic-password -U -s bertika -a whatsapp-token -w "$TOKEN" 2>/dev/null \
  || echo "(no se pudo guardar el token en el Llavero)"
if [ -n "$SECRET" ]; then
  security add-generic-password -U -s bertika -a whatsapp-app-secret -w "$SECRET" 2>/dev/null \
    || echo "(no se pudo guardar el secreto en el Llavero)"
fi

echo "== Ahora activo el canal con Meta =="
bash "$SCRIPT_DIR/whatsapp-activar.sh" \
  || echo "(La activación automática se cortó. Volvé a correr: bash scripts/whatsapp-activar.sh)"
