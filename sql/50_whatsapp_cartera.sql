-- =========================================================
-- WhatsApp del cajero externo + pase de cartera
-- =========================================================

alter table staff_profiles
  add column if not exists whatsapp_numero text,
  add column if not exists whatsapp_activo boolean not null default false,
  add column if not exists whatsapp_solo boolean not null default false;

comment on column staff_profiles.whatsapp_numero is
  'Número internacional, solo dígitos. Lo configura la casa, no el cajero.';
comment on column staff_profiles.whatsapp_activo is
  'Si está prendido, los jugadores de su cartera ven el botón de WhatsApp.';
comment on column staff_profiles.whatsapp_solo is
  'Si está prendido, esos jugadores no ven el chat de la casa.';

notify pgrst, 'reload schema';
