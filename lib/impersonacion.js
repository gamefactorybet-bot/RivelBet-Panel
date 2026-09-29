import crypto from 'node:crypto';

// "Entrar como jugador" desde el panel: ver lib/../sql/22_impersonacion.sql
// para el porqué del código de un solo uso en vez de mandar el JWT
// directo por la URL.

const DURACION_SEGUNDOS = 60;

function hashCodigo(codigo) {
  return crypto.createHash('sha256').update(codigo).digest('hex');
}

/** Genera el código, guarda su hash y devuelve el código en claro (solo esta vez). */
export async function crearCodigoImpersonacion(supabaseAdmin, { playerId, staff }) {
  const codigo = crypto.randomBytes(32).toString('base64url');

  const { error } = await supabaseAdmin.from('impersonaciones').insert({
    codigo_hash: hashCodigo(codigo),
    player_id: playerId,
    staff_id: staff.id,
    staff_email: staff.email,
    expira_at: new Date(Date.now() + DURACION_SEGUNDOS * 1000).toISOString(),
  });

  if (error) throw { status: 500, message: 'No se pudo generar el acceso' };

  return codigo;
}

/**
 * Canjea el código: si es válido, no expiró y no se usó antes, lo marca
 * como canjeado y devuelve quién lo generó y para qué jugador.
 * Se puede llamar una sola vez por código a propósito.
 */
export async function canjearCodigoImpersonacion(supabaseAdmin, codigo) {
  if (!codigo) throw { status: 400, message: 'Falta el código' };

  const { data: fila } = await supabaseAdmin
    .from('impersonaciones')
    .select('id, player_id, staff_email, expira_at, canjeado_at')
    .eq('codigo_hash', hashCodigo(String(codigo)))
    .maybeSingle();

  if (!fila) throw { status: 401, message: 'Enlace inválido' };
  if (fila.canjeado_at) throw { status: 401, message: 'Este enlace ya se usó' };
  if (new Date(fila.expira_at).getTime() < Date.now()) {
    throw { status: 401, message: 'Este enlace venció' };
  }

  // Se marca canjeado ANTES de devolver el resultado: si dos pedidos
  // llegan casi juntos con el mismo código, el segundo ya lo va a
  // encontrar marcado (o el update no afecta filas) y falla en vez de
  // emitir dos sesiones con el mismo código de un solo uso.
  const { data: actualizada, error } = await supabaseAdmin
    .from('impersonaciones')
    .update({ canjeado_at: new Date().toISOString() })
    .eq('id', fila.id)
    .is('canjeado_at', null)
    .select('id')
    .maybeSingle();

  if (error || !actualizada) throw { status: 401, message: 'Este enlace ya se usó' };

  return { playerId: fila.player_id, staffEmail: fila.staff_email };
}
