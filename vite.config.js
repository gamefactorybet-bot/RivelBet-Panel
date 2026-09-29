import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));

/**
 * Lee el .env sin depender de dotenv.
 * Las variables sin prefijo VITE_ (como SUPABASE_SERVICE_ROLE_KEY) no las
 * expone Vite al cliente, así que las cargamos a process.env para que las
 * funciones de /api las vean igual que en Vercel.
 */
function cargarEnv() {
  const archivo = resolve(raiz, '.env');
  if (!existsSync(archivo)) return;

  for (const linea of readFileSync(archivo, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const corte = limpia.indexOf('=');
    if (corte === -1) continue;

    const clave = limpia.slice(0, corte).trim();
    const valor = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');

    if (!process.env[clave]) process.env[clave] = valor;
  }
}

/**
 * Corre las funciones serverless de /api durante `npm run dev`.
 * Replica lo justo del entorno de Vercel: req.body ya parseado,
 * req.query, y los helpers res.status().json().
 * En producción esto no se usa — ahí las corre Vercel de verdad.
 */
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // URLs limpias: /jugador -> /jugador.html
        // Así el link que se les pasa a los jugadores no lleva extensión.
        const soloRuta = req.url.split('?')[0];
        if (soloRuta === '/jugador' || soloRuta === '/jugador/') {
          req.url = '/jugador.html' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
          return next();
        }

        if (!req.url.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        const nombre = url.pathname.replace('/api/', '');
        const archivo = resolve(raiz, 'api', `${nombre}.js`);

        if (!existsSync(archivo)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `No existe /api/${nombre}` }));
          return;
        }

        try {
          // Leemos el cuerpo del pedido
          let body = {};
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const crudo = Buffer.concat(chunks).toString();
            body = crudo ? JSON.parse(crudo) : {};
          }

          req.body = body;
          req.query = Object.fromEntries(url.searchParams);
          req.headers.authorization = req.headers.authorization || '';

          // Helpers que las funciones esperan encontrar en res
          res.status = (codigo) => {
            res.statusCode = codigo;
            return res;
          };
          res.json = (datos) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(datos));
            return res;
          };

          // Import con timestamp para que los cambios en /api se tomen
          // sin reiniciar el servidor.
          const modulo = await server.ssrLoadModule(`/api/${nombre}.js`);
          await modulo.default(req, res);
        } catch (err) {
          console.error(`[api/${nombre}]`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Error interno' }));
          }
        }
      });
    },
  };
}

cargarEnv();

// VITE_APP_MODE decide qué se construye:
//   'panel'  -> solo el panel del staff
//   'portal' -> solo el portal del jugador, servido en la raíz
//   sin definir -> los dos (desarrollo y deploy único)
const modo = process.env.VITE_APP_MODE;

const entradas = {
  panel:  { panel: resolve(raiz, 'index.html') },
  portal: { jugador: resolve(raiz, 'jugador.html') },
};

export default defineConfig({
  plugins: [
    react(),
    apiLocal(),
    // En el build del portal, jugador.html pasa a ser index.html: el
    // jugador entra por la raíz del dominio, sin /jugador en la URL.
    modo === 'portal' && {
      name: 'portal-en-raiz',
      closeBundle() {
        const origen = resolve(raiz, 'dist/jugador.html');
        if (existsSync(origen)) {
          renameSync(origen, resolve(raiz, 'dist/index.html'));
        }
      },
    },
  ].filter(Boolean),
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: entradas[modo] || { ...entradas.panel, ...entradas.portal },
    },
  },
});
