import crypto from 'node:crypto';

// =========================================================
// Firma para la integración con proveedores externos de juegos.
//
// Dos cosas distintas, con el mismo secreto pero propósitos separados:
//
//  1. TOKEN DE LANZAMIENTO: le dice al proveedor "este es el jugador
//     que está entrando". Viaja en la URL, así que el navegador lo ve
//     — por diseño no alcanza por sí solo para mover plata.
//
//  2. FIRMA DE LLAMADA: cada vez que el proveedor nos pide debitar o
//     acreditar, la llamada viene firmada con el secreto. El secreto
//     nunca toca un navegador, solo vive en los dos backends. Sin la
//     firma correcta, no se mueve un peso.
// =========================================================

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(secreto, texto) {
  return b64url(crypto.createHmac('sha256', secreto).update(texto).digest());
}

/** Token de lanzamiento: quién es el jugador, qué juego, hasta cuándo vale. */
export function firmarLanzamiento({ secreto, playerId, gameSlug, duracionHoras = 6 }) {
  const payload = b64url(JSON.stringify({
    sub: playerId, game: gameSlug,
    exp: Math.floor(Date.now() / 1000) + duracionHoras * 3600,
  }));

  return `${payload}.${hmac(secreto, payload)}`;
}

export function verificarLanzamiento(token, secreto) {
  const [payload, firma] = String(token || '').split('.');
  if (!payload || !firma) throw new Error('Token inválido');

  const esperada = hmac(secreto, payload);
  if (esperada.length !== firma.length ||
      !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) {
    throw new Error('Token inválido');
  }

  const datos = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (datos.exp < Math.floor(Date.now() / 1000)) throw new Error('Token vencido');

  return datos;
}

/**
 * Firma de una llamada de plata (apostar/premiar/balance).
 * Cubre acción + token + monto + roundId + momento, así una llamada
 * capturada no se puede reproducir más tarde ni para otro monto.
 */
export function firmarLlamada({ secreto, accion, token, monto, roundId, timestamp }) {
  const texto = `${accion}|${token}|${monto ?? ''}|${roundId ?? ''}|${timestamp}`;
  return hmac(secreto, texto);
}

/**
 * Verifica la firma de una llamada entrante del proveedor.
 * Rechaza además llamadas viejas (más de 2 minutos): una firma
 * capturada no sirve para reintentarla después.
 */
export function verificarLlamada({ secreto, accion, token, monto, roundId, timestamp, firma }) {
  const ahora = Math.floor(Date.now() / 1000);
  const marca = Number(timestamp);

  if (!marca || Math.abs(ahora - marca) > 120) {
    throw new Error('La llamada venció o el reloj está desincronizado');
  }

  const esperada = firmarLlamada({ secreto, accion, token, monto, roundId, timestamp });

  if (!firma || esperada.length !== firma.length ||
      !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(firma))) {
    throw new Error('Firma inválida');
  }
}
