import { supabase, getSessionWithProfile } from './lib/supabaseClient.js';
import { loadSettings, huboFallaDeConexion } from './lib/settings.js';
import { apiFetch } from './lib/api.ts';
import { renderLogin } from './pages/Login.tsx';
import { renderDashboard } from './pages/dashboard.js';

const app = document.getElementById('app');

async function boot() {
  // La apariencia se carga ANTES de pintar nada, así el login
  // ya aparece con el tema del casino y no hay parpadeo.
  const settings = await loadSettings();
  document.title = settings.casino_name;

  if (huboFallaDeConexion()) {
    app.innerHTML = avisoSinConexion();
    return;
  }

  const { session, profile } = await getSessionWithProfile();

  if (session) {
    // No esperamos la respuesta: si falla, no tiene por qué frenar el ingreso.
    apiFetch('/api/staff?recurso=acceso', { method: 'POST' });
    renderDashboard(app, { session, profile, settings });
  } else {
    renderLogin(app, settings, async (newSession) => {
      const { profile: newProfile } = await getSessionWithProfile();
      renderDashboard(app, { session: newSession, profile: newProfile, settings });
    });
  }
}

// Si el token se refresca o se cierra sesión en otra pestaña, reaccionamos acá.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    boot();
  }
});

boot();

/**
 * Pantalla de "no llegamos a la base".
 * Sin esto la app queda en blanco y no hay forma de saber qué pasó.
 */
function avisoSinConexion() {
  return `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
      <div class="card" style="max-width:420px;text-align:center">
        <h2 style="margin-top:0">No se pudo conectar</h2>
        <p class="hint">
          No llegamos a la base de datos. Puede ser un problema de red, o que el
          proyecto de Supabase esté pausado.
        </p>
        <div class="acciones" style="justify-content:center">
          <button onclick="window.location.reload()">Reintentar</button>
        </div>
      </div>
    </div>
  `;
}
