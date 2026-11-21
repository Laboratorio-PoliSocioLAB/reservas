begin;

-- Match existing reservations by the verified institutional address.
create or replace function public.get_my_bookings()
returns table (
  id uuid,
  resource_id text,
  booking_date date,
  start_time time,
  end_time time,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.resource_id, b.booking_date, b.start_time, b.end_time, b.status
  from public.bookings b
  where (select public.is_verified_go_ugr_user())
    and lower(b.requester_email) = (select lower(auth.jwt() ->> 'email'));
$$;

revoke all on function public.get_my_bookings() from public, anon;
grant execute on function public.get_my_bookings() to authenticated;

notify pgrst, 'reload schema';
commit;
