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
| Backups | `/var/backups/bertika/` (cron diario del servidor + botón manual del panel `/respaldos`) |
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

# Robustez (Fase 1) - opcionales pero recomendados
# A donde mandar las alertas del monitoreo (base, cola atascada, respaldo viejo, 5xx).
ALERTAS_EMAIL=dueno@bertika.com
# Alternativa/complemento: un webhook que recibe { tipo, mensaje, detalle, fecha }.
# ALERTAS_WEBHOOK=https://hooks.slack.com/services/...
# Carpeta de respaldos que revisa /api/salud (por defecto /var/backups/bertika).
BACKUP_DIR=/var/backups/bertika
# Se pueden apagar para depurar; en produccion tienen que quedar en 1.
OUTBOX_WORKER=1
MONITOREO=1
```

`GET /api/health` queda público y sin datos sensibles: sirve para un monitor de uptime
(devuelve 503 si la base no responde). El detalle está en **Sistema → Salud y auditoría**
(`GET /api/salud`, permiso `sistema`).

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
bash scripts/deploy.sh
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

**Estado real (23/09/2026): los respaldos estuvieron rotos desde el 16/09.** El cron
corría todos los días pero `pg_dump` fallaba por falta de contraseña y dejaba archivos
de **0 bytes**; nadie lo notaba porque el cron no avisa y no había log. El respaldo
bueno más viejo que quedaba era del 15/09.

Ahora el respaldo vive en el repo y se instala con un comando:

```bash
bash scripts/backup-db.sh --instalar    # lo copia al VPS y arma el cron diario 03:17
bash scripts/backup-db.sh               # corre un respaldo ahora
bash scripts/backup-db.sh --verificar   # RESTAURA el último respaldo en una base de
                                        # prueba y cuenta filas (no toca la real)
```

Qué hace distinto del anterior:

1. usa la cadena de conexión de la app (`/etc/bertika/bertika-api.env`), así no depende
   de que la contraseña esté en el entorno del cron;
2. **valida** que el dump pese más de 2 KB y traiga las tablas del taller (si no, falla
   y no guarda un archivo vacío que parezca bueno);
3. borra los respaldos viejos (14 días) **y** los `.sql` vacíos que quedaron del script roto;
4. deja el resultado en `/var/log/bertika-backup.log` (el cron redirige ahí).

Cron diario a las 03:17 (host): `/etc/cron.d/bertika-backup` → `/usr/local/bin/bertika-backup.sh --en-servidor`.

### Botón manual en el panel (admin)

Además del cron del servidor, el administrador puede respaldar **cuando quiere** desde
**Sistema → Respaldos** (`/respaldos`):

- **Respaldar ahora**: corre el respaldo en el VPS y baja el `.sql.gz` al navegador en el
  mismo click (queda en la carpeta de Descargas). Las fotos van en un `.tar.gz` aparte.
- Debajo, la lista de copias del servidor (tamaño y fecha) con un botón para bajar cada una.

No hay ninguna tarea programada en la Mac: la bajada automática diaria a las 09:15
(LaunchAgent `com.bertika.backup`) se quitó el 23/09/2026 a pedido del usuario. El único
automatismo que queda es el cron del propio servidor (03:17), como red de seguridad.

Endpoints (solo `respaldos`, que por plantilla es exclusivo del admin):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/api/respaldos` | Lista las copias del servidor (nombre, tipo, bytes, fecha) |
| `POST` | `/api/respaldos` | Corre el respaldo ahora (409 si ya hay uno en curso) |
| `GET` | `/api/respaldos/:archivo` | Baja el archivo (el nombre se valida contra un patrón fijo) |

El endpoint ejecuta el script con argumentos fijos (`--en-servidor --json`); nunca recibe
comandos del navegador. Variables opcionales: `BACKUP_DIR` (por defecto
`/var/backups/bertika`), `BACKUP_SCRIPT` (`/usr/local/bin/bertika-backup.sh`) y
`BACKUP_RETENCION_DIAS` (14, solo para mostrarlo en el panel).

> **El botón necesita el script instalado y actualizado en el VPS.** Después de tocar
> `scripts/backup-db.sh` hay que correr una vez `bash scripts/backup-db.sh --instalar`
> (el deploy no toca `/usr/local/bin`). Si falta, el panel avisa con ese mismo comando.

Restaurar a mano (reemplaza la base real: parar el servicio antes):

```bash
systemctl stop bertika-api
gunzip -c /var/backups/bertika/bertika_YYYY-MM-DD_HHMM.sql.gz | psql "$DATABASE_URL"
systemctl start bertika-api
```

### Copias fuera del servidor

Un respaldo en el mismo servidor no protege contra perder el servidor. Las copias son:

```bash
bash scripts/backup-db.sh --traer                    # trae la última copia a tu Mac (backups/)
bash scripts/backup-db.sh --configurar-nube <destino>  # copia automática en la nube
bash scripts/backup-db.sh --nube                     # prueba la copia a la nube ahora
```

La copia a la nube se hace **desde el servidor**, así cada respaldo (el del cron y el del
botón) se sube solo, sin depender de que tu Mac esté encendida. Necesita
[rclone](https://rclone.org) instalado en el VPS y un destino conectado:

```bash
apt-get install -y rclone      # en el VPS
rclone config                  # crear el remoto (Drive, S3, Backblaze, OneDrive…)
bash scripts/backup-db.sh --configurar-nube gdrive:bertika-backups
```

Sin destino configurado, el respaldo local funciona igual y el log aclara que la nube no está
configurada (no falla). En la nube se guardan 30 días.

> **Pendiente recomendado:** correr `--verificar` una vez por mes y anotarlo. Un respaldo
> que nunca se probó no es un respaldo.

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
bash scripts/deploy.sh

# Backup manual (desde la Mac, sin abrir el panel)
bash scripts/backup-db.sh

# Backup manual desde el panel: Sistema → Respaldos → «Respaldar ahora»
# (el mismo script, con --en-servidor --json, y baja la copia al navegador)
```