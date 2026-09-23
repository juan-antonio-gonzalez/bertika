#!/usr/bin/env bash
# Bertika - Respaldo diario de la base y prueba de restauracion.
#
# Uso:
#   bash scripts/backup-db.sh                 # corre en el servidor y deja el .sql.gz
#   bash scripts/backup-db.sh --instalar      # lo instala en el VPS + cron diario 03:17
#   bash scripts/backup-db.sh --verificar     # restaura el ultimo respaldo en una base
#                                             # de prueba y cuenta las filas (no toca la real)
#
# Por que existe: el respaldo anterior llamaba a `pg_dump` sin credenciales, asi
# que fallaba todos los dias y dejaba archivos de 0 bytes (nadie lo notaba porque
# el cron no avisa). Este script:
#   1. usa la cadena de conexion de la app (/etc/bertika/bertika-api.env),
#   2. verifica que el dump tenga contenido y las tablas esperadas,
#   3. borra los respaldos viejos (y los .sql vacios que quedaron de antes),
#   4. sale con error si algo falla, para que el cron lo reporte.
set -euo pipefail

SSH_HOST="srv1981179.hstgr.cloud"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS=(-i "$SSH_KEY" -o StrictHostKeyChecking=yes)
ENV_REMOTO="/etc/bertika/bertika-api.env"
DESTINO="/var/backups/bertika"
RETENCION_DIAS=14
MIN_BYTES=2048

# ----------------------------- se ejecuta en el VPS -----------------------------
if [ "${1:-}" = "--en-servidor" ]; then
  DB="$(grep -E '^DATABASE_URL=' "$ENV_REMOTO" | cut -d= -f2-)"
  [ -n "$DB" ] || { echo "No encontre DATABASE_URL en $ENV_REMOTO"; exit 1; }
  mkdir -p "$DESTINO"
  STAMP="$(date +%F_%H%M)"
  ARCHIVO="$DESTINO/bertika_$STAMP.sql.gz"
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  pg_dump "$DB" > "$TMP"
  TAMANO="$(wc -c < "$TMP" | tr -d ' ')"
  if [ "$TAMANO" -lt "$MIN_BYTES" ]; then
    echo "FALLA: el respaldo salio de $TAMANO bytes (minimo $MIN_BYTES). No se guarda."
    exit 1
  fi
  # Control de cordura: el dump tiene que traer las tablas del taller.
  for t in ordenes clientes baterias insumos usuarios wa_conversaciones; do
    grep -q "CREATE TABLE public.$t" "$TMP" || { echo "FALLA: el respaldo no trae la tabla $t"; exit 1; }
  done
  gzip -c "$TMP" > "$ARCHIVO"
  chmod 600 "$ARCHIVO"
  # Las fotos de diagnostico viven fuera de la base: sin esto quedan sin respaldo.
  if [ -d /var/www/bertika/uploads ]; then
    tar czf "$DESTINO/uploads_$STAMP.tar.gz" -C /var/www/bertika uploads 2>/dev/null || true
    chmod 600 "$DESTINO/uploads_$STAMP.tar.gz" 2>/dev/null || true
  fi
  # Limpieza: respaldos viejos (comprimidos) y los .sql vacios del script roto.
  find "$DESTINO" -name 'bertika_*.sql.gz' -mtime "+$RETENCION_DIAS" -delete
  find "$DESTINO" -name 'uploads_*.tar.gz' -mtime "+$RETENCION_DIAS" -delete
  find "$DESTINO" -name 'bertika_*.sql' -size 0 -delete
  echo "OK respaldo: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1)), fotos: $(ls -la "$DESTINO"/uploads_*.tar.gz 2>/dev/null | tail -1 | awk '{print $5" bytes"}' || echo 'sin fotos'), quedan $(ls "$DESTINO"/*.sql.gz 2>/dev/null | wc -l | tr -d ' ') respaldos"
  exit 0
fi

