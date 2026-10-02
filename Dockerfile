# Checklist de Instalaciones — Diseñarte México. App estática servida con nginx.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html manifest.webmanifest sw.js favicon.ico favicon.svg /usr/share/nginx/html/
COPY fonts /usr/share/nginx/html/fonts
COPY icons /usr/share/nginx/html/icons
COPY img /usr/share/nginx/html/img
EXPOSE 80
