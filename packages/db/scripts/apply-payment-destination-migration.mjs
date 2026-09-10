import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationUrl = new URL(
  "../migrations/0002_dynamic_payment_destination.sql",
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);
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
      to_regclass('public.order_payments') is not null as base_payment_schema,
      to_regclass('public.platform_payment_settings') is not null as settings_table,
      to_regclass('public.platform_payment_settings_history') is not null as history_table,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'order_payments'
          and column_name = 'destination_upi_id'
      ) as destination_upi_id,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'order_payments'
          and column_name = 'destination_upi_payee_name'
      ) as destination_upi_payee_name
  `);
  return {
    basePaymentSchemaReady: Boolean(row?.base_payment_schema),
    settingsTable: Boolean(row?.settings_table),
    historyTable: Boolean(row?.history_table),
    paymentDestinationColumns:
      Boolean(row?.destination_upi_id) &&
      Boolean(row?.destination_upi_payee_name),
  };
}

try {
  if (preflight) {
    const state = await readiness();
    console.log(
      JSON.stringify(
        { migrationCanApply: state.basePaymentSchemaReady, ...state },
        null,
        2,
      ),
    );
    if (!state.basePaymentSchemaReady) process.exitCode = 2;
  } else {
    const before = await readiness();
    if (!before.basePaymentSchemaReady) {
      throw new Error(
        "Refusing payment-destination migration before the base payment schema is installed.",
      );
    }
    const migration = await readFile(migrationPath, "utf8");
    const executable = checkOnly
      ? migration.replace(/commit;\s*$/i, "rollback;")
      : migration;
    if (checkOnly && !/rollback;\s*$/i.test(executable)) {
      throw new Error("Could not prepare migration for rolled-back check mode");
    }
    await sql.unsafe(executable);
    console.log(
      checkOnly
        ? "Dynamic payment-destination migration validated and rolled back."
        : "Dynamic payment-destination migration applied successfully.",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
