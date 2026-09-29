-- =========================================================
-- Referidos
--
-- Cada jugador tiene un código. Cuando alguien se registra con ese
-- código y hace su PRIMERA carga aprobada (>= un mínimo), los dos
-- reciben un bono. Así cada referido pagado metió plata real.
--
-- Anti-abuso: el invitado no puede tener la misma IP que el referidor
-- (documento y teléfono ya son únicos globalmente).
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

alter table players
  add column if not exists codigo_referido text,
  add column if not exists referido_por    uuid references players(id) on delete set null;

create unique index if not exists idx_players_codigo_referido
  on players (codigo_referido) where codigo_referido is not null;
create index if not exists idx_players_referido_por on players (referido_por);

create table if not exists referidos_config (
  id            int primary key default 1 check (id = 1),
  activo        boolean not null default false,
  bono_referidor numeric(14,2) not null default 0 check (bono_referidor >= 0),
  bono_referido  numeric(14,2) not null default 0 check (bono_referido >= 0),
  min_carga     numeric(14,2) not null default 0 check (min_carga >= 0),
  tope          int not null default 0 check (tope >= 0),   -- 0 = sin tope
  updated_by    text,
  updated_at    timestamptz not null default now()
);
insert into referidos_config (id) values (1) on conflict (id) do nothing;

alter table referidos_config enable row level security;
drop policy if exists "staff lee referidos config" on referidos_config;
create policy "staff lee referidos config" on referidos_config for select using (es_staff());

create table if not exists referidos (
  id           uuid primary key default gen_random_uuid(),
  referidor_id uuid not null references players(id) on delete cascade,
  referido_id  uuid not null references players(id) on delete cascade,
  estado       text not null default 'registrado' check (estado in ('registrado', 'pagado')),
  tx_referidor uuid references balance_transactions(id),
  tx_referido  uuid references balance_transactions(id),
  created_at   timestamptz not null default now(),
  pagado_at    timestamptz
);

create unique index if not exists idx_referidos_uno on referidos (referido_id);
create index if not exists idx_referidos_referidor on referidos (referidor_id);

alter table referidos enable row level security;
drop policy if exists "staff lee referidos" on referidos;
create policy "staff lee referidos" on referidos for select using (es_staff());

