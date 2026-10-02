// Checklist de Instalaciones — servidor: sirve la app y la API de datos compartidos (Postgres).
// Sin login: cualquiera con el enlace puede usarla. Por eso nada se borra de verdad (se marca
// `borrado` y se recupera desde la base) y las escrituras tienen un límite por IP.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT || 3000);
const CATEGORIAS = new Set(["diseno", "montaje", "electrico", "limpieza", "epp"]);

// ---------- Base de datos ----------
let pool = null, listo = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // El Postgres de EasyPanel va por la red interna, sin SSL. Para una base externa: PGSSL=on.
      ssl: process.env.PGSSL === "on" ? { rejectUnauthorized: false } : false,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

function esquema() {
  if (!listo) listo = db().query(`
    CREATE TABLE IF NOT EXISTS articulos (
      id TEXT PRIMARY KEY,
      categoria TEXT NOT NULL,
      nombre TEXT NOT NULL,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      borrado TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS frecuentes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      items JSONB NOT NULL,
      extras TEXT NOT NULL DEFAULT '',
      usos INTEGER NOT NULL DEFAULT 0,
      ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT now(),
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      modificado TIMESTAMPTZ NOT NULL DEFAULT now(),
      borrado TIMESTAMPTZ
    );
  `).catch(e => { listo = null; throw e; });
  return listo;
}

async function q(sql, params) {
  await esquema();
  return db().query(sql, params);
}

async function tx(fn) {
  await esquema();
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const r = await fn((sql, params) => c.query(sql, params));
    await c.query("COMMIT");
    return r;
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
}

// ---------- Utilidades ----------
class ErrorHttp extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado; } }
const clave = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ID = /^[a-z0-9]{4,40}$/;

function texto(v, max, campo) {
  if (typeof v !== "string") throw new ErrorHttp(400, `Falta ${campo}.`);
  const t = v.trim().replace(/\s+/g, " ");
  if (!t || t.length > max) throw new ErrorHttp(400, `${campo} no es válido.`);
  return t;
}

function validarItems(items) {
  if (!items || typeof items !== "object" || Array.isArray(items)) throw new ErrorHttp(400, "Faltan los artículos.");
  const pares = Object.entries(items);
  if (!pares.length || pares.length > 300) throw new ErrorHttp(400, "La lista de artículos no es válida.");
  const limpio = {};
  for (const [k, v] of pares) {
    if (k.length > 100 || !/^[a-z]+:[a-z0-9-]+$/.test(k)) throw new ErrorHttp(400, "Un artículo no es válido.");
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new ErrorHttp(400, "Una cantidad no es válida.");
    limpio[k] = n;
  }
  return limpio;
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "", tam = 0;
    req.on("data", c => {
      tam += c.length;
      if (tam > 64 * 1024) { reject(new ErrorHttp(413, "Demasiados datos.")); req.destroy(); return; }
      datos += c;
    });
    req.on("end", () => {
      if (!datos) return resolve({});
      try { resolve(JSON.parse(datos)); } catch { reject(new ErrorHttp(400, "JSON no válido.")); }
    });
    req.on("error", reject);
  });
}

// Límite de escrituras por IP: 120 por minuto alcanza de sobra para uso normal y sincronizaciones.
const escrituras = new Map();
function limitar(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ahora = Date.now(), r = escrituras.get(ip) || { desde: ahora, n: 0 };
  if (ahora - r.desde > 60000) { r.desde = ahora; r.n = 0; }
  r.n++;
  escrituras.set(ip, r);
  if (r.n > 120) throw new ErrorHttp(429, "Demasiados cambios seguidos. Espera un minuto.");
}
setInterval(() => { const ahora = Date.now(); for (const [ip, r] of escrituras) if (ahora - r.desde > 60000) escrituras.delete(ip); }, 60000).unref();

function json(res, estado, cuerpo) {
  res.writeHead(estado, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(cuerpo));
}

const fila = (f) => ({ id: f.id, nombre: f.nombre, items: f.items, extras: f.extras, usos: f.usos, ultimoUso: new Date(f.ultimo_uso).getTime() });

