-- PoliSocioLAB · Restricción estricta a usuarios autenticados con Google (@go.ugr.es)
-- Bloquea bots, correos inventados y comunidad no universitaria a nivel de base de datos.

create or replace function public.is_valid_go_ugr_email(p_email text)
returns boolean
language sql
immutable
strict
as $$
  select lower(trim(p_email)) ~ '^[a-z0-9][a-z0-9._+-]{0,63}@go\.ugr\.es$';
$$;

create or replace function public.is_verified_go_ugr_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    auth.uid() is not null
    and public.is_valid_go_ugr_email(coalesce(auth.jwt() ->> 'email', ''))
    and (
      public.is_staff()
      or (
        (
          lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '')) = 'google'
          or coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
        )
        and exists (
          select 1
          from auth.users u
          where u.id = auth.uid()
            and lower(coalesce(u.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            and u.email_confirmed_at is not null
        )
      )
    );
$$;

-- Actualizar get_public_availability para exigir sesión verificada @go.ugr.es
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
  if not public.is_verified_go_ugr_user() then
    raise exception 'Inicia sesión con tu cuenta institucional de Google (@go.ugr.es) para consultar la disponibilidad.';
  end if;

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

-- Actualizar submit_booking_request: ignora p_email del cliente y toma siempre el correo verificado del JWT de Google (@go.ugr.es)
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
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_purpose text := left(trim(coalesce(p_purpose, '')), 400);
  v_resource record;
  v_end_minutes integer;
  v_end_time time;
  v_pending_count integer;
  v_created public.bookings;
begin
  if not public.is_verified_go_ugr_user() then
    raise exception 'Debes iniciar sesión con tu cuenta de Google (@go.ugr.es) para solicitar una reserva.';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Introduce tu nombre y apellidos.';
  end if;

  if not public.is_valid_go_ugr_email(v_email) then
    raise exception 'Solo se permiten reservas con cuentas institucionales @go.ugr.es.';
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
    'requester_email', v_created.requester_email,
    'date', to_char(v_created.booking_date, 'YYYY-MM-DD'),
    'start', to_char(v_created.start_time, 'HH24:MI'),
    'end', to_char(v_created.end_time, 'HH24:MI'),
    'status', v_created.status
  );
end;
$$;

-- Revocar acceso anónimo (bots/externos sin sesión @go.ugr.es no pueden invocar ninguna RPC)
revoke all on function public.get_public_availability(date) from public, anon;
grant execute on function public.get_public_availability(date) to authenticated;

revoke all on function public.submit_booking_request(text, text, text, date, time, integer, text) from public, anon;
grant execute on function public.submit_booking_request(text, text, text, date, time, integer, text) to authenticated;

revoke all on function public.is_verified_go_ugr_user() from public, anon;
grant execute on function public.is_verified_go_ugr_user() to authenticated;
