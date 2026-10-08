import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/0007_direct_pay_on_delivery.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();

test("direct pay on delivery migration is explicitly transactional", () => {
  assert.match(normalized, /^begin;/);
  assert.match(normalized, /commit;$/);
});

test("direct pay on delivery migration adds required order columns non-destructively", () => {
  assert.match(normalized, /add column if not exists payment_model text/);
  assert.match(
    normalized,
    /add column if not exists otp_verified_at timestamptz/,
  );
  assert.match(
    normalized,
    /add column if not exists payment_received_at timestamptz/,
  );
  assert.match(
    normalized,
    /add column if not exists payment_issue_at timestamptz/,
  );
  assert.match(
    normalized,
    /add column if not exists payment_issue_reason text/,
  );
  assert.match(
    normalized,
    /add column if not exists payment_issue_resolved_at timestamptz/,
  );
  assert.match(
    normalized,
    /add column if not exists payment_issue_resolution text/,
  );
});

test("existing orders default to LEGACY and new orders default to DIRECT_PAY_ON_DELIVERY with platform fee 0", () => {
  assert.match(
    normalized,
    /update public\.orders set payment_model = 'legacy' where payment_model is null/,
  );
  assert.match(
    normalized,
    /alter column payment_model set default 'direct_pay_on_delivery'/,
  );
  assert.match(normalized, /alter column payment_model set not null/);
  assert.match(normalized, /alter column platform_fee set default 0/);
});

test("direct payment model constraints enforce platform fee 0 and payment received after OTP", () => {
  assert.match(normalized, /orders_payment_model_check/);
  assert.match(
    normalized,
    /payment_model in \('legacy', 'direct_pay_on_delivery'\)/,
  );
  assert.match(normalized, /orders_status_check/);
  assert.match(normalized, /'payment_due'/);
  assert.match(normalized, /orders_direct_payment_platform_fee_zero/);
  assert.match(
    normalized,
    /payment_model <> 'direct_pay_on_delivery' or platform_fee = 0/,
  );
  assert.match(normalized, /orders_direct_payment_received_after_otp/);
  assert.match(
    normalized,
    /payment_received_at is null or otp_verified_at is not null/,
  );
});

test("active order indexes include PAYMENT_DUE state", () => {
  assert.match(
    normalized,
    /create unique index orders_one_active_buyer_unique on public\.orders\(buyer_id\) where status in \(\s*'broadcasted',\s*'accepted',\s*'item_available',\s*'purchased',\s*'on_the_way',\s*'near_you',\s*'payment_due'\s*\)/,
  );
  assert.match(
    normalized,
    /create unique index orders_one_active_deliverer_unique on public\.orders\(deliverer_id\) where deliverer_id is not null and status in \(\s*'accepted',\s*'item_available',\s*'purchased',\s*'on_the_way',\s*'near_you',\s*'payment_due'\s*\)/,
  );
});

test("admin action logs permit audited direct-order issue outcomes", () => {
  assert.match(normalized, /direct_payment_issue_resolved/);
  assert.match(normalized, /direct_order_completed/);
  assert.match(normalized, /direct_order_failed/);
});

test("direct pay migration preserves legacy data and does not weaken RLS", () => {
  assert.doesNotMatch(normalized, /drop\s+table/);
  assert.doesNotMatch(normalized, /truncate\s+/);
  assert.doesNotMatch(normalized, /disable\s+row\s+level\s+security/);
  assert.doesNotMatch(normalized, /drop\s+policy/);
  assert.doesNotMatch(
    normalized,
    /grant\s+[^;]+\s+on\s+(?:table\s+)?public\.(?:orders|order_payments|order_settlements)/,
  );
});
