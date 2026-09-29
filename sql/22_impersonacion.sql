-- =========================================================
-- Entrar al portal como un jugador ("ver como cliente")
--
-- El panel y el portal viven en dominios distintos (ver
-- deploy/README.md), así que no alcanza con generar el JWT del
-- jugador en el panel y mandarlo directo por la URL al portal: quedaría
-- un token válido por 12 horas pegado en el historial del navegador y
-- en cualquier log de acceso que guarde la URL completa.
--
-- En cambio, el panel genera un CÓDIGO de un solo uso, válido 60
-- segundos, y solo ese código viaja por la URL. El portal lo canjea
-- por el JWT real llamando a /api/player-sesion?recurso=impersonar.
-- Si el código se filtra, ya expiró o ya se usó.
--
-- Se guarda el hash del código, no el código en texto plano — mismo
-- criterio que las contraseñas: si esta tabla se llegara a exponer,
-- no hay nada reutilizable adentro.
-- =========================================================

create table if not exists impersonaciones (
  id           uuid primary key default gen_random_uuid(),
  codigo_hash  text not null unique,
  player_id    uuid not null references players(id) on delete cascade,
  staff_id     uuid not null references staff_profiles(id),
  staff_email  text not null,
  expira_at    timestamptz not null,
  canjeado_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_imperson_vigentes
  on impersonaciones (codigo_hash)
  where canjeado_at is null;

alter table impersonaciones enable row level security;

-- Nadie la lee ni la escribe desde el navegador: solo las funciones de
-- /api la tocan, con la service role key. Sin policy de select/insert
-- para authenticated/anon, RLS la deja cerrada por defecto.
