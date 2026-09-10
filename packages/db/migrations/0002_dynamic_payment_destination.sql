begin;

alter table public.order_payments
  add column if not exists destination_upi_id text,
  add column if not exists destination_upi_payee_name text;

alter table public.order_payments
  drop constraint if exists order_payments_destination_pair_check,
  drop constraint if exists order_payments_destination_upi_length,
  drop constraint if exists order_payments_destination_upi_format,
  drop constraint if exists order_payments_destination_payee_length;

alter table public.order_payments
  add constraint order_payments_destination_pair_check check (
    (destination_upi_id is null and destination_upi_payee_name is null)
    or (destination_upi_id is not null and destination_upi_payee_name is not null)
  ),
  add constraint order_payments_destination_upi_length check (
    destination_upi_id is null or char_length(destination_upi_id) between 5 and 100
  ),
  add constraint order_payments_destination_upi_format check (
    destination_upi_id is null or destination_upi_id ~* '^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$'
  ),
  add constraint order_payments_destination_payee_length check (
    destination_upi_payee_name is null or char_length(destination_upi_payee_name) between 2 and 80
  );

create table if not exists public.platform_payment_settings (
  id text primary key default 'primary',
  upi_id text not null,
  upi_payee_name text not null default 'CAmpDeliver',
  updated_by_admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_payment_settings_singleton check (id = 'primary'),
  constraint platform_payment_settings_upi_id_length check (char_length(upi_id) between 5 and 100),
  constraint platform_payment_settings_upi_id_format check (upi_id ~* '^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$'),
  constraint platform_payment_settings_payee_name_length check (char_length(upi_payee_name) between 2 and 80)
);

create table if not exists public.platform_payment_settings_history (
  id uuid primary key default gen_random_uuid(),
  settings_id text not null default 'primary' references public.platform_payment_settings(id) on delete restrict,
  previous_upi_id text,
  previous_upi_payee_name text,
  new_upi_id text not null,
  new_upi_payee_name text not null,
  changed_by_admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint platform_payment_settings_history_singleton check (settings_id = 'primary'),
  constraint platform_payment_settings_history_new_upi_length check (char_length(new_upi_id) between 5 and 100),
  constraint platform_payment_settings_history_new_upi_format check (new_upi_id ~* '^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$'),
  constraint platform_payment_settings_history_new_payee_length check (char_length(new_upi_payee_name) between 2 and 80)
);

alter table public.platform_payment_settings
  drop constraint if exists platform_payment_settings_singleton,
  drop constraint if exists platform_payment_settings_upi_id_length,
  drop constraint if exists platform_payment_settings_upi_id_format,
  drop constraint if exists platform_payment_settings_payee_name_length;

alter table public.platform_payment_settings
  add constraint platform_payment_settings_singleton check (id = 'primary'),
  add constraint platform_payment_settings_upi_id_length check (char_length(upi_id) between 5 and 100),
  add constraint platform_payment_settings_upi_id_format check (upi_id ~* '^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$'),
  add constraint platform_payment_settings_payee_name_length check (char_length(upi_payee_name) between 2 and 80);

alter table public.platform_payment_settings_history
  drop constraint if exists platform_payment_settings_history_singleton,
  drop constraint if exists platform_payment_settings_history_new_upi_length,
  drop constraint if exists platform_payment_settings_history_new_upi_format,
  drop constraint if exists platform_payment_settings_history_new_payee_length;

alter table public.platform_payment_settings_history
  add constraint platform_payment_settings_history_singleton check (settings_id = 'primary'),
  add constraint platform_payment_settings_history_new_upi_length check (char_length(new_upi_id) between 5 and 100),
  add constraint platform_payment_settings_history_new_upi_format check (new_upi_id ~* '^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$'),
  add constraint platform_payment_settings_history_new_payee_length check (char_length(new_upi_payee_name) between 2 and 80);

create index if not exists idx_platform_payment_settings_history_created
  on public.platform_payment_settings_history(created_at desc);

alter table public.platform_payment_settings enable row level security;
alter table public.platform_payment_settings_history enable row level security;

-- Financial routing configuration is backend-only. ADMIN access goes through
-- the authenticated tRPC API so changes are validated and audit-logged.
revoke all on table public.platform_payment_settings,
  public.platform_payment_settings_history from anon, authenticated;

commit;
