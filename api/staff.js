import { supabaseAdmin, requireStaff, requirePermiso } from '../lib/supabaseAdmin.js';
import { PERFIL_KEYS, PERMISOS } from '../lib/permisos.js';

// /api/staff?recurso=crear|actualizar|listar|acceso
// Consolidado (antes: crear-cajero, actualizar-staff, listar-staff, registrar-acceso).
export default async function handler(req, res) {
  const recurso = req.query.recurso;

  if (recurso === 'actualizar') return actualizar(req, res);
  if (recurso === 'listar') return listar(req, res);
  if (recurso === 'acceso') return acceso(req, res);
  if (recurso === 'comisiones') return comisiones(req, res);
  if (recurso === 'pasar-cartera') return pasarCartera(req, res);
  return crear(req, res);
}

// POST ?recurso=crear — body: { email, password, displayName, role, perfil, telefono, notas }
async function crear(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'gestionar_staff');

    const { email, password, displayName, role, perfil, telefono, notas, externoModo, comisionPct,
            whatsappNumero, whatsappActivo, whatsappSolo } = req.body || {};

    if (!email || !password || !displayName || !role) {
      return res.status(400).json({ error: 'Faltan email, password, displayName o role' });
    }

    if (!['admin', 'cajero'].includes(role)) {
      return res.status(400).json({ error: 'role inválido' });
    }

    const perfilElegido = perfil || (role === 'admin' ? 'dios' : 'cajero');

    if (!PERFIL_KEYS.includes(perfilElegido)) {
      return res.status(400).json({ error: 'Perfil inválido' });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) return res.status(400).json({ error: createError.message });

    const { error: profileError } = await supabaseAdmin.from('staff_profiles').insert({
      id: created.user.id,
      email,
      display_name: displayName,
      role,
      perfil: perfilElegido,
      telefono: telefono || null,
      notas: notas || null,
      permisos: {},
      ...camposExterno(perfilElegido, externoModo, comisionPct),
      ...camposWhatsapp(perfilElegido, { whatsappNumero, whatsappActivo, whatsappSolo }),
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    await supabaseAdmin.from('staff_history').insert({
      staff_id: created.user.id,
      accion: 'creado',
      detalle: { perfil: perfilElegido, role },
      created_by: staff.email,
    });

    return res.status(200).json({ id: created.user.id, email, role, perfil: perfilElegido });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=actualizar — body: { staffId, displayName, perfil, permisos, telefono, notas, active, nuevaPassword }
async function actualizar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'gestionar_staff');

    const { staffId, displayName, perfil, permisos, telefono, notas, active, nuevaPassword, externoModo, comisionPct,
            whatsappNumero, whatsappActivo, whatsappSolo, forzarDesactivar } = req.body || {};

    if (!staffId) return res.status(400).json({ error: 'Falta staffId' });

    const { data: objetivo } = await supabaseAdmin
      .from('staff_profiles')
      .select('*')
      .eq('id', staffId)
      .single();

    if (!objetivo) return res.status(404).json({ error: 'No se encontró ese miembro del staff' });

    const esUnoMismo = staffId === staff.id;

    if (esUnoMismo && active === false) {
      return res.status(400).json({ error: 'No podés desactivar tu propia cuenta' });
    }

    if (esUnoMismo && perfil && perfil !== objetivo.perfil) {
      return res.status(400).json({ error: 'No podés cambiarte tu propio perfil. Pedíselo a otro admin.' });
    }

    if (esUnoMismo && permisos && permisos.gestionar_staff === false) {
      return res.status(400).json({ error: 'No podés quitarte el permiso de gestionar staff' });
    }

    const patch = {};

    if (displayName !== undefined) patch.display_name = String(displayName).trim();
    if (telefono !== undefined) patch.telefono = telefono || null;
    if (notas !== undefined) patch.notas = notas || null;
    if (active !== undefined) patch.active = Boolean(active);

    if (perfil !== undefined) {
      if (!PERFIL_KEYS.includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
      patch.perfil = perfil;
      patch.role = perfil === 'dios' ? 'admin' : 'cajero';
    }

    const perfilFinal = patch.perfil || objetivo.perfil;
    if (perfil !== undefined || externoModo !== undefined || comisionPct !== undefined) {
      Object.assign(patch, camposExterno(perfilFinal, externoModo, comisionPct));
    }
    if (whatsappNumero !== undefined || whatsappActivo !== undefined || whatsappSolo !== undefined || perfil !== undefined) {
      Object.assign(patch, camposWhatsapp(perfilFinal, { whatsappNumero, whatsappActivo, whatsappSolo }));
    }

    if (active === false && !forzarDesactivar) {
      const { count } = await supabaseAdmin
        .from('players').select('id', { count: 'exact', head: true }).eq('owner_staff_id', staffId);
      if (count > 0) {
        return res.status(409).json({
          error: `Tiene ${count} jugador${count === 1 ? '' : 'es'} en cartera. Pasalos a otro cajero antes de desactivar.`,
          jugadores: count,
        });
      }
    }

    if (permisos !== undefined) {
      const limpio = {};
      for (const [clave, valor] of Object.entries(permisos || {})) {
        if (clave in PERMISOS && typeof valor === 'boolean') limpio[clave] = valor;
      }
      patch.permisos = limpio;
    }

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from('staff_profiles').update(patch).eq('id', staffId);
      if (error) return res.status(400).json({ error: error.message });
    }

    if (nuevaPassword) {
      if (String(nuevaPassword).length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(staffId, {
        password: String(nuevaPassword),
      });

      if (authError) return res.status(400).json({ error: authError.message });
    }

    await supabaseAdmin.from('staff_history').insert({
      staff_id: staffId,
      accion: nuevaPassword ? 'password reseteada' : 'editado',
      detalle: patch,
      created_by: staff.email,
    });

    const { data: actualizado } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, email, display_name, role, perfil, permisos, telefono, notas, active, created_at, externo_modo, comision_pct')
      .eq('id', staffId)
      .single();

    return res.status(200).json({ staff: actualizado });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=listar
async function listar(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await requirePermiso(req, 'ver_staff');

    let { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, email, display_name, role, perfil, permisos, telefono, notas, active, ultimo_acceso, created_at, externo_modo, comision_pct, whatsapp_numero, whatsapp_activo, whatsapp_solo')
      .order('created_at', { ascending: true });

    if (error && /externo_modo|comision_pct|whatsapp_/.test(error.message || '')) {
      ({ data, error } = await supabaseAdmin
        .from('staff_profiles')
        .select('id, email, display_name, role, perfil, permisos, telefono, notas, active, ultimo_acceso, created_at')
        .order('created_at', { ascending: true }));
    }

    if (error) return res.status(400).json({ error: error.message });

    const { data: dueños } = await supabaseAdmin
      .from('players').select('owner_staff_id').not('owner_staff_id', 'is', null);
    const porOwner = {};
    for (const p of dueños || []) {
      porOwner[p.owner_staff_id] = (porOwner[p.owner_staff_id] || 0) + 1;
    }

    return res.status(200).json({
      staff: (data || []).map((s) => ({ ...s, jugadores: porOwner[s.id] || 0 })),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// POST ?recurso=acceso
async function acceso(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requireStaff(req);

    await supabaseAdmin
      .from('staff_profiles')
      .update({ ultimo_acceso: new Date().toISOString() })
      .eq('id', staff.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

function camposExterno(perfil, externoModo, comisionPct) {
  if (perfil !== 'externo') return { externo_modo: null };

  const modo = externoModo === 'comisionista' ? 'comisionista' : 'revendedor';
  const out = { externo_modo: modo };

  if (comisionPct !== undefined && comisionPct !== null && comisionPct !== '') {
    const n = Number(comisionPct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw { status: 400, message: 'El porcentaje de comisión tiene que estar entre 0 y 100' };
    }
    out.comision_pct = n;
  } else if (modo === 'comisionista' && (comisionPct === undefined || comisionPct === null || comisionPct === '')) {
    out.comision_pct = 5;
  }

  return out;
}

function camposWhatsapp(perfil, { whatsappNumero, whatsappActivo, whatsappSolo } = {}) {
  if (perfil !== 'externo') {
    return { whatsapp_numero: null, whatsapp_activo: false, whatsapp_solo: false };
  }
  const out = {};
  if (whatsappNumero !== undefined) {
    const digitos = String(whatsappNumero || '').replace(/\D/g, '');
    out.whatsapp_numero = digitos || null;
  }
  if (whatsappActivo !== undefined) out.whatsapp_activo = Boolean(whatsappActivo);
  if (whatsappSolo !== undefined) out.whatsapp_solo = Boolean(whatsappSolo);
  return out;
}

async function comisiones(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    await requirePermiso(req, 'gestionar_staff');
    const staffId = req.query.staffId;
    if (!staffId) return res.status(400).json({ error: 'Falta staffId' });

    const { data, error } = await supabaseAdmin
      .from('staff_comisiones')
      .select('id, carga, pct, monto, created_at, player_id')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(400).json({ error: error.message });

    const total = (data || []).reduce((s, r) => s + Number(r.monto || 0), 0);
    return res.status(200).json({ comisiones: data || [], total });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function pasarCartera(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const staff = await requirePermiso(req, 'gestionar_staff');
    const { desdeId, haciaId } = req.body || {};
    if (!desdeId) return res.status(400).json({ error: 'Falta el cajero de origen' });
    if (haciaId && haciaId === desdeId) {
      return res.status(400).json({ error: 'Elegí otro cajero, no el mismo' });
    }

    const { data: origen } = await supabaseAdmin
      .from('staff_profiles').select('id, display_name, email, perfil').eq('id', desdeId).single();
    if (!origen) return res.status(404).json({ error: 'No se encontró el cajero de origen' });

    let destino = null;
    if (haciaId) {
      const { data } = await supabaseAdmin
        .from('staff_profiles').select('id, display_name, email, perfil, active').eq('id', haciaId).single();
      destino = data;
      if (!destino) return res.status(404).json({ error: 'No se encontró el cajero destino' });
      if (destino.perfil !== 'externo') {
        return res.status(400).json({ error: 'El destino tiene que ser un cajero externo, o la casa' });
      }
      if (destino.active === false) {
        return res.status(400).json({ error: 'Ese cajero está desactivado' });
      }
    }

    const { count } = await supabaseAdmin
      .from('players').select('id', { count: 'exact', head: true }).eq('owner_staff_id', desdeId);
    if (!count) return res.status(400).json({ error: 'Ese cajero no tiene jugadores en cartera' });

    const { error } = await supabaseAdmin
      .from('players')
      .update({ owner_staff_id: haciaId || null })
      .eq('owner_staff_id', desdeId);
    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('staff_history').insert({
      staff_id: desdeId,
      accion: 'cartera pasada',
      detalle: {
        cantidad: count,
        hacia: destino ? { id: destino.id, nombre: destino.display_name, email: destino.email } : 'casa',
      },
      created_by: staff.email,
    });
    if (destino) {
      await supabaseAdmin.from('staff_history').insert({
        staff_id: destino.id,
        accion: 'cartera recibida',
        detalle: {
          cantidad: count,
          desde: { id: origen.id, nombre: origen.display_name, email: origen.email },
        },
        created_by: staff.email,
      });
    }

    return res.status(200).json({
      cantidad: count,
      hacia: destino ? destino.display_name : 'la casa',
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
