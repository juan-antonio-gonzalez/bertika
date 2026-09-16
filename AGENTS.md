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

## Contacto / datos reales
- Datos de contacto centralizados en `src/data/siteData.js` (no hardcodear).
- Marca: `BERTIKA®` (sin `.S.R.L.`). No usar "Vertika"/"BateriaOS".
- Cotizador de visita: tarifas en `src/data/cotizadorVisita.js`, en USD (dólar Banco Central), provisorias.