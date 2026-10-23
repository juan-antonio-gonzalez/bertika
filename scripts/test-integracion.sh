#!/usr/bin/env bash
# Test de integracion de la API contra un PostgreSQL real.
#
# Uso:
#   TEST_DATABASE_URL=postgres://usuario:clave@127.0.0.1:5432/bertika_test \
#     bash scripts/test-integracion.sh
#
# La base tiene que ser DESCARTABLE: el script la borra y la vuelve a crear.
# Por seguridad exige que el nombre termine en "_test".
#
# En GitHub Actions la base la provee el servicio postgres del workflow.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  cat >&2 <<'MSG'
Falta TEST_DATABASE_URL.

Ejemplo local (con un PostgreSQL corriendo):
  createdb bertika_test
  TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bertika_test npm run test:integracion

En CI lo configura .github/workflows/ci.yml con el servicio postgres.
MSG
  exit 2
fi

if [[ ! -d api/node_modules ]]; then
  echo "Faltan las dependencias de la API. Corré: (cd api && npm ci)" >&2
  exit 2
fi

exec node scripts/test-integracion.mjs
