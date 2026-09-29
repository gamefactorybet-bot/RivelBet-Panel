-- =========================================================
-- Autorregistro de jugadores + bono de registro
--
-- El jugador se crea solo desde el portal, sin cajero. Da sus
-- datos de contacto y su documento (para verificar después) y
-- entra en estado 'sin_verificar': ve el catálogo pero no puede
-- jugar hasta que un operador revise sus fotos (ver 31_verificaciones).
--
-- El bono se acredita ACÁ, al crear la cuenta — no al verificar.
-- Es el gancho: el jugador ve la plata en el saldo pero no le sirve
-- de nada sin verificarse (no puede jugar) ni sin cargar (no puede
-- retirar, ver 32_candado_retiro).
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- Datos nuevos del jugador
-- ---------------------------------------------------------
alter table players
  add column if not exists documento          text,
  add column if not exists telefono           text,
  add column if not exists email              text,
  add column if not exists fecha_nacimiento   date,
  add column if not exists registro_ip        text,
  add column if not exists estado_verificacion text not null default 'sin_verificar'
    check (estado_verificacion in ('sin_verificar', 'pendiente', 'verificado', 'rechazado')),
  -- El retiro arranca bloqueado para quien recibió bono: se libera
  -- con una carga aprobada >= el valor del bono (ver 32).
  add column if not exists retiro_bloqueado   boolean not null default false,
  -- Piso de saldo no retirable = la cara del bono. Modelo B: el bono
  -- entra al saldo normal, pero nunca se lo lleva; solo lo ganado con
  -- él. El piso solo BAJA (si funde el bono jugando), nunca sube.
  add column if not exists bono_por_descontar numeric(14,2) not null default 0
    check (bono_por_descontar >= 0);

comment on column players.estado_verificacion is
  'sin_verificar: recién registrado | pendiente: subió fotos, falta revisión | verificado: puede jugar | rechazado: puede reenviar';
comment on column players.bono_por_descontar is
  'Piso de saldo no retirable (cara del bono de registro). retirable = balance - bono_por_descontar. Solo decrece.';

-- documento / telefono / email únicos entre los que los tengan
-- cargados (los jugadores viejos creados por cajero pueden no tener).
create unique index if not exists idx_players_documento
  on players (documento) where documento is not null;
create unique index if not exists idx_players_telefono
  on players (telefono) where telefono is not null;
create unique index if not exists idx_players_email
  on players (lower(email)) where email is not null;

-- ---------------------------------------------------------
-- Config del bono de registro — una sola fila (id = 1)
-- Se edita desde el panel: monto + imagen y textos del banner que
-- ve el jugador en el registro y en la pantalla de verificación.
-- ---------------------------------------------------------
create table if not exists bono_registro (
  id          int primary key default 1 check (id = 1),
  activo      boolean not null default false,
  monto       numeric(14,2) not null default 0 check (monto >= 0),
  banner_url  text,
  titulo      text not null default 'Registrate y llevate tu bono',
  subtitulo   text not null default 'Verificá tu identidad y empezá a jugar',
  edad_minima int not null default 18 check (edad_minima between 18 and 25),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

insert into bono_registro (id) values (1)
on conflict (id) do nothing;

alter table bono_registro enable row level security;

-- Lectura pública: el portal muestra el banner antes de que el
-- jugador tenga cuenta. Igual lo pide por /api. Sin policy de
-- update => se edita solo por /api con Service Role.
drop policy if exists "cualquiera lee el bono de registro" on bono_registro;
create policy "cualquiera lee el bono de registro"
  on bono_registro for select using (true);

-- ---------------------------------------------------------
-- Auditoría: qué bono de registro recibió cada jugador
-- ---------------------------------------------------------
create table if not exists bonos_otorgados (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  monto         numeric(14,2) not null check (monto > 0),
  tx_id         uuid references balance_transactions(id),
  -- 'activo': todavía bloquea el retiro | 'liberado': ya se hizo la
  -- carga que califica, el candado se levantó
  estado        text not null default 'activo' check (estado in ('activo', 'liberado')),
  carga_liberadora uuid references deposit_requests(id),
  created_at    timestamptz not null default now(),
  liberado_at   timestamptz
);

create index if not exists idx_bonos_otorgados_player on bonos_otorgados (player_id);

-- Un solo bono de registro por jugador, para siempre.
create unique index if not exists idx_bonos_otorgados_uno
  on bonos_otorgados (player_id);

alter table bonos_otorgados enable row level security;
drop policy if exists "staff autenticado lee bonos otorgados" on bonos_otorgados;
create policy "staff autenticado lee bonos otorgados"
  on bonos_otorgados for select using (es_staff());

-- ---------------------------------------------------------
-- Registrar un jugador nuevo desde el portal
--
-- Crea la cuenta y, si hay bono activo, lo acredita en el mismo
-- paso atómico: una fila en players, el asiento del bono en el
-- libro, la fila de auditoría y el candado de retiro.
-- ---------------------------------------------------------
create or replace function registrar_jugador(
  p_username        text,
  p_password_hash   text,
  p_documento       text,
  p_telefono        text,
  p_email           text,
  p_fecha_nacimiento date,
  p_ip              text default null
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
begin
  -- Freno al farmeo: máximo 5 cuentas por IP en 24 h.
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

  begin
    insert into players (username, password_hash,
                         documento, telefono, email, fecha_nacimiento, registro_ip, created_by)
    values (v_username, p_password_hash,
            trim(p_documento), trim(p_telefono), lower(trim(p_email)),
            p_fecha_nacimiento, p_ip, 'autorregistro')
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

  -- Bono: solo si está activo y con monto. wallet_movimiento deja el
  -- asiento en el libro (identificado como "Bono de registro").
  if coalesce(v_bono.activo, false) and coalesce(v_bono.monto, 0) > 0 then
    v_tx := wallet_movimiento(
      v_player.id, 'carga', v_bono.monto,
      'Bono de registro', 'sistema:autorregistro'
    );

    insert into bonos_otorgados (player_id, monto, tx_id)
    values (v_player.id, v_bono.monto, v_tx.id);

    update players
    set retiro_bloqueado = true,
        bono_por_descontar = v_bono.monto
    where id = v_player.id
    returning * into v_player;
  end if;

  return v_player;
end;
$$;
