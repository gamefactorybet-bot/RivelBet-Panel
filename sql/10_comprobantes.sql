-- =========================================================
-- Comprobantes de transferencia
-- El archivo vive en Cloudinary; acá guardamos la URL y el
-- public_id (que es lo que hace falta para borrarlo después).
-- =========================================================

alter table deposit_requests
  add column if not exists comprobante_public_id text,
  add column if not exists telegram_message_id   bigint;

comment on column deposit_requests.comprobante_public_id is 'ID en Cloudinary, para poder borrar el archivo';
comment on column deposit_requests.telegram_message_id is 'ID del mensaje enviado al grupo, para responderlo al resolver';

alter table withdrawal_requests
  add column if not exists telegram_message_id bigint;
