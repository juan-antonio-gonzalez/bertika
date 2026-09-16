#!/usr/bin/env bash
# Deploy Bertika a produccion (VPS Hostinger).
# - Compila el frontend y lo sincroniza a /var/www/bertika
# - Sincroniza el backend (api/) y reinstala dependencias
# - Reinicia el servicio systemd bertika-api
set -euo pipefail

SSH_HOST="srv1981179.hstgr.cloud"
REMOTE_DIR="/var/www/bertika"
SSH_KEY="$HOME/.ssh/id_ed25519_bertika"
SSH_ARGS="-i $SSH_KEY -o StrictHostKeyChecking=yes"

echo "== Build frontend =="
npm run build

# Guard anti-regresion: NO subir contenido stale (demo vieja "Vertika")
# ni pushear un dist que no lleve la marca Bertika. Si algo de esto
# apareciera, el deploy se aborta ANTES de tocar la VPS.
echo "== Guard: contenido a desplegar =="
if grep -rli 'vertika' dist/ >/dev/null 2>&1; then
  echo "ERROR: dist/ contiene 'Vertika' (contenido viejo/demo). Abortando deploy."
  echo "Corre 'bash scripts/checkpoint.sh' para snapshoteer y reconstrui el fuente."
  exit 1
fi
if ! grep -qi 'bertika' dist/index.html 2>/dev/null; then
  echo "ERROR: dist/index.html no contiene la marca Bertika. Abortando deploy."
  exit 1
fi
echo "OK: dist sin 'Vertika' y con marca Bertika."

# Excluye de TODO lo que sube: documentacion, readmes, archivos de sistema y basura.
# La VPS solo recibe codigo: NUNCA readme/*.md/instructivos/PROMPT/docs.
EXCLUDE_DOCS=(--exclude '*.md' --exclude '*.pdf' --exclude 'readme*' --exclude 'README*' --exclude docs --exclude 'PROMPT*' --exclude 'INSTRUCTIVO*' --exclude '.DS_Store')

echo "== Deploy frontend a $SSH_HOST =="
# --delete solo sobre el dist: nunca se tocan api/ (con su node_modules),
# src/data ni uploads/ (que viven en el mismo directorio raiz).
rsync -az --delete \
  --exclude api --exclude src --exclude uploads "${EXCLUDE_DOCS[@]}" \
  -e "ssh $SSH_ARGS" dist/ "root@$SSH_HOST:$REMOTE_DIR/"

echo "== Deploy API =="
rsync -az --delete --exclude node_modules --exclude .env "${EXCLUDE_DOCS[@]}" \
  -e "ssh $SSH_ARGS" api/ "root@$SSH_HOST:$REMOTE_DIR/api/"

echo "== Seed data (src/data) =="
ssh $SSH_ARGS "root@$SSH_HOST" "mkdir -p $REMOTE_DIR/src/data"
rsync -az "${EXCLUDE_DOCS[@]}" -e "ssh $SSH_ARGS" src/data/ "root@$SSH_HOST:$REMOTE_DIR/src/data/"

echo "== Dependencias, directorios y servicio =="
ssh $SSH_ARGS "root@$SSH_HOST" bash -s <<'EOF'
set -euo pipefail
cd /var/www/bertika/api
npm ci --omit=dev --no-fund --no-audit
mkdir -p /var/www/bertika/uploads /var/backups/bertika
systemctl restart bertika-api 2>/dev/null || true
EOF

echo "== Verificacion =="
sleep 2
for url in "https://bertika.com/" "https://bertika.com/api/public/stats" "https://srv1981179.hstgr.cloud/"; do
  code=$(curl -ks -o /dev/null -w "%{http_code}" "$url" || true)
  echo "$code  $url"
done