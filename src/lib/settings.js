import { DEFAULT_SETTINGS, applyAppearance, applyBackground } from './themes.js';

let cached = null;

// Igual que en el cliente del jugador: si el deploy separa la API de
// la app, VITE_API_BASE apunta a dónde vive /api. Vacío = mismo dominio.
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

/**
 * Lee la apariencia desde /api/config (pública, sin login). Antes se
 * consultaba `casino_settings` directo con la clave anónima, pero esa
 * clave no puede leer `animaciones` (es RLS solo-staff) — los íconos
 * animados de soporte y del saldo necesitan el join server-side, que
 * corre con la clave de servicio.
 * Si falla, cae en los valores por defecto para que la app nunca quede
 * en blanco por un problema de red.
 */
export async function loadSettings() {
  if (cached) return cached;

  // Con timeout: si la base no responde (proyecto pausado, red caída),
  // la app arranca igual con los valores por defecto en vez de quedarse
  // en una pantalla en blanco sin explicación.
  let data = null;
  let falla = null;

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);

  try {
    const respuesta = await fetch(`${BASE}/api/config?recurso=settings`, { signal: control.signal });
    const texto = await respuesta.text();
    const cuerpo = texto ? JSON.parse(texto) : {};

    if (!respuesta.ok) falla = new Error(cuerpo.error || `Error ${respuesta.status}`);
    else data = cuerpo;
  } catch (err) {
    falla = err;
  } finally {
    clearTimeout(reloj);
  }

  if (falla) {
    console.warn('[settings] no se pudo leer la configuración:', falla.message);
    sinConexion = true;
  }

  cached = data || { ...DEFAULT_SETTINGS };
  aplicarTodo(cached);
  return cached;
}

let sinConexion = false;

/** ¿Arrancamos sin poder hablar con la base? */
export function huboFallaDeConexion() {
  return sinConexion;
}

export function updateCachedSettings(next) {
  cached = next;
  aplicarTodo(next);
  return cached;
}

function aplicarTodo(s) {
  applyAppearance(s);
  applyBackground('login', { url: s.bg_login_url, dim: s.bg_login_dim });
  applyBackground('panel', { url: s.bg_panel_url, dim: s.bg_panel_dim });
  applyBackground('juegos', { url: s.bg_juegos_url, dim: s.bg_juegos_dim });
}
