begin;

alter table public.orders
  add column if not exists payment_model text,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists payment_received_at timestamptz,
  add column if not exists payment_issue_at timestamptz,
  add column if not exists payment_issue_reason text,
  add column if not exists payment_issue_resolved_at timestamptz,
  add column if not exists payment_issue_resolution text;

update public.orders
set payment_model = 'LEGACY'
where payment_model is null;

alter table public.orders
  alter column payment_model set default 'DIRECT_PAY_ON_DELIVERY',
  alter column payment_model set not null,
  alter column platform_fee set default 0;

alter table public.orders
  drop constraint if exists orders_payment_model_check,
  drop constraint if exists orders_status_check,
  drop constraint if exists orders_direct_payment_platform_fee_zero,
  drop constraint if exists orders_direct_payment_received_after_otp,
  drop constraint if exists orders_payment_issue_pair_check;

alter table public.orders
  add constraint orders_payment_model_check check (
    payment_model in ('LEGACY', 'DIRECT_PAY_ON_DELIVERY')
  ),
  add constraint orders_status_check check (
    status in (
      'BROADCASTED',
      'ACCEPTED',
      'ITEM_AVAILABLE',
      'PURCHASED',
      'ON_THE_WAY',
      'NEAR_YOU',
      'PAYMENT_DUE',
      'DELIVERED',
      'CANCELLED',
      'FAILED',
      'PREPARING',
      'COMPLETED'
    )
  ),
  add constraint orders_direct_payment_platform_fee_zero check (
    payment_model <> 'DIRECT_PAY_ON_DELIVERY' or platform_fee = 0
  ),
  add constraint orders_direct_payment_received_after_otp check (
    payment_received_at is null or otp_verified_at is not null
  ),
  add constraint orders_payment_issue_pair_check check (
    (payment_issue_at is null and payment_issue_reason is null)
    or
    (payment_issue_at is not null and payment_issue_reason is not null)
  );

drop index if exists public.orders_one_active_buyer_unique;
drop index if exists public.orders_one_active_deliverer_unique;

create unique index orders_one_active_buyer_unique
  on public.orders(buyer_id)
  where status in (
    'BROADCASTED',
    'ACCEPTED',
    'ITEM_AVAILABLE',
    'PURCHASED',
    'ON_THE_WAY',
    'NEAR_YOU',
    'PAYMENT_DUE'
  );

create unique index orders_one_active_deliverer_unique
  on public.orders(deliverer_id)
  where deliverer_id is not null
    and status in (
      'ACCEPTED',
      'ITEM_AVAILABLE',
      'PURCHASED',
      'ON_THE_WAY',
      'NEAR_YOU',
      'PAYMENT_DUE'
    );

alter table public.payment_admin_action_logs
  drop constraint if exists payment_admin_action_logs_action_check;

alter table public.payment_admin_action_logs
  add constraint payment_admin_action_logs_action_check check (
    action in (
      'PAYMENT_VERIFIED',
      'PAYMENT_REJECTED',
      'REFUND_COMPLETED',
      'SETTLEMENT_PAID',
      'SETTLEMENT_HELD',
      'DIRECT_PAYMENT_ISSUE_RESOLVED',
      'DIRECT_ORDER_COMPLETED',
      'DIRECT_ORDER_FAILED'
    )
  );

commit;