// ---------- API ----------
async function api(req, res, ruta) {
  if (!db()) throw new ErrorHttp(503, "La base de datos no está configurada (falta DATABASE_URL).");
  const metodo = req.method;
  let m;

  if (ruta === "/api/salud" && metodo === "GET") {
    await q("SELECT 1");
    return json(res, 200, { ok: true });
  }

  if (ruta === "/api/datos" && metodo === "GET") {
    const [a, f] = await Promise.all([
      q("SELECT id, categoria, nombre FROM articulos WHERE borrado IS NULL ORDER BY creado, id"),
      q("SELECT * FROM frecuentes WHERE borrado IS NULL ORDER BY usos DESC, ultimo_uso DESC")
    ]);
    return json(res, 200, { articulos: a.rows, frecuentes: f.rows.map(fila) });
  }

  if (metodo !== "GET") limitar(req);

  if (ruta === "/api/articulos" && metodo === "POST") {
    const b = await leerCuerpo(req);
    const categoria = String(b.categoria || "");
    if (!CATEGORIAS.has(categoria)) throw new ErrorHttp(400, "La categoría no es válida.");
    const id = String(b.id || "");
    if (!new RegExp(`^${categoria}:p-[a-z0-9]{4,40}$`).test(id)) throw new ErrorHttp(400, "El identificador no es válido.");
    const nombre = texto(b.nombre, 60, "El nombre");
    return json(res, 200, await tx(async (t) => {
      await t("SELECT pg_advisory_xact_lock(hashtext($1))", ["art:" + categoria]);
      const activos = await t("SELECT id, categoria, nombre FROM articulos WHERE categoria = $1 AND borrado IS NULL", [categoria]);
      const igual = activos.rows.find(r => r.id === id || clave(r.nombre) === clave(nombre));
      if (igual) return { articulo: igual, duplicado: igual.id !== id };
      await t("INSERT INTO articulos (id, categoria, nombre) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET borrado = NULL", [id, categoria, nombre]);
      return { articulo: { id, categoria, nombre } };
    }));
  }

  if ((m = ruta.match(/^\/api\/articulos\/([^/]+)$/)) && metodo === "DELETE") {
    await q("UPDATE articulos SET borrado = now() WHERE id = $1 AND borrado IS NULL", [decodeURIComponent(m[1])]);
    return json(res, 200, { ok: true });
  }

  if ((m = ruta.match(/^\/api\/frecuentes\/([a-z0-9]+)$/)) && metodo === "PUT") {
    const id = m[1];
    if (!ID.test(id)) throw new ErrorHttp(400, "El identificador no es válido.");
    const b = await leerCuerpo(req);
    const nombre = texto(b.nombre, 60, "El nombre");
    const items = validarItems(b.items);
    const extras = typeof b.extras === "string" ? b.extras.slice(0, 2000) : "";
    const usos = Number.isInteger(b.usos) && b.usos >= 0 && b.usos < 100000 ? b.usos : 0; // solo al crearla
    return json(res, 200, await tx(async (t) => {
      // Mismo nombre que otra ya guardada → se actualiza esa (dos personas guardando "Vinil en muro").
      await t("SELECT pg_advisory_xact_lock(hashtext('frecuentes'))");
      const otra = await t("SELECT id FROM frecuentes WHERE lower(nombre) = lower($1) AND id <> $2 AND borrado IS NULL LIMIT 1", [nombre, id]);
      const destino = otra.rows[0] ? otra.rows[0].id : id;
      const r = await t(`
        INSERT INTO frecuentes (id, nombre, items, extras, usos) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, items = EXCLUDED.items, extras = EXCLUDED.extras,
          modificado = now(), borrado = NULL
        RETURNING *`, [destino, nombre, JSON.stringify(items), extras, usos]);
      return { frecuente: fila(r.rows[0]) };
    }));
  }

  if ((m = ruta.match(/^\/api\/frecuentes\/([a-z0-9]+)\/uso$/)) && metodo === "POST") {
    await q("UPDATE frecuentes SET usos = usos + 1, ultimo_uso = now() WHERE id = $1 AND borrado IS NULL", [m[1]]);
    return json(res, 200, { ok: true });
  }

  if ((m = ruta.match(/^\/api\/frecuentes\/([a-z0-9]+)$/)) && metodo === "DELETE") {
    await q("UPDATE frecuentes SET borrado = now() WHERE id = $1 AND borrado IS NULL", [m[1]]);
    return json(res, 200, { ok: true });
  }

  throw new ErrorHttp(404, "No existe.");
}

// ---------- Archivos de la app ----------
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2"
};
const SUELTOS = new Set(["/index.html", "/sw.js", "/manifest.webmanifest", "/favicon.ico", "/favicon.svg"]);
const CARPETAS = ["/fonts/", "/icons/", "/img/"];

function estatico(req, res, ruta) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (ruta === "/") ruta = "/index.html";
  const permitido = SUELTOS.has(ruta) || (CARPETAS.some(c => ruta.startsWith(c)) && !ruta.includes(".."));
  let archivo = permitido ? path.join(RAIZ, ruta) : null;
  if (!archivo || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
    // Rutas desconocidas sin extensión → la app; archivos que no existen → 404.
    if (path.extname(ruta)) { res.writeHead(404); return res.end(); }
    archivo = path.join(RAIZ, "index.html"); ruta = "/index.html";
  }
  const ext = path.extname(archivo);
  // El HTML, el service worker y el manifest siempre se revisan para que llegue el diseño nuevo.
  const cache = SUELTOS.has(ruta) && ext !== ".ico" && ext !== ".svg" ? "no-cache" : "public, max-age=604800";
  res.writeHead(200, { "content-type": TIPOS[ext] || "application/octet-stream", "cache-control": cache, "x-content-type-options": "nosniff" });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(archivo).pipe(res);
}

http.createServer(async (req, res) => {
  let ruta;
  try { ruta = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (!ruta.startsWith("/api/")) return estatico(req, res, ruta);
  try {
    await api(req, res, ruta);
  } catch (e) {
    const estado = e.estado || 500;
    if (estado >= 500) console.error(req.method, ruta, e);
    if (!res.headersSent) json(res, estado, { error: estado >= 500 && !e.estado ? "Error del servidor." : e.message });
  }
}).listen(PUERTO, () => {
  console.log(`Checklist en http://localhost:${PUERTO}` + (db() ? "" : " (sin DATABASE_URL: los datos compartidos no funcionan)"));
  if (db()) esquema().then(() => console.log("Base de datos lista."), e => console.error("Base de datos:", e.message));
});
