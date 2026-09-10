begin;

alter table public.phone_verifications
  add column if not exists consumed_at timestamptz;

create index if not exists idx_phone_verifications_active_lookup
  on public.phone_verifications(phone_number, created_at desc)
  where consumed_at is null;

-- Signup verification state remains backend-only. Existing RLS and grants from
-- the security migration continue to protect this table and the new column.
alter table public.phone_verifications enable row level security;
revoke all on table public.phone_verifications from anon, authenticated;

commit;
