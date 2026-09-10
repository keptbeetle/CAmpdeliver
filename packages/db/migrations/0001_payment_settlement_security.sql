-- CAmpDeliver pilot payments + database hardening.
-- This migration is intentionally additive. The legacy wallet columns/table are
-- retained for rollback compatibility, but the application no longer uses them.
-- Apply only through `pnpm --filter @acme/db security:apply` after ensuring no
-- legacy active orders are in flight.

begin;

-- Every student account can buy and deliver. ADMIN is the only elevated role.
update public.profiles set role = 'STUDENT' where role = 'DELIVERER';

-- Existing rows contain legacy plaintext OTP values. They are short-lived and
-- safe to invalidate during this rollout; new codes are stored as HMACs.
delete from public.phone_verifications;

alter table public.phone_verifications
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

alter table public.orders
  add column if not exists platform_fee integer,
  add column if not exists deliverer_allows_pay_at_delivery boolean not null default false,
  add column if not exists state_expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists items_available_at timestamptz,
  add column if not exists purchased_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_otp_failed_attempts integer not null default 0,
  add column if not exists delivery_otp_locked_until timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancellation_reason text;

-- Legacy orders predate the platform fee. Preserve their historical totals,
-- then make ₹3 the default only for orders created after this migration.
update public.orders set platform_fee = 0 where platform_fee is null;
alter table public.orders
  alter column platform_fee set default 300,
  alter column platform_fee set not null;

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  method text,
  status text not null default 'NOT_STARTED',
  expected_amount integer not null,
  submitted_utr text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by_admin_id uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  refund_reference text,
  refunded_at timestamptz,
  refunded_by_admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  deliverer_id uuid not null references public.profiles(id) on delete cascade,
  food_reimbursement integer not null,
  delivery_earning integer not null,
  amount_due integer not null,
  status text not null default 'AVAILABLE',
  requested_at timestamptz,
  payout_reference text,
  paid_at timestamptz,
  paid_by_admin_id uuid references public.profiles(id) on delete set null,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_settlements
  add column if not exists requested_at timestamptz,
  alter column status set default 'AVAILABLE';

