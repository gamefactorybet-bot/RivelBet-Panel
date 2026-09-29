import crypto from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requirePlayerActivo } from '../lib/playerAuth.js';
import { avisarCarga, avisarRetiro, avisarVerificacionPendiente, avisarAbusoBono } from '../lib/telegram.js';
import { aplicarCors } from '../lib/cors.js';

// /api/player-caja?recurso=deposito|retiro|bono|cuentas|cloudinary|verificacion
// Consolidado (antes: player-deposito, player-retiro, player-bono,
// player-cuentas, cloudinary-firma).
export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;

  const recurso = req.query.recurso;

  if (recurso === 'retiro') return retiro(req, res);
  if (recurso === 'bono') return bono(req, res);
  if (recurso === 'promo') return promo(req, res);
  if (recurso === 'ofertas') return ofertas(req, res);
  if (recurso === 'cuentas') return cuentas(req, res);
  if (recurso === 'cloudinary') return cloudinary(req, res);
  if (recurso === 'verificacion') return verificacion(req, res);
  if (recurso === 'cashback') return cashback(req, res);
  return deposito(req, res);
}

// POST ?recurso=deposito / DELETE ?recurso=deposito&id=xxx
async function deposito(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');

    if (req.method === 'DELETE') {
      return res.status(403).json({ error: 'Las cargas no se pueden cancelar. Esperá a que un cajero las confirme.' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { amount, accountId, nota, comprobanteUrl, comprobantePublicId, promoCodigo, ofertaId } = req.body || {};
    const monto = Number(amount);

    if (!monto || monto <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });

    if (ofertaId && promoCodigo) {
      return res.status(400).json({ error: 'Elegí la oferta o un código, no los dos.' });
    }
    if (ofertaId) {
      const { error: ofErr } = await supabaseAdmin.rpc('validar_oferta_carga', {
        p_oferta_id: ofertaId, p_player_id: sesion.sub, p_monto: monto,
      });
      if (ofErr) return res.status(400).json({ error: ofErr.message });
    }

    const { data: player } = await supabaseAdmin
      .from('players')
      .select('player_number, username, display_name, balance, ban_recargas, ban_permanente')
      .eq('id', sesion.sub).single();

    if (!player) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (player.ban_permanente || player.ban_recargas) {
      return res.status(403).json({ error: 'No podés solicitar cargas en este momento.' });
    }

    const { data, error } = await supabaseAdmin
      .from('deposit_requests')
      .insert({
        player_id: sesion.sub, account_id: accountId || null, amount: monto,
        nota_jugador: nota || null, comprobante_url: comprobanteUrl || null,
        comprobante_public_id: comprobantePublicId || null,
        promo_codigo: ofertaId ? null : (promoCodigo ? String(promoCodigo).trim().toUpperCase() : null),
        oferta_id: ofertaId || null,
      })
      .select('id, amount, estado, created_at').single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya tenés una carga pendiente. Esperá a que la confirmen.' });
      }
      return res.status(400).json({ error: error.message });
    }

    try {
      const { data: cuenta } = accountId
        ? await supabaseAdmin.from('bank_accounts').select('banco, titular').eq('id', accountId).single()
        : { data: null };

      const msg = await avisarCarga({
        jugador: player, monto, moneda: process.env.VITE_CURRENCY_CODE || '', cuenta, comprobanteUrl, nota,
      });

      if (msg?.message_id) {
        await supabaseAdmin.from('deposit_requests').update({ telegram_message_id: msg.message_id }).eq('id', data.id);
      }
    } catch (err) {
      console.error('[telegram] aviso de carga', err.message);
    }

    return res.status(200).json({ solicitud: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function ofertas(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');
    const { data, error } = await supabaseAdmin.rpc('ofertas_carga_para', { p_player_id: sesion.sub });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ofertas: data || [] });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=retiro / DELETE ?recurso=retiro&id=xxx
async function retiro(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');

    if (req.method === 'DELETE') {
      return res.status(403).json({ error: 'Los retiros no se pueden cancelar. Esperá a que un cajero los procese.' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { amount, nota, metodoTipo, aliasTipo, aliasValor, banco, numeroCuenta, titular, documento } = req.body || {};
    const monto = Number(amount);

    if (!monto || monto <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });

    if (!['alias', 'cuenta'].includes(metodoTipo)) {
      return res.status(400).json({ error: 'Elegí cómo querés cobrar' });
    }

    if (metodoTipo === 'alias') {
      if (!['ci', 'telefono', 'correo', 'ruc'].includes(aliasTipo) || !String(aliasValor || '').trim()) {
        return res.status(400).json({ error: 'Completá el dato del alias' });
      }
    } else if (!String(banco || '').trim() || !String(numeroCuenta || '').trim()
        || !String(titular || '').trim() || !String(documento || '').trim()) {
      return res.status(400).json({ error: 'Completá los datos de la cuenta bancaria' });
    }

    const { data: player } = await supabaseAdmin
      .from('players')
      .select('player_number, username, display_name, balance, ban_retiros, ban_permanente')
      .eq('id', sesion.sub).single();

    if (!player) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (player.ban_permanente || player.ban_retiros) {
      return res.status(403).json({ error: 'No podés solicitar retiros en este momento.' });
    }
    if (monto > Number(player.balance)) {
      return res.status(400).json({ error: 'No tenés saldo suficiente para ese retiro.' });
    }

    const { data, error } = await supabaseAdmin.rpc('solicitar_retiro', {
      p_player_id: sesion.sub, p_amount: monto, p_nota: nota || null, p_metodo_tipo: metodoTipo,
      p_alias_tipo: metodoTipo === 'alias' ? aliasTipo : null,
      p_alias_valor: metodoTipo === 'alias' ? String(aliasValor).trim() : null,
      p_banco: metodoTipo === 'cuenta' ? String(banco).trim() : null,
      p_numero_cuenta: metodoTipo === 'cuenta' ? String(numeroCuenta).trim() : null,
      p_titular: metodoTipo === 'cuenta' ? String(titular).trim() : null,
      p_documento: metodoTipo === 'cuenta' ? String(documento).trim() : null,
    });

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya tenés un retiro pendiente. Esperá a que lo procesen.' });
      }
      return res.status(400).json({ error: error.message });
    }

    let telegramId = null;
    try {
      const msg = await avisarRetiro({ jugador: player, monto, moneda: process.env.VITE_CURRENCY_CODE || '' });

      if (msg?.message_id) {
        telegramId = msg.message_id;
        await supabaseAdmin.from('withdrawal_requests').update({ telegram_message_id: msg.message_id }).eq('id', data.id);
      }
    } catch (err) {
      console.error('[telegram] aviso de retiro', err.message);
    }

    await marcarYAvisarAbuso({
      playerId: sesion.sub, withdrawalId: data.id, jugador: player, monto, replyTo: telegramId,
    });

    return res.status(200).json({ solicitud: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=bono&monto=50000&codigo=NAVIDAD
// Vista previa del bono mientras el jugador escribe el monto. Si mandó un
// código promo, ese reemplaza al bono automático.
async function bono(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');
    const monto = Number(req.query.monto);
    const codigo = String(req.query.codigo || '').trim();

    if (!monto || monto <= 0) return res.status(200).json({ bono: null });

    if (codigo) {
      const { data, error } = await supabaseAdmin.rpc('calcular_promo', { p_codigo: codigo, p_monto: monto, p_player_id: sesion.sub });
      if (error) return res.status(400).json({ error: error.message });
      const fila = Array.isArray(data) ? data[0] : data;
      if (!fila?.promo_id || Number(fila.promo_monto) <= 0) {
        return res.status(200).json({ bono: null, codigoInvalido: true });
      }
      return res.status(200).json({
        bono: { nombre: `Código ${fila.promo_codigo}`, monto: Number(fila.promo_monto), total: monto + Number(fila.promo_monto), esPromo: true },
      });
    }

    const { data, error } = await supabaseAdmin.rpc('calcular_bono', { p_player_id: sesion.sub, p_monto: monto });

    if (error) return res.status(400).json({ error: error.message });

    const fila = Array.isArray(data) ? data[0] : data;

    if (!fila?.bono_id || Number(fila.bono_monto) <= 0) return res.status(200).json({ bono: null });

    return res.status(200).json({
      bono: { nombre: fila.bono_nombre, monto: Number(fila.bono_monto), total: monto + Number(fila.bono_monto) },
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=promo — body: { codigo }  (free bet: canjea y le cae)
async function promo(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');
    const codigo = String(req.body?.codigo || '').trim();
    if (!codigo) return res.status(400).json({ error: 'Ingresá un código' });

    const { data, error } = await supabaseAdmin.rpc('canjear_promo', {
      p_player_id: sesion.sub, p_codigo: codigo,
    });

    if (error) return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });
    return res.status(200).json(data || { ok: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=cuentas
async function cuentas(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await requirePlayerActivo(req, supabaseAdmin, 'id');

    const { data: settings } = await supabaseAdmin.from('casino_settings').select('rotacion_modo').eq('id', 1).single();
    const modo = settings?.rotacion_modo || 'monto';

    const visible = (c) => ({
      id: c.id, banco: c.banco, titular: c.titular, numero_cuenta: c.numero_cuenta, alias: c.alias,
      documento: c.mostrar_documento ? c.documento : null,
      documento_tipo: c.mostrar_documento ? c.documento_tipo : null,
    });

    if (modo === 'manual') {
      const { data, error } = await supabaseAdmin
        .from('bank_accounts')
        .select('id, banco, titular, numero_cuenta, alias, documento, documento_tipo, mostrar_documento')
        .eq('activa', true).order('orden', { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ cuentas: (data || []).map(visible), modo });
    }

    const { data, error } = await supabaseAdmin.rpc('elegir_cuenta');
    if (error) return res.status(400).json({ error: error.message });

    const cuenta = Array.isArray(data) ? data[0] : data;

    if (!cuenta) return res.status(200).json({ cuentas: [], modo, sinDisponibles: true });

    return res.status(200).json({ cuentas: [visible(cuenta)], modo });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=verificacion — sube las 3 fotos y deja la cuenta 'pendiente'
// GET  ?recurso=verificacion — estado actual (para la pantalla de verificación)
async function verificacion(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id, estado_verificacion');

    if (req.method === 'GET') {
      const { data: verif } = await supabaseAdmin
        .from('verificaciones')
        .select('id, estado, motivo, doc_tipo, created_at')
        .eq('player_id', sesion.sub).order('created_at', { ascending: false }).limit(1).maybeSingle();

      const { data: player } = await supabaseAdmin
        .from('players').select('estado_verificacion').eq('id', sesion.sub).single();

      return res.status(200).json({ estado: player?.estado_verificacion, verificacion: verif || null });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { docTipo, urlFrente, urlDorso, urlPersona } = req.body || {};

    if (!urlFrente || !urlDorso || !urlPersona) {
      return res.status(400).json({ error: 'Faltan fotos: se necesitan las tres.' });
    }

    const { data, error } = await supabaseAdmin.rpc('registrar_verificacion', {
      p_player_id: sesion.sub,
      p_doc_tipo: docTipo || 'ci',
      p_url_frente: urlFrente,
      p_url_dorso: urlDorso,
      p_url_persona: urlPersona,
    });

    if (error) return res.status(400).json({ error: error.message });

    const verif = Array.isArray(data) ? data[0] : data;

    try {
      const { data: jugador } = await supabaseAdmin
        .from('players').select('player_number, username, display_name').eq('id', sesion.sub).single();
      const { count } = await supabaseAdmin
        .from('verificaciones').select('id', { count: 'exact', head: true }).eq('player_id', sesion.sub);
      await avisarVerificacionPendiente({ jugador, reenvio: (count || 0) > 1 });
    } catch (err) {
      console.error('[telegram] aviso de verificación', err.message);
    }

    return res.status(200).json({ verificacion: verif });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET  ?recurso=cashback — cashback disponible del jugador
// POST ?recurso=cashback — body: { periodoId, modo, ...datos de cobro }
async function cashback(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id, username');

    if (req.method === 'GET') {
      const { data } = await supabaseAdmin
        .from('cashback_periodos')
        .select('id, monto, periodo_inicio, periodo_fin, vence_at')
        .eq('player_id', sesion.sub).eq('estado', 'disponible')
        .order('created_at', { ascending: true }).limit(1).maybeSingle();

      return res.status(200).json({ cashback: data || null });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { periodoId, modo, metodoTipo, aliasTipo, aliasValor, banco, numeroCuenta, titular, documento } = req.body || {};

    if (!periodoId || !['fichas', 'retiro'].includes(modo)) {
      return res.status(400).json({ error: 'Faltan periodoId o modo' });
    }

    if (modo === 'retiro') {
      if (!['alias', 'cuenta'].includes(metodoTipo)) return res.status(400).json({ error: 'Elegí cómo cobrar' });
      if (metodoTipo === 'alias' && !String(aliasValor || '').trim()) {
        return res.status(400).json({ error: 'Completá el dato del alias' });
      }
      if (metodoTipo === 'cuenta' && (!String(banco || '').trim() || !String(numeroCuenta || '').trim()
          || !String(titular || '').trim() || !String(documento || '').trim())) {
        return res.status(400).json({ error: 'Completá los datos de la cuenta' });
      }
    }

    // El periodo tiene que ser del jugador que llama.
    const { data: cbRow } = await supabaseAdmin
      .from('cashback_periodos').select('player_id').eq('id', periodoId).maybeSingle();
    if (!cbRow || cbRow.player_id !== sesion.sub) {
      return res.status(404).json({ error: 'Cashback no encontrado' });
    }

    const { data, error } = await supabaseAdmin.rpc('cobrar_cashback', {
      p_periodo_id: periodoId,
      p_actor: 'jugador:' + sesion.usr,
      p_modo: modo,
      p_metodo_tipo: modo === 'retiro' ? metodoTipo : null,
      p_alias_tipo: modo === 'retiro' && metodoTipo === 'alias' ? aliasTipo : null,
      p_alias_valor: modo === 'retiro' && metodoTipo === 'alias' ? String(aliasValor).trim() : null,
      p_banco: modo === 'retiro' && metodoTipo === 'cuenta' ? String(banco).trim() : null,
      p_numero_cuenta: modo === 'retiro' && metodoTipo === 'cuenta' ? String(numeroCuenta).trim() : null,
      p_titular: modo === 'retiro' && metodoTipo === 'cuenta' ? String(titular).trim() : null,
      p_documento: modo === 'retiro' && metodoTipo === 'cuenta' ? String(documento).trim() : null,
    });

    if (error) return res.status(400).json({ error: error.message });

    const cbRes = Array.isArray(data) ? data[0] : data;

    if (cbRes?.modo === 'retiro' && cbRes.withdrawal_id) {
      try {
        const { data: jugador } = await supabaseAdmin
          .from('players').select('player_number, username, display_name, balance').eq('id', sesion.sub).single();
        const msg = await avisarRetiro({ jugador, monto: cbRes.monto, moneda: process.env.VITE_CURRENCY_CODE || '' });
        if (msg?.message_id) {
          await supabaseAdmin.from('withdrawal_requests').update({ telegram_message_id: msg.message_id }).eq('id', cbRes.withdrawal_id);
        }
      } catch (err) {
        console.error('[telegram] cashback retiro', err.message);
      }
    }

    return res.status(200).json({ cashback: cbRes });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=cloudinary — firma para subir el comprobante
// ?tipo=verificacion cambia la carpeta (fotos del documento, no comprobantes)
async function cloudinary(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const preset = process.env.VITE_CLOUDINARY_PRESET;

    if (!cloudName) return res.status(500).json({ error: 'Falta configurar Cloudinary en el servidor' });

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const base = req.query.tipo === 'verificacion' ? 'verificaciones' : 'comprobantes';
    const folder = `${base}/${sesion.usr}`;

    if (apiKey && apiSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const aFirmar = `folder=${folder}&timestamp=${timestamp}`;
      const signature = crypto.createHash('sha1').update(aFirmar + apiSecret).digest('hex');
      return res.status(200).json({ modo: 'firmado', url, folder, apiKey, timestamp, signature });
    }

    if (!preset) return res.status(500).json({ error: 'Falta configurar Cloudinary: definí el preset o la API key y secret' });

    return res.status(200).json({ modo: 'preset', url, folder, preset });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function marcarYAvisarAbuso({ playerId, withdrawalId, jugador, monto, replyTo }) {
  try {
    const { data: detalle, error } = await supabaseAdmin.rpc('evaluar_abuso_bono', {
      p_player_id: playerId,
    });
    if (error) {
      console.error('[telegram] evaluar abuso', error.message);
      return;
    }
    if (!detalle?.alerta) return;

    await supabaseAdmin
      .from('withdrawal_requests')
      .update({ alerta_abuso: true, alerta_abuso_detalle: detalle })
      .eq('id', withdrawalId);

    await avisarAbusoBono({
      jugador,
      monto,
      moneda: process.env.VITE_CURRENCY_CODE || '',
      detalle,
      replyTo,
    });
  } catch (err) {
    console.error('[telegram] aviso de abuso', err.message);
  }
}
