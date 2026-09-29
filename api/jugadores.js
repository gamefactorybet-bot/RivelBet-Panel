import bcrypt from 'bcryptjs';
import { supabaseAdmin, requireStaff, requirePermiso, requireJugadorDe } from '../lib/supabaseAdmin.js';
import { puede } from '../lib/permisos.js';
import { crearCodigoImpersonacion } from '../lib/impersonacion.js';

// /api/jugadores?recurso=crear|verificar|password|ban|impersonar|notas|bono
// Consolidado (antes: crear-jugador, verificar-usuario, cambiar-password, ban)
// para entrar bajo el límite de funciones serverless del plan gratuito.
export default async function handler(req, res) {
  const recurso = req.query.recurso;

  if (recurso === 'verificar') return verificar(req, res);
  if (recurso === 'password') return password(req, res);
  if (recurso === 'ban') return ban(req, res);
  if (recurso === 'impersonar') return impersonar(req, res);
  if (recurso === 'notas') return notas(req, res);
  if (recurso === 'bono') return bono(req, res);
  if (recurso === 'telefono') return telefono(req, res);
  return crear(req, res);
}

// POST ?recurso=bono — body: { playerId, monto, rollover, nota }
// Un cajero le da un bono a dedo al jugador desde el perfil. Pasa por
// sumar_bono_billetera, así respeta el modo avanzado de billetera.
async function bono(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'cargar');
    const { playerId, monto, rollover, nota } = req.body || {};

    if (!playerId) return res.status(400).json({ error: 'Falta el jugador' });
    await requireJugadorDe(staff, playerId);
    if (!(Number(monto) > 0)) return res.status(400).json({ error: 'El monto tiene que ser mayor a 0' });

    const { data, error } = await supabaseAdmin.rpc('dar_bono_manual', {
      p_player_id: playerId,
      p_monto: Number(monto),
      p_rollover: Math.max(0, Number(rollover) || 0),
      p_nota: String(nota || '').trim() || 'Bono',
      p_actor: staff.email,
    });

    if (error) return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });
    return res.status(200).json(data || { ok: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET  ?recurso=notas&playerId=xxx  — lista las notas internas
// POST ?recurso=notas               — body: { playerId, texto }
async function notas(req, res) {
  try {
    const staff = await requireStaff(req);

    if (req.method === 'GET') {
      await requireJugadorDe(staff, req.query.playerId);
      const { data, error } = await supabaseAdmin
        .from('player_notas')
        .select('*')
        .eq('player_id', req.query.playerId)
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ notas: data || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { playerId, texto } = req.body || {};
    if (!playerId || !String(texto || '').trim()) {
      return res.status(400).json({ error: 'Falta el texto de la nota' });
    }
    await requireJugadorDe(staff, playerId);

    const { data, error } = await supabaseAdmin
      .from('player_notas')
      .insert({ player_id: playerId, texto: String(texto).trim().slice(0, 1000), autor: staff.display_name || staff.email })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ nota: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

function normalizarTelefono(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos;
}

// POST ?recurso=crear — body: { username, displayName, password, saldoInicial, telefono }
async function crear(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'crear_jugador');

    const { username, displayName, password, saldoInicial, telefono } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Faltan usuario o contraseña' });
    }

    const tel = normalizarTelefono(telefono);
    if (tel.length < 8) {
      return res.status(400).json({ error: 'El teléfono es la verificación de este jugador. Poné el número de WhatsApp, con código de país (mínimo 8 dígitos).' });
    }

    const user = String(username).trim().toLowerCase();

    if (user.length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    }

    if (!/^[a-z0-9_.]+$/.test(user)) {
      return res.status(400).json({ error: 'El usuario solo admite letras, números, punto y guión bajo' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const saldo = Number(saldoInicial) || 0;
    if (saldo < 0) {
      return res.status(400).json({ error: 'El saldo inicial no puede ser negativo' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const { data: player, error } = await supabaseAdmin
      .from('players')
      .insert({
        username: user,
        display_name: displayName || null,
        password_hash: passwordHash,
        balance: 0,
        created_by: staff.email,
        owner_staff_id: staff.id,
        telefono: tel,
        estado_verificacion: 'verificado',
      })
      .select('id, username, display_name, balance, created_at, player_number, telefono')
      .single();

    if (error) {
      if (error.code === '23505') {
        const msg = String(error.message || '');
        if (/telefono/i.test(msg)) {
          return res.status(409).json({ error: 'Ese teléfono ya está vinculado a otro usuario' });
        }
        return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
      }
      return res.status(400).json({ error: error.message });
    }

    if (saldo > 0) {
      const { error: movErr } = await supabaseAdmin.rpc('wallet_movimiento', {
        p_player_id: player.id, p_type: 'carga', p_amount: saldo,
        p_note: 'Saldo inicial al crear el usuario',
        p_created_by: staff.email, p_staff_id: staff.id,
      });
      if (movErr) {
        await supabaseAdmin.from('players').delete().eq('id', player.id);
        return res.status(400).json({ error: movErr.message });
      }
      player.balance = saldo;
    }

    return res.status(200).json({ player });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=verificar&username=xxx
async function verificar(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await requireStaff(req);

    const username = String(req.query.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'Falta username' });

    const { data } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    return res.status(200).json({ disponible: !data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=password — body: { playerId, nuevaPassword }
async function password(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'password_jugador');

    const { playerId, nuevaPassword } = req.body || {};

    if (!playerId || !nuevaPassword) {
      return res.status(400).json({ error: 'Faltan playerId o nuevaPassword' });
    }
    await requireJugadorDe(staff, playerId);

    if (String(nuevaPassword).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const passwordHash = await bcrypt.hash(String(nuevaPassword), 10);

    const { data, error } = await supabaseAdmin
      .from('players')
      .update({ password_hash: passwordHash })
      .eq('id', playerId)
      .select('id, username')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Jugador no encontrado' });

    await supabaseAdmin.from('password_resets').insert({
      player_id: playerId,
      reset_by: staff.email,
    });

    return res.status(200).json({ ok: true, username: data.username });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

const TIPOS_BAN = { recargas: 'ban_recargas', retiros: 'ban_retiros', permanente: 'ban_permanente' };

// POST ?recurso=ban — body: { playerId, tipo, activo, motivo } o { playerId, cerrarSesion: true }
async function ban(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requireStaff(req);

    const { playerId, tipo, activo, motivo, cerrarSesion } = req.body || {};

    if (cerrarSesion && playerId) {
      await requireJugadorDe(staff, playerId);
      const { error } = await supabaseAdmin
        .from('players')
        .update({ sesion_revocada_at: new Date().toISOString() })
        .eq('id', playerId);

      if (error) return res.status(400).json({ error: error.message });

      await supabaseAdmin.from('ban_history').insert({
        player_id: playerId,
        ban_tipo: 'recargas',
        activo: false,
        motivo: 'Sesión cerrada por ' + (staff.display_name || staff.email),
        created_by: staff.email,
      });

      return res.status(200).json({ ok: true });
    }

    if (!playerId || !tipo || typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'Faltan playerId, tipo o activo' });
    }
    await requireJugadorDe(staff, playerId);

    const columna = TIPOS_BAN[tipo];
    if (!columna) return res.status(400).json({ error: 'Tipo de ban inválido' });

    const permiso = tipo === 'permanente' ? 'ban_permanente' : 'ban_operativo';
    if (!puede(staff, permiso)) {
      return res.status(403).json({ error: 'No tenés permiso para aplicar este tipo de ban' });
    }

    const { data, error } = await supabaseAdmin
      .from('players')
      .update({
        [columna]: activo,
        ban_motivo: activo ? (motivo || null) : null,
        ban_updated_by: staff.email,
        ban_updated_at: new Date().toISOString(),
      })
      .eq('id', playerId)
      .select('id, player_number, username, ban_recargas, ban_retiros, ban_permanente, ban_motivo')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('ban_history').insert({
      player_id: playerId,
      ban_tipo: tipo,
      activo,
      motivo: motivo || null,
      created_by: staff.email,
    });

    return res.status(200).json({ player: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=impersonar — body: { playerId }
// Devuelve la URL del portal con un código de un solo uso (60s). El
// portal lo canjea por una sesión real en /api/player-sesion?recurso=impersonar.
async function impersonar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'impersonar_jugador');

    const { playerId } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'Falta playerId' });
    await requireJugadorDe(staff, playerId);

    const { data: player } = await supabaseAdmin
      .from('players').select('id').eq('id', playerId).maybeSingle();

    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    if (!process.env.PORTAL_URL) {
      return res.status(500).json({ error: 'Falta configurar PORTAL_URL en el servidor' });
    }

    const codigo = await crearCodigoImpersonacion(supabaseAdmin, { playerId, staff });

    const url = new URL(process.env.PORTAL_URL);
    url.searchParams.set('impersonar', codigo);

    return res.status(200).json({ url: url.toString() });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=telefono — body: { playerId, telefono }
// Para un jugador de cartera sin número, o para corregirlo.
async function telefono(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'crear_jugador');
    const { playerId, telefono: crudo } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'Falta playerId' });
    await requireJugadorDe(staff, playerId);

    const tel = normalizarTelefono(crudo);
    if (tel.length < 8) {
      return res.status(400).json({ error: 'Poné el número de WhatsApp, con código de país (mínimo 8 dígitos).' });
    }

    const { data: actual } = await supabaseAdmin
      .from('players').select('created_by').eq('id', playerId).maybeSingle();
    if (!actual) return res.status(404).json({ error: 'Jugador no encontrado' });

    const patch = { telefono: tel };
    if (actual.created_by !== 'autorregistro') patch.estado_verificacion = 'verificado';

    const { data: player, error } = await supabaseAdmin
      .from('players')
      .update(patch)
      .eq('id', playerId)
      .select('id, telefono, estado_verificacion')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ese teléfono ya está vinculado a otro usuario' });
      }
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ player });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
