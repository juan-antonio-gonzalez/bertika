#!/usr/bin/env bash
# Bertika - Instala la bajada diaria del respaldo a esta Mac.
#
# Uso:  bash scripts/instalar-backup-mac.sh
#
# Deja en la Mac una copia de la base y de las fotos, todos los dias a las 09:15.
# Es la segunda pata del respaldo: el VPS tiene el suyo y esto lo trae afuera.
#
# Se instala como agente de usuario de macOS (LaunchAgent). No necesita permisos
# de administrador. Para desinstalar: bash scripts/instalar-backup-mac.sh --quitar
set -euo pipefail

ETIQUETA="com.bertika.backup"
PLIST_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/launchd/$ETIQUETA.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
LOG="/tmp/bertika-backup-mac.log"

if [ "${1:-}" = "--quitar" ]; then
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "Listo: la bajada diaria quedo desinstalada (los respaldos ya bajados siguen en backups/)."
  exit 0
fi

[ -f "$PLIST_SRC" ] || { echo "No encuentro $PLIST_SRC"; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo "Instalado: todos los dias a las 09:15 la Mac baja el ultimo respaldo."
echo "  - Se guarda en: backups/ (dentro del proyecto)"
echo "  - Registro:     $LOG"
echo
echo "Para probarlo ahora mismo:  launchctl start $ETIQUETA"
echo "Para desinstalar:           bash scripts/instalar-backup-mac.sh --quitar"
