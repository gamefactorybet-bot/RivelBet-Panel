-- =========================================================
-- Asignar fichas al revendedor: pagó + margen %
--
-- p_amount sigue siendo las fichas cuando no hay margen
-- (cajero de casa / mostrador). Si p_margen_pct viene,
-- p_amount es lo que pagó en plata y se acreditan
-- pagó × (1 + margen/100) fichas.
-- =========================================================

drop function if exists fondo_asignar(uuid, numeric, text, text);

create or replace function fondo_asignar(
  p_staff_id   uuid,
  p_amount     numeric,
  p_created_by text,
  p_note       text default null,
  p_margen_pct numeric default null
)
returns staff_fondos
language plpgsql security definer set search_path = public as $$
declare
  v_b         casino_boveda;
  v_fondo     staff_fondos;
  v_perfil    text;
  v_modo      text;
  v_chips     numeric;
  v_pago      numeric;
  v_margen    numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  select perfil, externo_modo into v_perfil, v_modo
  from staff_profiles where id = p_staff_id;
  if not found then raise exception 'Cajero no encontrado'; end if;

  if v_perfil = 'externo' and v_modo = 'comisionista' then
    raise exception 'El comisionista no compra fichas. Sus jugadores recargan a la casa.';
  end if;

  if p_margen_pct is not null then
    if p_margen_pct < 0 or p_margen_pct > 500 then
      raise exception 'El margen tiene que estar entre 0 y 500 %%';
    end if;
    v_pago := p_amount;
    v_margen := p_margen_pct;
    v_chips := round(p_amount * (1 + p_margen_pct / 100.0), 2);
  else
    v_pago := null;
    v_margen := null;
    v_chips := p_amount;
  end if;

  if v_chips <= 0 then raise exception 'El lote de fichas tiene que ser mayor a 0'; end if;

  perform ensure_fondo(p_staff_id);

  select * into v_b from casino_boveda where id = 1 for update;
  if v_b.fichas < v_chips then
    raise exception 'La bóveda no tiene suficientes fichas (hay %, hacen falta %)', v_b.fichas, v_chips;
  end if;

  select * into v_fondo from staff_fondos where staff_id = p_staff_id for update;

  update casino_boveda set fichas = fichas - v_chips where id = 1
    returning * into v_b;
  update staff_fondos
  set fichas = fichas + v_chips, updated_at = now()
  where staff_id = p_staff_id
  returning * into v_fondo;

  insert into staff_fondo_txs
    (tipo, staff_id, amount, pago, margen_pct, boveda_before, boveda_after, fondo_before, fondo_after, note, created_by)
  values
    ('asignar', p_staff_id, v_chips, v_pago, v_margen,
     v_b.fichas + v_chips, v_b.fichas,
     v_fondo.fichas - v_chips, v_fondo.fichas,
     p_note, p_created_by);

  return v_fondo;
end;
$$;

grant execute on function fondo_asignar(uuid, numeric, text, text, numeric) to service_role;

notify pgrst, 'reload schema';
