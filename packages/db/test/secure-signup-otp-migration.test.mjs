import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/0003_secure_signup_otp.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();
const executableSql = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

test("secure signup OTP migration is transactional and additive", () => {
  assert.match(executableSql, /^begin;/);
  assert.match(executableSql, /commit;$/);
  assert.match(
    normalized,
    /alter table public\.phone_verifications add column if not exists consumed_at timestamptz/,
  );
});

test("active OTP lookup is indexed and verification state remains backend-only", () => {
  assert.match(normalized, /idx_phone_verifications_active_lookup/);
  assert.match(normalized, /where consumed_at is null/);
  assert.match(
    normalized,
    /alter table public\.phone_verifications enable row level security/,
  );
  assert.match(
    normalized,
    /revoke all on table public\.phone_verifications from anon, authenticated/,
  );
  assert.doesNotMatch(
    normalized,
    /grant [^;]+phone_verifications[^;]+ to authenticated/,
  );
});
