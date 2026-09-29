-- =========================================================
-- Modos del cajero externo: revendedor vs comisionista
--
-- revendedor: compra fichas (pagó + % de margen) y paga los retiros.
-- comisionista: trae jugadores, la casa cobra y paga, él gana un %.
-- =========================================================

alter table staff_profiles
  add column if not exists externo_modo text,
  add column if not exists comision_pct numeric(5,2) not null default 0;

alter table staff_profiles drop constraint if exists staff_externo_modo_check;
alter table staff_profiles
  add constraint staff_externo_modo_check
  check (externo_modo is null or externo_modo in ('revendedor', 'comisionista'));

alter table staff_profiles drop constraint if exists staff_comision_pct_check;
alter table staff_profiles
  add constraint staff_comision_pct_check
  check (comision_pct >= 0 and comision_pct <= 100);

update staff_profiles
set externo_modo = 'revendedor'
where perfil = 'externo' and externo_modo is null;

comment on column staff_profiles.externo_modo is
  'Solo externo: revendedor (compra fichas) o comisionista (% sobre cargas de la casa).';
comment on column staff_profiles.comision_pct is
  'Porcentaje que se lleva el comisionista sobre cada carga aprobada de sus jugadores.';

-- En cada asignación se puede guardar cuánto pagó y el margen aplicado.
alter table staff_fondo_txs
  add column if not exists pago numeric(14,2),
  add column if not exists margen_pct numeric(5,2);

notify pgrst, 'reload schema';
