begin;

alter table public.profiles
  add column if not exists delivery_presence_latitude double precision,
  add column if not exists delivery_presence_longitude double precision,
  add column if not exists delivery_presence_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_delivery_presence_pair_check,
  drop constraint if exists profiles_delivery_presence_latitude_check,
  drop constraint if exists profiles_delivery_presence_longitude_check;

alter table public.profiles
  add constraint profiles_delivery_presence_pair_check check (
    (delivery_presence_latitude is null and delivery_presence_longitude is null and delivery_presence_updated_at is null)
    or
    (delivery_presence_latitude is not null and delivery_presence_longitude is not null and delivery_presence_updated_at is not null)
  ),
  add constraint profiles_delivery_presence_latitude_check check (
    delivery_presence_latitude is null or delivery_presence_latitude between -90 and 90
  ),
  add constraint profiles_delivery_presence_longitude_check check (
    delivery_presence_longitude is null or delivery_presence_longitude between -180 and 180
  );

create index if not exists idx_profiles_delivery_presence_updated
  on public.profiles(delivery_presence_updated_at);

commit;