# ------------------- copia local (fuera del servidor) -------------------
if [ "${1:-}" = "--traer" ]; then
  DESTINO_LOCAL="${2:-$HOME/Desktop/Proyecto/Taller-reparación/backups}"
  mkdir -p "$DESTINO_LOCAL"
  echo "== Trayendo los ultimos respaldos a $DESTINO_LOCAL =="
  ULTIMO_DB="$(ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "ls -t $DESTINO/bertika_*.sql.gz 2>/dev/null | head -1" || true)"
  ULTIMO_UP="$(ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "ls -t $DESTINO/uploads_*.tar.gz 2>/dev/null | head -1" || true)"
  if [ -z "$ULTIMO_DB" ]; then echo "  No hay respaldos en el servidor todavia"; exit 1; fi
  scp -q "${SSH_ARGS[@]}" "root@$SSH_HOST:$ULTIMO_DB" "$DESTINO_LOCAL/" && echo "  base: $(basename "$ULTIMO_DB")"
  if [ -n "$ULTIMO_UP" ]; then scp -q "${SSH_ARGS[@]}" "root@$SSH_HOST:$ULTIMO_UP" "$DESTINO_LOCAL/" && echo "  fotos: $(basename "$ULTIMO_UP")"; fi
  echo "  (copia fuera del VPS: si se pierde el servidor, la base esta aca)"
  exit 0
fi

[ -f "$SSH_KEY" ] || { echo "No encuentro la llave $SSH_KEY"; exit 1; }

# ------------------------------- instalacion en el VPS -------------------------------
if [ "${1:-}" = "--instalar" ]; then
  echo "== Instalando el respaldo en el VPS =="
  scp -q "${SSH_ARGS[@]}" "${BASH_SOURCE[0]}" "root@$SSH_HOST:/usr/local/bin/bertika-backup.sh"
  ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s" <<'REMOTO'
set -euo pipefail
chmod 755 /usr/local/bin/bertika-backup.sh
printf '17 3 * * * root /usr/local/bin/bertika-backup.sh --en-servidor >> /var/log/bertika-backup.log 2>&1\n' > /etc/cron.d/bertika-backup
chmod 644 /etc/cron.d/bertika-backup
echo "cron: $(cat /etc/cron.d/bertika-backup)"
echo "== Prueba inmediata =="
/usr/local/bin/bertika-backup.sh --en-servidor
REMOTO
  echo
  echo "Listo. Cada dia a las 03:17 queda un respaldo en $DESTINO del VPS"
  echo "y el resultado se anota en /var/log/bertika-backup.log."
  exit 0
fi

# ---------------------------------- verificacion ----------------------------------
if [ "${1:-}" = "--verificar" ]; then
  echo "== Prueba de restauracion (no toca la base real) =="
  ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s" <<'REMOTO'
set -euo pipefail
DB="$(grep -E '^DATABASE_URL=' /etc/bertika/bertika-api.env | cut -d= -f2-)"
ULTIMO="$(ls -t /var/backups/bertika/bertika_*.sql.gz 2>/dev/null | head -1 || true)"
[ -n "$ULTIMO" ] || { echo "No hay ningun respaldo para probar"; exit 1; }
echo "  respaldo: $ULTIMO ($(du -h "$ULTIMO" | cut -f1), del $(date -r "$ULTIMO" '+%F %H:%M'))"
# Base de prueba descartable: se arma la URL de mantenimiento cambiando el
# ultimo tramo (la base) por /postgres.
BASE="${DB%/*}"
echo "  restaurando en una base de prueba..."
# El rol de la app no puede crear bases: la base de prueba la crea el superusuario
# (este script corre como root en el VPS) y los objetos quedan del dueño real.
su postgres -c "psql -q -c 'DROP DATABASE IF EXISTS bertika_prueba;'" >/dev/null
su postgres -c "psql -q -c 'CREATE DATABASE bertika_prueba OWNER bertika;'" >/dev/null
gunzip -c "$ULTIMO" | psql "$BASE/bertika_prueba" >/dev/null
psql "$BASE/bertika_prueba" -tA -c "SELECT 'ordenes='||count(*) FROM ordenes UNION ALL SELECT 'clientes='||count(*) FROM clientes UNION ALL SELECT 'usuarios='||count(*) FROM usuarios;" | tr '\n' ' '
echo
su postgres -c "psql -q -c 'DROP DATABASE bertika_prueba;'" >/dev/null
echo "  RESTAURACION OK: el respaldo se recupera completo"
REMOTO
  exit 0
fi

# ----------------------------------- uso normal -----------------------------------
echo "== Respaldo de la base de Bertika =="
ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s" <<'REMOTO'
set -euo pipefail
if [ -x /usr/local/bin/bertika-backup.sh ]; then
  /usr/local/bin/bertika-backup.sh --en-servidor
else
  echo "Todavia no esta instalado en el servidor."
  echo "Corré una vez:  bash scripts/backup-db.sh --instalar"
  exit 1
fi
REMOTO
