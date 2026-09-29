-- =========================================================
-- Historial de bans
-- Cada vez que se activa o levanta un ban queda registrado
-- quién lo hizo, cuándo y con qué motivo.
-- =========================================================

create table if not exists ban_history (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  ban_tipo   text not null check (ban_tipo in ('recargas', 'retiros', 'permanente')),
  activo     boolean not null,
  motivo     text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ban_history_player
  on ban_history (player_id, created_at desc);

alter table ban_history enable row level security;

drop policy if exists "staff autenticado lee historial de bans" on ban_history;

create policy "staff autenticado lee historial de bans"
  on ban_history for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );
