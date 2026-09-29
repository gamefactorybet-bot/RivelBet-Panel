-- =========================================================
-- Auditoría de reseteos de contraseña de jugadores
-- Como la contraseña se guarda hasheada y nadie puede leerla,
-- lo único auditable es QUIÉN la reseteó y CUÁNDO.
-- =========================================================

create table if not exists password_resets (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  reset_by   text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_resets_player
  on password_resets (player_id, created_at desc);

alter table password_resets enable row level security;

drop policy if exists "staff autenticado lee reseteos" on password_resets;

create policy "staff autenticado lee reseteos"
  on password_resets for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );
