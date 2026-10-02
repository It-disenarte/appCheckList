# Checklist de Instalaciones — Diseñarte México

Hoja de control de equipo y materiales para instalaciones. App estática (HTML + CSS + JS, sin build), instalable como PWA y usable sin internet.

## Despliegue (EasyPanel)

Servicio **App** → Source: GitHub, este repositorio, rama `main` → Build: **Dockerfile**. El contenedor es nginx y escucha en el puerto **80**.

Cada `git push` a `main` se despliega con el botón **Deploy** de EasyPanel (o automático si está activado el *Auto Deploy*).

## Al cambiar algo

- Sube la versión de la caché en `sw.js` (`CACHE = 'checklist-vN'`) para que los teléfonos descarguen lo nuevo.
- Íconos: `node scripts/iconos.js` (usa `sharp` desde la carpeta del Cotizador) y sube el `?v=` en `index.html`.
