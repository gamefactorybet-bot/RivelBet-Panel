import { loadSettings, huboFallaDeConexion } from '../lib/settings.js';
import { applyBackground } from '../lib/themes.js';
import { playerFetch, guardarToken, leerToken, borrarToken } from './api.ts';
import { prefetchCatalogo, invalidarCatalogo } from './catalogo.ts';
import { renderPlayerLogin } from './login.js';
import { renderPlayerRegistro } from './registro.js';
import { renderPlayerHome } from './PlayerHome.tsx';

const app = document.getElementById('app');

// Al volver del juego (atrás / bfcache) recargamos el lobby: si no,
// el navegador restaura la pantalla de "Abriendo...".
window.addEventListener('pageshow', () => {
  if (sessionStorage.getItem('pt-volver-lobby') !== '1') return;
  sessionStorage.removeItem('pt-volver-lobby');
  window.location.reload();
});

let settingsActuales = null;

/** Login con el acceso a "Crear cuenta" ya cableado. */
function mostrarLogin(aviso) {
  renderPlayerLogin(app, settingsActuales, entrar, aviso, mostrarRegistro);
}

function mostrarRegistro() {
  renderPlayerRegistro(app, settingsActuales, entrar, () => mostrarLogin());
}

async function boot() {
  const token = leerToken();
  if (token) prefetchCatalogo();

  const settings = await loadSettings();
  settingsActuales = settings;
  document.title = settings.casino_name;

  applyBackground('login', {
    url: settings.bg_panel_url,
    dim: settings.bg_login_dim,
  });

  if (huboFallaDeConexion()) {
    app.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div class="card" style="max-width:380px;text-align:center">
          <h2 style="margin-top:0">Sin conexión</h2>
          <p class="hint">No pudimos conectarnos. Revisá tu internet y probá de nuevo.</p>
          <div class="acciones" style="justify-content:center">
            <button onclick="window.location.reload()">Reintentar</button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // "Entrar como jugador" desde el panel: llega acá con ?impersonar=<código>
  // en vez de un token guardado. Se saca de la URL apenas se lee, así
  // nunca queda pegado en el historial del navegador ni en un refresh.
  const url = new URL(window.location.href);
  const codigoImpersonar = url.searchParams.get('impersonar');

  if (codigoImpersonar) {
    url.searchParams.delete('impersonar');
    window.history.replaceState({}, '', url);

    const { ok, data, error } = await playerFetch('/api/player-sesion?recurso=impersonar', {
      method: 'POST',
      conToken: false,
      body: { codigo: codigoImpersonar },
    });

    if (ok) {
      entrar(data.token, data);
      return;
    }

    mostrarLogin(error);
    return;
  }

  if (token) {
    const { ok, data, error } = await playerFetch('/api/player-sesion');

    if (ok) {
      renderPlayerHome(app, { settings, datos: data, onSalir: salir });
      return;
    }

    // Sea sesión vencida, revocada o cuenta suspendida, el motivo se
    // muestra en el login para que el jugador sepa qué pasó.
    mostrarLogin(error);
    return;
  }

  mostrarLogin();
}

async function entrar(token, datosSesion) {
  guardarToken(token);
  prefetchCatalogo();

  // El login (y el canje de impersonación) ya devuelven todo lo que
  // hace falta para pintar el portal — si lo tenemos, lo usamos
  // directo en vez de volver a pedirlo. Ese segundo pedido, pegado
  // justo al de login, era el que a veces se colgaba y dejaba al
  // jugador viendo "Entrando..." para siempre (arreglado también del
  // lado del servidor, pero esto evita depender de un segundo viaje).
  if (datosSesion) {
    const settings = await loadSettings();
    renderPlayerHome(app, { settings, datos: datosSesion, onSalir: salir });
    return;
  }

  await boot();
}

function salir() {
  borrarToken();
  invalidarCatalogo();
  boot();
}

boot();
