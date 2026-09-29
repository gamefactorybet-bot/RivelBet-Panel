-- =========================================================
-- Giro diario gratis
--
-- Una tirada gratis por día (por fecha, en la zona del casino). El
-- premio lo resuelve el servidor con crypto.randomInt ponderado (en
-- la API, como el slot) y se acredita directo al saldo. Se multiplica
-- por el giro_multiplicador del nivel VIP.
--
-- El objetivo es el hábito: aunque el jugador no tenga saldo, entra
-- todos los días a probar.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists giro_diario_config (
  id       int primary key default 1 check (id = 1),
  activo   boolean not null default false,
  -- [{ "monto": 0, "peso": 60 }, { "monto": 500, "peso": 22 }, ...]
  premios  jsonb not null default '[{"monto":0,"peso":70},{"monto":500,"peso":20},{"monto":1500,"peso":8},{"monto":5000,"peso":2}]'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into giro_diario_config (id) values (1) on conflict (id) do nothing;

alter table giro_diario_config enable row level security;
drop policy if exists "staff lee giro config" on giro_diario_config;
create policy "staff lee giro config" on giro_diario_config for select using (es_staff());

create table if not exists giros_diarios (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  fecha      date not null,
  premio_base numeric(14,2) not null default 0,
  premio     numeric(14,2) not null default 0,   -- ya con el multiplicador VIP
  tx_id      uuid references balance_transactions(id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_giro_uno_por_dia on giros_diarios (player_id, fecha);
create index if not exists idx_giro_fecha on giros_diarios (fecha desc);

alter table giros_diarios enable row level security;
drop policy if exists "staff lee giros" on giros_diarios;
create policy "staff lee giros" on giros_diarios for select using (es_staff());

-- ---------------------------------------------------------
-- Resolver el giro. El premio_base ya viene calculado por la API
-- (azar ponderado con crypto). Acá se valida, se aplica el
-- multiplicador VIP y se acredita.
-- ---------------------------------------------------------
create or replace function girar_diario(p_player_id uuid, p_premio_base numeric)
returns giros_diarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p     players;
  v_hoy   date := (now() at time zone zona_casino())::date;
  v_mult  numeric := 1;
  v_final numeric;
  v_tx    balance_transactions;
  v_row   giros_diarios;
begin
  select * into v_p from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_p.ban_permanente then raise exception 'Tu cuenta está suspendida'; end if;
  if v_p.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad para girar';
  end if;

  -- Reservamos el giro del día ANTES de acreditar: si ya existe (o dos
  -- toques a la vez), el único que gana es el primero — sin doble crédito.
  begin
    insert into giros_diarios (player_id, fecha, premio_base, premio)
    values (p_player_id, v_hoy, coalesce(p_premio_base, 0), 0)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Ya usaste tu giro de hoy';
  end;

  select coalesce(vn.giro_multiplicador, 1) into v_mult
  from vip_niveles vn where vn.id = v_p.vip_nivel_id;

  v_final := round(coalesce(p_premio_base, 0) * coalesce(v_mult, 1), 2);

  if v_final > 0 then
    v_tx := wallet_movimiento(p_player_id, 'carga', v_final, 'Giro diario', 'sistema:giro-diario');
  end if;

  update giros_diarios
  set premio = v_final, tx_id = v_tx.id
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------
-- Estado para el portal: si puede girar hoy y cuándo es el próximo
-- ---------------------------------------------------------
create or replace function giro_estado(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activo',  coalesce((select activo from giro_diario_config where id = 1), false),
    'premios', coalesce((select premios from giro_diario_config where id = 1), '[]'::jsonb),
    'giroHoy', (select jsonb_build_object('premio', premio, 'at', created_at)
                from giros_diarios
                where player_id = p_player_id
                  and fecha = (now() at time zone zona_casino())::date),
    'proximoAt', ((((now() at time zone zona_casino())::date + 1)::text || ' 00:00')
                  ::timestamp at time zone zona_casino())
  );
$$;
grant execute on function giro_estado(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- Métricas para el panel
-- ---------------------------------------------------------
create or replace function giro_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'hoy',        coalesce((select count(*) from giros_diarios where fecha = (now() at time zone zona_casino())::date), 0),
    'repartido_hoy', coalesce((select sum(premio) from giros_diarios where fecha = (now() at time zone zona_casino())::date), 0),
    'semana',     coalesce((select count(*) from giros_diarios where created_at > now() - interval '7 days'), 0),
    'repartido_semana', coalesce((select sum(premio) from giros_diarios where created_at > now() - interval '7 days'), 0)
  );
$$;
grant execute on function giro_stats() to authenticated;

-- Heartbeats: el giro cambia el estado del jugador y es novedad para el panel
drop trigger if exists trg_hb_player_giro on giros_diarios;
create trigger trg_hb_player_giro after insert on giros_diarios
  for each row execute function trg_bump_ph_row();

drop trigger if exists trg_hb_staff_giro on giros_diarios;
create trigger trg_hb_staff_giro after insert on giros_diarios
  for each statement execute function bump_staff_heartbeat();
