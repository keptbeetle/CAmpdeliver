import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/0001_payment_settlement_security.sql",
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

test("security migration is explicitly transactional", () => {
  assert.match(executableSql, /^begin;/);
  assert.match(executableSql, /commit;$/);
});

test("legacy role and order-status constraints are replaced with the new state model", () => {
  assert.match(normalized, /drop constraint if exists profiles_role_check/);
  assert.match(normalized, /check \(role in \('student','admin'\)\)/);
  assert.match(normalized, /drop constraint if exists orders_status_check/);
  assert.match(normalized, /'item_available'/);
  assert.match(normalized, /'purchased'/);
  assert.match(normalized, /'delivered'/);
});

test("database prevents duplicate simultaneous buyer and deliverer work", () => {
  assert.match(
    normalized,
    /create unique index if not exists orders_one_active_buyer_unique on public\.orders\(buyer_id\) where status in \('broadcasted','accepted','item_available','purchased','on_the_way','near_you'\)/,
  );
  assert.match(
    normalized,
    /create unique index if not exists orders_one_active_deliverer_unique on public\.orders\(deliverer_id\) where deliverer_id is not null and status in \('accepted','item_available','purchased','on_the_way','near_you'\)/,
  );
});

test("financial tables enforce one payment and one settlement per order", () => {
  assert.match(
    normalized,
    /create unique index if not exists order_payments_order_unique on public\.order_payments\(order_id\)/,
  );
  assert.match(
    normalized,
    /create unique index if not exists order_settlements_order_unique on public\.order_settlements\(order_id\)/,
  );
  assert.match(normalized, /order_settlements_amount_matches/);
  assert.match(
    normalized,
    /amount_due = food_reimbursement \+ delivery_earning/,
  );
  assert.match(normalized, /status text not null default 'available'/);
  assert.match(normalized, /requested_at timestamptz/);
  assert.match(normalized, /'available','pending','paid','on_hold','failed'/);
});

test("authenticated PostgREST access cannot directly mutate or read sensitive payment/order tables", () => {
  assert.match(
    normalized,
    /revoke all on table public\.profiles, public\.canteens, public\.landmarks, public\.menu_items, public\.orders, public\.order_payments, public\.order_settlements, public\.chat_messages, public\.wallet_transactions, public\.phone_verifications from anon, authenticated;/,
  );
  assert.match(
    normalized,
    /grant select on table public\.profiles, public\.canteens, public\.landmarks, public\.menu_items to authenticated;/,
  );
  assert.doesNotMatch(
    normalized,
    /grant (?:select|insert|update|delete|all)[^;]*public\.order_payments[^;]* to authenticated;/,
  );
  assert.doesNotMatch(
    normalized,
    /grant (?:select|insert|update|delete|all)[^;]*public\.orders[^;]* to authenticated;/,
  );
});

test("RLS is enabled on user, order, finance, chat, wallet, and OTP tables", () => {
  for (const table of [
    "profiles",
    "canteens",
    "landmarks",
    "menu_items",
    "orders",
    "order_payments",
    "order_settlements",
    "chat_messages",
    "wallet_transactions",
    "phone_verifications",
  ]) {
    assert.match(
      normalized,
      new RegExp(`alter table public\\.${table} enable row level security;`),
    );
  }
});

test("OTP brute-force counters are persisted with nonnegative constraints", () => {
  assert.match(
    normalized,
    /add column if not exists failed_attempts integer not null default 0/,
  );
  assert.match(
    normalized,
    /add column if not exists delivery_otp_failed_attempts integer not null default 0/,
  );
  assert.match(normalized, /phone_verifications_failed_attempts_nonnegative/);
  assert.match(normalized, /orders_delivery_otp_failed_attempts_nonnegative/);
});

test("private order Realtime broadcasts are participant-authorized", () => {
  assert.match(
    normalized,
    /create or replace function public\.campdeliver_can_access_realtime_topic\(topic text\)/,
  );
  assert.match(normalized, /topic like 'order:%'/);
  assert.match(
    normalized,
    /o\.buyer_id = auth\.uid\(\) or o\.deliverer_id = auth\.uid\(\)/,
  );
  assert.match(
    normalized,
    /create policy campdeliver_order_broadcast_read on realtime\.messages for select to authenticated/,
  );
  assert.match(
    normalized,
    /create or replace function public\.campdeliver_can_send_realtime_event\(topic text, event_name text\)/,
  );
  assert.match(
    normalized,
    /event_name in \('location_update', 'chat_update', 'order_update'\)/,
  );
  assert.match(
    normalized,
    /o\.buyer_id = auth\.uid\(\) and event_name in \('chat_update', 'order_update'\)/,
  );
  assert.match(
    normalized,
    /create policy campdeliver_order_broadcast_write on realtime\.messages for insert to authenticated/,
  );
  assert.match(
    normalized,
    /campdeliver_can_send_realtime_event\( \(select realtime\.topic\(\)\), realtime\.messages\.event \)/,
  );
  assert.match(normalized, /realtime\.messages\.extension = 'broadcast'/);
});

test("legacy wallet access receives no authenticated policy or grant", () => {
  assert.doesNotMatch(
    normalized,
    /create policy [^;]+ on public\.wallet_transactions/,
  );
  assert.doesNotMatch(
    normalized,
    /grant [^;]+ on table [^;]*public\.wallet_transactions[^;]* to authenticated;/,
  );
});
