#!/usr/bin/env bash
# Bertika - Respaldo diario de la base y prueba de restauracion.
#
# Uso:
#   bash scripts/backup-db.sh                 # corre en el servidor y deja el .sql.gz
#   bash scripts/backup-db.sh --en-servidor [--json]
#                                             # respaldo en el VPS; con --json
#                                             # imprime una linea JSON (lo usa el
#                                             # boton "Respaldar ahora" del panel)
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

subir_a_nube() {
  local db="$1" fotos="$2"
  local cfg=/etc/bertika/backup-nube.env
  [ -f "$cfg" ] || { echo "   (nube: sin configurar; ver bash scripts/backup-db.sh --configurar-nube)"; return 0; }
  # shellcheck disable=SC1090
  . "$cfg"
  if [ -z "${NUBE_DESTINO:-}" ]; then echo "   (nube: NUBE_DESTINO vacio en $cfg)"; return 0; fi
  if ! command -v rclone >/dev/null 2>&1; then
    echo "   (nube: falta rclone en el servidor: apt-get install -y rclone)"
    return 0
  fi
  local ok=1
  for f in "$db" "$fotos"; do
    [ -f "$f" ] || continue
    if rclone copy "$f" "$NUBE_DESTINO" --no-traverse >/dev/null 2>&1; then
      echo "   nube OK: $(basename "$f") -> $NUBE_DESTINO"
    else
      ok=0
      echo "   AVISO: no se pudo subir $(basename "$f") a $NUBE_DESTINO"
    fi
  done
  # Retencion en la nube: 30 dias.
  rclone delete "$NUBE_DESTINO" --min-age 30d >/dev/null 2>&1 || true
  [ "$ok" = "1" ] || echo "   (revisá 'rclone config' y el destino en $cfg)"
}

# La copia a la nube se hace DESDE EL SERVIDOR (asi el respaldo diario de las
# 03:17 se sube solo, sin depender de que tu Mac este encendida). Ver mas abajo
# los modos --configurar-nube y --nube.

# ----------------------------- se ejecuta en el VPS -----------------------------
if [ "${1:-}" = "--en-servidor" ]; then
  # --json: salida de una sola linea para que la API del panel la parsee.
  # Los mensajes humanos se van a stderr, asi stdout queda limpio.
  JSON=0
  [ "${2:-}" = "--json" ] && JSON=1
  aviso() { [ "$JSON" = "1" ] && echo "$1" >&2 || echo "$1"; }
  fallar() {
    [ "$JSON" = "1" ] && echo "{\"ok\":false,\"error\":$1}" || echo "$2"
    exit 1
  }
  DB="$(grep -E '^DATABASE_URL=' "$ENV_REMOTO" | cut -d= -f2-)"
  [ -n "$DB" ] || fallar '"No encontre DATABASE_URL en el archivo de entorno del servidor"' "No encontre DATABASE_URL en $ENV_REMOTO"
  mkdir -p "$DESTINO"
  STAMP="$(date +%F_%H%M)"
  ARCHIVO="$DESTINO/bertika_$STAMP.sql.gz"
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  pg_dump "$DB" > "$TMP"
  TAMANO="$(wc -c < "$TMP" | tr -d ' ')"
  if [ "$TAMANO" -lt "$MIN_BYTES" ]; then
    fallar "\"El respaldo salio de $TAMANO bytes (minimo $MIN_BYTES): no se guarda\"" "FALLA: el respaldo salio de $TAMANO bytes (minimo $MIN_BYTES). No se guarda."
  fi
  # Control de cordura: el dump tiene que traer las tablas del taller.
  for t in ordenes clientes baterias insumos usuarios wa_conversaciones; do
    grep -q "CREATE TABLE public.$t" "$TMP" || fallar "\"El respaldo no trae la tabla $t\"" "FALLA: el respaldo no trae la tabla $t"
  done
  gzip -c "$TMP" > "$ARCHIVO"
  chmod 600 "$ARCHIVO"
  # Las fotos de diagnostico viven fuera de la base: sin esto quedan sin respaldo.
  FOTOS=""
  if [ -d /var/www/bertika/uploads ]; then
    tar czf "$DESTINO/uploads_$STAMP.tar.gz" -C /var/www/bertika uploads 2>/dev/null || true
    chmod 600 "$DESTINO/uploads_$STAMP.tar.gz" 2>/dev/null || true
    [ -f "$DESTINO/uploads_$STAMP.tar.gz" ] && FOTOS="uploads_$STAMP.tar.gz"
  fi
  # Limpieza: respaldos viejos (comprimidos) y los .sql vacios del script roto.
  find "$DESTINO" -name 'bertika_*.sql.gz' -mtime "+$RETENCION_DIAS" -delete
  find "$DESTINO" -name 'uploads_*.tar.gz' -mtime "+$RETENCION_DIAS" -delete
  find "$DESTINO" -name 'bertika_*.sql' -size 0 -delete
  BYTES="$(wc -c < "$ARCHIVO" | tr -d ' ')"
  if [ "$JSON" = "1" ]; then
    printf '{"ok":true,"archivo":"%s","bytes":%s,"fecha":"%s","fotos":"%s"}\n' \
      "$(basename "$ARCHIVO")" "$BYTES" "$(date -Iseconds)" "$FOTOS"
  else
    echo "OK respaldo: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1)), fotos: $(ls -la "$DESTINO"/uploads_*.tar.gz 2>/dev/null | tail -1 | awk '{print $5" bytes"}' || echo 'sin fotos'), quedan $(ls "$DESTINO"/*.sql.gz 2>/dev/null | wc -l | tr -d ' ') respaldos"
  fi
  # Copia fuera del VPS (si esta configurada): sin esto, si se pierde el
  # servidor se pierden tambien los respaldos. Va a stderr para no ensuciar el
  # JSON, y nunca corta el respaldo (que ya quedo hecho y validado).
  subir_a_nube "$ARCHIVO" "$DESTINO/uploads_$STAMP.tar.gz" >&2 || true
  exit 0
