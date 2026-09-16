# Bertika · Producción y operación

Guía de la infraestructura real desplegada en el VPS, despliegue, backups y solución de problemas.

## 1. Infraestructura

| Componente | Detalle |
| --- | --- |
| Proveedor / plan | Hostinger VPS (Boston 2) |
| Hostname | `srv1981179.hstgr.cloud` (`2.25.220.174`) |
| SO | Ubuntu 26.04.1 LTS |
| Node | v22.22.1 (`/usr/bin/node`), npm 9.2.0 (`apt install --no-install-recommends npm`) |
| nginx | 1.28.3 + Certbot (cert Let's Encrypt ← `https://srv1981179.hstgr.cloud`, auto-renovable) |
| PostgreSQL | 18 (`main`, puerto 5432, escucha solo en localhost) |
| Firewall (ufw) | 22/tcp, 80/tcp, 443/tcp únicamente |
| Frontend | estático en `/var/www/bertika/` (build de Vite) |
| Backend | servicios `bertika-api.service` (systemd) en `127.0.0.1:3001` |
| Seed data | `/var/www/bertika/src/data/` (copia de la fuente de verdad) |
| Fotos | `/var/www/bertika/uploads/` |
| Backups | `/var/backups/bertika/` via cron diario |
| Env (secretos) | `/etc/bertika/bertika-api.env` (modo 600, fuera del árbol web) |

Acceso por SSH: `ssh -i ~/.ssh/id_ed25519_bertika root@srv1981179.hstgr.cloud`
(alias local configurado como `bertika-vps`).

## 2. DNS y HTTPS

- `A @` = `bertika.com` y `www.bertika.com` → `2.25.220.174` (propagado).
- Asegurar con: `curl -sI https://bertika.com`. Si la máquina local resuelve una IP vieja,
  revisar el caché del router/resolver (`dig +short bertika.com`).

## 3. Variables de entorno (secrets)

Archivo: `/etc/bertika/bertika-api.env` (600, `root`).

```
PORT=3001
DATABASE_URL=postgres://bertika:<PASS>@localhost:5432/bertika
JWT_SECRET=<hex-64>
ALLOWED_ORIGINS=https://bertika.com,https://www.bertika.com
UPLOAD_DIR=/var/www/bertika/uploads
PUBLIC_URL=https://bertika.com
```

Plantilla versionada: `api/.env.example`. Nunca commitees `.env`.

## 4. Servicio systemd (`bertika-api`)

Unidad: `/etc/systemd/system/bertika-api.service` (template en `deploy/bertika-api.service`).

```ini
[Unit]
Description=Bertika API (Express + PostgreSQL)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=/var/www/bertika/api
EnvironmentFile=/etc/bertika/bertika-api.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
User=root
Group=root

[Install]
WantedBy=multi-user.target
```

Operación:

```bash
systemctl daemon-reload && systemctl enable --now bertika-api
systemctl restart bertika-api
systemctl is-active bertika-api                 # active
journalctl -u bertika-api -n 50 --no-pager      # logs
```

## 5. nginx

`/etc/nginx/sites-available/bertika` (activo vía symlink; bloques SSL administrados por Certbot).
Aparte de servir `index.html` (SPA), define:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    client_max_body_size 10m;
}

