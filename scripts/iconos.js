#!/usr/bin/env node
/**
 * Genera el ícono de la app (hoja magenta de Diseñarte + portapapeles con palomitas) en todos los tamaños.
 *
 *   node scripts/iconos.js
 *
 * Usa sharp desde node_modules del Cotizador (esta app no tiene dependencias propias).
 * Si cambias el ícono, cambia también la versión (?v=) en index.html y la caché de sw.js.
 */
const fs = require("fs");
const path = require("path");
const sharp = require(path.resolve(__dirname, "../../5.cotizador-disenarte/cotizador-disenarte/node_modules/sharp"));

const RAIZ = path.resolve(__dirname, "..");
const MAGENTA = "#A53692";
const MORADO = "#7C07A6";

// Hoja: esquinas superior izquierda e inferior derecha muy redondeadas (~40 %), las otras dos apenas (~11 %).
const HOJA = "M12,207.2 A195.2,195.2 0 0 1 207.2,12 H446.32 A53.68,53.68 0 0 1 500,65.68 V304.8 A195.2,195.2 0 0 1 304.8,500 H65.68 A53.68,53.68 0 0 1 12,446.32 Z";

// Pictograma en la retícula de 24 de lucide (trazo 2, extremos redondeados).
function pictograma(color, escala, x, y) {
  return `<g transform="translate(${x} ${y}) scale(${escala})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <path d="m7.5 11 1.3 1.3 2.4-2.4"/><path d="M13.5 11.5h3"/>
    <path d="m7.5 16 1.3 1.3 2.4-2.4"/><path d="M13.5 16.5h3"/>
  </g>`;
}

// Hoja con transparencia (favicon, PWA, interfaz sobre fondos claros).
const hoja = (fondo, trazo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${fondo}" d="${HOJA}"/>${pictograma(trazo, 10.5, 130, 130)}</svg>`;

// Cuadrado de color completo, pictograma dentro del 80 % central (maskable y apple-touch, opacos).
const cuadrado = (escala) => {
  const lado = 24 * escala;
  const o = (512 - lado) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${MAGENTA}"/>${pictograma("#FFFFFF", escala, o, o)}</svg>`;
};

// ICO con PNG incrustados (Windows Vista+ y todos los navegadores lo aceptan).
function ico(pngs) {
  const cab = Buffer.alloc(6 + 16 * pngs.length);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let desp = cab.length;
  pngs.forEach(({ lado, buf }, i) => {
    const b = 6 + 16 * i;
    cab.writeUInt8(lado >= 256 ? 0 : lado, b); cab.writeUInt8(lado >= 256 ? 0 : lado, b + 1);
    cab.writeUInt16LE(1, b + 4); cab.writeUInt16LE(32, b + 6);
    cab.writeUInt32LE(buf.length, b + 8); cab.writeUInt32LE(desp, b + 12);
    desp += buf.length;
  });
  return Buffer.concat([cab, ...pngs.map((p) => p.buf)]);
}

const png = (svg, lado) => sharp(Buffer.from(svg), { density: 384 }).resize(lado, lado).png().toBuffer();

(async () => {
  const color = hoja(MAGENTA, "#FFFFFF");
  const positivo = hoja("#FFFFFF", MORADO);
  fs.writeFileSync(path.join(RAIZ, "favicon.svg"), color);
  fs.writeFileSync(path.join(RAIZ, "icons/hoja.svg"), color);
  fs.writeFileSync(path.join(RAIZ, "icons/hoja-blanca.svg"), positivo);

  fs.writeFileSync(path.join(RAIZ, "icons/icon-192.png"), await png(color, 192));
  fs.writeFileSync(path.join(RAIZ, "icons/icon-512.png"), await png(color, 512));
  fs.writeFileSync(path.join(RAIZ, "icons/icon-192-maskable.png"), await png(cuadrado(8.5), 192));
  fs.writeFileSync(path.join(RAIZ, "icons/icon-512-maskable.png"), await png(cuadrado(8.5), 512));
  // iOS pinta de negro las esquinas transparentes: va opaco.
  fs.writeFileSync(path.join(RAIZ, "icons/apple-touch-icon.png"), await png(cuadrado(11), 180));

  const pngs = [];
  for (const lado of [16, 32, 48]) pngs.push({ lado, buf: await png(color, lado) });
  fs.writeFileSync(path.join(RAIZ, "favicon.ico"), ico(pngs));
  console.log("Íconos generados.");
})();