-- Idempotent constraints. Existing values are validated so a bad rollout fails
-- loudly instead of silently weakening financial invariants.
do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('STUDENT','ADMIN'));
  if not exists (select 1 from pg_constraint where conname = 'profiles_wallet_balance_nonnegative') then
    alter table public.profiles add constraint profiles_wallet_balance_nonnegative
      check (wallet_balance >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_frozen_balance_nonnegative') then
    alter table public.profiles add constraint profiles_frozen_balance_nonnegative
      check (frozen_balance >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'phone_verifications_failed_attempts_nonnegative') then
    alter table public.phone_verifications add constraint phone_verifications_failed_attempts_nonnegative
      check (failed_attempts >= 0);
  end if;

  alter table public.orders drop constraint if exists orders_status_check;
  alter table public.orders add constraint orders_status_check check (
    status in ('BROADCASTED','ACCEPTED','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU','DELIVERED','CANCELLED','FAILED','PREPARING','COMPLETED')
  );
  if not exists (select 1 from pg_constraint where conname = 'orders_food_price_nonnegative') then
    alter table public.orders add constraint orders_food_price_nonnegative check (food_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_fee_nonnegative') then
    alter table public.orders add constraint orders_delivery_fee_nonnegative check (delivery_fee >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_platform_fee_nonnegative') then
    alter table public.orders add constraint orders_platform_fee_nonnegative check (platform_fee >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_otp_failed_attempts_nonnegative') then
    alter table public.orders add constraint orders_delivery_otp_failed_attempts_nonnegative check (delivery_otp_failed_attempts >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_buyer_deliverer_distinct') then
    alter table public.orders add constraint orders_buyer_deliverer_distinct
      check (deliverer_id is null or deliverer_id <> buyer_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_canteen_latitude_check') then
    alter table public.orders add constraint orders_canteen_latitude_check check (canteen_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_canteen_longitude_check') then
    alter table public.orders add constraint orders_canteen_longitude_check check (canteen_longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_latitude_check') then
    alter table public.orders add constraint orders_delivery_latitude_check check (delivery_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_longitude_check') then
    alter table public.orders add constraint orders_delivery_longitude_check check (delivery_longitude between -180 and 180);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'canteens_latitude_check') then
    alter table public.canteens add constraint canteens_latitude_check check (latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'canteens_longitude_check') then
    alter table public.canteens add constraint canteens_longitude_check check (longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'canteens_radius_positive') then
    alter table public.canteens add constraint canteens_radius_positive check (radius > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'landmarks_latitude_check') then
    alter table public.landmarks add constraint landmarks_latitude_check check (latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'landmarks_longitude_check') then
    alter table public.landmarks add constraint landmarks_longitude_check check (longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'landmarks_radius_positive') then
    alter table public.landmarks add constraint landmarks_radius_positive check (radius > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_items_price_nonnegative') then
    alter table public.menu_items add constraint menu_items_price_nonnegative check (price >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_payments_amount_positive') then
    alter table public.order_payments add constraint order_payments_amount_positive check (expected_amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_payments_method_check') then
    alter table public.order_payments add constraint order_payments_method_check
      check (method is null or method in ('ADVANCE','PAY_AT_DELIVERY'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_payments_status_check') then
    alter table public.order_payments add constraint order_payments_status_check check (
      status in ('NOT_STARTED','AWAITING_SELECTION','AWAITING_PAYMENT','PENDING_VERIFICATION','PAID','REJECTED','REFUND_REQUIRED','REFUNDED')
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_settlements_food_nonnegative') then
    alter table public.order_settlements add constraint order_settlements_food_nonnegative check (food_reimbursement >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_settlements_earning_nonnegative') then
    alter table public.order_settlements add constraint order_settlements_earning_nonnegative check (delivery_earning >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_settlements_amount_positive') then
    alter table public.order_settlements add constraint order_settlements_amount_positive check (amount_due > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_settlements_amount_matches') then
    alter table public.order_settlements add constraint order_settlements_amount_matches
      check (amount_due = food_reimbursement + delivery_earning);
  end if;
  alter table public.order_settlements drop constraint if exists order_settlements_status_check;
  alter table public.order_settlements add constraint order_settlements_status_check
    check (status in ('AVAILABLE','PENDING','PAID','ON_HOLD','FAILED'));
end $$;

create unique index if not exists order_payments_order_unique on public.order_payments(order_id);
create unique index if not exists order_payments_utr_unique on public.order_payments(submitted_utr) where submitted_utr is not null;
create unique index if not exists order_payments_refund_reference_unique on public.order_payments(refund_reference) where refund_reference is not null;
create index if not exists idx_order_payments_buyer_created on public.order_payments(buyer_id, created_at desc);
create index if not exists idx_order_payments_status_created on public.order_payments(status, created_at desc);

create unique index if not exists order_settlements_order_unique on public.order_settlements(order_id);
create unique index if not exists order_settlements_payout_reference_unique on public.order_settlements(payout_reference) where payout_reference is not null;
create index if not exists idx_order_settlements_deliverer_created on public.order_settlements(deliverer_id, created_at desc);
create index if not exists idx_order_settlements_status_created on public.order_settlements(status, created_at desc);

create index if not exists idx_orders_buyer_created on public.orders(buyer_id, created_at desc);
create index if not exists idx_orders_deliverer_created on public.orders(deliverer_id, created_at desc);
create index if not exists idx_orders_status_expires on public.orders(status, state_expires_at);
create unique index if not exists orders_one_active_buyer_unique
  on public.orders(buyer_id)
  where status in ('BROADCASTED','ACCEPTED','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU');
create unique index if not exists orders_one_active_deliverer_unique
  on public.orders(deliverer_id)
  where deliverer_id is not null
    and status in ('ACCEPTED','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU');
create index if not exists idx_menu_items_canteen_available on public.menu_items(canteen_id, is_available);
create index if not exists idx_chat_messages_order_created on public.chat_messages(order_id, created_at);

-- Make updated_at correct even for admin SQL or future provider webhooks.
create or replace function public.campdeliver_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.campdeliver_set_updated_at() from public;

-- Triggers are recreated to keep the script idempotent.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles','canteens','landmarks','menu_items','orders','order_payments','order_settlements']
  loop
    execute format('drop trigger if exists campdeliver_set_updated_at on public.%I', table_name);
    execute format(
      'create trigger campdeliver_set_updated_at before update on public.%I for each row execute function public.campdeliver_set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- RLS helper. public CREATE is revoked below, so the SECURITY DEFINER search
-- path contains only trusted objects.
create or replace function public.campdeliver_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

revoke all on function public.campdeliver_is_admin() from public;
grant execute on function public.campdeliver_is_admin() to authenticated;

-- Realtime Broadcast authorization. Order topics are private. Participants may
-- join their own order channel, but live `location_update` writes are restricted
-- to the assigned deliverer (ADMIN retains the operational override).
create or replace function public.campdeliver_can_access_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    topic like 'order:%'
    and (
      exists (
        select 1
        from public.orders o
        where o.id::text = substring(topic from 7)
          and (o.buyer_id = auth.uid() or o.deliverer_id = auth.uid())
      )
      or public.campdeliver_is_admin()
    );
$$;

revoke all on function public.campdeliver_can_access_realtime_topic(text) from public;
grant execute on function public.campdeliver_can_access_realtime_topic(text) to authenticated;

create or replace function public.campdeliver_can_send_realtime_event(topic text, event_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    topic like 'order:%'
    and event_name in ('location_update', 'chat_update', 'order_update')
    and (
      public.campdeliver_is_admin()
      or exists (
        select 1
        from public.orders o
        where o.id::text = substring(topic from 7)
          and (
            o.deliverer_id = auth.uid()
            or (
              o.buyer_id = auth.uid()
              and event_name in ('chat_update', 'order_update')
            )
          )
      )
    );
$$;

revoke all on function public.campdeliver_can_send_realtime_event(text, text) from public;
grant execute on function public.campdeliver_can_send_realtime_event(text, text) to authenticated;

revoke create on schema public from public;
grant usage on schema public to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.canteens enable row level security;
alter table public.landmarks enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_settlements enable row level security;
alter table public.chat_messages enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.phone_verifications enable row level security;

-- Direct PostgREST access is intentionally narrower than the RLS policies.
-- Catalog/profile reads may be used by future clients, but sensitive order,
-- payment, settlement and chat rows stay backend-only so column data such as
-- handover OTPs and admin reconciliation references cannot be fetched directly.
-- All mutations flow through the authenticated tRPC backend, whose database
-- owner role is not FORCE-RLS.
revoke all on table public.profiles, public.canteens, public.landmarks,
  public.menu_items, public.orders, public.order_payments,
  public.order_settlements, public.chat_messages, public.wallet_transactions,
  public.phone_verifications from anon, authenticated;

grant select on table public.profiles, public.canteens, public.landmarks,
  public.menu_items to authenticated;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.campdeliver_is_admin());

drop policy if exists canteens_read_active_or_admin on public.canteens;
create policy canteens_read_active_or_admin on public.canteens
  for select to authenticated
  using (is_active or public.campdeliver_is_admin());

drop policy if exists landmarks_read_active_or_admin on public.landmarks;
create policy landmarks_read_active_or_admin on public.landmarks
  for select to authenticated
  using (is_active or public.campdeliver_is_admin());

drop policy if exists menu_items_read_active_or_admin on public.menu_items;
create policy menu_items_read_active_or_admin on public.menu_items
  for select to authenticated
  using (
    public.campdeliver_is_admin()
    or (
      is_available
      and exists (
        select 1 from public.canteens c
        where c.id = menu_items.canteen_id and c.is_active
      )
    )
  );

drop policy if exists orders_read_participant_or_admin on public.orders;
create policy orders_read_participant_or_admin on public.orders
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or deliverer_id = auth.uid()
    or public.campdeliver_is_admin()
  );

drop policy if exists order_payments_read_participant_or_admin on public.order_payments;
create policy order_payments_read_participant_or_admin on public.order_payments
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or public.campdeliver_is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_payments.order_id and o.deliverer_id = auth.uid()
    )
  );

drop policy if exists order_settlements_read_owner_or_admin on public.order_settlements;
create policy order_settlements_read_owner_or_admin on public.order_settlements
  for select to authenticated
  using (deliverer_id = auth.uid() or public.campdeliver_is_admin());

drop policy if exists chat_messages_read_participant_or_admin on public.chat_messages;
create policy chat_messages_read_participant_or_admin on public.chat_messages
  for select to authenticated
  using (
    public.campdeliver_is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = chat_messages.order_id
        and (o.buyer_id = auth.uid() or o.deliverer_id = auth.uid())
    )
  );

drop policy if exists campdeliver_order_broadcast_read on realtime.messages;
create policy campdeliver_order_broadcast_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.campdeliver_can_access_realtime_topic((select realtime.topic()))
  );

drop policy if exists campdeliver_order_broadcast_write on realtime.messages;
create policy campdeliver_order_broadcast_write on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.campdeliver_can_send_realtime_event(
      (select realtime.topic()),
      realtime.messages.event
    )
  );

-- Intentionally no policies or grants for phone_verifications and the legacy
-- wallet ledger. They are server-only even for authenticated clients.

commit;
