import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationPath = fileURLToPath(
  new URL("../migrations/0004_remove_phone_signup_otp.sql", import.meta.url),
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
  const [tableState] = await sql.unsafe(`
    select to_regclass('public.phone_verifications') is not null as exists
  `);
  const phoneVerificationsTable = Boolean(tableState?.exists);
  if (!phoneVerificationsTable) {
    return { phoneVerificationsTable: false, rowCount: 0 };
  }

  const [row] = await sql.unsafe(
    "select count(*)::int as row_count from public.phone_verifications",
  );
  return {
    phoneVerificationsTable: true,
    rowCount: Number(row?.row_count ?? 0),
  };
}

try {
  const before = await readiness();
  if (preflight) {
    console.log(
      JSON.stringify(
        {
          migrationCanApply: before.rowCount === 0,
          ...before,
        },
        null,
        2,
      ),
    );
    if (before.rowCount !== 0) process.exitCode = 2;
  } else {
    if (before.rowCount !== 0) {
      throw new Error(
        "Refusing to remove legacy phone verification storage while rows remain.",
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
        ? "Email-auth cleanup migration validated and rolled back."
        : "Email-auth cleanup migration applied successfully.",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
