-- PoliSocioLAB · Sistema de reservas de laboratorios (UGR)
-- Esquema PostgreSQL para Supabase (plan gratuito)

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Funciones auxiliares inmutables
-- ---------------------------------------------------------------------------
create or replace function public.time_to_minutes(t time)
returns integer
language sql
immutable
strict
as $$
  select (extract(hour from t)::integer * 60) + extract(minute from t)::integer;
$$;

create or replace function public.is_valid_ugr_email(p_email text)
returns boolean
language sql
immutable
strict
as $$
  select lower(trim(p_email)) ~ '^[a-z0-9][a-z0-9._+-]{0,63}@([a-z0-9-]+\.)*ugr\.es$';
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas principales
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id text primary key,
  room text not null check (room in ('RADIO', 'CUALITATIVO1', 'CUALITATIVO2')),
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.staff_users (
  email text primary key check (email = lower(trim(email))),
  display_name text not null default '',
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room in ('RADIO', 'CUALITATIVO1', 'CUALITATIVO2')),
  iso_day smallint not null check (iso_day between 1 and 7),
  open_time time not null,
  close_time time not null,
  slot_minutes smallint not null default 60 check (slot_minutes between 15 and 240),
  check (close_time > open_time),
  check ((public.time_to_minutes(close_time) - public.time_to_minutes(open_time)) % slot_minutes = 0),
  unique (room, iso_day, open_time)
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  target text not null, -- 'RADIO', 'CUALITATIVO1', 'CUALITATIVO2' o 'C01'..'C10'
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requester_name text not null check (length(trim(requester_name)) >= 2),
  requester_email text not null check (public.is_valid_ugr_email(requester_email)),
  purpose text not null default '',
  resource_id text not null references public.resources(id),
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA')),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text not null default '',
  mail_status text not null default 'NO_APLICA'
    check (mail_status in ('NO_APLICA', 'EN_COLA', 'ENVIADO', 'ERROR')),
  mail_error text not null default '',
  mail_sent_at timestamptz,
  check (end_time > start_time),
  -- Garantía a nivel de base de datos: jamás pueden solaparse dos reservas APROBADAS del mismo recurso/puesto
  constraint bookings_no_approved_overlap
    exclude using gist (
      resource_id with =,
      booking_date with =,
      int4range(public.time_to_minutes(start_time), public.time_to_minutes(end_time), '[)') with &&
    )
    where (status = 'APROBADA')
);

create index if not exists idx_bookings_date_status on public.bookings (booking_date, status);
create index if not exists idx_bookings_email_date on public.bookings (lower(requester_email), booking_date);
create index if not exists idx_blocks_date on public.blocks (block_date);

