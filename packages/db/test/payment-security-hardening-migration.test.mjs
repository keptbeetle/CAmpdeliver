import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/0005_payment_security_hardening.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();

test("payment security hardening migration is transactional", () => {
  assert.match(normalized, /^begin;/);
  assert.match(normalized, /commit;$/);
});

test("transaction references are constrained at the database boundary", () => {
  assert.match(normalized, /order_payments_submitted_utr_format/);
  assert.match(normalized, /order_payments_refund_reference_format/);
  assert.match(normalized, /order_settlements_payout_reference_format/);
  assert.match(normalized, /\^\[a-z0-9\]\[a-z0-9\._\/-\]\{4,79\}\$/);
});

test("rejected UTRs are not globally reserved while active money states stay unique", () => {
  assert.match(
    normalized,
    /drop index if exists public\.order_payments_utr_unique/,
  );
  assert.match(
    normalized,
    /create unique index order_payments_utr_unique on public\.order_payments\(submitted_utr\) where submitted_utr is not null and status in \('pending_verification','paid','refund_required','refunded'\)/,
  );
  assert.doesNotMatch(normalized, /order_payments_utr_unique[^;]+rejected/);
});

test("admin financial actions are stored in a backend-only audit table", () => {
  assert.match(
    normalized,
    /create table if not exists public\.payment_admin_action_logs/,
  );
  assert.match(
    normalized,
    /alter table public\.payment_admin_action_logs enable row level security;/,
  );
  assert.match(
    normalized,
    /revoke all on table public\.payment_admin_action_logs from anon, authenticated;/,
  );
  assert.doesNotMatch(
    normalized,
    /grant [^;]+payment_admin_action_logs[^;]+ to authenticated;/,
  );
});

test("financial audit history is append-only", () => {
  assert.match(
    normalized,
    /create trigger payment_admin_action_logs_append_only before update or delete on public\.payment_admin_action_logs/,
  );
  assert.match(
    normalized,
    /create trigger platform_payment_settings_history_append_only before update or delete on public\.platform_payment_settings_history/,
  );
});
