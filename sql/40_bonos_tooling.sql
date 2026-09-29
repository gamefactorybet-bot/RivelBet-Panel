-- =========================================================
-- Herramientas de bonos sobre el motor de rollover (sql/39)
--
--  1. bono_movimientos — ledger de cada bono con rollover, para medir
--     liberación vs forfeit vs en curso.
--  2. promo_codigos / promo_canjes — códigos para campañas: free bet
--     (canjea y le cae) o match sobre depósito (mete el código al cargar).
--  3. dar_bono_manual — un cajero le da un bono a dedo desde el perfil.
--  4. Segmentación de `bonos`: VIP mínimo, días sin cargar, sin depósito,
--     tope de usos y presupuesto.
--  5. bono_metricas() — resumen para el panel.
--
-- Todo pasa por sumar_bono_billetera, así respeta modo_avanzado: si está
-- apagado, ningún bono suma requisito ni escribe bono_movimientos.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- 1. Ledger de bonos con rollover
-- ---------------------------------------------------------
create table if not exists bono_movimientos (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references players(id) on delete cascade,
  origen            text not null check (origen in
                      ('registro','carga','referido','cashback','giro','promo','manual','otro')),
  origen_id         uuid,                       -- bonos.id | promo_codigos.id, si aplica
  referencia        text,                       -- nombre del bono / código / nota del cajero
  monto             numeric(14,2) not null,
  rollover          numeric(6,2) not null,
  requisito_inicial numeric(14,2) not null,
  estado            text not null default 'activo' check (estado in ('activo','liberado','perdido')),
  tx_id             uuid references balance_transactions(id),
  created_at        timestamptz not null default now(),
  resuelto_at       timestamptz
);
create index if not exists idx_bono_mov_player on bono_movimientos (player_id, estado);
create index if not exists idx_bono_mov_origen on bono_movimientos (origen, created_at desc);

alter table bono_movimientos enable row level security;
drop policy if exists "staff lee bono_movimientos" on bono_movimientos;
create policy "staff lee bono_movimientos" on bono_movimientos for select using (es_staff());

-- ---------------------------------------------------------
-- 2. Códigos promocionales
-- ---------------------------------------------------------
create table if not exists promo_codigos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,          -- se guarda upper()
  descripcion    text,
  tipo           text not null check (tipo in ('fijo','porcentaje')),
  valor          numeric(14,2) not null check (valor > 0),
  tope           numeric(14,2),                 -- techo del bono si es %
  rollover       numeric(6,2) not null default 1 check (rollover >= 0),
  requiere_carga boolean not null default true, -- true = match sobre el depósito; false = free bet
  min_carga      numeric(14,2) not null default 0,
  desde          timestamptz,
  hasta          timestamptz,
  tope_usos      int not null default 0,        -- 0 = sin tope global
  usos           int not null default 0,
  activo         boolean not null default true,
  created_by     text,
  created_at     timestamptz not null default now()
);

alter table promo_codigos enable row level security;
drop policy if exists "staff lee promo_codigos" on promo_codigos;
create policy "staff lee promo_codigos" on promo_codigos for select using (es_staff());

create table if not exists promo_canjes (
  id                 uuid primary key default gen_random_uuid(),
  codigo_id          uuid not null references promo_codigos(id) on delete cascade,
  player_id          uuid not null references players(id) on delete cascade,
  deposit_request_id uuid references deposit_requests(id),
  monto              numeric(14,2) not null,
  created_at         timestamptz not null default now(),
  unique (codigo_id, player_id)
);
create index if not exists idx_promo_canjes_player on promo_canjes (player_id);

alter table promo_canjes enable row level security;
drop policy if exists "staff lee promo_canjes" on promo_canjes;
create policy "staff lee promo_canjes" on promo_canjes for select using (es_staff());

-- El código que el jugador metió al pedir la carga (match sobre depósito).
alter table deposit_requests add column if not exists promo_codigo text;

