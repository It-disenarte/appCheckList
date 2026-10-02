# Checklist de Instalaciones — Diseñarte México

Hoja de control de equipo y materiales para instalaciones. Instalable como PWA y usable sin internet.

Los **artículos agregados** y las **checklists frecuentes** se comparten con todo el equipo (Postgres). La hoja que se está llenando es de cada dispositivo hasta imprimirla.

- `index.html`: toda la interfaz (sin build).
- `server.js`: Node sin framework; sirve la app y la API (`/api/datos`, `/api/articulos`, `/api/frecuentes`). Crea las tablas al arrancar.

## Sin login

Cualquiera con el enlace puede usarla. Para que un error tenga arreglo:

- **Nada se borra de verdad**: se marca `borrado` con la fecha. Para recuperar algo:
  ```sql
  UPDATE frecuentes SET borrado = NULL WHERE nombre = 'Vinil en muro';
  UPDATE articulos  SET borrado = NULL WHERE nombre = 'Espátula';
  ```
- Máximo 120 cambios por minuto por IP.

## Despliegue (EasyPanel)

1. **+ Service → Postgres** (p. ej. `checklist-db`). Copia su *Internal Connection URL*.
2. **+ Service → App** → Source: GitHub, este repo, rama `main` → Build: **Dockerfile**.
3. En la App → **Environment**: `DATABASE_URL=<la Internal Connection URL>`.
4. **Domains**: tu dominio, puerto **3000** (HTTPS lo pone EasyPanel; la PWA lo necesita).
5. **Deploy**. En los logs debe salir `Base de datos lista.` Comprobación: `https://tu-dominio/api/salud` → `{"ok":true}`.

Variables opcionales: `PGSSL=on` (base externa con SSL), `DB_POOL_MAX` (por defecto 5).

## Local

```
npm install
DATABASE_URL=postgres://usuario:clave@localhost:5432/checklist node server.js
```
Sin `DATABASE_URL` la app abre igual, pero lo compartido no se sincroniza.

## Al cambiar algo

- Sube la versión de la caché en `sw.js` (`CACHE = 'checklist-vN'`) para que los teléfonos descarguen lo nuevo.
- Íconos: `node scripts/iconos.js` (usa `sharp` desde la carpeta del Cotizador) y sube el `?v=` en `index.html`.
