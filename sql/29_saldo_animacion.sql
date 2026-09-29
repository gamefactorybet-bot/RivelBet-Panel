-- =========================================================
-- Ficha animada junto al saldo del header: misma biblioteca de
-- animaciones que el ícono de soporte y los carteles de juego.
-- La posición también es elegible desde Personalización.
-- =========================================================

alter table casino_settings
  add column if not exists saldo_animacion_id uuid references animaciones(id) on delete set null,
  add column if not exists saldo_animacion_posicion text not null default 'antes'
    check (saldo_animacion_posicion in ('antes', 'grande', 'despues'));
