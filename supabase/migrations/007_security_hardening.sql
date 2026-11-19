-- PoliSocioLAB · Endurecimiento de seguridad (Auth Google OAuth, RLS mínimo privilegio, anti-TOCTOU y nombre inmutable)
-- Aplicar después de 006_require_purpose.sql

-- ---------------------------------------------------------------------------
-- 1. Verificación estricta de sesión Google OAuth (@go.ugr.es), staff y admin
--    Exige:
--    - Sesión autenticada con método 'oauth' en el claim JWT `amr`
--      (bloquea sesiones por contraseña/OTP incluso en cuentas ya enlazadas)
--    - Cuenta activa en auth.users (email confirmado, no eliminada ni suspendida)
--    - Identidad verificada de Google en auth.identities con el mismo correo
-- ---------------------------------------------------------------------------
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
    and exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
      where entry ->> 'method' = 'oauth'
    )
    and exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and u.email_confirmed_at is not null
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
    )
    and exists (
      select 1
      from auth.identities i
      where i.user_id = auth.uid()
        and i.provider = 'google'
        and lower(coalesce(i.identity_data ->> 'email', i.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and lower(coalesce(i.identity_data ->> 'email_verified', 'false')) = 'true'
    );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_verified_go_ugr_user()
    and exists (
      select 1
      from public.staff_users
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_verified_go_ugr_user()
    and exists (
      select 1
      from public.staff_users
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role = 'admin'
    );
$$;

-- ---------------------------------------------------------------------------
-- 2. Revocar exposición RPC de funciones SECURITY DEFINER internas
--    Impide bypass anónimo de disponibilidad vía /rest/v1/rpc/has_resource_conflict
-- ---------------------------------------------------------------------------
revoke all on function public.has_resource_conflict(text, text, date, time, time, uuid)
  from public, anon, authenticated;

revoke all on function public.range_within_opening_hours(text, date, time, time)
  from public, anon, authenticated;

revoke all on function public.is_verified_go_ugr_user() from public, anon;
grant execute on function public.is_verified_go_ugr_user() to authenticated;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Políticas RLS de mínimo privilegio (acotadas a TO authenticated)
-- ---------------------------------------------------------------------------
-- resources: lectura solo comunidad @go.ugr.es verificada; escritura solo admin
drop policy if exists "resources_public_read" on public.resources;
drop policy if exists "resources_ugr_read" on public.resources;
create policy "resources_ugr_read" on public.resources
  for select to authenticated
  using (public.is_verified_go_ugr_user());

drop policy if exists "resources_staff_write" on public.resources;
drop policy if exists "resources_admin_write" on public.resources;
create policy "resources_admin_write" on public.resources
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- opening_hours: lectura solo comunidad @go.ugr.es verificada; escritura solo admin
drop policy if exists "opening_hours_public_read" on public.opening_hours;
drop policy if exists "opening_hours_ugr_read" on public.opening_hours;
create policy "opening_hours_ugr_read" on public.opening_hours
  for select to authenticated
  using (public.is_verified_go_ugr_user());

drop policy if exists "opening_hours_staff_write" on public.opening_hours;
drop policy if exists "opening_hours_admin_write" on public.opening_hours;
create policy "opening_hours_admin_write" on public.opening_hours
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- blocks: lectura/escritura solo personal autorizado + integridad de target y created_by
drop policy if exists "blocks_staff_all" on public.blocks;
create policy "blocks_staff_all" on public.blocks
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'blocks_target_valid' and conrelid = 'public.blocks'::regclass
  ) then
    alter table public.blocks
      add constraint blocks_target_valid
      check (target in ('RADIO', 'CUALITATIVO1', 'CUALITATIVO2', 'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'blocks_reason_len' and conrelid = 'public.blocks'::regclass
  ) then
    alter table public.blocks
      add constraint blocks_reason_len
      check (length(reason) <= 300);
  end if;
end $$;

create or replace function public.enforce_block_audit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if v_jwt_email <> '' then
    new.created_by := v_jwt_email;
  end if;
  new.reason := left(trim(regexp_replace(coalesce(new.reason, ''), E'[\\x00-\\x1F\\x7F]+', ' ', 'g')), 300);
  return new;
end;
$$;

revoke all on function public.enforce_block_audit() from public, anon, authenticated;

drop trigger if exists trg_blocks_enforce_audit on public.blocks;
create trigger trg_blocks_enforce_audit
  before insert or update on public.blocks
  for each row
  execute function public.enforce_block_audit();

-- staff_users: lectura solo personal autorizado
drop policy if exists "staff_users_staff_read" on public.staff_users;
create policy "staff_users_staff_read" on public.staff_users
  for select to authenticated
  using (public.is_staff());

-- bookings: solo lectura para personal; las transiciones de estado pasan obligatoriamente por resolve_booking()
drop policy if exists "bookings_staff_select" on public.bookings;
create policy "bookings_staff_select" on public.bookings
  for select to authenticated
  using (public.is_staff());

drop policy if exists "bookings_staff_update" on public.bookings;

-- ---------------------------------------------------------------------------
-- 4. Endurecer submit_booking_request:
--    - Nombre leído de auth.identities (Google OAuth inmutable, NO user_metadata)
--    - Bloqueo transaccional por solicitante (evita condiciones de carrera TOCTOU)
--    - Límite diario anti-spam (máx. 20 solicitudes / 24h) + máx. 10 pendientes
--    - Validación estricta de p_start_time (no nulo, sin segundos) y saneo de caracteres de control
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

revoke all on function public.submit_booking_request(text, text, text, date, time, integer, text) from public, anon;
grant execute on function public.submit_booking_request(text, text, text, date, time, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Endurecer resolve_booking: bloqueo por sala/fecha al aprobar y saneo de nota
-- ---------------------------------------------------------------------------
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
      if v_resource.room = 'CUALITATIVO2' then
        select r.id into v_assigned_resource_id
        from public.resources r
        where r.room = 'CUALITATIVO2'
          and r.active = true
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

revoke all on function public.resolve_booking(uuid, text, text) from public, anon;
grant execute on function public.resolve_booking(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Utilidad de retención RGPD (purga de historial resuelto antiguo, solo admin/postgres)
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_bookings(p_retention_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted integer;
begin
  if not (
    session_user = 'postgres'
    or coalesce(auth.role(), '') = 'service_role'
    or public.is_admin()
  ) then
    raise exception 'Acceso reservado a administración.';
  end if;

  if p_retention_days is null or p_retention_days < 30 then
    raise exception 'El plazo mínimo de conservación es de 30 días.';
  end if;

  delete from public.bookings
  where status <> 'PENDIENTE'
    and booking_date < (timezone('Europe/Madrid', now())::date - p_retention_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_bookings(integer) from public, anon;
grant execute on function public.purge_old_bookings(integer) to authenticated;
