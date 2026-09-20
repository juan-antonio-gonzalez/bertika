#!/usr/bin/env bash
# Carga las claves de WhatsApp (Meta) en el servidor y en el Llavero de macOS.
#
# Uso:  bash scripts/whatsapp-env.sh
#
# Los valores NUNCA se escriben en el repositorio ni en el historial del shell:
# se piden con "read -s" (oculto), viajan a la VPS por scp a un archivo temporal
# con permisos 600 y se borran al terminar.
set -euo pipefail

SSH_HOST="srv1981179.hstgr.cloud"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS=(-i "$SSH_KEY" -o StrictHostKeyChecking=yes)
ENV_REMOTO="/etc/bertika/bertika-api.env"

echo "== Claves de WhatsApp (Meta) =="
echo "Dejá vacío lo que no quieras cambiar."
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

TOKEN="$(pedir WHATSAPP_TOKEN 'token de Meta' s)"
PHONE_ID="$(pedir WHATSAPP_PHONE_ID 'Phone number ID' n)"
WABA_ID="$(pedir WHATSAPP_WABA_ID 'WABA ID (opcional)' n)"
VERIFY="$(pedir WHATSAPP_VERIFY_TOKEN 'frase secreta que inventás' s)"
SECRET="$(pedir WHATSAPP_APP_SECRET 'App Secret' s)"
VERSION="$(pedir WHATSAPP_API_VERSION 'versión de la API (enter = v22.0)' n)"

if [ -z "$TOKEN$PHONE_ID$WABA_ID$VERIFY$SECRET$VERSION" ]; then
  echo "No cargaste nada. No se toca el servidor."
  exit 0
fi

TMP="$(mktemp)"
chmod 600 "$TMP"
{
  [ -n "$TOKEN" ] && echo "WHATSAPP_TOKEN=$TOKEN"
  [ -n "$PHONE_ID" ] && echo "WHATSAPP_PHONE_ID=$PHONE_ID"
  [ -n "$WABA_ID" ] && echo "WHATSAPP_WABA_ID=$WABA_ID"
  [ -n "$VERIFY" ] && echo "WHATSAPP_VERIFY_TOKEN=$VERIFY"
  [ -n "$SECRET" ] && echo "WHATSAPP_APP_SECRET=$SECRET"
  [ -n "$VERSION" ] && echo "WHATSAPP_API_VERSION=$VERSION"
} > "$TMP"
trap 'rm -f "$TMP"' EXIT

echo
echo "== Subiendo al servidor =="
scp -q "${SSH_ARGS[@]}" "$TMP" "root@$SSH_HOST:/tmp/whatsapp-env.$$"

ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s" <<EOF
set -euo pipefail
ENV="$ENV_REMOTO"
NUEVO="/tmp/whatsapp-env.$$"
[ -f "\$ENV" ] || { echo "No existe \$ENV"; exit 1; }
cp -a "\$ENV" "\$ENV.bak.\$(date +%s)"
# Se quitan las claves viejas de WhatsApp y se agregan las nuevas.
grep -v -E '^WHATSAPP_(TOKEN|PHONE_ID|WABA_ID|VERIFY_TOKEN|APP_SECRET|API_VERSION)=' "\$ENV" > "\$ENV.nuevo" || true
cat "\$NUEVO" >> "\$ENV.nuevo"
cat "\$ENV.nuevo" > "\$ENV"
rm -f "\$ENV.nuevo" "\$NUEVO"
chmod 600 "\$ENV"
systemctl restart bertika-api
sleep 2
echo "Servicio: \$(systemctl is-active bertika-api)"
echo "Variables cargadas: \$(grep -c '^WHATSAPP_' "\$ENV")"
EOF

# Copia en el Llavero de macOS (misma convención que el resto de los secretos).
if [ -n "$TOKEN" ]; then security add-generic-password -U -s bertika -a whatsapp-token -w "$TOKEN" 2>/dev/null || echo "(no se pudo guardar el token en el Llavero)"; fi
if [ -n "$SECRET" ]; then security add-generic-password -U -s bertika -a whatsapp-app-secret -w "$SECRET" 2>/dev/null || echo "(no se pudo guardar el secreto en el Llavero)"; fi
if [ -n "$VERIFY" ]; then security add-generic-password -U -s bertika -a whatsapp-verify-token -w "$VERIFY" 2>/dev/null || echo "(no se pudo guardar la frase en el Llavero)"; fi

echo
echo "Listo. Entrá al panel: Hub → pestaña WhatsApp y tiene que decir 'Conectado'."
echo "Después, en Meta, configurá el webhook con la frase que cargaste (ver docs/WHATSAPP_META.md, paso 5)."