location /uploads/ {
    alias /var/www/bertika/uploads/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

Template versionado: `deploy/bertika.conf`. Validar con `nginx -t` y recargar con `systemctl reload nginx`.

## 6. Despliegue

```bash
npm run deploy
# = scripts/deploy.sh
```

Qué hace `scripts/deploy.sh`:

1. `npm run build` (frontend → `dist/`).
2. `rsync --delete dist/` → `/var/www/bertika/` **excluyendo** `api`, `src`, `uploads`
   (para no borrar backend, seed ni fotos).
3. `rsync api/` → `/var/www/bertika/api/` (excluye `node_modules` y `.env`).
4. `rsync src/data/` → `/var/www/bertika/src/data/` (fuente del seed).
5. En el VPS: `npm ci --omit=dev` + `systemctl restart bertika-api`.
6. Verificación HTTP de `https://bertika.com`, `/api/public/stats` y el hostname del VPS.

> En el primer despliegue a un VPS nuevo hay que: crear la BD (`createdb`), el usuario de BD,
> escribir `/etc/bertika/bertika-api.env`, instalar `npm`, y correr `node api/seed.js` una vez.

### Inicializar una base de datos nueva

```bash
# en el VPS
su - postgres -c "createuser bertika && createdb -O bertika bertika && psql -c \"ALTER USER bertika PASSWORD '<PASS>'\""   # (pg_hba permite host + scram)
cd /var/www/bertika/api && node seed.js   # crea tablas y carga datos demo
```

## 7. Semilla / reset de datos

- `node api/seed.js` es **idempotente** (crea tablas con `schema.sql` y re-siembra la demo).
- Endpoint `POST /api/reset` (solo admin) lo ejecuta como proceso hijo.
  **Advertencia:** borra las tablas demo y recarga el seed — en producción solo para demos.
- Fuente de verdad de los datos: `src/data/seed.js` (se despliega junto con `api/`).
- Credenciales demo del seed: ver README (admin / técnico / cliente).
- Los ids siguen un contador (`contadores`): `ord_100+`, `ev_100+`, `bat_100+`, `cli_100+`, `usr_100+`, etc.

## 8. Backups

Cron diario a las 03:17 (host): `/etc/cron.d/bertika-backup` → `/usr/local/bin/bertika-backup.sh`.

```bash
pg_dump -h 127.0.0.1 -U bertika bertika > /var/backups/bertika/bertika_$(date +%F_%H%M).sql
gzip —f ... ; find … -mtime +14 -delete   # retención 14 días
```

Restaurar:

```bash
gunzip -c /var/backups/bertika/bertika_YYYY-MM-DD_HHMM.sql.gz | psql -h 127.0.0.1 -U bertika bertika
```

## 9. Troubleshooting

- **`npm` no encontrado en ssh no interactivo:** Hostinger instala Node en `/usr/bin` pero no npm.
  Instalarlo con `apt-get install -y --no-install-recommends npm` (npm 9 + node 22 OK).
- **`non-integer constant in ORDER BY`:** Postgres no acepta `ORDER BY NULL` (válido en SQLite).
  Usar `SELECT * FROM t` o `ORDER BY <col>`.
- **502 desde nginx tras desplegar:** el `rsync --delete` del frontend puede haber borrado `api/`
  (y su `.env`) si no se excluye. El script actual excluye `api`, `src`, `uploads` y el `.env`
  vive fuera del árbol (`/etc/bertika/bertika-api.env`). Verificar con `systemctl is-active bertika-api`.
- **Caché DNS local apuntando a IP vieja:** `curl -sI https://srv1981179.hstgr.cloud` para confirmar
  que el VPS está healthy; luego limpiar caché del router/resolver.
- **`Peer authentication failed`:** Postgres exige autenticación por host TCP
  (`psql -h 127.0.0.1 -U bertika`), no por socket local.
- **CORS:** la API solo acepta `ALLOWED_ORIGINS` (por defecto `PUBLIC_URL`); en dev, el proxying de
  Vite evita CORS.

## 10. Rutas de dominio público

| Ruta | Uso |
| --- | --- |
| `/` | Landing (stats públicas) |
| `/auth` | Login |
| `/tracker/:orden_id` | Seguimiento sin login |
| `/api/public/*` | Endpoints públicos (stats, búsqueda, cotización, contacto) |
| `/uploads/*` | Fotos subidas por multer |

## 11. Hoja de referencia rápida

```bash
# Salud
ssh bertika-vps "systemctl is-active bertika-api bertika-api; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/public/stats"

# Logs
ssh bertika-vps "journalctl -u bertika-api -n 50 --no-pager"

# Deploy
npm run deploy

# Backup manual
ssh bertika-vps "PGPASSWORD='<PASS>' /usr/local/bin/bertika-backup.sh"
```