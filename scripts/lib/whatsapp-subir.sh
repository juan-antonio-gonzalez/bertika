#!/usr/bin/env bash
# Bertika - Sube claves de WhatsApp al servidor (uso interno).
#
# Uso: bash scripts/lib/whatsapp-subir.sh <archivo con lineas CLAVE=VALOR>
#
# El archivo debe tener permiso 600. Solo reemplaza las claves que vienen en el
# archivo: lo que no venga queda como estaba. Al final reinicia el servicio.
# Los valores nunca se imprimen.
set -euo pipefail

ARCHIVO="${1:?Falta el archivo con las claves}"
[ -s "$ARCHIVO" ] || { echo "No hay claves para subir."; exit 1; }

SSH_HOST="srv1981179.hstgr.cloud"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS=(-i "$SSH_KEY" -o StrictHostKeyChecking=yes)
ENV_REMOTO="/etc/bertika/bertika-api.env"
DESTINO="/tmp/whatsapp-claves.$$"

[ -f "$SSH_KEY" ] || { echo "No encuentro la llave $SSH_KEY"; exit 1; }

echo "== Subiendo al servidor =="
# -p conserva el permiso 600 del archivo temporal (nunca queda legible por otros).
scp -q -p "${SSH_ARGS[@]}" "$ARCHIVO" "root@$SSH_HOST:$DESTINO"

ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s -- '$ENV_REMOTO' '$DESTINO'" <<'REMOTO'
set -euo pipefail
ENV="$1"
NUEVO="$2"
[ -f "$ENV" ] || { echo "No existe $ENV"; exit 1; }
cp -a "$ENV" "$ENV.bak.$(date +%s)"
# Solo se reemplazan las claves que vinieron: el resto queda como estaba.
while IFS='=' read -r CLAVE VALOR; do
  [ -n "$CLAVE" ] || continue
  grep -v -E "^$CLAVE=" "$ENV" > "$ENV.nuevo" || true
  printf '%s=%s\n' "$CLAVE" "$VALOR" >> "$ENV.nuevo"
  cat "$ENV.nuevo" > "$ENV"
done < "$NUEVO"
rm -f "$ENV.nuevo" "$NUEVO"
chmod 600 "$ENV"
systemctl restart bertika-api
sleep 2
echo "Servicio: $(systemctl is-active bertika-api)"
echo "Claves de WhatsApp cargadas: $(grep -c '^WHATSAPP_' "$ENV")"
REMOTO
