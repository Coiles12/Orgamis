create extension if not exists "pgcrypto";

-- Disponibilites indexees par date reelle (slot_date) avec semaine ISO derivee.
-- Chaque creneau correspond a un jour precis: matin, midi ou soir.

create type public.time_block as enum ('morning', 'noon', 'evening');
create type public.activity_status as enum ('draft', 'confirmed', 'cancelled');
create type public.transport_mode as enum (
  'car_driver',
  'car_passenger',
  'bike',
  'walking',
  'public_transport'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  is_admin boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot_date date not null,
  iso_year integer generated always as (extract(isoyear from slot_date)::integer) stored,
  iso_week integer generated always as (extract(week from slot_date)::integer) stored,
  time_block public.time_block not null,
  is_available boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint availability_slots_unique unique (user_id, slot_date, time_block)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  location text,
  date timestamptz not null,
  max_participants integer check (max_participants is null or max_participants > 0),
  status public.activity_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists availability_slots_date_idx
  on public.availability_slots (slot_date, time_block);

create index if not exists availability_slots_iso_idx
  on public.availability_slots (iso_year, iso_week, time_block);

create index if not exists activities_date_idx
  on public.activities (date);

create table if not exists public.activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  transport_mode public.transport_mode not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint activity_participants_unique unique (activity_id, user_id)
);

create table if not exists public.carpools (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  driver_participation_id uuid not null references public.activity_participants (id) on delete cascade,
  seats_available integer not null check (seats_available > 0),
  vehicle_label text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint carpools_driver_unique unique (driver_participation_id)
);

create table if not exists public.car_seat_reservations (
  id uuid primary key default gen_random_uuid(),
  driver_participation_id uuid not null references public.activity_participants (id) on delete cascade,
  passenger_user_id uuid not null references public.profiles (id) on delete cascade,
  seats_reserved integer not null default 1 check (seats_reserved > 0),
  created_at timestamptz not null default timezone('utc', now()),
  constraint car_seat_reservations_unique unique (driver_participation_id, passenger_user_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.validate_carpool_driver()
returns trigger
language plpgsql
as $$
declare
  selected_transport_mode public.transport_mode;
  selected_activity_id uuid;
begin
  select transport_mode, activity_id
    into selected_transport_mode, selected_activity_id
  from public.activity_participants
  where id = new.driver_participation_id;

  if selected_transport_mode is distinct from 'car_driver' then
    raise exception 'Le participant selectionne doit etre conducteur.';
  end if;

  if selected_activity_id is distinct from new.activity_id then
    raise exception 'La voiture doit appartenir a la meme activite.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_carpool_reservation()
returns trigger
language plpgsql
as $$
declare
  reserved_seats integer;
  max_seats integer;
begin
  select coalesce(sum(r.seats_reserved), 0)
    into reserved_seats
  from public.car_seat_reservations r
  where r.driver_participation_id = new.driver_participation_id
    and (tg_op = 'INSERT' or r.id <> new.id);

  select c.seats_available
    into max_seats
  from public.carpools c
  where c.driver_participation_id = new.driver_participation_id;

  if max_seats is null then
    raise exception 'Aucune voiture trouvee pour ce conducteur.';
  end if;

  if reserved_seats + new.seats_reserved > max_seats then
    raise exception 'Plus assez de places disponibles.';
  end if;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create or replace trigger availability_slots_set_updated_at
  before update on public.availability_slots
  for each row execute procedure public.set_updated_at();

create or replace trigger activities_set_updated_at
  before update on public.activities
  for each row execute procedure public.set_updated_at();

create or replace trigger validate_carpool_driver_trigger
  before insert or update on public.carpools
  for each row execute procedure public.validate_carpool_driver();

create or replace trigger validate_carpool_reservation_trigger
  before insert or update on public.car_seat_reservations
  for each row execute procedure public.validate_carpool_reservation();

create or replace view public.availability_dashboard as
select
  iso_year,
  iso_week,
  slot_date,
  time_block,
  count(*) filter (where is_available) as available_count
from public.availability_slots
group by iso_year, iso_week, slot_date, time_block
order by iso_year, iso_week, slot_date, time_block;

alter table public.profiles enable row level security;
alter table public.availability_slots enable row level security;
alter table public.activities enable row level security;
alter table public.activity_participants enable row level security;
alter table public.carpools enable row level security;
alter table public.car_seat_reservations enable row level security;

create policy "Profiles are visible to authenticated users"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

create policy "Users can delete their own profile"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

create policy "Admins can delete any profile"
  on public.profiles
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

create policy "Availability visible to authenticated users"
  on public.availability_slots
  for select
  to authenticated
  using (true);

create policy "Users manage their own availability"
  on public.availability_slots
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Activities visible to authenticated users"
  on public.activities
  for select
  to authenticated
  using (true);

create policy "Users create activities"
  on public.activities
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Activity creators update their activities"
  on public.activities
  for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Admins can delete any activity"
  on public.activities
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

create policy "Participants visible to authenticated users"
  on public.activity_participants
  for select
  to authenticated
  using (true);

create policy "Users manage their own participation"
  on public.activity_participants
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Carpools visible to authenticated users"
  on public.carpools
  for select
  to authenticated
  using (true);

create policy "Drivers manage their own cars"
  on public.carpools
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.activity_participants ap
      where ap.id = driver_participation_id
        and ap.user_id = auth.uid()
        and ap.transport_mode = 'car_driver'
    )
  )
  with check (
    exists (
      select 1
      from public.activity_participants ap
      where ap.id = driver_participation_id
        and ap.user_id = auth.uid()
        and ap.transport_mode = 'car_driver'
    )
  );

create policy "Reservations visible to authenticated users"
  on public.car_seat_reservations
  for select
  to authenticated
  using (true);

create policy "Users manage their own reservations"
  on public.car_seat_reservations
  for all
  to authenticated
  using (auth.uid() = passenger_user_id)
  with check (auth.uid() = passenger_user_id);

create policy "Drivers can clear reservations on their cars"
  on public.car_seat_reservations
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.activity_participants ap
      where ap.id = driver_participation_id
        and ap.user_id = auth.uid()
        and ap.transport_mode = 'car_driver'
    )
  );

-- Set admin flag for specific user
update public.profiles
set is_admin = true
where id in (
  select id from auth.users where email = 'lecointregustave@gmail.com'
);
