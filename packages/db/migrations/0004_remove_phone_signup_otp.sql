begin;

-- Signup no longer uses phone OTP. Email ownership is verified by Supabase Auth,
-- so this backend-only legacy verification table has no remaining application use.
drop table if exists public.phone_verifications;

commit;
