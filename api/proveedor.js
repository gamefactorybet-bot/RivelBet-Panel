import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { verificarLanzamiento, verificarLlamada } from '../lib/proveedorAuth.js';

// /api/proveedor?accion=balance|apostar|premiar
//
// Este endpoint lo llama el SERVIDOR del proveedor externo, nunca el
// navegador del jugador. Por eso no usa el login de staff ni el de
// jugador: se autentica con la firma HMAC de cada llamada, verificada
// contra el secreto de ESE proveedor puntual.
//
// Cabeceras esperadas en cada llamada:
//   X-Timestamp   segundos unix del momento del pedido
//   X-Firma       HMAC de la llamada (ver lib/proveedorAuth.js)
//
// Body en todas: { token, roundId, monto? }
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const accion = req.query.accion;
    if (!['balance', 'apostar', 'premiar'].includes(accion)) {
      return res.status(400).json({ error: 'Acción inválida' });
    }

    const { token, roundId, monto } = req.method === 'GET' ? req.query : (req.body || {});
    const timestamp = req.headers['x-timestamp'];
    const firma = req.headers['x-firma'];

    if (!token) return res.status(400).json({ error: 'Falta el token' });

    // El token nos dice el jugador y el juego. Buscamos el juego para
    // saber a qué proveedor pertenece y con qué secreto verificar.
    const payloadSinFirmar = decodificarSinVerificar(token);
    if (!payloadSinFirmar?.game) return res.status(401).json({ error: 'Token inválido' });

    const { data: game } = await supabaseAdmin
      .from('games').select('slug, proveedor_id').eq('slug', payloadSinFirmar.game).maybeSingle();

    if (!game?.proveedor_id) return res.status(401).json({ error: 'Token inválido' });

    const { data: proveedor } = await supabaseAdmin
      .from('proveedores_externos').select('secreto, activo').eq('id', game.proveedor_id).single();

    if (!proveedor?.activo) return res.status(403).json({ error: 'Proveedor deshabilitado' });

    // Primero la firma de la llamada en sí (prueba que es el backend
    // del proveedor, no alguien que vio el token en una URL).
    verificarLlamada({ secreto: proveedor.secreto, accion, token, monto, roundId, timestamp, firma });

    // Recién ahora confiamos en el contenido del token.
    const datos = verificarLanzamiento(token, proveedor.secreto);

    if (accion === 'balance') {
      const { data: player } = await supabaseAdmin.from('players').select('balance').eq('id', datos.sub).single();
      if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
      return res.status(200).json({ balance: Number(player.balance) });
    }

    if (!roundId) return res.status(400).json({ error: 'Falta roundId (para no procesar la misma jugada dos veces)' });

    // Van a funciones distintas, no una compartida: "apostar" debita y
    // abre la ronda, "premiar" la busca por roundId y acredita. No se
    // puede premiar sin que exista antes su apuesta.
    if (accion === 'apostar') {
      const monto2 = Number(monto);
      if (!monto2 || monto2 <= 0) return res.status(400).json({ error: 'Monto de apuesta inválido' });

      const { data, error } = await supabaseAdmin.rpc('proveedor_apostar', {
        p_player_id: datos.sub, p_game_slug: datos.game, p_bet: monto2, p_round_id: roundId,
      });

      if (error) return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });

      const ronda = Array.isArray(data) ? data[0] : data;
      return res.status(200).json({ balance: Number(ronda.balance_after) });
    }

    // accion === 'premiar'
    const { data, error } = await supabaseAdmin.rpc('proveedor_premiar', {
      p_player_id: datos.sub, p_round_id: roundId, p_win: Number(monto) || 0,
    });

    if (error) return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });

    const ronda = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({ balance: Number(ronda.balance_after) });
  } catch (err) {
    return res.status(401).json({ error: err.message || 'No autorizado' });
  }
}

/** Lee el payload del token SIN validar la firma — solo para saber
 * qué juego es y así encontrar el secreto correcto con el que
 * verificarlo de verdad. No es la validación real. */
function decodificarSinVerificar(token) {
  try {
    const [payload] = String(token).split('.');
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return null;
  }
}