fi

# Sube el respaldo a la nube si hay destino configurado. Nunca corta el respaldo:
# si la nube falla, el respaldo local ya quedo hecho y se avisa en el log.
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

# ------------------------- copia en la nube (opcional) -------------------------
if [ "${1:-}" = "--configurar-nube" ]; then
  DESTINO_NUBE="${2:-}"
  if [ -z "$DESTINO_NUBE" ]; then
    echo "Uso:  bash scripts/backup-db.sh --configurar-nube <destino de rclone>"
    echo "Ejemplos:  gdrive:bertika-backups   ·   s3:mi-bucket/bertika   ·   onedrive:bertika"
    echo "Antes, en el servidor, hay que conectar el destino:  rclone config"
    exit 1
  fi
  ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s -- '$DESTINO_NUBE'" <<'REMOTO'
set -euo pipefail
DESTINO="$1"
if ! command -v rclone >/dev/null 2>&1; then
  echo "Falta rclone en el servidor. Instalalo con: apt-get update && apt-get install -y rclone"
  exit 1
fi
printf 'NUBE_DESTINO=%s\n' "$DESTINO" > /etc/bertika/backup-nube.env
chmod 600 /etc/bertika/backup-nube.env
echo "Destino guardado en /etc/bertika/backup-nube.env"
echo "== Prueba de conexion =="
if rclone lsd "$DESTINO" >/dev/null 2>&1 || rclone lsd "$(dirname "$DESTINO")" >/dev/null 2>&1; then
  echo "OK: el destino responde"
else
  echo "AVISO: el destino no responde todavia. Revisá 'rclone config' (¿esta creado el remoto?)"
fi
REMOTO
  echo
  echo "Listo: el respaldo diario de las 03:17 va a copiarse tambien a la nube."
  exit 0
fi

if [ "${1:-}" = "--nube" ]; then
  echo "== Probando la copia a la nube =="
  ssh "${SSH_ARGS[@]}" "root@$SSH_HOST" "bash -s" <<'REMOTO'
set -euo pipefail
cfg=/etc/bertika/backup-nube.env
if [ ! -f "$cfg" ]; then
  echo "Todavia no hay destino configurado."
  echo "En el servidor hay que conectar la cuenta (rclone config) y despues correr:"
  echo "  bash scripts/backup-db.sh --configurar-nube <destino>"
  exit 0
fi
. "$cfg"
ULTIMO="$(ls -t /var/backups/bertika/bertika_*.sql.gz 2>/dev/null | head -1 || true)"
FOTOS="$(ls -t /var/backups/bertika/uploads_*.tar.gz 2>/dev/null | head -1 || true)"
[ -n "$ULTIMO" ] || { echo "No hay respaldos locales para subir"; exit 1; }
command -v rclone >/dev/null 2>&1 || { echo "Falta rclone en el servidor"; exit 1; }
for f in "$ULTIMO" "$FOTOS"; do
  [ -f "$f" ] || continue
  if rclone copy "$f" "$NUBE_DESTINO" --no-traverse; then echo "OK: $(basename "$f") -> $NUBE_DESTINO"; else echo "FALLO: no se pudo subir $(basename "$f")"; exit 1; fi
done
echo "== Que hay en la nube =="
rclone ls "$NUBE_DESTINO" | tail -5
REMOTO
  exit 0
fi

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
