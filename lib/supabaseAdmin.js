import { createClient } from '@supabase/supabase-js';
import { puede, esExterno } from './permisos.js';

// Este cliente usa la Service Role Key: bypassea RLS y puede administrar
// usuarios de Auth. SOLO se importa desde archivos de /api (servidor).
// Nunca debe llegar al bundle del navegador.
export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Valida el JWT que manda el navegador (Authorization: Bearer <token>)
 * y devuelve el staff_profile del cajero/admin que hizo el pedido.
 * Lanza un objeto {status, message} si algo falla, listo para responder.
 */
export async function requireStaff(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw { status: 401, message: 'Falta token de autenticación' };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    throw { status: 401, message: 'Token inválido o expirado' };
  }

  let { data: profile, error: profileError } = await supabaseAdmin
    .from('staff_profiles')
    .select('id, email, display_name, role, perfil, permisos, active, telefono, externo_modo, comision_pct, whatsapp_numero, whatsapp_activo, whatsapp_solo')
    .eq('id', user.id)
    .single();

  if (profileError && /externo_modo|comision_pct|whatsapp_/.test(profileError.message || '')) {
    ({ data: profile, error: profileError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, email, display_name, role, perfil, permisos, active, telefono')
      .eq('id', user.id)
      .single());
  }

  if (profileError || !profile) {
    throw { status: 403, message: 'El usuario no tiene perfil de staff' };
  }

  if (profile.active === false) {
    throw { status: 403, message: 'Tu cuenta está desactivada. Hablá con un administrador.' };
  }

  return profile;
}

/**
 * Valida el token y además exige un permiso concreto.
 * Devuelve el staff si puede; lanza 403 si no.
 */
export async function requirePermiso(req, permiso) {
  const staff = await requireStaff(req);

  if (!puede(staff, permiso)) {
    throw { status: 403, message: 'No tenés permiso para hacer esto' };
  }

  return staff;
}

/** El cajero externo no opera la casa: solicitudes del portal, cuentas, etc. */
export function requireCasa(staff) {
  if (esExterno(staff)) {
    throw { status: 403, message: 'Esta sección es de la casa. Vos operás tu cartera.' };
  }
  return staff;
}

/**
 * Si el staff es externo, el jugador tiene que ser de su cartera.
 * La casa (dios / gerente / cajero interno) sigue viendo a todos.
 */
export async function requireJugadorDe(staff, playerId) {
  if (!esExterno(staff)) return;
  if (!playerId) throw { status: 400, message: 'Falta el jugador' };

  const { data } = await supabaseAdmin
    .from('players')
    .select('id, owner_staff_id')
    .eq('id', playerId)
    .maybeSingle();

  if (!data || data.owner_staff_id !== staff.id) {
    throw { status: 403, message: 'Ese jugador no es de tu cartera' };
  }
}
