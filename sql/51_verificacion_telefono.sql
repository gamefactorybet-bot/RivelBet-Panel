-- =========================================================
-- Jugadores de cajero (WhatsApp): el teléfono verifica
-- El autorregistro del portal sigue pidiendo documento.
-- =========================================================

comment on column players.telefono is
  'Identificador del jugador de cartera (WhatsApp). Único. En alta manual es la verificación.';

-- Los que ya creó un cajero y tienen teléfono, pueden jugar.
update players
set estado_verificacion = 'verificado'
where created_by is distinct from 'autorregistro'
  and telefono is not null
  and trim(telefono) <> ''
  and estado_verificacion in ('sin_verificar', 'rechazado');

notify pgrst, 'reload schema';
