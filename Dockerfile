# Checklist de Instalaciones — Diseñarte México. Node sirve la app y la API (Postgres).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js index.html manifest.webmanifest sw.js favicon.ico favicon.svg ./
COPY fonts ./fonts
COPY icons ./icons
COPY img ./img
EXPOSE 3000
USER node
CMD ["node", "server.js"]
