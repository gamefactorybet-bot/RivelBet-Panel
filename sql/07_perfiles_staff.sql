-- =========================================================
-- Perfiles y permisos del staff
-- El rol ('admin' | 'cajero') se mantiene por compatibilidad,
-- pero lo que manda ahora es el perfil + los permisos.
-- =========================================================

alter table staff_profiles
  add column if not exists perfil       text not null default 'cajero',
  add column if not exists permisos     jsonb not null default '{}'::jsonb,
  add column if not exists telefono     text,
  add column if not exists notas        text,
  add column if not exists ultimo_acceso timestamptz;

-- perfil: paquete de permisos predefinido. Ver src/lib/perfiles.js
--   dios      -> todo, incluido crear/editar staff y tocar ajustes
--   gerente   -> todo lo operativo + ver staff, sin tocar ajustes
--   caja      -> solicitudes, soporte y jugadores de la casa
--   cajero    -> mostrador: solo cargas y retiros manuales
--   externo   -> mini-distribuidor, solo su cartera
--   retiros   -> solo retiros y consulta
--   consulta  -> solo lectura, no mueve un peso

-- permisos: excepciones puntuales sobre el perfil.
--   { "cargar": false } le saca la carga a un cajero sin cambiarle el perfil.
-- Si una clave no está, se usa lo que dice el perfil.

-- Los admins existentes pasan a perfil 'dios' para no perder acceso.
update staff_profiles set perfil = 'dios' where role = 'admin' and perfil = 'cajero';

-- ---------------------------------------------------------
-- Auditoría de cambios sobre el staff
-- ---------------------------------------------------------
create table if not exists staff_history (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff_profiles(id) on delete cascade,
  accion     text not null,
  detalle    jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_history on staff_history (staff_id, created_at desc);

alter table staff_history enable row level security;

drop policy if exists "staff autenticado lee historial de staff" on staff_history;

create policy "staff autenticado lee historial de staff"
  on staff_history for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );
