import crypto from 'node:crypto';

// JWT propio para los jugadores, firmado con HMAC-SHA256.
// No usamos Supabase Auth acá porque exige email y los jugadores entran
// con nombre de usuario; además ya tenemos su contraseña hasheada en
// `players`, y duplicarla en auth.users obligaría a sincronizar cada
// reseteo. Implementado con crypto nativo: sin dependencias nuevas.

const SECRETO = process.env.PLAYER_JWT_SECRET;
const DURACION_HORAS = 12;

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function firmar(datos) {
  return b64url(crypto.createHmac('sha256', SECRETO).update(datos).digest());
}

export function emitirToken(player, extra = {}) {
  if (!SECRETO) {
    throw { status: 500, message: 'Falta configurar PLAYER_JWT_SECRET en el servidor' };
  }

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const ahora = Math.floor(Date.now() / 1000);

  const payload = b64url(JSON.stringify({
    sub: player.id,
    num: player.player_number,
    usr: player.username,
    iat: ahora,                                   // cuándo se emitió
    exp: ahora + DURACION_HORAS * 3600,
    ...extra,                                      // ej. { imp: 'cajero@casino.com' } si entró un cajero por él
  }));

  const cuerpo = `${header}.${payload}`;
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function verificarToken(token) {
  if (!SECRETO) {
    throw { status: 500, message: 'Falta configurar PLAYER_JWT_SECRET en el servidor' };
  }

  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw { status: 401, message: 'Sesión inválida' };

  const [header, payload, firma] = partes;

  // timingSafeEqual para no filtrar información por el tiempo de respuesta
  const esperada = Buffer.from(firmar(`${header}.${payload}`));
  const recibida = Buffer.from(firma);

  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) {
    throw { status: 401, message: 'Sesión inválida' };
  }

  const datos = JSON.parse(deB64url(payload).toString());

  if (!datos.exp || datos.exp < Math.floor(Date.now() / 1000)) {
    throw { status: 401, message: 'Tu sesión venció. Volvé a entrar.' };
  }

  return datos;
}

/** Saca el token del header Authorization y lo valida. */
export function requirePlayer(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw { status: 401, message: 'Falta iniciar sesión' };

  return verificarToken(token);
}

/**
 * Valida el token Y el estado del jugador en la base.
 *
 * Solo con el token no alcanza: un jugador baneado mientras estaba
 * adentro seguiría entrando hasta que venza, porque el token no sabe
 * nada de lo que pasó después de emitirse.
 *
 * Cuesta una consulta extra por pedido. Es el precio de que un ban
 * tenga efecto inmediato, y vale la pena.
 */
export async function requirePlayerActivo(req, supabaseAdmin, columnas = '*') {
  const sesion = requirePlayer(req);

  const pedidas = columnas === '*'
    ? '*'
    : `${columnas}, ban_permanente, sesion_revocada_at`;

  const { data: player } = await supabaseAdmin
    .from('players')
    .select(pedidas)
    .eq('id', sesion.sub)
    .maybeSingle();

  if (!player) {
    throw { status: 404, message: 'Cuenta no encontrada' };
  }

  if (player.ban_permanente) {
    throw { status: 403, message: 'Tu cuenta está suspendida. Contactá al casino.' };
  }

  // ¿Se revocaron las sesiones después de emitirse este token?
  if (player.sesion_revocada_at) {
    const revocada = Math.floor(new Date(player.sesion_revocada_at).getTime() / 1000);
    if ((sesion.iat || 0) < revocada) {
      throw { status: 401, message: 'Tu sesión se cerró. Volvé a entrar.' };
    }
  }

  return { sesion, player };
}
