-- =========================================================
-- Cortar la sesión del jugador al banearlo
--
-- El problema: el token del jugador dura 12 horas y no se revisa
-- contra la base. Si baneás a alguien que ya está adentro, sigue
-- navegando hasta que venza. Los movimientos de saldo sí lo frenan
-- (las funciones validan el ban), pero puede seguir entrando.
--
-- La solución: una marca de "todo token emitido antes de este
-- momento deja de valer". No hay que guardar ni buscar tokens: se
-- compara la fecha de emisión contra esta columna.
-- =========================================================

alter table players
  add column if not exists sesion_revocada_at timestamptz;

comment on column players.sesion_revocada_at is
  'Los tokens emitidos antes de esta fecha dejan de valer. Se actualiza al banear o al cambiar la contraseña.';

-- ---------------------------------------------------------
-- Un ban permanente corta la sesión sola
--
-- Va como trigger y no en la API para que valga siempre: si mañana
-- alguien banea desde el SQL editor o desde otro proceso, la sesión
-- se corta igual.
-- ---------------------------------------------------------
create or replace function revocar_sesion_al_banear()
returns trigger
language plpgsql
as $$
begin
  if new.ban_permanente = true and coalesce(old.ban_permanente, false) = false then
    new.sesion_revocada_at := now();
  end if;

  -- Cambiar la contraseña también cierra las sesiones abiertas: es lo
  -- que uno espera cuando le roban la cuenta y pide el reseteo.
  if new.password_hash is distinct from old.password_hash then
    new.sesion_revocada_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_revocar_sesion on players;

create trigger trg_revocar_sesion
  before update on players
  for each row
  execute function revocar_sesion_al_banear();
