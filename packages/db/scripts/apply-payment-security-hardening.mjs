import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationUrl = new URL(
  "../migrations/0005_payment_security_hardening.sql",
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
      to_regclass('public.order_payments') is not null as payments,
      to_regclass('public.order_settlements') is not null as settlements,
      to_regclass('public.platform_payment_settings_history') is not null as settings_history,
      to_regclass('public.payment_admin_action_logs') is not null as audit_log,
      exists (
        select 1 from pg_constraint
        where conname = 'order_payments_submitted_utr_format'
          and conrelid = to_regclass('public.order_payments')
      ) as payment_utr_constraint,
      exists (
        select 1 from pg_constraint
        where conname = 'order_payments_refund_reference_format'
          and conrelid = to_regclass('public.order_payments')
      ) as refund_reference_constraint,
      exists (
        select 1 from pg_constraint
        where conname = 'order_settlements_payout_reference_format'
          and conrelid = to_regclass('public.order_settlements')
      ) as payout_reference_constraint,
      exists (
        select 1 from pg_indexes
        where schemaname = 'public'
          and tablename = 'order_payments'
          and indexname = 'order_payments_utr_unique'
          and indexdef ilike '%PENDING_VERIFICATION%'
          and indexdef ilike '%PAID%'
          and indexdef ilike '%REFUND_REQUIRED%'
          and indexdef ilike '%REFUNDED%'
          and indexdef not ilike '%REJECTED%'
      ) as payment_utr_unique_active_only,
      coalesce((
        select relrowsecurity from pg_class
        where oid = to_regclass('public.payment_admin_action_logs')
      ), false) as audit_log_rls,
      exists (
        select 1 from pg_trigger
        where not tgisinternal
          and tgname = 'payment_admin_action_logs_append_only'
          and tgrelid = to_regclass('public.payment_admin_action_logs')
      ) as audit_log_append_only,
      exists (
        select 1 from pg_trigger
        where not tgisinternal
          and tgname = 'platform_payment_settings_history_append_only'
          and tgrelid = to_regclass('public.platform_payment_settings_history')
      ) as payment_settings_history_append_only,
      case
        when to_regclass('public.payment_admin_action_logs') is null then false
        else not has_table_privilege(
          'authenticated',
          to_regclass('public.payment_admin_action_logs'),
          'SELECT'
        )
      end as authenticated_select_revoked,
      case
        when to_regclass('public.payment_admin_action_logs') is null then false
        else not has_table_privilege(
          'anon',
          to_regclass('public.payment_admin_action_logs'),
          'SELECT'
        )
      end as anon_select_revoked
  `);
  const basePaymentSchemaReady =
    Boolean(row?.payments) &&
    Boolean(row?.settlements) &&
    Boolean(row?.settings_history);
  const hardeningReady =
    Boolean(row?.audit_log) &&
    Boolean(row?.payment_utr_constraint) &&
    Boolean(row?.refund_reference_constraint) &&
    Boolean(row?.payout_reference_constraint) &&
    Boolean(row?.payment_utr_unique_active_only) &&
    Boolean(row?.audit_log_rls) &&
    Boolean(row?.audit_log_append_only) &&
    Boolean(row?.payment_settings_history_append_only) &&
    Boolean(row?.authenticated_select_revoked) &&
    Boolean(row?.anon_select_revoked);
  return {
    basePaymentSchemaReady,
    hardeningReady,
    auditLogReady: Boolean(row?.audit_log),
    referenceConstraintsReady:
      Boolean(row?.payment_utr_constraint) &&
      Boolean(row?.refund_reference_constraint) &&
      Boolean(row?.payout_reference_constraint),
    activeReferenceUniquenessReady: Boolean(
      row?.payment_utr_unique_active_only,
    ),
    auditRlsReady: Boolean(row?.audit_log_rls),
    appendOnlyReady:
      Boolean(row?.audit_log_append_only) &&
      Boolean(row?.payment_settings_history_append_only),
    directClientReadRevoked:
      Boolean(row?.authenticated_select_revoked) &&
      Boolean(row?.anon_select_revoked),
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
        "Refusing payment security hardening before the base payment schema is installed.",
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
    if (apply) {
      const after = await readiness();
      if (!after.hardeningReady) {
        throw new Error(
          "Payment security hardening migration committed but required security artifacts are incomplete.",
        );
      }
    }
    console.log(
      checkOnly
        ? "Payment security hardening migration validated and rolled back."
        : "Payment security hardening migration applied and verified successfully.",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