-- ---------------------------------------------------------------------------
-- 3. Datos iniciales: 3 laboratorios (12 recursos) + horarios L-V 08:00-21:00
-- ---------------------------------------------------------------------------
insert into public.resources (id, room, label, sort_order) values
  ('RADIO', 'RADIO', 'Laboratorio de radio', 1),
  ('CUALITATIVO1', 'CUALITATIVO1', 'Laboratorio cualitativo 1', 2),
  ('C01', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 01', 11),
  ('C02', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 02', 12),
  ('C03', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 03', 13),
  ('C04', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 04', 14),
  ('C05', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 05', 15),
  ('C06', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 06', 16),
  ('C07', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 07', 17),
  ('C08', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 08', 18),
  ('C09', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 09', 19),
  ('C10', 'CUALITATIVO2', 'Laboratorio cualitativo 2 · Puesto 10', 20)
on conflict (id) do nothing;

insert into public.opening_hours (room, iso_day, open_time, close_time, slot_minutes)
select r.room, d.iso_day, time '08:00', time '21:00', 60
from (values ('RADIO'), ('CUALITATIVO1'), ('CUALITATIVO2')) as r(room)
cross join generate_series(1, 5) as d(iso_day)
on conflict (room, iso_day, open_time) do nothing;

-- Personal autorizado inicial (puedes añadir o quitar cuentas aquí o desde Supabase)
insert into public.staff_users (email, display_name, role) values
  ('vcalero@go.ugr.es', 'Virginia Calero', 'staff'),
  ('godoy@go.ugr.es', 'Jesús M. Godoy (técnico)', 'admin')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Seguridad (Row Level Security)
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.resources enable row level security;
alter table public.staff_users enable row level security;
alter table public.opening_hours enable row level security;
alter table public.blocks enable row level security;
alter table public.bookings enable row level security;

-- resources: lectura pública, edición solo staff
drop policy if exists "resources_public_read" on public.resources;
create policy "resources_public_read" on public.resources
  for select using (true);

drop policy if exists "resources_staff_write" on public.resources;
create policy "resources_staff_write" on public.resources
  for all using (public.is_staff()) with check (public.is_staff());

-- opening_hours: lectura pública, edición solo staff
drop policy if exists "opening_hours_public_read" on public.opening_hours;
create policy "opening_hours_public_read" on public.opening_hours
  for select using (true);

drop policy if exists "opening_hours_staff_write" on public.opening_hours;
create policy "opening_hours_staff_write" on public.opening_hours
  for all using (public.is_staff()) with check (public.is_staff());

-- blocks: lectura/escritura solo staff (el calendario público los evalúa vía RPC)
drop policy if exists "blocks_staff_all" on public.blocks;
create policy "blocks_staff_all" on public.blocks
  for all using (public.is_staff()) with check (public.is_staff());

-- staff_users: solo staff puede ver la lista
drop policy if exists "staff_users_staff_read" on public.staff_users;
create policy "staff_users_staff_read" on public.staff_users
  for select using (public.is_staff());

-- bookings: PRIVADO. Nadie anónimo puede leer nombres ni correos. Solo staff.
drop policy if exists "bookings_staff_select" on public.bookings;
create policy "bookings_staff_select" on public.bookings
  for select using (public.is_staff());

drop policy if exists "bookings_staff_update" on public.bookings;
create policy "bookings_staff_update" on public.bookings
  for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5. Helper interno de validación de horario y conflictos
-- ---------------------------------------------------------------------------
create or replace function public.range_within_opening_hours(
  p_room text,
  p_date date,
  p_start time,
  p_end time
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_iso_day smallint := extract(isodow from p_date)::smallint;
  v_cursor integer := public.time_to_minutes(p_start);
  v_target integer := public.time_to_minutes(p_end);
  v_next integer;
begin
  if v_cursor >= v_target then
    return false;
  end if;

  while v_cursor < v_target loop
    select v_cursor + oh.slot_minutes
    into v_next
    from public.opening_hours oh
    where oh.room = p_room
      and oh.iso_day = v_iso_day
      and v_cursor >= public.time_to_minutes(oh.open_time)
      and v_cursor + oh.slot_minutes <= public.time_to_minutes(oh.close_time)
      and (v_cursor - public.time_to_minutes(oh.open_time)) % oh.slot_minutes = 0
    limit 1;

    if v_next is null then
      return false;
    end if;
    v_cursor := v_next;
  end loop;

  return v_cursor = v_target;
end;
$$;

create or replace function public.has_resource_conflict(
  p_resource_id text,
  p_room text,
  p_date date,
  p_start time,
  p_end time,
  p_ignore_booking_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.status = 'APROBADA'
      and b.resource_id = p_resource_id
      and b.booking_date = p_date
      and b.start_time < p_end
      and p_start < b.end_time
      and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
  )
  or exists (
    select 1
    from public.blocks bl
    where bl.block_date = p_date
      and bl.start_time < p_end
      and p_start < bl.end_time
      and (bl.target = p_resource_id or bl.target = p_room)
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC pública: consultar disponibilidad (sin datos personales)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_availability(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now_madrid timestamp := timezone('Europe/Madrid', now());
  v_today date := v_now_madrid::date;
  v_now_time time := v_now_madrid::time;
  v_last_date date := v_today + 60;
  v_date date := coalesce(p_date, v_today);
  v_iso_day smallint;
  v_slots jsonb;
begin
  if v_date < v_today or v_date > v_last_date then
    raise exception 'Selecciona una fecha dentro de los próximos 60 días.';
  end if;

  v_iso_day := extract(isodow from v_date)::smallint;

  with generated_slots as (
    select
      oh.room,
      (time '00:00' + make_interval(mins => gs.m)) as start_time,
      (time '00:00' + make_interval(mins => gs.m + oh.slot_minutes)) as end_time
    from public.opening_hours oh
    cross join lateral generate_series(
      public.time_to_minutes(oh.open_time),
      public.time_to_minutes(oh.close_time) - oh.slot_minutes,
      oh.slot_minutes
    ) as gs(m)
    where oh.iso_day = v_iso_day
  ),
  open_slots as (
    select *
    from generated_slots
    where v_date > v_today or start_time > v_now_time
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'room', s.room,
        'date', to_char(v_date, 'YYYY-MM-DD'),
        'start', to_char(s.start_time, 'HH24:MI'),
        'end', to_char(s.end_time, 'HH24:MI'),
        'available', coalesce((
          select jsonb_agg(r.id order by r.sort_order)
          from public.resources r
          where r.active = true
            and r.room = s.room
            and not public.has_resource_conflict(r.id, r.room, v_date, s.start_time, s.end_time)
        ), '[]'::jsonb)
      )
      order by s.start_time, s.room
    ),
    '[]'::jsonb
  )
  into v_slots
  from open_slots s;

  return jsonb_build_object(
    'date', to_char(v_date, 'YYYY-MM-DD'),
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'last_date', to_char(v_last_date, 'YYYY-MM-DD'),
    'slots', v_slots
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC pública: enviar solicitud de reserva (valida dominio *ugr.es)
-- ---------------------------------------------------------------------------
create or replace function public.submit_booking_request(
  p_name text,
  p_email text,
  p_resource_id text,
  p_date date,
  p_start_time time,
  p_hours integer default 1,
  p_purpose text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_madrid timestamp := timezone('Europe/Madrid', now());
  v_today date := v_now_madrid::date;
  v_now_time time := v_now_madrid::time;
  v_last_date date := v_today + 60;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_purpose text := left(trim(coalesce(p_purpose, '')), 400);
  v_resource record;
  v_end_minutes integer;
  v_end_time time;
  v_pending_count integer;
  v_created public.bookings;
begin
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Introduce tu nombre y apellidos.';
  end if;

  if not public.is_valid_ugr_email(v_email) then
    raise exception 'Debes usar un correo institucional de la UGR cuyo dominio termine en ugr.es.';
  end if;

  if p_hours is null or p_hours < 1 or p_hours > 6 then
    raise exception 'La duración debe estar entre 1 y 6 horas.';
  end if;

  if p_date is null or p_date < v_today or p_date > v_last_date then
    raise exception 'Selecciona una fecha dentro de los próximos 60 días.';
  end if;

  if p_date = v_today and p_start_time <= v_now_time then
    raise exception 'Ese turno ya ha comenzado.';
  end if;

  select * into v_resource
  from public.resources
  where id = p_resource_id and active = true;

  if not found then
    raise exception 'El recurso seleccionado no es válido.';
  end if;

  v_end_minutes := public.time_to_minutes(p_start_time) + (p_hours * 60);
  if v_end_minutes > 24 * 60 - 1 then
    raise exception 'La duración seleccionada supera el horario de cierre.';
  end if;
  v_end_time := time '00:00' + make_interval(mins => v_end_minutes);

  if not public.range_within_opening_hours(v_resource.room, p_date, p_start_time, v_end_time) then
    raise exception 'El horario o la duración seleccionada está fuera del horario de apertura del laboratorio.';
  end if;

  if public.has_resource_conflict(v_resource.id, v_resource.room, p_date, p_start_time, v_end_time) then
    raise exception 'El recurso ya está ocupado o bloqueado en parte de ese horario.';
  end if;

  -- Evitar duplicados o solapamientos del mismo estudiante
  if exists (
    select 1
    from public.bookings b
    where lower(b.requester_email) = v_email
      and b.status in ('PENDIENTE', 'APROBADA')
      and b.booking_date = p_date
      and b.start_time < v_end_time
      and p_start_time < b.end_time
  ) then
    raise exception 'Ya tienes una solicitud pendiente o aprobada que coincide con ese horario.';
  end if;

  -- Límite anti-abuso: máximo 10 solicitudes pendientes simultáneas por correo
  select count(*) into v_pending_count
  from public.bookings
  where lower(requester_email) = v_email
    and status = 'PENDIENTE'
    and booking_date >= v_today;

  if v_pending_count >= 10 then
    raise exception 'Has alcanzado el máximo de solicitudes pendientes simultáneas. Espera a que la Facultad resuelva las actuales.';
  end if;

  insert into public.bookings (
    requester_name,
    requester_email,
    purpose,
    resource_id,
    booking_date,
    start_time,
    end_time,
    status
  )
  values (
    v_name,
    v_email,
    v_purpose,
    v_resource.id,
    p_date,
    p_start_time,
    v_end_time,
    'PENDIENTE'
  )
  returning * into v_created;

  return jsonb_build_object(
    'id', v_created.id,
    'resource_id', v_created.resource_id,
    'resource_label', v_resource.label,
    'date', to_char(v_created.booking_date, 'YYYY-MM-DD'),
    'start', to_char(v_created.start_time, 'HH24:MI'),
    'end', to_char(v_created.end_time, 'HH24:MI'),
    'status', v_created.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC de personal: aprobar, rechazar o cancelar una solicitud
-- ---------------------------------------------------------------------------
create or replace function public.resolve_booking(
  p_booking_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_now_madrid timestamp := timezone('Europe/Madrid', now());
  v_today date := v_now_madrid::date;
  v_now_time time := v_now_madrid::time;
  v_booking public.bookings;
  v_resource public.resources;
begin
  if not public.is_staff() then
    raise exception 'Acceso reservado al personal autorizado.';
  end if;

  if p_decision not in ('APROBADA', 'RECHAZADA', 'CANCELADA') then
    raise exception 'Decisión no válida.';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'No se encontró la solicitud.';
  end if;

  select * into v_resource
  from public.resources
  where id = v_booking.resource_id;

  if p_decision in ('APROBADA', 'RECHAZADA') and v_booking.status <> 'PENDIENTE' then
    raise exception 'Esta solicitud ya fue resuelta (%).', v_booking.status;
  end if;

  if p_decision = 'CANCELADA' and v_booking.status <> 'APROBADA' then
    raise exception 'Solo se pueden cancelar reservas previamente aprobadas.';
  end if;

  if p_decision = 'APROBADA' then
    if v_booking.booking_date < v_today
       or (v_booking.booking_date = v_today and v_booking.start_time <= v_now_time) then
      raise exception 'El turno ya ha comenzado y no se puede aprobar.';
    end if;

    if not public.range_within_opening_hours(
      v_resource.room, v_booking.booking_date, v_booking.start_time, v_booking.end_time
    ) then
      raise exception 'El turno ya no figura en el horario de apertura.';
    end if;

    if public.has_resource_conflict(
      v_booking.resource_id, v_resource.room, v_booking.booking_date,
      v_booking.start_time, v_booking.end_time, v_booking.id
    ) then
      raise exception 'El recurso ya está ocupado o bloqueado en ese horario.';
    end if;
  end if;

  update public.bookings
  set status = p_decision,
      reviewed_at = now(),
      reviewed_by = v_staff_email,
      review_note = left(trim(coalesce(p_note, '')), 500),
      mail_status = 'EN_COLA',
      mail_error = ''
  where id = v_booking.id
  returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'status', v_booking.status,
    'resource_label', v_resource.label,
    'requester_email', v_booking.requester_email,
    'mail_status', v_booking.mail_status
  );
end;
$$;

-- Permisos explícitos sobre las funciones RPC
revoke all on function public.get_public_availability(date) from public;
grant execute on function public.get_public_availability(date) to anon, authenticated;

revoke all on function public.submit_booking_request(text, text, text, date, time, integer, text) from public;
grant execute on function public.submit_booking_request(text, text, text, date, time, integer, text) to anon, authenticated;

revoke all on function public.resolve_booking(uuid, text, text) from public;
grant execute on function public.resolve_booking(uuid, text, text) to authenticated;
