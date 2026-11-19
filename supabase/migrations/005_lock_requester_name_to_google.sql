-- PoliSocioLAB · Bloquear nombre del solicitante al nombre verificado de Google (@go.ugr.es)
-- Impide que un usuario altere su nombre desde el navegador o la API.

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
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_jwt_name text := left(trim(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    ''
  )), 120);
  v_name text;
  v_purpose text := left(trim(coalesce(p_purpose, '')), 400);
  v_room text;
  v_resource record;
  v_end_minutes integer;
  v_end_time time;
  v_pending_count integer;
  v_created public.bookings;
begin
  if not public.is_verified_go_ugr_user() then
    raise exception 'Debes iniciar sesión con tu cuenta de Google (@go.ugr.es) para solicitar una reserva.';
  end if;

  if not public.is_valid_go_ugr_email(v_email) then
    raise exception 'Solo se permiten reservas con cuentas institucionales @go.ugr.es.';
  end if;

  -- Usar siempre el nombre verificado de Google (@go.ugr.es); respaldo al identificador del correo si Google no lo informara
  if length(v_jwt_name) >= 2 then
    v_name := v_jwt_name;
  else
    v_name := left(split_part(v_email, '@', 1), 120);
  end if;

  if length(v_name) < 2 then
    raise exception 'No se pudo obtener tu nombre desde la cuenta @go.ugr.es.';
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

  v_end_minutes := public.time_to_minutes(p_start_time) + (p_hours * 60);
  if v_end_minutes > 24 * 60 - 1 then
    raise exception 'La duración seleccionada supera el horario de cierre.';
  end if;
  v_end_time := time '00:00' + make_interval(mins => v_end_minutes);

  if p_resource_id = 'CUALITATIVO2' then
    v_room := 'CUALITATIVO2';
  else
    select room into v_room
    from public.resources
    where id = p_resource_id and active = true;
  end if;

  if v_room is null then
    raise exception 'El espacio seleccionado no es válido.';
  end if;

  if not public.range_within_opening_hours(v_room, p_date, p_start_time, v_end_time) then
    raise exception 'El horario o la duración seleccionada está fuera del horario de apertura del laboratorio.';
  end if;

  if v_room = 'CUALITATIVO2' then
    select r.* into v_resource
    from public.resources r
    where r.room = 'CUALITATIVO2'
      and r.active = true
      and not public.has_resource_conflict(r.id, r.room, p_date, p_start_time, v_end_time)
    order by (
      select count(*)
      from public.bookings b
      where b.resource_id = r.id
        and b.status = 'PENDIENTE'
        and b.booking_date = p_date
        and b.start_time < v_end_time
        and p_start_time < b.end_time
    ) asc, r.sort_order asc
    limit 1;

    if not found then
      raise exception 'El Laboratorio cualitativo 2 ya ha alcanzado su aforo máximo de 10 plazas en parte de ese horario.';
    end if;
  else
    select * into v_resource
    from public.resources
    where id = p_resource_id and active = true;

    if public.has_resource_conflict(v_resource.id, v_resource.room, p_date, p_start_time, v_end_time) then
      raise exception 'El laboratorio ya está ocupado o bloqueado en parte de ese horario.';
    end if;
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
    'requester_name', v_created.requester_name,
    'requester_email', v_created.requester_email,
    'date', to_char(v_created.booking_date, 'YYYY-MM-DD'),
    'start', to_char(v_created.start_time, 'HH24:MI'),
    'end', to_char(v_created.end_time, 'HH24:MI'),
    'status', v_created.status
  );
end;
$$;

revoke all on function public.submit_booking_request(text, text, text, date, time, integer, text) from public, anon;
grant execute on function public.submit_booking_request(text, text, text, date, time, integer, text) to authenticated;
