import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { emitirToken, requirePlayerActivo } from '../lib/playerAuth.js';
import { canjearCodigoImpersonacion } from '../lib/impersonacion.js';
import { avisarRegistro } from '../lib/telegram.js';
import { aplicarCors } from '../lib/cors.js';

// Columnas del jugador que necesita el portal para pintar la pantalla.
const COLS_PLAYER =
  'id, player_number, username, display_name, balance, ban_retiros, ban_recargas, estado_verificacion, retiro_bloqueado, bono_por_descontar, cargado_historico, vip_nivel_id, saldo_bono, requisito_apuesta, ganancia_bono';

async function contactoCajero(playerId) {
  const { data: p } = await supabaseAdmin
    .from('players').select('owner_staff_id, username').eq('id', playerId).maybeSingle();
  if (!p?.owner_staff_id) return null;

  const { data: s, error } = await supabaseAdmin
    .from('staff_profiles')
    .select('display_name, active, whatsapp_numero, whatsapp_activo, whatsapp_solo')
    .eq('id', p.owner_staff_id)
    .maybeSingle();
  if (error || !s || s.active === false || !s.whatsapp_activo) return null;

  const numero = String(s.whatsapp_numero || '').replace(/\D/g, '');
  if (numero.length < 8) return null;

  const texto = encodeURIComponent(`Hola, soy ${p.username} y quiero cargar`);
  return {
    nombre: s.display_name || 'tu cajero',
    numero,
    url: `https://wa.me/${numero}?text=${texto}`,
    soloWhatsapp: Boolean(s.whatsapp_solo),
  };
}

function playerPublico(p) {
  return {
    id: p.id, player_number: p.player_number, username: p.username,
    display_name: p.display_name, balance: p.balance, ban_retiros: p.ban_retiros,
    estado_verificacion: p.estado_verificacion,
    retiro_bloqueado: p.retiro_bloqueado,
    bono_por_descontar: Number(p.bono_por_descontar || 0),
    cargado_historico: Number(p.cargado_historico || 0),
    vip_nivel_id: p.vip_nivel_id || null,
    // Billetera modo avanzado (0 en modo simple)
    saldo_bono: Number(p.saldo_bono || 0),
    requisito_apuesta: Number(p.requisito_apuesta || 0),
    ganancia_bono: Number(p.ganancia_bono || 0),
  };
}

// GET  /api/player-sesion                    -> datos del jugador logueado (antes: player-me)
// POST /api/player-sesion                    -> login (antes: player-login)
// POST /api/player-sesion?recurso=registro   -> autorregistro desde el portal
// POST /api/player-sesion?recurso=impersonar -> canjea el código que armó el panel por una sesión real
export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;

  if (req.method === 'GET') return me(req, res);
  if (req.method === 'POST') {
    if (req.query.recurso === 'impersonar') return impersonar(req, res);
    if (req.query.recurso === 'registro') return registro(req, res);
    if (req.query.recurso === 'avisos-leidos') return avisosLeidos(req, res);
    return login(req, res);
  }
  return res.status(405).json({ error: 'Método no permitido' });
}

/**
 * Movimientos, solicitudes pendientes y soporte sin leer: lo que
 * necesita el portal para pintar la pantalla principal, más allá del
 * jugador en sí. Se usa acá y en login()/impersonar() para que
 * después de entrar no haga falta un segundo pedido — ese segundo
 * pedido, pegado justo al de login, era lo que se colgaba.
 */
