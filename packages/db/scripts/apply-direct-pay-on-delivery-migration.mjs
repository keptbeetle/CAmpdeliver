import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationPath = fileURLToPath(
  new URL("../migrations/0007_direct_pay_on_delivery.sql", import.meta.url),
);
const checkOnly = process.argv.includes("--check");
const apply = process.argv.includes("--apply");
const preflight = process.argv.includes("--preflight");

if ([checkOnly, apply, preflight].filter(Boolean).length !== 1) {
  throw new Error("Choose exactly one mode: --preflight, --check, or --apply.");
}
if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required");

const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false });

async function readiness() {
  const [row] = await sql.unsafe(`
    select
      to_regclass('public.orders') is not null as orders_ready,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'orders'
          and column_name = 'payment_model'
      ) as payment_model_ready,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'orders'
          and column_name = 'otp_verified_at'
      ) as otp_verified_at_ready,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'orders'
          and column_name = 'payment_received_at'
      ) as payment_received_at_ready,
      exists (
        select 1 from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'orders'
          and c.conname = 'orders_payment_model_check'
      ) as payment_model_check_ready,
      exists (
        select 1 from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'orders'
          and c.conname = 'orders_status_check'
          and pg_get_constraintdef(c.oid) ilike '%PAYMENT_DUE%'
      ) as status_check_ready,
      exists (
        select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'orders'
          and indexname = 'orders_one_active_buyer_unique'
          and indexdef ilike '%PAYMENT_DUE%'
      ) as buyer_unique_ready,
      exists (
        select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'orders'
          and indexname = 'orders_one_active_deliverer_unique'
          and indexdef ilike '%PAYMENT_DUE%'
      ) as deliverer_unique_ready,
      exists (
        select 1 from pg_constraint
        where conname = 'payment_admin_action_logs_action_check'
          and conrelid = to_regclass('public.payment_admin_action_logs')
          and pg_get_constraintdef(oid) ilike '%DIRECT_ORDER_COMPLETED%'
          and pg_get_constraintdef(oid) ilike '%DIRECT_ORDER_FAILED%'
      ) as direct_admin_outcomes_ready
  `);

  const migrationReady = Boolean(
    row?.payment_model_ready &&
      row?.otp_verified_at_ready &&
      row?.payment_received_at_ready &&
      row?.payment_model_check_ready &&
      row?.status_check_ready &&
      row?.buyer_unique_ready &&
      row?.deliverer_unique_ready &&
      row?.direct_admin_outcomes_ready,
  );

  return {
    ordersReady: Boolean(row?.orders_ready),
    migrationReady,
    paymentModelReady: Boolean(row?.payment_model_ready),
    otpVerifiedAtReady: Boolean(row?.otp_verified_at_ready),
    paymentReceivedAtReady: Boolean(row?.payment_received_at_ready),
    paymentModelCheckReady: Boolean(row?.payment_model_check_ready),
    statusCheckReady: Boolean(row?.status_check_ready),
    buyerUniqueReady: Boolean(row?.buyer_unique_ready),
    delivererUniqueReady: Boolean(row?.deliverer_unique_ready),
    directAdminOutcomesReady: Boolean(row?.direct_admin_outcomes_ready),
  };
}

try {
  if (preflight) {
    console.log(JSON.stringify(await readiness(), null, 2));
  } else {
    const before = await readiness();
    if (!before.ordersReady) throw new Error("orders table is missing");
    const migration = await readFile(migrationPath, "utf8");
    const executable = checkOnly
      ? migration.replace(/commit;\s*$/i, "rollback;")
      : migration;
    await sql.unsafe(executable);
    if (apply) {
      const after = await readiness();
      if (!after.migrationReady) {
        throw new Error(
          "Direct pay on delivery migration is incomplete after apply",
        );
      }
      console.log(JSON.stringify(after, null, 2));
    } else {
      console.log(
        "Direct pay on delivery migration validated and rolled back.",
      );
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
