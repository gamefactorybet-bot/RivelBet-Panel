-- =========================================================
-- Chat de soporte / reclamos
-- Cada reclamo es una conversación con estado, no un hilo infinito:
-- así el cajero sabe qué le falta contestar y se puede medir cuántos
-- reclamos hubo y por qué.
-- =========================================================

create table if not exists soporte_tickets (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,

  motivo        text not null default 'otro'
                  check (motivo in ('recarga', 'retiro', 'cuenta', 'otro')),

  -- abierto      -> el jugador escribió, nadie contestó todavía
  -- en_curso     -> un cajero ya respondió
  -- resuelto     -> el cajero lo dio por atendido
  -- cerrado      -> se archivó (ya no admite mensajes)
  estado        text not null default 'abierto'
                  check (estado in ('abierto', 'en_curso', 'resuelto', 'cerrado')),

  -- Si el reclamo es sobre plata, queda enganchado a la solicitud:
  -- el cajero ve el monto y el comprobante sin buscarlos.
  deposit_id    uuid references deposit_requests(id) on delete set null,
  withdrawal_id uuid references withdrawal_requests(id) on delete set null,

  atendido_por  text,
  primera_respuesta_at timestamptz,
  resuelto_at   timestamptz,
  cerrado_at    timestamptz,

  ultimo_mensaje    text,
  ultimo_mensaje_at timestamptz not null default now(),
  sin_leer_staff    int not null default 0,
  sin_leer_player   int not null default 0,

  created_at    timestamptz not null default now()
);

create index if not exists idx_tickets_estado on soporte_tickets (estado, ultimo_mensaje_at desc);
create index if not exists idx_tickets_player on soporte_tickets (player_id, ultimo_mensaje_at desc);

-- Un jugador no puede abrir diez reclamos a la vez: mientras tenga uno
-- sin resolver, sigue escribiendo en ese.
create unique index if not exists idx_ticket_uno_abierto
  on soporte_tickets (player_id)
  where estado in ('abierto', 'en_curso');

create table if not exists soporte_mensajes (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references soporte_tickets(id) on delete cascade,
  autor_tipo  text not null check (autor_tipo in ('jugador', 'staff', 'sistema')),
  autor       text not null,
  texto       text,
  adjunto_url text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mensajes_ticket on soporte_mensajes (ticket_id, created_at asc);

alter table soporte_tickets enable row level security;
alter table soporte_mensajes enable row level security;

drop policy if exists "staff autenticado lee tickets" on soporte_tickets;
create policy "staff autenticado lee tickets"
  on soporte_tickets for select
  using (
    exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.active = true)
  );

drop policy if exists "staff autenticado lee mensajes" on soporte_mensajes;
create policy "staff autenticado lee mensajes"
  on soporte_mensajes for select
  using (
    exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.active = true)
  );

-- ---------------------------------------------------------
-- Insertar un mensaje y actualizar el resumen del ticket
-- en un solo paso: si se hicieran por separado, un fallo entre
-- medio dejaría el contador de no leídos desincronizado.
-- ---------------------------------------------------------
create or replace function soporte_enviar(
  p_ticket_id  uuid,
  p_autor_tipo text,
  p_autor      text,
  p_texto      text,
  p_adjunto    text default null
)
returns soporte_mensajes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket soporte_tickets;
  v_msg    soporte_mensajes;
begin
  select * into v_ticket from soporte_tickets where id = p_ticket_id for update;

  if not found then
    raise exception 'Conversación no encontrada';
  end if;

  if v_ticket.estado = 'cerrado' then
    raise exception 'Esta conversación está cerrada';
  end if;

  insert into soporte_mensajes (ticket_id, autor_tipo, autor, texto, adjunto_url)
  values (p_ticket_id, p_autor_tipo, p_autor, p_texto, p_adjunto)
  returning * into v_msg;

  update soporte_tickets
  set ultimo_mensaje = left(coalesce(p_texto, 'Adjuntó una imagen'), 120),
      ultimo_mensaje_at = now(),
      -- Cada lado incrementa los no leídos del otro
      sin_leer_staff  = case when p_autor_tipo = 'jugador' then sin_leer_staff + 1 else 0 end,
      sin_leer_player = case when p_autor_tipo = 'staff'   then sin_leer_player + 1 else 0 end,
      -- Que el jugador escriba sobre un reclamo resuelto lo reabre
      estado = case
        when p_autor_tipo = 'jugador' and v_ticket.estado = 'resuelto' then 'en_curso'
        when p_autor_tipo = 'staff' and v_ticket.estado = 'abierto' then 'en_curso'
        else v_ticket.estado
      end,
      atendido_por = case
        when p_autor_tipo = 'staff' then p_autor else atendido_por
      end,
      primera_respuesta_at = case
        when p_autor_tipo = 'staff' and primera_respuesta_at is null then now()
        else primera_respuesta_at
      end
  where id = p_ticket_id;

  return v_msg;
end;
$$;