-- ---------------------------------------------------------
-- Genera un código de referido único a partir del usuario
-- ---------------------------------------------------------
create or replace function gen_codigo_referido(p_base text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pre text := upper(regexp_replace(coalesce(p_base, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_cod text;
  v_i   int := 0;
begin
  v_pre := left(coalesce(nullif(v_pre, ''), 'WIN'), 4);
  loop
    v_cod := v_pre || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from players where codigo_referido = v_cod);
    v_i := v_i + 1;
    if v_i > 20 then
      v_cod := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
      exit;
    end if;
  end loop;
  return v_cod;
end;
$$;

-- Backfill de los jugadores existentes
do $$
declare r record;
begin
  for r in select id, username from players where codigo_referido is null loop
    update players set codigo_referido = gen_codigo_referido(r.username) where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------
-- registrar_jugador: ahora acepta un código de referido.
-- Redefine la versión de 30_autorregistro.sql sumando ese bloque y
-- la generación del código propio.
-- ---------------------------------------------------------
create or replace function registrar_jugador(
  p_username         text,
  p_password_hash    text,
  p_documento        text,
  p_telefono         text,
  p_email            text,
  p_fecha_nacimiento date,
  p_ip               text default null,
  p_codigo_referido  text default null
)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
  v_bono     bono_registro;
  v_player   players;
  v_tx       balance_transactions;
  v_por_ip   int;
  v_cfg_ref  referidos_config;
  v_refdor   players;
begin
  if p_ip is not null then
    select count(*) into v_por_ip
    from players
    where registro_ip = p_ip and created_at > now() - interval '24 hours';
    if v_por_ip >= 5 then
      raise exception 'Se registraron demasiadas cuentas desde esta conexión. Probá más tarde.';
    end if;
  end if;

  if v_username is null or length(v_username) < 3 then
    raise exception 'El usuario tiene que tener al menos 3 caracteres';
  end if;
  if p_password_hash is null or p_password_hash = '' then
    raise exception 'Falta la contraseña';
  end if;
  if coalesce(trim(p_documento), '') = '' then
    raise exception 'Ingresá tu número de documento';
  end if;
  if coalesce(trim(p_telefono), '') = '' then
    raise exception 'Ingresá tu teléfono';
  end if;
  if coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then
    raise exception 'Ingresá un correo válido';
  end if;
  if p_fecha_nacimiento is null then
    raise exception 'Ingresá tu fecha de nacimiento';
  end if;

  select * into v_bono from bono_registro where id = 1;

  if p_fecha_nacimiento > (current_date - make_interval(years => coalesce(v_bono.edad_minima, 18))) then
    raise exception 'Tenés que ser mayor de % años para registrarte', coalesce(v_bono.edad_minima, 18);
  end if;

  -- ¿Vino con código de referido válido?
  select * into v_cfg_ref from referidos_config where id = 1;
  if coalesce(v_cfg_ref.activo, false) and coalesce(trim(p_codigo_referido), '') <> '' then
    select * into v_refdor from players where codigo_referido = upper(trim(p_codigo_referido));
    if found and v_refdor.ban_permanente then
      v_refdor := null;
    end if;
    -- Mismo IP que el referidor => no cuenta (pero deja registrarse).
    if v_refdor.id is not null and p_ip is not null and v_refdor.registro_ip = p_ip then
      v_refdor := null;
    end if;
  end if;

  begin
    insert into players (username, password_hash,
                         documento, telefono, email, fecha_nacimiento, registro_ip,
                         codigo_referido, referido_por, created_by)
    values (v_username, p_password_hash,
            trim(p_documento), trim(p_telefono), lower(trim(p_email)),
            p_fecha_nacimiento, p_ip,
            gen_codigo_referido(v_username), v_refdor.id, 'autorregistro')
    returning * into v_player;
  exception when unique_violation then
    if position('username' in sqlerrm) > 0 then
      raise exception 'Ese usuario ya está tomado';
    elsif position('documento' in sqlerrm) > 0 then
      raise exception 'Ese documento ya está registrado';
    elsif position('telefono' in sqlerrm) > 0 then
      raise exception 'Ese teléfono ya está registrado';
    elsif position('email' in sqlerrm) > 0 then
      raise exception 'Ese correo ya está registrado';
    else
      raise exception 'Ya existe una cuenta con esos datos';
    end if;
  end;

  if v_refdor.id is not null then
    insert into referidos (referidor_id, referido_id) values (v_refdor.id, v_player.id)
    on conflict (referido_id) do nothing;
  end if;

  if coalesce(v_bono.activo, false) and coalesce(v_bono.monto, 0) > 0 then
    v_tx := wallet_movimiento(
      v_player.id, 'carga', v_bono.monto,
      'Bono de registro', 'sistema:autorregistro'
    );
    insert into bonos_otorgados (player_id, monto, tx_id)
    values (v_player.id, v_bono.monto, v_tx.id);
    update players
    set retiro_bloqueado = true, bono_por_descontar = v_bono.monto
    where id = v_player.id
    returning * into v_player;
  end if;

  return v_player;
end;
$$;

-- ---------------------------------------------------------
-- Pagar el referido cuando el invitado hace su primera carga.
-- Lo dispara un trigger sobre deposit_requests (así no hace falta
-- redefinir aprobar_deposito otra vez).
-- ---------------------------------------------------------
create or replace function procesar_referido(p_player_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref     referidos;
  v_cfg     referidos_config;
  v_pagados int;
  v_tx1     balance_transactions;
  v_tx2     balance_transactions;
  v_refdor  players;
begin
  select * into v_cfg from referidos_config where id = 1;
  if not coalesce(v_cfg.activo, false) then return; end if;

  select * into v_ref from referidos
  where referido_id = p_player_id and estado = 'registrado'
  for update;
  if not found then return; end if;

  -- Solo la primera carga aprobada del invitado.
  if (select count(*) from deposit_requests
      where player_id = p_player_id and estado = 'aprobado') <> 1 then
    return;
  end if;

  if p_monto < coalesce(v_cfg.min_carga, 0) then
    return;
  end if;

  if coalesce(v_cfg.tope, 0) > 0 then
    select count(*) into v_pagados from referidos
    where referidor_id = v_ref.referidor_id and estado = 'pagado';
    if v_pagados >= v_cfg.tope then return; end if;
  end if;

  select * into v_refdor from players where id = v_ref.referidor_id;
  if v_refdor.ban_permanente then return; end if;

  if coalesce(v_cfg.bono_referidor, 0) > 0 then
    v_tx1 := wallet_movimiento(v_ref.referidor_id, 'carga', v_cfg.bono_referidor,
      'Bono por referido', 'sistema:referidos');
  end if;
  if coalesce(v_cfg.bono_referido, 0) > 0 then
    v_tx2 := wallet_movimiento(p_player_id, 'carga', v_cfg.bono_referido,
      'Bono de bienvenida por referido', 'sistema:referidos');
  end if;

  update referidos
  set estado = 'pagado', tx_referidor = v_tx1.id, tx_referido = v_tx2.id, pagado_at = now()
  where id = v_ref.id;
end;
$$;

create or replace function trg_referido_al_aprobar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'aprobado' and coalesce(old.estado, '') = 'pendiente' then
    begin
      perform procesar_referido(new.player_id, new.amount);
    exception when others then
      raise warning 'procesar_referido: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_dep_referido on deposit_requests;
create trigger trg_dep_referido after update on deposit_requests
  for each row execute function trg_referido_al_aprobar();

-- ---------------------------------------------------------
-- Resumen para la card del portal
-- ---------------------------------------------------------
create or replace function referidos_resumen(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activo',    coalesce((select activo from referidos_config where id = 1), false),
    'bono',      coalesce((select bono_referidor from referidos_config where id = 1), 0),
    'codigo',    (select codigo_referido from players where id = p_player_id),
    'invitados', coalesce((select count(*) from referidos where referidor_id = p_player_id), 0),
    'pagados',   coalesce((select count(*) from referidos where referidor_id = p_player_id and estado = 'pagado'), 0),
    'ganado',    coalesce((select sum(amount) from balance_transactions
                           where player_id = p_player_id and note = 'Bono por referido'), 0)
  );
$$;
grant execute on function referidos_resumen(uuid) to anon, authenticated;

-- Heartbeat del panel al cambiar algo de referidos
drop trigger if exists trg_hb_staff on referidos;
create trigger trg_hb_staff after insert or update on referidos
  for each statement execute function bump_staff_heartbeat();
