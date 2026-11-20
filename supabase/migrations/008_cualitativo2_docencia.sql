-- Cualitativo 2 admite solicitudes de sala completa para docencia.
-- La reserva utiliza un recurso propio para conservar un único registro y un único correo.
insert into public.resources (id, room, label, sort_order)
values ('CUALITATIVO2_DOCENCIA', 'CUALITATIVO2', 'Laboratorio cualitativo 2 (sala completa para docencia)', 11)
on conflict (id) do nothing;

-- Una plaza ocupa su posición en [1, 11). La sala completa ocupa las diez.
-- Conserva la garantía ante aprobaciones concurrentes y escrituras directas.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass and conname = 'bookings_no_teaching_overlap'
  ) then
    alter table public.bookings add constraint bookings_no_teaching_overlap
      exclude using gist (
        booking_date with =,
        int4range(public.time_to_minutes(start_time), public.time_to_minutes(end_time), '[)') with &&,
        (case
          when resource_id = 'CUALITATIVO2_DOCENCIA' then int4range(1, 11, '[)')
          else int4range(
            substring(resource_id from '^C([0-9]{2})$')::integer,
            substring(resource_id from '^C([0-9]{2})$')::integer + 1,
            '[)'
          )
        end) with &&
      )
      where (status = 'APROBADA' and (resource_id = 'CUALITATIVO2_DOCENCIA' or resource_id ~ '^C(0[1-9]|10)$'));
  end if;
end;
$$;

-- El correo verificado identifica cuentas de personal. Virginia valida el uso docente.
create or replace function public.can_request_teaching_room()
returns boolean
language sql
stable
set search_path = public
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', ''))) not like 'e.%'
    and exists (
      select 1 from public.resources where id = 'CUALITATIVO2_DOCENCIA' and active
    );
$$;

revoke all on function public.can_request_teaching_room() from public, anon, authenticated;

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
      and (
        b.resource_id = p_resource_id
        or (p_room = 'CUALITATIVO2' and (
          b.resource_id = 'CUALITATIVO2_DOCENCIA'
          or (p_resource_id = 'CUALITATIVO2_DOCENCIA' and b.resource_id ~ '^C(0[1-9]|10)$')
        ))
      )
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
      and (
        bl.target in (p_resource_id, p_room)
        or (p_resource_id = 'CUALITATIVO2_DOCENCIA' and bl.target ~ '^C(0[1-9]|10)$')
      )
  );
$$;

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
  v_can_request_whole_room boolean;
begin
  if not public.is_verified_go_ugr_user() then
    raise exception 'Inicia sesión con tu cuenta institucional de Google (@go.ugr.es) para consultar la disponibilidad.';
  end if;

  if v_date < v_today or v_date > v_last_date then
    raise exception 'Selecciona una fecha dentro de los próximos 60 días.';
  end if;

  v_can_request_whole_room := public.can_request_teaching_room();
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
            and r.id <> 'CUALITATIVO2_DOCENCIA'
            and not public.has_resource_conflict(r.id, r.room, v_date, s.start_time, s.end_time)
        ), '[]'::jsonb),
        'whole_room_available', case
          when v_can_request_whole_room and s.room = 'CUALITATIVO2'
            then not public.has_resource_conflict(
              'CUALITATIVO2_DOCENCIA', s.room, v_date, s.start_time, s.end_time
            )
          else false
        end
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
    'can_request_whole_room', v_can_request_whole_room,
    'slots', v_slots
  );
end;
$$;

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
set search_path = public, auth
as $$
declare
  v_now_madrid timestamp := timezone('Europe/Madrid', now());
  v_today date := v_now_madrid::date;
  v_now_time time := v_now_madrid::time;
  v_last_date date := v_today + 60;
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_google_name text;
  v_name text;
  v_purpose text := left(
    trim(
      regexp_replace(
        replace(replace(coalesce(p_purpose, ''), E'\r\n', E'\n'), E'\r', E'\n'),
        E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]',
        '',
        'g'
      )
    ),
    400
  );
  v_room text;
  v_resource record;
  v_end_minutes integer;
  v_end_time time;
  v_pending_count integer;
  v_daily_count integer;
  v_created public.bookings;
