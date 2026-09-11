begin;

alter table public.order_payments
  drop constraint if exists order_payments_submitted_utr_format,
  drop constraint if exists order_payments_refund_reference_format;

alter table public.order_payments
  add constraint order_payments_submitted_utr_format check (
    submitted_utr is null
    or (char_length(submitted_utr) between 5 and 80 and submitted_utr ~ '^[A-Z0-9][A-Z0-9._/-]{4,79}$')
  ),
  add constraint order_payments_refund_reference_format check (
    refund_reference is null
    or (char_length(refund_reference) between 5 and 80 and refund_reference ~ '^[A-Z0-9][A-Z0-9._/-]{4,79}$')
  );

drop index if exists public.order_payments_utr_unique;
create unique index order_payments_utr_unique
  on public.order_payments(submitted_utr)
  where submitted_utr is not null
    and status in ('PENDING_VERIFICATION','PAID','REFUND_REQUIRED','REFUNDED');

alter table public.order_settlements
  drop constraint if exists order_settlements_payout_reference_format;

alter table public.order_settlements
  add constraint order_settlements_payout_reference_format check (
    payout_reference is null
    or (char_length(payout_reference) between 5 and 80 and payout_reference ~ '^[A-Z0-9][A-Z0-9._/-]{4,79}$')
  );

create table if not exists public.payment_admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  order_id uuid not null,
  payment_id uuid,
  settlement_id uuid,
  from_state text,
  to_state text not null,
  created_at timestamptz not null default now(),
  constraint payment_admin_action_logs_action_check check (
    action in ('PAYMENT_VERIFIED','PAYMENT_REJECTED','REFUND_COMPLETED','SETTLEMENT_PAID','SETTLEMENT_HELD')
  ),
  constraint payment_admin_action_logs_state_length check (
    (from_state is null or char_length(from_state) between 1 and 40)
    and char_length(to_state) between 1 and 40
  )
);

create index if not exists idx_payment_admin_action_logs_order_created
  on public.payment_admin_action_logs(order_id, created_at desc);
create index if not exists idx_payment_admin_action_logs_admin_created
  on public.payment_admin_action_logs(admin_id, created_at desc);

alter table public.payment_admin_action_logs enable row level security;
revoke all on table public.payment_admin_action_logs from anon, authenticated;

create or replace function public.campdeliver_reject_financial_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial audit records are append-only';
end;
$$;

revoke all on function public.campdeliver_reject_financial_audit_mutation() from public;
revoke all on function public.campdeliver_reject_financial_audit_mutation() from anon, authenticated;

drop trigger if exists payment_admin_action_logs_append_only
  on public.payment_admin_action_logs;
create trigger payment_admin_action_logs_append_only
before update or delete on public.payment_admin_action_logs
for each row execute function public.campdeliver_reject_financial_audit_mutation();

drop trigger if exists platform_payment_settings_history_append_only
  on public.platform_payment_settings_history;
create trigger platform_payment_settings_history_append_only
before update or delete on public.platform_payment_settings_history
for each row execute function public.campdeliver_reject_financial_audit_mutation();

commit;