async function datosDeSesion(playerId) {
  const [
    { data: movimientos }, { data: pendiente }, { data: pendienteCarga }, { data: soporte },
    { data: verif }, { data: bonoOtorgado }, { data: cashback }, { data: vipNiveles },
    { data: giroDiario }, { data: referidos }, { data: billeteraCfg }, { data: hitos },
    { data: esperaRetiro }, { data: avisos },
  ] = await Promise.all([
    supabaseAdmin.from('balance_transactions')
      .select('id, type, amount, balance_after, note, created_at')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(25),
    supabaseAdmin.from('withdrawal_requests')
      .select('id, amount, estado, created_at')
      .eq('player_id', playerId).eq('estado', 'pendiente').maybeSingle(),
    supabaseAdmin.from('deposit_requests')
      .select('id, amount, estado, created_at')
      .eq('player_id', playerId).eq('estado', 'pendiente').maybeSingle(),
    supabaseAdmin.from('soporte_tickets')
      .select('id, estado, sin_leer_player')
      .eq('player_id', playerId).order('ultimo_mensaje_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('verificaciones')
      .select('id, estado, motivo, doc_tipo, created_at')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('bonos_otorgados')
      .select('monto, estado')
      .eq('player_id', playerId).maybeSingle(),
    supabaseAdmin.from('cashback_periodos')
      .select('id, monto, periodo_inicio, periodo_fin, vence_at')
      .eq('player_id', playerId).eq('estado', 'disponible')
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabaseAdmin.from('vip_niveles')
      .select('id, nombre, color, orden, umbral_cargado, cashback_pct, giro_multiplicador, bono_cumple, bono_mensual, retiro_espera_horas, imagen_url, animacion:animaciones!vip_niveles_animacion_id_fkey(url)')
      .order('orden', { ascending: true }),
    supabaseAdmin.rpc('giro_estado', { p_player_id: playerId }),
    supabaseAdmin.rpc('referidos_resumen', { p_player_id: playerId }),
    supabaseAdmin.from('billetera_config').select('modo_avanzado, retener_ganancias').eq('id', 1).maybeSingle(),
    supabaseAdmin.rpc('mis_hitos', { p_player_id: playerId }),
    supabaseAdmin.rpc('retiro_espera', { p_player_id: playerId }),
    supabaseAdmin.rpc('avisos_pendientes', { p_player_id: playerId }),
  ]);

  return {
    movimientos: movimientos || [],
    pendiente: pendiente || null,
    pendienteCarga: pendienteCarga || null,
    soporteSinLeer: soporte?.sin_leer_player || 0,
    verificacion: verif || null,
    // Cuánto tiene que cargar para desbloquear el retiro (0 = sin candado).
    bonoRegistro: bonoOtorgado?.estado === 'activo' ? Number(bonoOtorgado.monto) : 0,
    cashback: cashback || null,
    giroDiario: giroDiario || null,
    referidos: referidos || null,
    billetera: billeteraCfg || { modo_avanzado: false, retener_ganancias: false },
    hitos: Array.isArray(hitos) ? hitos : [],
    cajeroWhatsapp: await contactoCajero(playerId),
    vipNiveles: (vipNiveles || []).map((n) => ({
      id: n.id, nombre: n.nombre, color: n.color, orden: n.orden,
      umbral: Number(n.umbral_cargado), cashbackPct: Number(n.cashback_pct),
      giroMult: Number(n.giro_multiplicador),
      bonoCumple: Number(n.bono_cumple), bonoMensual: Number(n.bono_mensual),
      imagenUrl: n.imagen_url || null, animacionUrl: n.animacion?.url || null,
      retiroEsperaHoras: Number(n.retiro_espera_horas ?? 24),
    })),
    retiroEspera: normalizarEspera(esperaRetiro),
    avisos: Array.isArray(avisos) ? avisos : [],
  };
}

async function avisosLeidos(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
    if (ids.length) {
      await supabaseAdmin.rpc('avisos_marcar_leido', { p_player_id: sesion.sub, p_ids: ids });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

function normalizarEspera(fila) {
  const e = Array.isArray(fila) ? fila[0] : fila;
  if (!e) return { horas: 24, disponibleAt: null, segundosRestantes: 0, nivelNombre: null };
  return {
    horas: Number(e.horas ?? 24),
    ultimoAt: e.ultimo_at || null,
    disponibleAt: e.disponible_at || null,
    segundosRestantes: Number(e.segundos_restantes || 0),
    nivelNombre: e.nivel_nombre || null,
  };
}

async function login(req, res) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) return res.status(400).json({ error: 'Ingresá tu usuario y contraseña' });

    const usuario = String(username).trim().toLowerCase();
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

    const { data: bloqueado } = await supabaseAdmin.rpc('login_bloqueado', { p_username: usuario, p_ip: ip });

    if (bloqueado) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Esperá 15 minutos o hablá con tu cajero.' });
    }

    const registrar = (exitoso) => supabaseAdmin.from('login_attempts').insert({ username: usuario, ip, exitoso });

    const { data: player } = await supabaseAdmin
      .from('players')
      .select(`${COLS_PLAYER}, password_hash, ban_permanente`)
      .eq('username', usuario).maybeSingle();

    const generico = 'Usuario o contraseña incorrectos';

    if (!player) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');
      await registrar(false);
      return res.status(401).json({ error: generico });
    }

    const coincide = await bcrypt.compare(String(password), player.password_hash);

    if (!coincide) {
      await registrar(false);
      return res.status(401).json({ error: generico });
    }

    if (player.ban_permanente) {
      return res.status(403).json({ error: 'Tu cuenta está suspendida. Contactá al casino.' });
    }

    await registrar(true);

    const datosSesion = await datosDeSesion(player.id);

    return res.status(200).json({
      token: emitirToken(player),
      player: playerPublico(player),
      ...datosSesion,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=registro — body: { username, password, documento, telefono, email, fechaNacimiento, codigoReferido }
async function registro(req, res) {
  try {
    const { username, password, documento, telefono, email, fechaNacimiento, codigoReferido } = req.body || {};

    if (!username || !password) return res.status(400).json({ error: 'Ingresá usuario y contraseña' });
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'La contraseña tiene que tener al menos 4 caracteres' });
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const hash = await bcrypt.hash(String(password), 10);

    const { data: creado, error } = await supabaseAdmin.rpc('registrar_jugador', {
      p_username: username,
      p_password_hash: hash,
      p_documento: documento,
      p_telefono: telefono,
      p_email: email,
      p_fecha_nacimiento: fechaNacimiento || null,
      p_ip: ip,
      p_codigo_referido: codigoReferido || null,
    });

    if (error) return res.status(400).json({ error: error.message });

    const player = Array.isArray(creado) ? creado[0] : creado;

    try {
      await avisarRegistro({
        jugador: player,
        bono: Number(player.bono_por_descontar || 0),
        moneda: process.env.VITE_CURRENCY_CODE || '',
      });
    } catch (err) {
      console.error('[telegram] aviso de registro', err.message);
    }

    const datosSesion = await datosDeSesion(player.id);

    return res.status(200).json({
      token: emitirToken(player),
      player: playerPublico(player),
      ...datosSesion,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function me(req, res) {
  try {
    const { sesion, player } = await requirePlayerActivo(req, supabaseAdmin, COLS_PLAYER);

    const datosSesion = await datosDeSesion(sesion.sub);

    return res.status(200).json({
      player: playerPublico(player),
      ...datosSesion,
      // Si `imp` viene en el token, esta sesión la abrió un cajero desde
      // el panel, no el jugador: el portal muestra un aviso fijo.
      impersonadoPor: sesion.imp || null,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=impersonar — body: { codigo }
// Sin token todavía: el código de un solo uso ES la credencial acá.
async function impersonar(req, res) {
  try {
    const { codigo } = req.body || {};
    const { playerId, staffEmail } = await canjearCodigoImpersonacion(supabaseAdmin, codigo);

    const { data: player } = await supabaseAdmin
      .from('players')
      .select(`${COLS_PLAYER}, ban_permanente`)
      .eq('id', playerId).maybeSingle();

    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
    if (player.ban_permanente) return res.status(403).json({ error: 'Esta cuenta está suspendida' });

    const datosSesion = await datosDeSesion(player.id);

    return res.status(200).json({
      token: emitirToken(player, { imp: staffEmail }),
      player: playerPublico(player),
      ...datosSesion,
      impersonadoPor: staffEmail,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
