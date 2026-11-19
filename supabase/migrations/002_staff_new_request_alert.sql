-- PoliSocioLAB · Aviso automático al personal ante nuevas solicitudes pendientes
-- Garantiza envío único (at-most-once) por solicitud para evitar duplicados o spam.

alter table public.bookings
  add column if not exists staff_notified_at timestamptz;

create index if not exists idx_bookings_created_at
  on public.bookings (created_at desc);
