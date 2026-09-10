import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/0002_dynamic_payment_destination.sql",
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

test("dynamic payment destination migration is transactional and additive", () => {
  assert.match(executableSql, /^begin;/);
  assert.match(executableSql, /commit;$/);
  assert.match(
    normalized,
    /alter table public\.order_payments add column if not exists destination_upi_id text, add column if not exists destination_upi_payee_name text/,
  );
  assert.match(
    normalized,
    /create table if not exists public\.platform_payment_settings/,
  );
  assert.match(
    normalized,
    /create table if not exists public\.platform_payment_settings_history/,
  );
});

test("payment destination is a singleton with an append-only history trail", () => {
  assert.match(
    normalized,
    /platform_payment_settings_singleton check \(id = 'primary'\)/,
  );
  assert.match(normalized, /platform_payment_settings_upi_id_format/);
  assert.match(
    normalized,
    /alter table public\.platform_payment_settings drop constraint if exists platform_payment_settings_singleton/,
  );
  assert.match(normalized, /order_payments_destination_pair_check/);
  assert.match(normalized, /order_payments_destination_upi_format/);
  assert.match(normalized, /destination_upi_id text/);
  assert.match(normalized, /destination_upi_payee_name text/);
  assert.match(normalized, /previous_upi_id text/);
  assert.match(normalized, /new_upi_id text not null/);
  assert.match(
    normalized,
    /changed_by_admin_id uuid references public\.profiles\(id\)/,
  );
  assert.match(normalized, /created_at timestamptz not null default now\(\)/);
});

test("payment routing settings stay backend-only under RLS", () => {
  assert.match(
    normalized,
    /alter table public\.platform_payment_settings enable row level security;/,
  );
  assert.match(
    normalized,
    /alter table public\.platform_payment_settings_history enable row level security;/,
  );
  assert.match(
    normalized,
    /revoke all on table public\.platform_payment_settings, public\.platform_payment_settings_history from anon, authenticated;/,
  );
  assert.doesNotMatch(
    normalized,
    /grant [^;]+platform_payment_settings[^;]+ to authenticated;/,
  );
  assert.doesNotMatch(
    normalized,
    /create policy [^;]+ on public\.platform_payment_settings/,
  );
});
