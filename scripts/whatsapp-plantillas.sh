#!/usr/bin/env bash
# Bertika - Crea las plantillas de WhatsApp en Meta (categoria Utilidad).
#
# Uso:  bash scripts/whatsapp-plantillas.sh
#
# Las claves se leen en el servidor, nunca viajan a esta maquina.
# Es idempotente: las que ya existen no se tocan.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_HOST="srv1981179.hstgr.cloud"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS=(-i "$SSH_KEY" -o StrictHostKeyChecking=yes)

[ -f "$SSH_KEY" ] || { echo "No encuentro la llave $SSH_KEY"; exit 1; }

ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "node -" < "$SCRIPT_DIR/lib/plantillas.mjs"
