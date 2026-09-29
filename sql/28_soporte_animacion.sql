-- =========================================================
-- Ícono animado del chat de soporte flotante: reusa la misma
-- biblioteca de animaciones Lottie que ya usan los carteles de las
-- tarjetas de juego (tabla `animaciones`, ver 23_animaciones.sql).
-- =========================================================

alter table casino_settings
  add column if not exists soporte_animacion_id uuid references animaciones(id) on delete set null;
