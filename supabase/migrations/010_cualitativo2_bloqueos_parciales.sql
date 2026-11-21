begin;

-- NULL retains the meaning of all existing room and individual seat blocks.
alter table public.blocks
  add column if not exists seat_ids text[];

alter table public.blocks
  add constraint blocks_partial_seats_valid check (
    seat_ids is null or (
      target = 'CUALITATIVO2'
      and array_ndims(seat_ids) = 1
      and cardinality(seat_ids) between 1 and 9
      and seat_ids <@ array['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10']
    )
  );

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
        (bl.target in (p_resource_id, p_room) and (
          bl.seat_ids is null
          or p_resource_id = 'CUALITATIVO2_DOCENCIA'
          or p_resource_id = any(bl.seat_ids)
        ))
        or (p_resource_id = 'CUALITATIVO2_DOCENCIA' and bl.target ~ '^C(0[1-9]|10)$')
      )
  );
$$;

-- Serialize other Cualitativo 2 block writers with allocation and booking approval.
create function public.lock_cualitativo2_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target = 'CUALITATIVO2' or new.target ~ '^C(0[1-9]|10)$' then
    perform pg_advisory_xact_lock(hashtext('polisociolab:room:CUALITATIVO2:' || new.block_date::text));
  end if;

  if new.seat_ids is not null and (
    select count(distinct seat) <> cardinality(new.seat_ids)
    from unnest(new.seat_ids) as seats(seat)
  ) then
    raise exception 'El bloqueo debe usar plazas diferentes.';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_cualitativo2_block() from public, anon, authenticated;

create trigger trg_blocks_lock_cualitativo2
before insert or update on public.blocks
for each row execute function public.lock_cualitativo2_block();

create function public.create_cualitativo2_seat_block(
  p_count integer,
  p_date date,
  p_start time,
  p_end time,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seat_ids text[];
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal autorizado puede crear bloqueos.' using errcode = '42501';
  end if;

  if p_count is null or p_count not between 1 and 9 then
    raise exception 'Selecciona entre 1 y 9 plazas para un bloqueo parcial.';
  end if;

  if p_date is null or p_start is null or p_end is null or p_end <= p_start then
    raise exception 'Indica una fecha y una hora de fin posterior a la de inicio.';
  end if;

  perform pg_advisory_xact_lock(hashtext('polisociolab:room:CUALITATIVO2:' || p_date::text));

  select array_agg(available.id order by available.sort_order, available.id)
  into v_seat_ids
  from (
    select r.id, r.sort_order
    from public.resources r
    where r.room = 'CUALITATIVO2'
      and r.id ~ '^C(0[1-9]|10)$'
      and r.active
      and not public.has_resource_conflict(r.id, r.room, p_date, p_start, p_end)
    order by r.sort_order desc, r.id desc
    limit p_count
  ) available;

  if coalesce(cardinality(v_seat_ids), 0) < p_count then
    raise exception 'Solo hay % plazas libres durante toda la franja elegida.', coalesce(cardinality(v_seat_ids), 0);
  end if;

  insert into public.blocks (target, seat_ids, block_date, start_time, end_time, reason)
  values ('CUALITATIVO2', v_seat_ids, p_date, p_start, p_end, coalesce(p_reason, ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_cualitativo2_seat_block(integer, date, time, time, text) from public, anon;
grant execute on function public.create_cualitativo2_seat_block(integer, date, time, time, text) to authenticated;

notify pgrst, 'reload schema';
commit;
