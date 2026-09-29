import { supabase } from './supabaseClient.js';
import type { ApiResult } from './types.js';

interface ApiFetchOpciones {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Llama a una función de /api con el token del cajero ya puesto.
 * Devuelve siempre { ok, data, error } — nunca lanza excepción, así
 * la interfaz jamás se queda colgada en "Guardando..." sin explicación.
 *
 * Los tres modos de falla que cubre:
 * - Sin sesión: el token venció o se cerró en otra pestaña
 * - Respuesta que no es JSON: pasa cuando /api no está corriendo y el
 *   servidor devuelve el index.html en su lugar
 * - Timeout: la red se cortó y el pedido nunca vuelve
 */
export async function apiFetch<T = unknown>(
  ruta: string,
  { method = 'GET', body, timeoutMs = 15000 }: ApiFetchOpciones = {}
): Promise<ApiResult<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { ok: false, error: 'Tu sesión venció. Volvé a iniciar sesión.' };
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);

  try {
    const res = await fetch(ruta, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: control.signal,
    });

    const texto = await res.text();

    let datos;
    try {
      datos = texto ? JSON.parse(texto) : {};
    } catch {
      return {
        ok: false,
        error: 'El servidor no respondió correctamente. Revisá que las funciones de /api estén corriendo.',
      };
    }

    if (!res.ok) {
      return { ok: false, error: datos.error || `Error ${res.status}` };
    }

    return { ok: true, data: datos };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'El servidor tardó demasiado en responder. Probá de nuevo.' };
    }
    return { ok: false, error: 'No se pudo conectar con el servidor.' };
  } finally {
    clearTimeout(reloj);
  }
}
