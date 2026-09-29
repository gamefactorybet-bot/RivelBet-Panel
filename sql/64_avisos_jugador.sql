-- =========================================================
-- Avisos al jugador cuando le acreditan plata
--
-- Carga (monto + bono + total) y bono de referido (quién lo originó).
-- El portal los pide con la sesión y los marca leídos al cerrar.
--
-- Después de correr:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists avisos_jugador (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  tipo       text not null check (tipo in ('carga', 'referido')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  leido_at   timestamptz
);

create index if not exists idx_avisos_pendientes
  on avisos_jugador (player_id, created_at)
  where leido_at is null;

alter table avisos_jugador enable row level security;
drop policy if exists "staff lee avisos" on avisos_jugador;
create policy "staff lee avisos" on avisos_jugador for select using (es_staff());

create or replace function push_aviso(p_player_id uuid, p_tipo text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into avisos_jugador (player_id, tipo, payload)
  values (p_player_id, p_tipo, coalesce(p_payload, '{}'::jsonb));
  perform bump_player_heartbeat(p_player_id);
end;
$$;

-- Carga aprobada: el UPDATE ya trae amount (real) y bono_monto.
create or replace function trg_aviso_carga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'aprobado' and coalesce(old.estado, '') = 'pendiente' then
    perform push_aviso(new.player_id, 'carga', jsonb_build_object(
      'carga', new.amount,
      'bono',  coalesce(new.bono_monto, 0),
      'total', new.amount + coalesce(new.bono_monto, 0)
    ));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_aviso_carga on deposit_requests;
create trigger trg_aviso_carga
  after update on deposit_requests
  for each row execute function trg_aviso_carga();

create or replace function avisos_pendientes(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'tipo', tipo,
    'payload', payload,
    'created_at', created_at
  ) order by created_at), '[]'::jsonb)
  from (
    select id, tipo, payload, created_at
    from avisos_jugador
    where player_id = p_player_id and leido_at is null
    order by created_at
    limit 10
  ) x;
$$;

grant execute on function avisos_pendientes(uuid) to authenticated;

create or replace function avisos_marcar_leido(p_player_id uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update avisos_jugador
  set leido_at = now()
  where player_id = p_player_id
    and leido_at is null
    and id = any(p_ids);
$$;

grant execute on function avisos_marcar_leido(uuid, uuid[]) to authenticated;

-- procesar_referido (sql/40) + aviso a las dos puntas.
create or replace function procesar_referido(p_player_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref      referidos;
  v_cfg      referidos_config;
  v_pagados  int;
  v_tx1      balance_transactions;
  v_tx2      balance_transactions;
  v_refdor   players;
  v_refdo    players;
  v_nom_dor  text;
  v_nom_do   text;
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
  select * into v_refdo from players where id = p_player_id;

  v_nom_dor := coalesce(nullif(v_refdor.display_name, ''), v_refdor.username);
  v_nom_do  := coalesce(nullif(v_refdo.display_name, ''), v_refdo.username);

  if coalesce(v_cfg.bono_referidor, 0) > 0 then
    v_tx1 := wallet_movimiento(v_ref.referidor_id, 'carga', v_cfg.bono_referidor,
      'Bono por referido', 'sistema:referidos');
    perform sumar_bono_billetera(v_ref.referidor_id, v_cfg.bono_referidor,
      coalesce(v_cfg.rollover, 1), true, 'referido', 'Bono por referido', null, v_tx1.id);
    perform push_aviso(v_ref.referidor_id, 'referido', jsonb_build_object(
      'rol', 'referidor',
      'de', v_nom_do,
      'numero', v_refdo.player_number,
      'monto', v_cfg.bono_referidor
    ));
  end if;
  if coalesce(v_cfg.bono_referido, 0) > 0 then
    v_tx2 := wallet_movimiento(p_player_id, 'carga', v_cfg.bono_referido,
      'Bono de bienvenida por referido', 'sistema:referidos');
    perform sumar_bono_billetera(p_player_id, v_cfg.bono_referido,
      coalesce(v_cfg.rollover, 1), true, 'referido', 'Bono de bienvenida por referido', null, v_tx2.id);
    perform push_aviso(p_player_id, 'referido', jsonb_build_object(
      'rol', 'referido',
      'de', v_nom_dor,
      'numero', v_refdor.player_number,
      'monto', v_cfg.bono_referido
    ));
  end if;

  update referidos
  set estado = 'pagado', tx_referidor = v_tx1.id, tx_referido = v_tx2.id, pagado_at = now()
  where id = v_ref.id;
end;
$$;
