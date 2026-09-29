import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env');
}

// persistSession + autoRefreshToken vienen en true por defecto,
// pero los dejamos explícitos para que quede documentado:
// - persistSession: guarda el token en localStorage del navegador
// - autoRefreshToken: lo renueva solo antes de que venza
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Devuelve la sesión activa (o null) y el perfil de staff asociado.
 * Se usa al arrancar la app para decidir si mostrar login o dashboard.
 */
export async function getSessionWithProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { session: null, profile: null };

  const { data: profile, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('No se pudo cargar el perfil de staff:', error.message);
    return { session, profile: null };
  }

  return { session, profile };
}