begin
  if not public.is_verified_go_ugr_user() then
    raise exception 'Debes iniciar sesión con tu cuenta de Google (@go.ugr.es) para solicitar una reserva.';
  end if;

  if not public.is_valid_go_ugr_email(v_email) then
    raise exception 'Solo se permiten reservas con cuentas institucionales @go.ugr.es.';
  end if;

  -- Serializar solicitudes concurrentes del mismo usuario (evita bypass TOCTOU de límites)
  perform pg_advisory_xact_lock(hashtext('polisociolab:booking:' || v_email));

  -- Nombre inmutable proveniente de la identidad Google OAuth (nunca de user_metadata ni del cliente)
  select left(
    trim(
      regexp_replace(
        coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name', ''),
        E'[\\x00-\\x1F\\x7F]+',
        ' ',
        'g'
      )
    ),
    120
  )
  into v_google_name
  from auth.identities i
  where i.user_id = auth.uid()
    and i.provider = 'google'
    and lower(coalesce(i.identity_data ->> 'email', i.email, '')) = v_email
  order by i.updated_at desc nulls last
  limit 1;

  if length(coalesce(v_google_name, '')) >= 2 then
    v_name := v_google_name;
  else
    v_name := left(split_part(v_email, '@', 1), 120);
  end if;

  if length(v_name) < 2 then
    raise exception 'No se pudo obtener tu nombre desde la cuenta @go.ugr.es.';
  end if;

  if length(v_purpose) < 3 then
    raise exception 'Indica brevemente el motivo o la asignatura de la reserva.';
  end if;

  if p_hours is null or p_hours < 1 or p_hours > 6 then
    raise exception 'La duración debe estar entre 1 y 6 horas.';
  end if;

  if p_date is null or p_date < v_today or p_date > v_last_date then
    raise exception 'Selecciona una fecha dentro de los próximos 60 días.';
  end if;

  if p_start_time is null or extract(second from p_start_time) <> 0 then
    raise exception 'La hora de inicio seleccionada no es válida.';
  end if;

  if p_date = v_today and p_start_time <= v_now_time then
    raise exception 'Ese turno ya ha comenzado.';
  end if;

  v_end_minutes := public.time_to_minutes(p_start_time) + (p_hours * 60);
  if v_end_minutes > 24 * 60 - 1 then
    raise exception 'La duración seleccionada supera el horario de cierre.';
  end if;
  v_end_time := time '00:00' + make_interval(mins => v_end_minutes);

  if p_resource_id = 'CUALITATIVO2_DOCENCIA' and not public.can_request_teaching_room() then
    raise exception 'La sala completa se solicita para docencia desde una cuenta institucional de personal.';
  end if;

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
    perform pg_advisory_xact_lock(hashtext('polisociolab:room:' || v_room || ':' || p_date::text));
  end if;

  if v_room = 'CUALITATIVO2' and p_resource_id <> 'CUALITATIVO2_DOCENCIA' then
    select r.* into v_resource
    from public.resources r
    where r.room = 'CUALITATIVO2'
      and r.active = true
      and r.id <> 'CUALITATIVO2_DOCENCIA'
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
      if p_resource_id = 'CUALITATIVO2_DOCENCIA' then
        raise exception 'La sala completa ya no está disponible en todo el horario seleccionado.';
      end if;
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

  -- Límite diario anti-spam (independiente de si las anteriores fueron rechazadas)
  select count(*) into v_daily_count
  from public.bookings
  where lower(requester_email) = v_email
    and created_at >= now() - interval '24 hours';

  if v_daily_count >= 20 then
    raise exception 'Has alcanzado el límite diario de solicitudes. Inténtalo de nuevo mañana.';
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

create or replace function public.resolve_booking(
  p_booking_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_now_madrid timestamp := timezone('Europe/Madrid', now());
  v_today date := v_now_madrid::date;
  v_now_time time := v_now_madrid::time;
  v_clean_note text := left(
    trim(
      regexp_replace(
        replace(replace(coalesce(p_note, ''), E'\r\n', E'\n'), E'\r', E'\n'),
        E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]',
        '',
        'g'
      )
    ),
    500
  );
  v_booking public.bookings;
  v_resource public.resources;
  v_assigned_resource_id text;
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

  v_assigned_resource_id := v_booking.resource_id;

  if p_decision in ('APROBADA', 'RECHAZADA') and v_booking.status <> 'PENDIENTE' then
    raise exception 'Esta solicitud ya fue resuelta (%).', v_booking.status;
  end if;

  if p_decision = 'CANCELADA' and v_booking.status <> 'APROBADA' then
    raise exception 'Solo se pueden cancelar reservas previamente aprobadas.';
  end if;

  if p_decision = 'APROBADA' then
    perform pg_advisory_xact_lock(
      hashtext('polisociolab:room:' || v_resource.room || ':' || v_booking.booking_date::text)
    );

    if v_resource.id = 'CUALITATIVO2_DOCENCIA' and not v_resource.active then
      raise exception 'La solicitud de sala completa está deshabilitada.';
    end if;

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
      v_assigned_resource_id, v_resource.room, v_booking.booking_date,
      v_booking.start_time, v_booking.end_time, v_booking.id
    ) then
      if v_resource.id = 'CUALITATIVO2_DOCENCIA' then
        raise exception 'No se puede aprobar la sala completa. Hay una reserva o un bloqueo que coincide con el turno.';
      elsif v_resource.room = 'CUALITATIVO2' then
        select r.id into v_assigned_resource_id
        from public.resources r
        where r.room = 'CUALITATIVO2'
          and r.active = true
          and r.id <> 'CUALITATIVO2_DOCENCIA'
          and not public.has_resource_conflict(
            r.id, r.room, v_booking.booking_date,
            v_booking.start_time, v_booking.end_time, v_booking.id
          )
        order by r.sort_order asc
        limit 1;

        if v_assigned_resource_id is null then
          raise exception 'El Laboratorio cualitativo 2 ya ha alcanzado su aforo máximo de 10 plazas en ese horario.';
        end if;
      else
        raise exception 'El laboratorio ya está ocupado o bloqueado en ese horario.';
      end if;
    end if;
  end if;

  update public.bookings
  set resource_id = v_assigned_resource_id,
      status = p_decision,
      reviewed_at = now(),
      reviewed_by = v_staff_email,
      review_note = v_clean_note,
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
