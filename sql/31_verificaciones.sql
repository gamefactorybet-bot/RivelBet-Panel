-- =========================================================
-- Verificación de identidad (KYC) — cola en el panel
--
-- El jugador sube TRES fotos: frente del documento, dorso, y una
-- foto suya sosteniendo el documento. Un operador las revisa desde
-- el panel (funciona como "Solicitudes") y aprueba o rechaza con
-- motivo. Aprobar habilita el juego — el bono ya se acreditó al
-- registrarse (ver 30_autorregistro).
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists verificaciones (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  doc_tipo     text not null default 'ci'
                 check (doc_tipo in ('ci', 'pasaporte', 'dni', 'otro')),
  url_frente   text not null,
  url_dorso    text not null,
  url_persona  text not null,
  estado       text not null default 'pendiente'
                 check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo       text,
  resuelto_por text,
  resuelto_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_verif_estado on verificaciones (estado, created_at desc);
create index if not exists idx_verif_player on verificaciones (player_id, created_at desc);

-- Una sola verificación pendiente por jugador: la bandeja no se
-- llena de envíos sueltos del mismo jugador.
create unique index if not exists idx_verif_una_pendiente
  on verificaciones (player_id)
  where estado = 'pendiente';

alter table verificaciones enable row level security;

-- El portal no lee directo: todo pasa por /api con el token del
-- jugador. Acá solo lectura al staff.
drop policy if exists "staff autenticado lee verificaciones" on verificaciones;
create policy "staff autenticado lee verificaciones"
  on verificaciones for select using (es_staff());

-- ---------------------------------------------------------
-- El jugador envía (o reenvía) sus fotos
-- Marca la cuenta como 'pendiente'. No se puede si ya está
-- verificado o si ya hay un envío esperando revisión.
-- ---------------------------------------------------------
create or replace function registrar_verificacion(
  p_player_id   uuid,
  p_doc_tipo    text,
  p_url_frente  text,
  p_url_dorso   text,
  p_url_persona text
)
returns verificaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
  v_verif  verificaciones;
begin
  if coalesce(p_url_frente, '') = '' or coalesce(p_url_dorso, '') = ''
     or coalesce(p_url_persona, '') = '' then
    raise exception 'Faltan fotos: se necesitan las tres (frente, dorso y foto tuya)';
  end if;

  select * into v_player from players where id = p_player_id for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  if v_player.estado_verificacion = 'verificado' then
    raise exception 'Tu cuenta ya está verificada';
  end if;

  if v_player.estado_verificacion = 'pendiente' then
    raise exception 'Ya tenés un envío en revisión';
  end if;

  insert into verificaciones (player_id, doc_tipo, url_frente, url_dorso, url_persona)
  values (p_player_id, coalesce(nullif(p_doc_tipo, ''), 'ci'),
          p_url_frente, p_url_dorso, p_url_persona)
  returning * into v_verif;

  update players set estado_verificacion = 'pendiente' where id = p_player_id;

  return v_verif;
end;
$$;

-- ---------------------------------------------------------
-- El operador resuelve una verificación
-- Aprobar => la cuenta queda 'verificado' y el jugador puede jugar.
-- Rechazar => 'rechazado' con motivo (lo ve el jugador), puede
-- reenviar. Idempotente: si ya estaba resuelta, no hace nada.
-- ---------------------------------------------------------
create or replace function resolver_verificacion(
  p_verif_id   uuid,
  p_created_by text,
  p_aprobar    boolean,
  p_motivo     text default null
)
returns verificaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verif verificaciones;
begin
  select * into v_verif from verificaciones where id = p_verif_id for update;

  if not found then
    raise exception 'Verificación no encontrada';
  end if;

  if v_verif.estado <> 'pendiente' then
    raise exception 'La verificación ya fue %', v_verif.estado;
  end if;

  if not p_aprobar and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Poné el motivo del rechazo: lo ve el jugador';
  end if;

  update verificaciones
  set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
      motivo = case when p_aprobar then null else trim(p_motivo) end,
      resuelto_por = p_created_by,
      resuelto_at = now()
  where id = p_verif_id
  returning * into v_verif;

  update players
  set estado_verificacion = case when p_aprobar then 'verificado' else 'rechazado' end
  where id = v_verif.player_id;

  return v_verif;
end;
$$;
