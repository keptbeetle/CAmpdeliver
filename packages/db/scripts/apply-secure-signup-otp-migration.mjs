import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationUrl = new URL(
  "../migrations/0003_secure_signup_otp.sql",
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
      to_regclass('public.phone_verifications') is not null as phone_verifications,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'phone_verifications'
          and column_name = 'consumed_at'
      ) as consumed_at
  `);

  return {
    phoneVerificationsTable: Boolean(row?.phone_verifications),
    consumedAtColumn: Boolean(row?.consumed_at),
  };
}

try {
  if (preflight) {
    const state = await readiness();
    console.log(
      JSON.stringify(
        {
          migrationCanApply: state.phoneVerificationsTable,
          ...state,
        },
        null,
        2,
      ),
    );
    if (!state.phoneVerificationsTable) process.exitCode = 2;
  } else {
    const before = await readiness();
    if (!before.phoneVerificationsTable) {
      throw new Error(
        "Refusing secure signup OTP migration before phone_verifications exists.",
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
        ? "Secure signup OTP migration validated and rolled back."
        : "Secure signup OTP migration applied successfully.",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
