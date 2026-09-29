-- =========================================================
-- Proveedores externos: integrar juegos de terceros
--
-- Cuando un juego lo hace otro equipo (deploy propio, servidor
-- propio), NUNCA le damos acceso directo a la tabla de jugadores ni
-- al saldo. El flujo es:
--
--   1. Nosotros generamos un token firmado con el secreto del
--      proveedor y lo mandamos en la URL de lanzamiento.
--   2. El SERVIDOR del proveedor (no el navegador del jugador) nos
--      llama para debitar/acreditar, firmando cada llamada con ese
--      mismo secreto.
--
-- El secreto nunca toca ningún navegador. Si solo dependiéramos del
-- token, cualquiera que lo viera en la URL podría acreditarse plata
-- llamándonos directo — por eso cada llamada de plata va firmada.
-- =========================================================

create table if not exists proveedores_externos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  secreto    text not null,          -- compartido con el backend del proveedor, nunca al navegador
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table games
  add column if not exists proveedor_id uuid references proveedores_externos(id);

comment on column games.proveedor_id is
  'Solo para juegos externos (launch_url no nulo): qué proveedor firma sus llamadas de plata.';

alter table proveedores_externos enable row level security;

drop policy if exists "staff autenticado lee proveedores" on proveedores_externos;
create policy "staff autenticado lee proveedores"
  on proveedores_externos for select
  using (es_staff());

-- ---------------------------------------------------------
-- Jugada de un proveedor externo, en DOS fases: apostar y premiar.
--
-- Van separadas (no como slot_jugada, que hace las dos juntas) porque
-- el proveedor a veces no sabe el premio en el momento de apostar
-- (giros gratis, rondas de bonus). Cada fase tiene su propia
-- protección de idempotencia — importante: NO pueden compartir la
-- misma clave, o "premiar" quedaría absorbida por la marca que dejó
-- "apostar" y el jugador nunca cobraría.
--
-- No confiamos en los límites que manda el proveedor: los volvemos a
-- validar contra la fila del juego. El proveedor puede tener un bug,
-- o alguien puede haber falsificado la llamada.
-- ---------------------------------------------------------

create or replace function proveedor_apostar(
  p_player_id uuid,
  p_game_slug text,
  p_bet       numeric,
  p_round_id  text
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   games;
  v_player players;
  v_after  numeric;
  v_ronda  game_rounds;
begin
  select * into v_ronda from game_rounds where player_id = p_player_id and client_id = p_round_id;
  if found then return v_ronda; end if;

  select * into v_game from games where slug = p_game_slug and activo = true;
  if not found then raise exception 'Juego no encontrado o inactivo'; end if;
  if v_game.launch_url is null then raise exception 'Ese juego no es de un proveedor externo'; end if;

  if p_bet is null or p_bet <= 0 then raise exception 'La apuesta debe ser mayor a 0'; end if;
  if p_bet < v_game.min_bet or p_bet > v_game.max_bet then
    raise exception 'Apuesta fuera de los límites del juego (% a %)', v_game.min_bet, v_game.max_bet;
  end if;

  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_player.ban_permanente then raise exception 'El jugador está suspendido'; end if;
  if v_player.balance < p_bet then raise exception 'Saldo insuficiente'; end if;

  v_after := v_player.balance - p_bet;
  update players set balance = v_after where id = p_player_id;

  insert into game_rounds
    (player_id, game_slug, bet, win, balance_before, balance_after, detalle, client_id)
  values
    (p_player_id, p_game_slug, p_bet, 0, v_player.balance, v_after,
     jsonb_build_object('proveedor_externo', true, 'estado', 'apostado'), p_round_id)
  returning * into v_ronda;

  return v_ronda;
end;
$$;

-- La ronda tiene que existir ya (por el paso de apostar). "Premiar"
-- sin apuesta previa no está permitido: evita que alguien se acredite
-- plata inventando un round_id que nunca pasó por la caja.
create or replace function proveedor_premiar(
  p_player_id uuid,
  p_round_id  text,
  p_win       numeric
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda  game_rounds;
  v_player players;
  v_after  numeric;
begin
  select * into v_ronda from game_rounds where player_id = p_player_id and client_id = p_round_id for update;

  if not found then
    raise exception 'No existe una apuesta con ese round_id para este jugador';
  end if;

  -- Ya se había acreditado antes: devolvemos lo mismo sin volver a
  -- pagar. Esto es lo que distingue esta fase de la de apostar: acá
  -- la marca de "ya procesado" es específica de premiar.
  if v_ronda.detalle->>'estado' = 'pagado' then
    return v_ronda;
  end if;

  select * into v_player from players where id = p_player_id for update;

  v_after := v_player.balance + coalesce(p_win, 0);
  update players set balance = v_after where id = p_player_id;

  update game_rounds
  set win = coalesce(p_win, 0), balance_after = v_after,
      detalle = detalle || jsonb_build_object('estado', 'pagado')
  where id = v_ronda.id
  returning * into v_ronda;

  return v_ronda;
end;
$$;
