// Auto-refresh en vivo del portal, sin generar tráfico.
//
// Cada ~20 s consulta la RPC `heartbeat` (una llamada, ~80 bytes, va
// directo a Supabase — no pasa por las funciones de Vercel). Solo
// cuando alguno de los dos contadores cambió llama a onCambio(), que
// es el refetch pesado de verdad.
//
// Se frena con la pestaña oculta y se ralentiza si el jugador no
// interactúa hace un rato. Cualquier error de red se ignora y se
// reintenta al próximo tick — nunca deja el estado a medias.

const URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const RAPIDO = 20000;   // 20 s con el jugador activo
const LENTO = 60000;    // 60 s si no toca nada hace más de 5 min
const OCIOSO_MS = 5 * 60 * 1000;

/**
 * Arranca el heartbeat. Devuelve una función para detenerlo.
 *   iniciarHeartbeat({ playerId, onCambio })
 */
export function iniciarHeartbeat({ playerId, onCambio }) {
  if (!URL || !KEY || !playerId) return () => {};

  let ultG;
  let ultP;
  let enVuelo = false;
  let vivo = true;
  let ultimaInteraccion = Date.now();
  let reloj = null;

  const marcarActividad = () => { ultimaInteraccion = Date.now(); };

  const chequear = async () => {
    if (!vivo || enVuelo || document.hidden) return;
    enVuelo = true;

    try {
      const res = await fetch(`${URL}/rest/v1/rpc/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({ p_player_id: playerId }),
      });

      if (!res.ok) return;

      const { g, p } = await res.json();

      if (ultG === undefined) {
        // Primera lectura: solo registramos, sin refrescar (recién cargó).
        ultG = g;
        ultP = p;
      } else if (g !== ultG || p !== ultP) {
        ultG = g;
        ultP = p;
        onCambio();
      }
    } catch {
      // Red caída: se reintenta al próximo tick, sin ruido.
    } finally {
      enVuelo = false;
    }
  };

  const programar = () => {
    if (!vivo) return;
    const ocioso = Date.now() - ultimaInteraccion > OCIOSO_MS;
    reloj = setTimeout(async () => {
      await chequear();
      programar();
    }, ocioso ? LENTO : RAPIDO);
  };

  const alVolver = () => {
    marcarActividad();
    if (!document.hidden) chequear();
  };

  ['click', 'keydown', 'touchstart', 'visibilitychange'].forEach((ev) =>
    window.addEventListener(ev, marcarActividad, { passive: true })
  );
  document.addEventListener('visibilitychange', alVolver);
  window.addEventListener('focus', alVolver);

  programar();

  return () => {
    vivo = false;
    if (reloj) clearTimeout(reloj);
    ['click', 'keydown', 'touchstart', 'visibilitychange'].forEach((ev) =>
      window.removeEventListener(ev, marcarActividad)
    );
    document.removeEventListener('visibilitychange', alVolver);
    window.removeEventListener('focus', alVolver);
  };
}
