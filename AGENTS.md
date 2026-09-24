# AGENTS.md — Reglas de trabajo

## Seguridad (obligatorio, no negociable)
- **PROHIBIDO ejecutar comandos git destructivos sin aprobación explícita del usuario**:
  `git checkout -- .`, `git checkout -- <ruta>`, `git reset --hard`, `git clean -f`, `git restore .`.
  Cualquiera de estos comandos requiere preguntar primero SIEMPRE.
- **PROHIBIDO borrar archivos con `rm` masivo / `rm -rf`** sin confirma; usar un `mv` a un directorio `trash/` si hace falta probar.
- Antes de CUALQUIER git operation, correr `git status --short` y leer el resultado.
- Los archivos bajo control de git y los que no lo están conviven: este repo tiene mucha lógica SIN commitear. Tratar cada archivo como irremplazable.

## Checkpoints (recomendado antes de cada tarea grande y antes de cada deploy)
1. `bash scripts/checkpoint.sh "descripcion"` → commitea TODO (tracked + untracked) en 1 comando, local, sin push.
2. Si el usuario no quiere commits: crear un zip de respaldo `backups/<fecha>.zip` de la carpeta fuente.
3. Tras terminar un hito: SEGUIR commiteando (`checkpoint.sh` o `git commit`) para que el trabajo nunca quede solo en el working tree.

## Deploy
- Usar `bash scripts/deploy.sh`. El deploy NUNCA debe incluir `*.md`, `docs`, `PROMPT*`, `INSTRUCTIVO*`, `readme*`, `.env`, claves ni secretos.
- `deploy.sh` aborta solo si el dist contiene "Vertika" o no lleva la marca Bertika (guard anti-regresion). No deshabilitar ese guard.
- No revelar secretos en logs ni mensajes. Los secretos viven en el Llavero de macOS (service `bertika`) y en `/etc/bertika/bertika-api.env` de la VPS, nunca en el repo.

## Respaldos (regla del dueño, 24/09/2026)
- **El respaldo NO es programado de nuestro lado**: no reinstalar la bajada automática a la Mac
  (LaunchAgent `com.bertika.backup`; sus archivos quedaron en `trash/backup-mac-automatico/`).
- El respaldo se dispara a mano desde el panel: **Sistema → Respaldos → «Respaldar ahora»**
  (corre en el VPS y baja el `.sql.gz` al navegador). Endpoints en `api/server.js` (`/api/respaldos`).
- El cron del VPS de las 03:17 se mantiene como red de seguridad. Tras tocar `scripts/backup-db.sh`
  hay que correr `bash scripts/backup-db.sh --instalar` (el deploy no toca `/usr/local/bin`).

## Reglas de negocio (no cambiar sin pedido explicito)
- **No se asignan clientes a los tecnicos.** Cualquier tecnico trabaja con cualquier
  orden/bateria, sin importar de que cliente sea (`tecnico_id` es solo informativo:
  indica quien la esta haciendo, no un permiso). Lo unico reservado al admin es
  **entregar** (cobra y carga la garantia), **cancelar** y **dar de baja**.
- Los permisos por usuario se manejan con la matriz de `src/data/permisos.js`
  (panel Usuarios): secciones visibles + capacidades crear/editar/borrar.

## Contacto / datos reales
- Datos de contacto centralizados en `src/data/siteData.js` (no hardcodear).
- Marca: `BERTIKA®` (sin `.S.R.L.`). No usar "Vertika"/"BateriaOS".
- Cotizador de visita: tarifas en `src/data/cotizadorVisita.js`, en USD (dólar Banco Central), provisorias.