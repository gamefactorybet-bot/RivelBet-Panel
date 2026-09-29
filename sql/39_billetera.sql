-- =========================================================
-- Billetera con rollover — modo avanzado con interruptor maestro
--
-- OFF (default): todo igual que hoy. Un saldo, todo retirable, candado
-- de primera carga como está.
--
-- ON: el saldo se piensa en tres partes — carga (retirable siempre),
-- bono (pegajoso, se libera apostándolo) y ganado (retirable). Cada
-- tipo de bono tiene su `rollover`. Opción de retener las ganancias del
-- bono hasta cumplir el rollover. Si el jugador retira con bono a medio
-- jugar, pierde solo el bono pendiente — nunca su plata ni sus ganancias.
--
-- Mecánicamente NO son dos sistemas: "simple" = este motor con los
-- rollovers en 0 y la vista colapsada a un número. Toda la lógica nueva
-- vive en 3 helpers que son no-op si `modo_avanzado` está apagado; cada
-- función existente cambia una línea (la llamada al helper).
--
-- YA hay jugadores en producción: las columnas entran con default 0 y el
-- flag arranca en false, así el comportamiento no cambia al correr esto.
-- Activar `modo_avanzado` es una decisión posterior del operador y solo
-- afecta créditos nuevos.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- Config — una sola fila (id = 1)
-- ---------------------------------------------------------
create table if not exists billetera_config (
  id                    int primary key default 1 check (id = 1),
  modo_avanzado         boolean not null default false,
  retener_ganancias     boolean not null default false,
  -- 0 = el depósito real nunca traba el retiro (recomendado)
  rollover_carga        numeric(6,2) not null default 0 check (rollover_carga >= 0),
  -- 0 = sin tope de apuesta mientras hay bono activo
  apuesta_max_bono      numeric(14,2) not null default 0 check (apuesta_max_bono >= 0),
  -- el candado clásico (carga >= bono para desbloquear el retiro)
  candado_primera_carga boolean not null default true,
  updated_by            text,
  updated_at            timestamptz not null default now()
);

insert into billetera_config (id) values (1) on conflict (id) do nothing;

alter table billetera_config enable row level security;
drop policy if exists "staff lee billetera config" on billetera_config;
create policy "staff lee billetera config" on billetera_config for select using (es_staff());

-- ---------------------------------------------------------
-- Contadores laterales del jugador. `balance` sigue siendo el único
-- número jugable; esto solo describe qué parte es bono pegajoso.
-- ---------------------------------------------------------
alter table players
  add column if not exists saldo_bono        numeric(14,2) not null default 0 check (saldo_bono >= 0),
  add column if not exists requisito_apuesta numeric(14,2) not null default 0 check (requisito_apuesta >= 0),
  add column if not exists ganancia_bono     numeric(14,2) not null default 0 check (ganancia_bono >= 0);

comment on column players.saldo_bono is
  'Capital de bono todavía pegajoso (subconjunto de balance). Se forfeita si el jugador retira con requisito_apuesta > 0.';
comment on column players.requisito_apuesta is
  'Lo que falta apostar para liberar el bono. Solo se usa en modo avanzado.';
comment on column players.ganancia_bono is
  'Ganado con el bono mientras estaba trabado. Solo se forfeita si retener_ganancias.';

-- ---------------------------------------------------------
-- `rollover` por tipo de bono. Bonos de verdad: default 1 (pegajoso,
-- hay que jugarlo una vez). Cashback y premio del giro: default 0
-- (salen libres, como hoy).
-- ---------------------------------------------------------
alter table bonos            add column if not exists rollover numeric(6,2) not null default 1 check (rollover >= 0);
alter table bono_registro    add column if not exists rollover numeric(6,2) not null default 1 check (rollover >= 0);
alter table referidos_config add column if not exists rollover numeric(6,2) not null default 1 check (rollover >= 0);
alter table cashback_config  add column if not exists rollover numeric(6,2) not null default 0 check (rollover >= 0);
alter table giro_diario_config add column if not exists rollover numeric(6,2) not null default 0 check (rollover >= 0);