-- ---------------------------------------------------------
-- 3. Segmentación de `bonos`
-- ---------------------------------------------------------
alter table bonos
  add column if not exists vip_nivel_min     uuid references vip_niveles(id) on delete set null,
  add column if not exists dias_sin_cargar   int not null default 0 check (dias_sin_cargar >= 0),
  add column if not exists solo_sin_deposito boolean not null default false,
  add column if not exists tope_usos         int not null default 0 check (tope_usos >= 0),
  add column if not exists presupuesto       numeric(14,2) not null default 0 check (presupuesto >= 0),
  add column if not exists usos              int not null default 0,
  add column if not exists repartido         numeric(14,2) not null default 0;

-- =========================================================
-- Helper: sumar_bono_billetera — ahora anota en bono_movimientos.
-- Se dropea la versión de 4 args de sql/39 y se recrea con el origen.
-- Los llamados de 3 args siguen andando (origen -> 'otro').
-- =========================================================
drop function if exists sumar_bono_billetera(uuid, numeric, numeric, boolean);

create or replace function sumar_bono_billetera(
  p_player_id  uuid,
  p_monto      numeric,
  p_rollover   numeric,
  p_es_bono    boolean default true,
  p_origen     text    default 'otro',
  p_referencia text    default null,
  p_origen_id  uuid    default null,
  p_tx_id      uuid    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv boolean;
begin
  if coalesce(p_monto, 0) <= 0 or coalesce(p_rollover, 0) <= 0 then
    return;
  end if;

  select modo_avanzado into v_adv from billetera_config where id = 1;
  if not coalesce(v_adv, false) then
    return;
  end if;

  update players
  set saldo_bono        = saldo_bono + case when p_es_bono then p_monto else 0 end,
      requisito_apuesta = requisito_apuesta + p_monto * p_rollover
  where id = p_player_id;

  -- La carga real (p_es_bono = false) no es un bono: no va al ledger.
  if p_es_bono then
    insert into bono_movimientos
      (player_id, origen, origen_id, referencia, monto, rollover, requisito_inicial, tx_id)
    values
      (p_player_id, p_origen, p_origen_id, p_referencia, p_monto, p_rollover,
       p_monto * p_rollover, p_tx_id);
  end if;
end;
$$;

-- =========================================================
-- consumir_apuesta_billetera — al liberar, cierra los bono_movimientos
-- activos del jugador (redefine la de sql/39 sumando ese update).
-- =========================================================
create or replace function consumir_apuesta_billetera(
  p_player_id uuid,
  p_bet       numeric,
  p_win       numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     billetera_config;
  v_req     numeric;
  v_bono    numeric;
  v_new_req numeric;
begin
  select * into v_cfg from billetera_config where id = 1;
  if not coalesce(v_cfg.modo_avanzado, false) then
    return;
  end if;

  select requisito_apuesta, saldo_bono into v_req, v_bono
  from players where id = p_player_id;

  if coalesce(v_req, 0) <= 0 and coalesce(v_bono, 0) <= 0 then
    return;
  end if;

  v_new_req := greatest(0, coalesce(v_req, 0) - coalesce(p_bet, 0));

  update players
  set requisito_apuesta = v_new_req,
      saldo_bono = case when v_new_req <= 0 then 0
                        else greatest(0, saldo_bono - coalesce(p_bet, 0)) end,
      ganancia_bono = case when v_new_req <= 0 then 0
                           when coalesce(v_cfg.retener_ganancias, false) and coalesce(v_req, 0) > 0
                             then ganancia_bono + coalesce(p_win, 0)
                           else ganancia_bono end
  where id = p_player_id;

  -- [tooling] requisito cumplido => cerrar el ledger
  if v_new_req <= 0 and coalesce(v_req, 0) > 0 then
    update bono_movimientos
    set estado = 'liberado', resuelto_at = now()
    where player_id = p_player_id and estado = 'activo';
  end if;
end;
$$;

-- =========================================================
-- solicitar_retiro — en el forfeit, marca los bono_movimientos como
-- perdidos (redefine la de sql/39 sumando ese update).
-- =========================================================
create or replace function solicitar_retiro(
  p_player_id     uuid,
  p_amount        numeric,
  p_nota          text default null,
  p_metodo_tipo   text default null,
  p_alias_tipo    text default null,
  p_alias_valor   text default null,
  p_banco         text default null,
  p_numero_cuenta text default null,
  p_titular       text default null,
  p_documento     text default null
)
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player        players;
  v_balance_after numeric;
  v_tx            balance_transactions;
  v_req           withdrawal_requests;
  v_bono_monto    numeric;
  v_piso          numeric;
  v_retirable     numeric;
  v_bille         billetera_config;
  v_forfeit       numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Método de cobro inválido';
  end if;

  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_player.ban_permanente then raise exception 'El jugador tiene ban permanente'; end if;
  if v_player.ban_retiros then raise exception 'El jugador tiene ban de retiros'; end if;
  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad antes de retirar';
  end if;

  if v_player.retiro_bloqueado then
    select monto into v_bono_monto from bonos_otorgados
    where player_id = p_player_id and estado = 'activo';
    raise exception 'Para retirar tenés que hacer una carga de al menos % y que un cajero la apruebe', coalesce(v_bono_monto, 0);
  end if;

  v_piso := least(v_player.bono_por_descontar, v_player.balance);

  select * into v_bille from billetera_config where id = 1;
  if coalesce(v_bille.modo_avanzado, false) and coalesce(v_player.requisito_apuesta, 0) > 0 then
    v_forfeit := coalesce(v_player.saldo_bono, 0)
      + case when coalesce(v_bille.retener_ganancias, false)
             then coalesce(v_player.ganancia_bono, 0) else 0 end;
  end if;

  v_retirable := v_player.balance - v_piso - v_forfeit;

  if p_amount > v_retirable then
    raise exception 'Podés retirar hasta % (% del bono no son retirables)', v_retirable, v_piso + v_forfeit;
  end if;

  v_balance_after := v_player.balance - v_forfeit - p_amount;

  update players
  set balance = v_balance_after,
      balance_retenido = balance_retenido + p_amount,
      bono_por_descontar = v_piso,
      saldo_bono        = case when v_forfeit > 0 then 0 else saldo_bono end,
      ganancia_bono     = case when v_forfeit > 0 then 0 else ganancia_bono end,
      requisito_apuesta = case when v_forfeit > 0 then 0 else requisito_apuesta end
  where id = p_player_id;

  if v_forfeit > 0 then
    update bonos_otorgados
    set estado = 'perdido', liberado_at = now()
    where player_id = p_player_id and estado = 'activo';

    -- [tooling] cerrar el ledger como perdido
    update bono_movimientos
    set estado = 'perdido', resuelto_at = now()
    where player_id = p_player_id and estado = 'activo';
  end if;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (p_player_id, 'retiro', p_amount, v_player.balance, v_balance_after,
     coalesce(p_nota, 'Retiro solicitado desde el portal'), 'jugador:' || v_player.username)
  returning * into v_tx;

  insert into withdrawal_requests
    (player_id, amount, nota_jugador, tx_id,
     metodo_tipo, alias_tipo, alias_valor, banco, numero_cuenta, titular, documento)
  values
    (p_player_id, p_amount, p_nota, v_tx.id,
     p_metodo_tipo, p_alias_tipo, p_alias_valor, p_banco, p_numero_cuenta, p_titular, p_documento)
  returning * into v_req;

  return v_req;
end;
$$;

-- =========================================================
-- calcular_bono — segmentación (redefine sql/12_bonos.sql).
-- =========================================================
create or replace function calcular_bono(
  p_player_id uuid,
  p_monto     numeric
)
returns table (bono_id uuid, bono_monto numeric, bono_nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_es_primera boolean;
  v_bono       bonos;
  v_monto      numeric;
  v_vip_orden  int;
begin
  select not exists (
    select 1 from deposit_requests
    where player_id = p_player_id and estado = 'aprobado'
  ) into v_es_primera;

  select coalesce(vn.orden, 0) into v_vip_orden
  from players p left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

  select * into v_bono
  from bonos b
  where b.activo = true
    and (b.desde is null or b.desde <= now())
    and (b.hasta is null or b.hasta >= now())
    and p_monto >= b.monto_min
    and (b.monto_max is null or p_monto <= b.monto_max)
    and (b.aplica = 'todas' or v_es_primera)
    -- [tooling] segmentación
    and (b.vip_nivel_min is null
         or v_vip_orden >= (select orden from vip_niveles where id = b.vip_nivel_min))
    and (b.dias_sin_cargar = 0 or not exists (
          select 1 from deposit_requests dr
          where dr.player_id = p_player_id and dr.estado = 'aprobado'
            and dr.resuelto_at > now() - make_interval(days => b.dias_sin_cargar)))
    and (not b.solo_sin_deposito or v_es_primera)
    and (b.tope_usos = 0 or b.usos < b.tope_usos)
    and (b.presupuesto = 0 or b.repartido < b.presupuesto)
  order by b.orden asc, b.monto_min desc
  limit 1;

  if not found then
    return query select null::uuid, 0::numeric, null::text;
    return;
  end if;

  if v_bono.tipo = 'porcentaje' then
    v_monto := round(p_monto * v_bono.valor / 100, 2);
    if v_bono.tope is not null and v_monto > v_bono.tope then
      v_monto := v_bono.tope;
    end if;
  else
    v_monto := v_bono.valor;
  end if;

  return query select v_bono.id, v_monto, v_bono.nombre;
end;
$$;

-- =========================================================
-- Calcular el bono de un código promocional para un monto de carga.
-- =========================================================
create or replace function calcular_promo(p_codigo text, p_monto numeric)
returns table (promo_id uuid, promo_monto numeric, promo_rollover numeric, promo_codigo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p     promo_codigos;
  v_monto numeric;
begin
  select * into v_p from promo_codigos
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if not found or not v_p.activo then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if v_p.desde is not null and v_p.desde > now() then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if v_p.hasta is not null and v_p.hasta < now() then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if v_p.tope_usos > 0 and v_p.usos >= v_p.tope_usos then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if coalesce(p_monto, 0) < v_p.min_carga then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;

  if v_p.tipo = 'porcentaje' then
    v_monto := round(coalesce(p_monto, 0) * v_p.valor / 100, 2);
    if v_p.tope is not null and v_monto > v_p.tope then v_monto := v_p.tope; end if;
  else
    v_monto := v_p.valor;
  end if;

  return query select v_p.id, v_monto, v_p.rollover, v_p.codigo;
end;
$$;

-- =========================================================
-- aprobar_deposito — redefine sql/39:
--   + código promo (match sobre depósito): reemplaza al bono automático
--   + bump de usos/repartido/presupuesto del bono
--   + origen en sumar_bono_billetera
-- =========================================================
create or replace function aprobar_deposito(
  p_request_id uuid,
  p_created_by text,
  p_monto_real numeric default null,
  p_nota       text default null
)
returns deposit_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req        deposit_requests;
  v_monto      numeric;
  v_tx         balance_transactions;
  v_tx_bono_id uuid;
  v_bono_id    uuid;
  v_bono_mon   numeric;
  v_bono_nom   text;
  v_reg_bloq   boolean;
  v_reg_bal    numeric;
  v_reg_piso   numeric;
  v_reg_monto  numeric;
  v_cargado    numeric;
  v_forzado    uuid;
  v_promo_id   uuid;
  v_promo_mon  numeric;
  v_promo_roll numeric;
  v_promo_cod  text;
  v_origen     text;
  v_origen_id  uuid;
  v_referencia text;
  v_roll       numeric;
begin
  select * into v_req from deposit_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_req.estado <> 'pendiente' then raise exception 'La solicitud ya fue %', v_req.estado; end if;

  v_monto := coalesce(p_monto_real, v_req.amount);
  if v_monto <= 0 then raise exception 'El monto acreditado debe ser mayor a 0'; end if;

  -- ¿Vino con código promocional válido? El código REEMPLAZA al bono automático.
  if coalesce(trim(v_req.promo_codigo), '') <> '' then
    select cp.promo_id, cp.promo_monto, cp.promo_rollover, cp.promo_codigo
    into v_promo_id, v_promo_mon, v_promo_roll, v_promo_cod
    from calcular_promo(v_req.promo_codigo, v_monto) cp;

    -- Un código por jugador
    if v_promo_id is not null and exists (
         select 1 from promo_canjes where codigo_id = v_promo_id and player_id = v_req.player_id) then
      v_promo_id := null;
    end if;
  end if;

  if v_promo_id is not null and coalesce(v_promo_mon, 0) > 0 then
    v_bono_mon  := v_promo_mon;
    v_bono_nom  := 'Código ' || v_promo_cod;
    v_roll      := coalesce(v_promo_roll, 1);
    v_origen    := 'promo';
    v_origen_id := v_promo_id;
    v_referencia := v_promo_cod;
  else
    select cb.bono_id, cb.bono_monto, cb.bono_nombre
    into v_bono_id, v_bono_mon, v_bono_nom
    from calcular_bono(v_req.player_id, v_monto) cb;
    v_roll      := coalesce((select rollover from bonos where id = v_bono_id), 1);
    v_origen    := 'carga';
    v_origen_id := v_bono_id;
    v_referencia := v_bono_nom;
  end if;

  v_tx := wallet_movimiento(
    v_req.player_id, 'carga', v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'), p_created_by
  );

  perform sumar_bono_billetera(
    v_req.player_id, v_monto,
    coalesce((select rollover_carga from billetera_config where id = 1), 0),
    false
  );

  if coalesce(v_bono_mon, 0) > 0 then
    v_tx_bono_id := (wallet_movimiento(
      v_req.player_id, 'carga', v_bono_mon,
      'Bono: ' || coalesce(v_bono_nom, 'promoción'), p_created_by
    )).id;

    perform sumar_bono_billetera(
      v_req.player_id, v_bono_mon, v_roll,
      true, v_origen, v_referencia, v_origen_id, v_tx_bono_id
    );

    if v_origen = 'promo' then
      update promo_codigos set usos = usos + 1 where id = v_promo_id;
      insert into promo_canjes (codigo_id, player_id, deposit_request_id, monto)
      values (v_promo_id, v_req.player_id, p_request_id, v_bono_mon)
      on conflict (codigo_id, player_id) do nothing;
    elsif v_bono_id is not null then
      update bonos
      set usos = usos + 1, repartido = repartido + v_bono_mon
      where id = v_bono_id;
    end if;
  end if;

  -- Candado del bono de registro
  select retiro_bloqueado, balance, bono_por_descontar
  into v_reg_bloq, v_reg_bal, v_reg_piso
  from players where id = v_req.player_id;

  if coalesce(v_reg_bloq, false) then
    select monto into v_reg_monto from bonos_otorgados
    where player_id = v_req.player_id and estado = 'activo';

    if found and v_monto >= v_reg_monto then
      update players
      set retiro_bloqueado = false,
          bono_por_descontar = least(bono_por_descontar,
                                     greatest(0, v_reg_bal - v_monto - coalesce(v_bono_mon, 0)))
      where id = v_req.player_id;

      update bonos_otorgados
      set estado = 'liberado', carga_liberadora = p_request_id, liberado_at = now()
      where player_id = v_req.player_id and estado = 'activo';
    end if;
  end if;

  -- VIP
  update players
  set cargado_historico = cargado_historico + v_monto
  where id = v_req.player_id
  returning cargado_historico, vip_nivel_forzado into v_cargado, v_forzado;

  update players
  set vip_nivel_id = nivel_vip_para(v_cargado, v_forzado)
  where id = v_req.player_id;

  update deposit_requests
  set estado = 'aprobado', amount = v_monto,
      bono_id = v_bono_id, bono_monto = coalesce(v_bono_mon, 0),
      resuelto_por = p_created_by, resuelto_at = now(), nota_staff = p_nota,
      tx_id = v_tx.id, tx_bono_id = v_tx_bono_id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- =========================================================
-- registrar_jugador — redefine sql/39: solo cambia el origen en la
-- llamada al helper.
-- =========================================================
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
  v_candado  boolean;
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

  select * into v_cfg_ref from referidos_config where id = 1;
  if coalesce(v_cfg_ref.activo, false) and coalesce(trim(p_codigo_referido), '') <> '' then
    select * into v_refdor from players where codigo_referido = upper(trim(p_codigo_referido));
    if found and v_refdor.ban_permanente then
      v_refdor := null;
    end if;
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

    select candado_primera_carga into v_candado from billetera_config where id = 1;
    if coalesce(v_candado, true) then
      update players
      set retiro_bloqueado = true, bono_por_descontar = v_bono.monto
      where id = v_player.id;
    end if;

    perform sumar_bono_billetera(
      v_player.id, v_bono.monto, coalesce(v_bono.rollover, 1),
      true, 'registro', 'Bono de registro', null, v_tx.id
    );

    select * into v_player from players where id = v_player.id;
  end if;

  return v_player;
end;
$$;

-- =========================================================
-- procesar_referido — redefine sql/39: origen en el helper.
-- =========================================================
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
    perform sumar_bono_billetera(v_ref.referidor_id, v_cfg.bono_referidor,
      coalesce(v_cfg.rollover, 1), true, 'referido', 'Bono por referido', null, v_tx1.id);
  end if;
  if coalesce(v_cfg.bono_referido, 0) > 0 then
    v_tx2 := wallet_movimiento(p_player_id, 'carga', v_cfg.bono_referido,
      'Bono de bienvenida por referido', 'sistema:referidos');
    perform sumar_bono_billetera(p_player_id, v_cfg.bono_referido,
      coalesce(v_cfg.rollover, 1), true, 'referido', 'Bono de bienvenida por referido', null, v_tx2.id);
  end if;

  update referidos
  set estado = 'pagado', tx_referidor = v_tx1.id, tx_referido = v_tx2.id, pagado_at = now()
  where id = v_ref.id;
end;
$$;

-- =========================================================
-- girar_diario — redefine sql/39: origen 'giro'.
-- =========================================================
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
    perform sumar_bono_billetera(
      p_player_id, v_final,
      coalesce((select rollover from giro_diario_config where id = 1), 0),
      true, 'giro', 'Giro diario', null, v_tx.id
    );
  end if;

  update giros_diarios
  set premio = v_final, tx_id = v_tx.id
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- =========================================================
-- cobrar_cashback — redefine sql/40 mismo: origen 'cashback' en fichas.
-- (cuerpo idéntico a sql/39 salvo esa línea)
-- =========================================================
create or replace function cobrar_cashback(
  p_periodo_id    uuid,
  p_actor         text,
  p_modo          text,
  p_metodo_tipo   text default null,
  p_alias_tipo    text default null,
  p_alias_valor   text default null,
  p_banco         text default null,
  p_numero_cuenta text default null,
  p_titular       text default null,
  p_documento     text default null
)
returns cashback_periodos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cb    cashback_periodos;
  v_p     players;
  v_nota  text;
  v_tx    balance_transactions;
  v_after numeric;
  v_req   withdrawal_requests;
begin
  if p_modo not in ('fichas', 'retiro') then
    raise exception 'Modo inválido';
  end if;

  select * into v_cb from cashback_periodos where id = p_periodo_id for update;
  if not found then raise exception 'Cashback no encontrado'; end if;
  if v_cb.estado <> 'disponible' then
    raise exception 'Ese cashback ya fue % ', v_cb.estado;
  end if;

  select * into v_p from players where id = v_cb.player_id for update;
  if v_p.ban_permanente then raise exception 'La cuenta está suspendida'; end if;

  v_nota := 'Cashback semana ' || to_char(v_cb.periodo_inicio, 'DD/MM') ||
            '–' || to_char(v_cb.periodo_fin, 'DD/MM');

  if p_modo = 'fichas' then
    v_tx := wallet_movimiento(v_p.id, 'carga', v_cb.monto, v_nota, p_actor);

    perform sumar_bono_billetera(
      v_p.id, v_cb.monto,
      coalesce((select rollover from cashback_config where id = 1), 0),
      true, 'cashback', v_nota, null, v_tx.id
    );

    update cashback_periodos
    set estado = 'cobrado', modo = 'fichas', tx_id = v_tx.id,
        cobrado_por = p_actor, cobrado_at = now()
    where id = p_periodo_id
    returning * into v_cb;

    return v_cb;
  end if;

  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Elegí cómo cobrar el retiro';
  end if;
  if exists (select 1 from withdrawal_requests
             where player_id = v_p.id and estado = 'pendiente') then
    raise exception 'El jugador ya tiene un retiro pendiente. Dáselo en fichas o esperá a que se resuelva.';
  end if;

  v_tx := wallet_movimiento(v_p.id, 'carga', v_cb.monto, v_nota || ' (a cobrar)', p_actor);

  select balance into v_after from players where id = v_p.id;

  update players
  set balance = v_after - v_cb.monto,
      balance_retenido = balance_retenido + v_cb.monto
  where id = v_p.id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (v_p.id, 'retiro', v_cb.monto, v_after, v_after - v_cb.monto, v_nota, p_actor);

  insert into withdrawal_requests
    (player_id, amount, nota_jugador, es_cashback,
     metodo_tipo, alias_tipo, alias_valor, banco, numero_cuenta, titular, documento)
  values
    (v_p.id, v_cb.monto, v_nota, true,
     p_metodo_tipo, p_alias_tipo, p_alias_valor, p_banco, p_numero_cuenta, p_titular, p_documento)
  returning * into v_req;

  update cashback_periodos
  set estado = 'cobrado', modo = 'retiro', tx_id = v_tx.id, withdrawal_id = v_req.id,
      cobrado_por = p_actor, cobrado_at = now()
  where id = p_periodo_id
  returning * into v_cb;

  return v_cb;
end;
$$;

-- =========================================================
-- canjear_promo — free bet: el jugador mete el código y le cae el bono.
-- =========================================================
create or replace function canjear_promo(p_player_id uuid, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p     promo_codigos;
  v_pl    players;
  v_monto numeric;
  v_tx    balance_transactions;
begin
  select * into v_pl from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_pl.ban_permanente then raise exception 'Tu cuenta está suspendida'; end if;
  if v_pl.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad para canjear un código';
  end if;

  select * into v_p from promo_codigos
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if not found or not v_p.activo then raise exception 'Código inválido'; end if;
  if v_p.requiere_carga then
    raise exception 'Ese código se usa al hacer una carga, no acá';
  end if;
  if v_p.tipo <> 'fijo' then
    raise exception 'Ese código necesita una carga';
  end if;
  if v_p.desde is not null and v_p.desde > now() then raise exception 'El código todavía no está vigente'; end if;
  if v_p.hasta is not null and v_p.hasta < now() then raise exception 'El código venció'; end if;
  if v_p.tope_usos > 0 and v_p.usos >= v_p.tope_usos then raise exception 'El código llegó a su límite de usos'; end if;

  if exists (select 1 from promo_canjes where codigo_id = v_p.id and player_id = p_player_id) then
    raise exception 'Ya usaste este código';
  end if;

  -- free bet: `valor` es el monto fijo (el % no tiene sentido sin carga)
  v_monto := v_p.valor;

  v_tx := wallet_movimiento(p_player_id, 'carga', v_monto,
    'Código ' || v_p.codigo, 'sistema:promo');

  perform sumar_bono_billetera(
    p_player_id, v_monto, coalesce(v_p.rollover, 1),
    true, 'promo', v_p.codigo, v_p.id, v_tx.id
  );

  update promo_codigos set usos = usos + 1 where id = v_p.id;
  insert into promo_canjes (codigo_id, player_id, monto) values (v_p.id, p_player_id, v_monto);

  return jsonb_build_object('ok', true, 'monto', v_monto, 'rollover', coalesce(v_p.rollover, 1));
end;
$$;

-- =========================================================
-- dar_bono_manual — un cajero le da un bono a dedo desde el perfil.
-- =========================================================
create or replace function dar_bono_manual(
  p_player_id uuid,
  p_monto     numeric,
  p_rollover  numeric,
  p_nota      text,
  p_actor     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl players;
  v_tx balance_transactions;
begin
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select * into v_pl from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_pl.ban_permanente then raise exception 'La cuenta está suspendida'; end if;

  v_tx := wallet_movimiento(p_player_id, 'carga', p_monto,
    coalesce(nullif(trim(p_nota), ''), 'Bono'), p_actor);

  perform sumar_bono_billetera(
    p_player_id, p_monto, coalesce(p_rollover, 0),
    true, 'manual', coalesce(nullif(trim(p_nota), ''), 'Bono manual'), null, v_tx.id
  );

  return jsonb_build_object('ok', true, 'saldo', (select balance from players where id = p_player_id));
end;
$$;

-- =========================================================
-- bono_metricas — resumen para el panel.
-- =========================================================
create or replace function bono_metricas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      bm.origen,
      bm.estado,
      bm.monto,
      bm.player_id,
      bm.created_at,
      exists (
        select 1 from deposit_requests dr
        where dr.player_id = bm.player_id and dr.estado = 'aprobado'
          and dr.resuelto_at > bm.created_at
      ) as cargo_despues
    from bono_movimientos bm
  )
  select jsonb_build_object(
    'por_origen', coalesce((
      select jsonb_object_agg(origen, fila) from (
        select origen, jsonb_build_object(
          'otorgados',   count(*),
          'monto',       coalesce(sum(monto), 0),
          'activos',     count(*) filter (where estado = 'activo'),
          'liberados',   count(*) filter (where estado = 'liberado'),
          'perdidos',    count(*) filter (where estado = 'perdido'),
          'cargo_despues', count(*) filter (where cargo_despues)
        ) as fila
        from base group by origen
      ) x
    ), '{}'::jsonb),
    'total', jsonb_build_object(
      'otorgados',   (select count(*) from base),
      'monto',       (select coalesce(sum(monto), 0) from base),
      'activos',     (select count(*) from base where estado = 'activo'),
      'liberados',   (select count(*) from base where estado = 'liberado'),
      'perdidos',    (select count(*) from base where estado = 'perdido'),
      'costo_perdido', (select coalesce(sum(monto), 0) from base where estado = 'liberado'),
      'costo_forfeit', (select coalesce(sum(monto), 0) from base where estado = 'perdido')
    ),
    'promos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', pc.codigo, 'activo', pc.activo, 'usos', pc.usos,
        'tope_usos', pc.tope_usos, 'requiere_carga', pc.requiere_carga,
        'repartido', coalesce((select sum(monto) from promo_canjes where codigo_id = pc.id), 0)
      ) order by pc.created_at desc)
      from promo_codigos pc
    ), '[]'::jsonb)
  );
$$;
grant execute on function bono_metricas() to authenticated;

notify pgrst, 'reload schema';
