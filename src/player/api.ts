// Cliente de API del jugador. Mismo contrato que el helper del panel
// ({ ok, data, error }), pero con el token propio del jugador en vez
// de la sesión de Supabase.
import type { ApiResult } from '../lib/types.js';

const CLAVE = 'player_token';

// Cuando el portal se despliega en su propio dominio, las llamadas van
// a la API del panel. Vacío = mismo dominio (desarrollo o deploy único).
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export function guardarToken(token: string): void {
  localStorage.setItem(CLAVE, token);
}

export function leerToken(): string | null {
  return localStorage.getItem(CLAVE);
}

export function borrarToken(): void {
  localStorage.removeItem(CLAVE);
}

interface PlayerFetchOpciones {
  method?: string;
  body?: unknown;
  conToken?: boolean;
  timeoutMs?: number;
}

export async function playerFetch<T = unknown>(
  ruta: string,
  { method = 'GET', body, conToken = true, timeoutMs = 15000 }: PlayerFetchOpciones = {}
): Promise<ApiResult<T>> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (conToken) {
    const token = leerToken();
    if (!token) return { ok: false, error: 'Iniciá sesión de nuevo.', expirado: true };
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(BASE + ruta, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: control.signal,
    });

    const texto = await res.text();

    let datos;
    try {
      datos = texto ? JSON.parse(texto) : {};
    } catch {
      return { ok: false, error: 'El servidor no respondió correctamente.' };
    }

    // 401 = token vencido o sesión revocada. 403 = cuenta suspendida.
    // En los dos casos hay que sacar al jugador: seguir mostrándole la
    // pantalla con datos viejos solo genera confusión.
    if (res.status === 401 || res.status === 403) {
      borrarToken();
      return {
        ok: false,
        error: datos.error || 'Tu sesión se cerró.',
        expirado: true,
      };
    }

    if (!res.ok) return { ok: false, error: datos.error || `Error ${res.status}` };

    return { ok: true, data: datos };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'El servidor tardó demasiado. Probá de nuevo.' };
    }
    return { ok: false, error: 'No se pudo conectar con el servidor.' };
  } finally {
    clearTimeout(reloj);
  }
}
