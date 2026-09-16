#!/usr/bin/env bash
# checkpoint.sh - Snapshot local del estado actual del proyecto.
# Uso:  bash scripts/checkpoint.sh ["descripcion opcional"]
# Commitea TODO (tracked + untracked) SIN hacer push. Si no hay cambios, avisa.
set -euo pipefail
cd "$(dirname "$0")/.."

LBL="checkpoint: $(date '+%Y-%m-%d %H:%M')${1:+ - $1}"
git add -A
if git diff --cached --quiet; then
  echo "Sin cambios para commitear. Trabajo ya seguro."
else
  git commit -m "$LBL" -q
  echo "Checkpoint creado: $LBL"
fi