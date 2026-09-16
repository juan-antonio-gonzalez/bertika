# AGENTS.md — Reglas de trabajo

## Seguridad (obligatorio, no negociable)
- **PROHIBIDO ejecutar comandos git destructivos sin aprobación explícita del usuario**:
  `git checkout -- .`, `git checkout -- <ruta>`, `git reset --hard`, `git clean -f`, `git restore .`.
  Cualquiera de estos comandos requiere preguntar primero SIEMPRE.
- **PROHIBIDO borrar archivos con `rm` masivo / `rm -rf`** sin confirma; usar un `mv` a un directorio `trash/` si hace falta probar.
- Antes de CUALQUIER git operation, correr `git status --short` y leer el resultado.
- Los archivos bajo control de git y los que no lo están conviven: este repo tiene mucha lógica SIN commitear. Tratar cada archivo como irremplazable.

## Checkpoints (recomendado antes de cada tarea grande y antes de cada deploy)
1. `git add -A && git commit -m "checkpoint: <descripcion>"` (solo local, nunca push salvo pedido).
2. Si el usuario no quiere commits: crear un zip de respaldo `backups/<fecha>.zip` de la carpeta fuente.

## Deploy
- Usar `bash scripts/deploy.sh`. El deploy NUNCA debe incluir `*.md`, `docs`, `PROMPT*`, `INSTRUCTIVO*`, `readme*`, `.env`, claves ni secretos.
- No revelar secretos en logs ni mensajes.

## Contacto / datos reales
- Datos de contacto centralizados en `src/data/siteData.js` (no hardcodear).
- Marca: `BERTIKA®` (sin `.S.R.L.`). No usar "Vertika"/"BateriaOS".
- Cotizador de visita: tarifas en `src/data/cotizadorVisita.js`, en USD (dólar Banco Central), provisorias.