import { supabase } from './supabaseClient.js';

const CAMPOS = `
  id, player_number, username, display_name, balance,
  ban_recargas, ban_retiros, ban_permanente, ban_motivo,
  ban_updated_by, ban_updated_at, created_by, created_at
`;

/**
 * Busca un jugador por ID numérico o por nombre de usuario.
 * Si el texto es solo dígitos lo tomamos como player_number;
 * si no, como username. Así un mismo buscador sirve para los dos.
 */
export async function buscarJugador(texto) {
  const q = String(texto || '').trim().toLowerCase();
  if (!q) return null;

  const esNumero = /^\d+$/.test(q);

  const { data } = await supabase
    .from('players')
    .select(CAMPOS)
    .eq(esNumero ? 'player_number' : 'username', esNumero ? Number(q) : q)
    .maybeSingle();

  return data || null;
}

/**
 * Lista jugadores con coincidencia parcial de nombre, para cuando
 * el cajero no se acuerda del username exacto.
 */
export async function listarJugadores({ filtro = '', limite = 30 } = {}) {
  let query = supabase
    .from('players')
    .select(CAMPOS)
    .order('player_number', { ascending: true })
    .limit(limite);

  const q = String(filtro || '').trim().toLowerCase();

  if (q) {
    query = /^\d+$/.test(q)
      ? query.eq('player_number', Number(q))
      : query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  }

  const { data } = await query;
  return data || [];
}

/** Historial de cargas y retiros de un jugador. */
export async function historialJugador(playerId, limite = 50) {
  const { data } = await supabase
    .from('balance_transactions')
    .select('id, type, amount, balance_before, balance_after, note, created_by, created_at, anulada, anula_a')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limite);

  return data || [];
}

/** Historial de bans de un jugador. */
export async function historialBans(playerId, limite = 20) {
  const { data } = await supabase
    .from('ban_history')
    .select('id, ban_tipo, activo, motivo, created_by, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limite);

  return data || [];
}

export function fechaCorta(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