-- Un bono forfeitado marca su auditoría como 'perdido'.
alter table bonos_otorgados drop constraint if exists bonos_otorgados_estado_check;
alter table bonos_otorgados add constraint bonos_otorgados_estado_check
  check (estado in ('activo', 'liberado', 'perdido'));

-- =========================================================
-- Helper 1 — acreditar un bono: lo vuelve pegajoso y suma el requisito.
-- El monto ya entró a `balance` por wallet_movimiento; esto solo lo
-- describe. No-op si el rollover es 0 (el crédito ya es plata libre).
--
-- p_es_bono = false para la carga real: suma requisito (si el operador
-- puso rollover_carga > 0) pero NO toca saldo_bono — la plata del
-- jugador nunca se forfeita.
-- =========================================================
create or replace function sumar_bono_billetera(
  p_player_id uuid,
  p_monto     numeric,
  p_rollover  numeric,
  p_es_bono   boolean default true
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
end;
$$;

-- =========================================================
-- Helper 2 — consumir una apuesta: baja el requisito y el bono
-- pegajoso, acumula lo ganado si hay retención, y libera el bono
-- cuando el requisito llega a 0.
-- Lo llama slot_jugada. El giro diario NO: la tirada es gratis.
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
      -- requisito cumplido => el bono deja de ser pegajoso (pasa a saldo común)
      saldo_bono = case when v_new_req <= 0 then 0
                        else greatest(0, saldo_bono - coalesce(p_bet, 0)) end,
      ganancia_bono = case when v_new_req <= 0 then 0
                           when coalesce(v_cfg.retener_ganancias, false) and coalesce(v_req, 0) > 0
                             then ganancia_bono + coalesce(p_win, 0)
                           else ganancia_bono end
  where id = p_player_id;
end;
$$;

-- =========================================================
-- Helper 3 (lectura) — cuánto puede retirar el jugador ahora mismo.
-- Contempla el piso clásico del bono de registro y, en modo avanzado
-- con requisito pendiente, el forfeit del bono (y de las ganancias
-- retenidas, si corresponde). El portal lo usa para mostrar el número.
-- =========================================================
create or replace function retirable_billetera(p_player_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg     billetera_config;
  v_p       players;
  v_piso    numeric;
  v_forfeit numeric := 0;
begin
  select * into v_cfg from billetera_config where id = 1;
  select * into v_p   from players where id = p_player_id;
  if not found then return 0; end if;

  v_piso := least(coalesce(v_p.bono_por_descontar, 0), v_p.balance);

  if coalesce(v_cfg.modo_avanzado, false) and coalesce(v_p.requisito_apuesta, 0) > 0 then
    v_forfeit := coalesce(v_p.saldo_bono, 0)
      + case when coalesce(v_cfg.retener_ganancias, false)
             then coalesce(v_p.ganancia_bono, 0) else 0 end;
  end if;

  return greatest(0, v_p.balance - v_piso - v_forfeit);
end;
$$;
grant execute on function retirable_billetera(uuid) to anon, authenticated;

-- =========================================================
-- Redefiniciones — cada una es su última versión vigente + la línea
-- del helper. Se marca con  -- [billetera]  el bloque agregado.
-- =========================================================

-- ---------------------------------------------------------
-- slot_jugada  (última versión: sql/32_candado_retiro.sql)
--  + tope de apuesta con bono activo
--  + consumir_apuesta_billetera tras registrar la ronda
-- ---------------------------------------------------------
create or replace function slot_jugada(
  p_player_id uuid,
  p_game_slug text,
  p_bet       numeric,
  p_win       numeric,
  p_detalle   jsonb,
  p_client_id text default null
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
  v_after  numeric;
  v_ronda  game_rounds;
  v_bille  billetera_config;   -- [billetera]
begin
  if p_client_id is not null then
    select * into v_ronda
    from game_rounds
    where player_id = p_player_id and client_id = p_client_id;

    if found then
      return v_ronda;
    end if;
  end if;

  if p_bet is null or p_bet <= 0 then
    raise exception 'La apuesta debe ser mayor a 0';
  end if;

  select * into v_player from players where id = p_player_id for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  if v_player.ban_permanente then
    raise exception 'Tu cuenta está suspendida';
  end if;

  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad para jugar';
  end if;

  if v_player.balance < p_bet then
    raise exception 'Saldo insuficiente';
  end if;

  -- [billetera] tope de apuesta mientras hay bono pegajoso
  select * into v_bille from billetera_config where id = 1;
  if coalesce(v_bille.modo_avanzado, false)
     and coalesce(v_bille.apuesta_max_bono, 0) > 0
     and coalesce(v_player.saldo_bono, 0) > 0
     and p_bet > v_bille.apuesta_max_bono then
    raise exception 'Con bono activo la apuesta máxima es %', v_bille.apuesta_max_bono;
  end if;

  v_after := v_player.balance - p_bet + coalesce(p_win, 0);

  update players set balance = v_after where id = p_player_id;

  insert into game_rounds
    (player_id, game_slug, bet, win, balance_before, balance_after, detalle, client_id)
  values
    (p_player_id, p_game_slug, p_bet, coalesce(p_win, 0), v_player.balance, v_after, p_detalle, p_client_id)
  returning * into v_ronda;

  -- [billetera] baja el requisito / libera el bono
  perform consumir_apuesta_billetera(p_player_id, p_bet, coalesce(p_win, 0));

  return v_ronda;
end;
$$;

-- ---------------------------------------------------------
-- solicitar_retiro  (última versión: sql/32_candado_retiro.sql)
--  + forfeit del bono no liberado cuando el jugador retira antes de
--    cumplir el rollover
-- ---------------------------------------------------------
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
  v_bille         billetera_config;   -- [billetera]
  v_forfeit       numeric := 0;       -- [billetera]
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Método de cobro inválido';
  end if;

  select * into v_player
  from players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  if v_player.ban_permanente then
    raise exception 'El jugador tiene ban permanente';
  end if;

  if v_player.ban_retiros then
    raise exception 'El jugador tiene ban de retiros';
  end if;

  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad antes de retirar';
  end if;

  -- Candado del bono de registro: no se retira nada hasta hacer una
  -- carga aprobada >= el valor del bono.
  if v_player.retiro_bloqueado then
    select monto into v_bono_monto
    from bonos_otorgados
    where player_id = p_player_id and estado = 'activo';
    raise exception 'Para retirar tenés que hacer una carga de al menos % y que un cajero la apruebe', coalesce(v_bono_monto, 0);
  end if;

  -- Piso no retirable del modelo clásico (el piso solo baja, nunca sube).
  v_piso := least(v_player.bono_por_descontar, v_player.balance);

  -- [billetera] forfeit del bono pegajoso si retira con requisito pendiente
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
      saldo_bono        = case when v_forfeit > 0 then 0 else saldo_bono end,          -- [billetera]
      ganancia_bono     = case when v_forfeit > 0 then 0 else ganancia_bono end,       -- [billetera]
      requisito_apuesta = case when v_forfeit > 0 then 0 else requisito_apuesta end    -- [billetera]
  where id = p_player_id;

  -- [billetera] marca el bono como perdido en la auditoría
  if v_forfeit > 0 then
    update bonos_otorgados
    set estado = 'perdido', liberado_at = now()
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

-- ---------------------------------------------------------
-- aprobar_deposito  (última versión: sql/36_vip.sql)
--  + sumar_bono_billetera sobre el bono por carga
-- ---------------------------------------------------------
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
begin
  select * into v_req from deposit_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_req.estado <> 'pendiente' then raise exception 'La solicitud ya fue %', v_req.estado; end if;

  v_monto := coalesce(p_monto_real, v_req.amount);
  if v_monto <= 0 then raise exception 'El monto acreditado debe ser mayor a 0'; end if;

  select cb.bono_id, cb.bono_monto, cb.bono_nombre
  into v_bono_id, v_bono_mon, v_bono_nom
  from calcular_bono(v_req.player_id, v_monto) cb;

  v_tx := wallet_movimiento(
    v_req.player_id, 'carga', v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'), p_created_by
  );

  -- [billetera] rollover sobre la carga real (default 0 = sin rollover)
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

    -- [billetera] el bono por carga es pegajoso segun su rollover
    perform sumar_bono_billetera(
      v_req.player_id, v_bono_mon,
      coalesce((select rollover from bonos where id = v_bono_id), 1)
    );
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

  -- VIP: histórico + nivel (solo cuenta la carga real, no el bono)
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

-- ---------------------------------------------------------
-- registrar_jugador  (última versión: sql/38_referidos.sql)
--  + el candado clásico solo si billetera_config.candado_primera_carga
--  + sumar_bono_billetera sobre el bono de registro
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
  v_candado  boolean;   -- [billetera]
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

    -- [billetera] el candado clásico es opcional
    select candado_primera_carga into v_candado from billetera_config where id = 1;
    if coalesce(v_candado, true) then
      update players
      set retiro_bloqueado = true, bono_por_descontar = v_bono.monto
      where id = v_player.id;
    end if;

    -- [billetera] rollover del bono de registro
    perform sumar_bono_billetera(v_player.id, v_bono.monto, coalesce(v_bono.rollover, 1));

    select * into v_player from players where id = v_player.id;
  end if;

  return v_player;
end;
$$;

-- ---------------------------------------------------------
-- procesar_referido  (última versión: sql/38_referidos.sql)
--  + sumar_bono_billetera sobre los dos bonos de referido
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
    perform sumar_bono_billetera(v_ref.referidor_id, v_cfg.bono_referidor, coalesce(v_cfg.rollover, 1));  -- [billetera]
  end if;
  if coalesce(v_cfg.bono_referido, 0) > 0 then
    v_tx2 := wallet_movimiento(p_player_id, 'carga', v_cfg.bono_referido,
      'Bono de bienvenida por referido', 'sistema:referidos');
    perform sumar_bono_billetera(p_player_id, v_cfg.bono_referido, coalesce(v_cfg.rollover, 1));  -- [billetera]
  end if;

  update referidos
  set estado = 'pagado', tx_referidor = v_tx1.id, tx_referido = v_tx2.id, pagado_at = now()
  where id = v_ref.id;
end;
$$;

-- ---------------------------------------------------------
-- girar_diario  (última versión: sql/37_giro_diario.sql)
--  + sumar_bono_billetera sobre el premio (rollover del giro, default 0)
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
    -- [billetera] el premio del giro puede ser pegajoso si el operador lo configura
    perform sumar_bono_billetera(
      p_player_id, v_final,
      coalesce((select rollover from giro_diario_config where id = 1), 0)
    );
  end if;

  update giros_diarios
  set premio = v_final, tx_id = v_tx.id
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------
-- cobrar_cashback  (única versión: sql/34_cashback.sql)
--  + modo fichas: sumar_bono_billetera con cashback_config.rollover (default 0)
--  El modo retiro sigue sin pasar por ningún piso ni forfeit: el
--  cashback es plata limpia del jugador (ver 34_cashback.sql).
-- ---------------------------------------------------------
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
  if not found then
    raise exception 'Cashback no encontrado';
  end if;
  if v_cb.estado <> 'disponible' then
    raise exception 'Ese cashback ya fue % ', v_cb.estado;
  end if;

  select * into v_p from players where id = v_cb.player_id for update;
  if v_p.ban_permanente then
    raise exception 'La cuenta está suspendida';
  end if;

  v_nota := 'Cashback semana ' || to_char(v_cb.periodo_inicio, 'DD/MM') ||
            '–' || to_char(v_cb.periodo_fin, 'DD/MM');

  if p_modo = 'fichas' then
    v_tx := wallet_movimiento(v_p.id, 'carga', v_cb.monto, v_nota, p_actor);

    -- [billetera] el cashback en fichas puede ser pegajoso si el operador lo configura
    perform sumar_bono_billetera(
      v_p.id, v_cb.monto,
      coalesce((select rollover from cashback_config where id = 1), 0)
    );

    update cashback_periodos
    set estado = 'cobrado', modo = 'fichas', tx_id = v_tx.id,
        cobrado_por = p_actor, cobrado_at = now()
    where id = p_periodo_id
    returning * into v_cb;

    return v_cb;
  end if;

  -- modo 'retiro'
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

notify pgrst, 'reload schema';
