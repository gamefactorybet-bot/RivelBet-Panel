import crypto from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requirePlayerActivo } from '../lib/playerAuth.js';
import { girar, CONFIG_DEFECTO } from '../lib/slot-engine.js';
import { firmarLanzamiento } from '../lib/proveedorAuth.js';
import { aplicarCors } from '../lib/cors.js';

// GET  /api/player-juego            -> catálogo del portal
// GET  /api/player-juego?recurso=giro   -> estado del giro diario
// POST /api/player-juego            -> resolver un giro de slot
// POST /api/player-juego?recurso=lanzar -> URL firmada de proveedor
// POST /api/player-juego?recurso=giro   -> girar el giro diario
export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;

  if (req.method === 'GET') {
    return req.query.recurso === 'giro' ? giroEstado(req, res) : catalogo(req, res);
  }

  if (req.method === 'POST') {
    if (req.query.recurso === 'lanzar') return lanzar(req, res);
    if (req.query.recurso === 'giro') return giroGirar(req, res);
    return jugar(req, res);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

/* ---------------- Giro diario ---------------- */

function elegirPremio(premios) {
  const lista = (Array.isArray(premios) ? premios : []).filter((p) => (Number(p.peso) || 0) > 0);
  const total = lista.reduce((a, p) => a + (Number(p.peso) || 0), 0);
  if (total <= 0) return 0;
  let r = crypto.randomInt(0, total);
  for (const p of lista) {
    r -= Number(p.peso) || 0;
    if (r < 0) return Math.max(0, Number(p.monto) || 0);
  }
  return 0;
}

async function giroEstado(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');
    const { data, error } = await supabaseAdmin.rpc('giro_estado', { p_player_id: sesion.sub });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function giroGirar(req, res) {
  try {
    const { sesion, player } = await requirePlayerActivo(req, supabaseAdmin, 'id, estado_verificacion');

    if (player.estado_verificacion !== 'verificado') {
      return res.status(400).json({ error: 'Verificá tu identidad para girar', requiereVerificacion: true });
    }

    const { data: cfg } = await supabaseAdmin
      .from('giro_diario_config').select('activo, premios').eq('id', 1).single();

    if (!cfg?.activo) return res.status(400).json({ error: 'El giro diario no está disponible ahora' });

    const premioBase = elegirPremio(cfg.premios);

    const { data, error } = await supabaseAdmin.rpc('girar_diario', {
      p_player_id: sesion.sub, p_premio_base: premioBase,
    });
    if (error) return res.status(400).json({ error: error.message });

    const row = Array.isArray(data) ? data[0] : data;
    const { data: p } = await supabaseAdmin
      .from('players').select('balance, requisito_apuesta, saldo_bono, ganancia_bono').eq('id', sesion.sub).single();

    return res.status(200).json({
      premio: Number(row.premio),
      premioBase: Number(row.premio_base),
      saldo: Number(p?.balance || 0),
      requisitoApuesta: Number(p?.requisito_apuesta || 0),
      saldoBono: Number(p?.saldo_bono || 0),
      gananciaBono: Number(p?.ganancia_bono || 0),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function catalogo(req, res) {
  try {
    await requirePlayerActivo(req, supabaseAdmin, 'id');

    const cols = `
        slug, nombre, imagen_url, imagen_personalizada_url, usar_imagen_personalizada,
        video_url, categoria, proveedor, config, launch_url,
        cartel_tipo, cartel_hasta, cartel_animacion:animaciones(url)
      `;
    let [{ data, error }, topRpc] = await Promise.all([
      supabaseAdmin
        .from('games')
        .select(cols)
        .eq('activo', true)
        .order('orden', { ascending: true }),
      supabaseAdmin.rpc('juegos_mas_jugados', { p_dias: 7, p_limite: 10 }),
    ]);

    // Si todavía no corrieron sql/54, el lobby no se puede caer:
    // se pide de nuevo sin video_url y las portadas quedan en foto.
    if (error && /video_url/.test(error.message || '')) {
      ({ data, error } = await supabaseAdmin
        .from('games')
        .select(cols.replace('video_url, ', ''))
        .eq('activo', true)
        .order('orden', { ascending: true }));
    }

    if (error) return res.status(400).json({ error: error.message });

    let marcas = [];
    {
      const r = await supabaseAdmin
        .from('proveedores_marca')
        .select('clave, nombre, slug, icono_url, orden')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true });
      if (!r.error) marcas = r.data || [];
    }

    // Cada juego lleva su propia tabla de pagos: dos juegos del mismo
    // motor pagan distinto.
    const categorias = {};
    const porSlug = {};
    const hoy = new Date().toISOString().slice(0, 10);
    const clavesConJuego = new Set();
    const marcaPorClave = Object.fromEntries((marcas || []).map((m) => [m.clave, m]));

    (data || []).forEach((j) => {
      const { config, imagen_personalizada_url, usar_imagen_personalizada,
              cartel_tipo, cartel_hasta, cartel_animacion, ...resto } = j;

      // 'nuevo' se apaga solo después de la fecha, sin que nadie tenga
      // que acordarse de sacarlo a mano.
      const vencido = cartel_tipo === 'nuevo' && cartel_hasta && cartel_hasta < hoy;

      const cartel = !cartel_tipo || vencido
        ? null
        : cartel_tipo === 'personalizado'
          ? (cartel_animacion ? { tipo: 'personalizado', animacionUrl: cartel_animacion.url } : null)
          : { tipo: cartel_tipo };

      const proveedor = resto.proveedor || 'propio';
      clavesConJuego.add(proveedor);
      const marca = marcaPorClave[proveedor];

      const juego = {
        ...resto,
        proveedor,
        proveedorIcono: marca?.icono_url || null,
        proveedorNombre: marca?.nombre || null,
        imagen_url: usar_imagen_personalizada && imagen_personalizada_url ? imagen_personalizada_url : resto.imagen_url,
        cartel,
        pagos: config?.pagos || CONFIG_DEFECTO.pagos,
        pagosDos: config?.pagosDos || CONFIG_DEFECTO.pagosDos,
      };
      porSlug[juego.slug] = juego;
      (categorias[j.categoria] ||= []).push(juego);
    });

    const proveedores = (marcas || [])
      .filter((m) => clavesConJuego.has(m.clave))
      .map((m) => ({
        clave: m.clave,
        nombre: m.nombre,
        slug: m.slug,
        iconoUrl: m.icono_url || null,
      }));

    const top = !topRpc?.error
      ? (topRpc.data || []).map((r) => porSlug[r.slug]).filter(Boolean)
      : [];

    return res.status(200).json({
      categorias: Object.entries(categorias).map(([titulo, juegos]) => ({ titulo, juegos })),
      proveedores,
      top,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// El servidor resuelve el giro y recién después toca el saldo, en una
// sola transacción. El navegador no manda ni el resultado ni el premio.
async function jugar(req, res) {
  try {
    const { sesion, player } = await requirePlayerActivo(req, supabaseAdmin, 'id, estado_verificacion, saldo_bono');

    if (player.estado_verificacion !== 'verificado') {
      return res.status(400).json({ error: 'Verificá tu identidad para jugar', requiereVerificacion: true });
    }

    const { juego, apuesta, clientId } = req.body || {};

    const [{ data: game }, { data: bille }] = await Promise.all([
      supabaseAdmin
        .from('games')
        .select('slug, nombre, min_bet, max_bet, activo, motor, config, launch_url')
        .eq('slug', juego).maybeSingle(),
      supabaseAdmin
        .from('billetera_config')
        .select('modo_avanzado, apuesta_max_bono').eq('id', 1).maybeSingle(),
    ]);

    if (!game || !game.activo) return res.status(404).json({ error: 'Ese juego no está disponible' });

    const monto = Number(apuesta);

    if (!monto || monto <= 0) return res.status(400).json({ error: 'Apuesta inválida' });

    // Los límites se validan acá y no en el navegador: el cliente puede
    // mandar cualquier número.
    if (monto < Number(game.min_bet) || monto > Number(game.max_bet)) {
      return res.status(400).json({ error: `La apuesta debe estar entre ${game.min_bet} y ${game.max_bet}` });
    }

    // Tope de apuesta con bono pegajoso (modo avanzado). El RPC lo
    // re-valida igual; esto es solo para un error más claro.
    if (bille?.modo_avanzado && Number(bille.apuesta_max_bono) > 0
        && Number(player.saldo_bono) > 0 && monto > Number(bille.apuesta_max_bono)) {
      return res.status(400).json({ error: `Con bono activo la apuesta máxima es ${bille.apuesta_max_bono}` });
    }

    if (game.launch_url) return res.status(400).json({ error: 'Ese juego se abre en el sitio del proveedor' });
    if (game.motor && game.motor !== 'clasico-3x3') {
      return res.status(400).json({ error: 'Ese motor todavía no está disponible' });
    }

    const resultado = girar({ apuesta: monto, config: game.config });

    // clientId hace el giro idempotente: si se corta la conexión y
    // reintenta, devuelve la ronda que ya existe en vez de cobrar dos veces.
    const { data, error } = await supabaseAdmin.rpc('slot_jugada', {
      p_player_id: sesion.sub, p_game_slug: game.slug, p_bet: monto,
      p_win: resultado.premio, p_detalle: resultado.detalle, p_client_id: clientId || null,
    });

    if (error) return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });

    const ronda = Array.isArray(data) ? data[0] : data;

    // Si el giro ya existía, devolvemos SU resultado: el jugador tiene
    // que ver lo mismo que la primera vez.
    const repetido = ronda.client_id && ronda.detalle
      && JSON.stringify(ronda.detalle) !== JSON.stringify(resultado.detalle);

    const detalle = repetido ? ronda.detalle : resultado.detalle;

    // Estado de billetera para que el portal refresque la barra de rollover.
    const { data: pp } = await supabaseAdmin
      .from('players').select('requisito_apuesta, saldo_bono, ganancia_bono').eq('id', sesion.sub).single();

    return res.status(200).json({
      grilla: repetido ? grillaDesdeLinea(ronda.detalle) : resultado.grilla,
      premio: Number(ronda.win),
      tipo: detalle.tipo,
      simbolo: detalle.simbolo,
      multiplicador: detalle.multiplicador,
      saldo: Number(ronda.balance_after),
      repetido: Boolean(repetido),
      requisitoApuesta: Number(pp?.requisito_apuesta || 0),
      saldoBono: Number(pp?.saldo_bono || 0),
      gananciaBono: Number(pp?.ganancia_bono || 0),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

/** Solo para giros repetidos: guardamos la línea de pago, no las 9 celdas. */
function grillaDesdeLinea(detalle) {
  const linea = detalle?.linea || ['cereza', 'limon', 'campana'];
  return [linea, linea, linea];
}


// POST ?recurso=lanzar — body: { juego }
// Para juegos de proveedores externos: genera la URL firmada que le
// dice al proveedor quién es el jugador. El proveedor la valida con
// el secreto que compartimos — nunca le mandamos el saldo ni tocamos
// su código directamente.
async function lanzar(req, res) {
  try {
    const { sesion, player } = await requirePlayerActivo(req, supabaseAdmin, 'id, estado_verificacion');

    if (player.estado_verificacion !== 'verificado') {
      return res.status(400).json({ error: 'Verificá tu identidad para jugar', requiereVerificacion: true });
    }

    const { juego } = req.body || {};

    const { data: game } = await supabaseAdmin
      .from('games')
      .select('slug, activo, launch_url, proveedor_id')
      .eq('slug', juego).maybeSingle();

    if (!game || !game.activo) return res.status(404).json({ error: 'Ese juego no está disponible' });
    if (!game.launch_url) return res.status(400).json({ error: 'Ese juego no es de un proveedor externo' });

    const { data: proveedor } = await supabaseAdmin
      .from('proveedores_externos')
      .select('secreto, activo')
      .eq('id', game.proveedor_id).maybeSingle();

    if (!proveedor || !proveedor.activo) {
      return res.status(503).json({ error: 'El proveedor de este juego no está disponible ahora' });
    }

    const token = firmarLanzamiento({ secreto: proveedor.secreto, playerId: sesion.sub, gameSlug: game.slug });

    const url = new URL(game.launch_url);
    url.searchParams.set('token', token);
    url.searchParams.set('operador', process.env.VITE_APP_NAME || 'operador');

    return res.status(200).json({ url: url.toString() });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
