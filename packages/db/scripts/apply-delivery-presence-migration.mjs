import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationPath = fileURLToPath(
  new URL("../migrations/0006_delivery_presence.sql", import.meta.url),
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
      to_regclass('public.profiles') is not null as profiles_ready,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = 'delivery_presence_latitude'
      ) as latitude_ready,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = 'delivery_presence_longitude'
      ) as longitude_ready,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = 'delivery_presence_updated_at'
      ) as updated_at_ready,
      exists (
        select 1 from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'profiles'
          and c.conname = 'profiles_delivery_presence_pair_check'
      ) as pair_check_ready,
      exists (
        select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'profiles'
          and indexname = 'idx_profiles_delivery_presence_updated'
      ) as index_ready
  `);
  const migrationReady = Boolean(
    row?.latitude_ready &&
      row?.longitude_ready &&
      row?.updated_at_ready &&
      row?.pair_check_ready &&
      row?.index_ready,
  );
  return {
    profilesReady: Boolean(row?.profiles_ready),
    migrationReady,
    latitudeReady: Boolean(row?.latitude_ready),
    longitudeReady: Boolean(row?.longitude_ready),
    updatedAtReady: Boolean(row?.updated_at_ready),
    pairCheckReady: Boolean(row?.pair_check_ready),
    indexReady: Boolean(row?.index_ready),
  };
}

try {
  if (preflight) {
    console.log(JSON.stringify(await readiness(), null, 2));
  } else {
    const before = await readiness();
    if (!before.profilesReady) throw new Error("profiles table is missing");
    const migration = await readFile(migrationPath, "utf8");
    const executable = checkOnly
      ? migration.replace(/commit;\s*$/i, "rollback;")
      : migration;
    await sql.unsafe(executable);
    if (apply) {
      const after = await readiness();
      if (!after.migrationReady) {
        throw new Error(
          "Delivery presence migration is incomplete after apply",
        );
      }
      console.log(JSON.stringify(after, null, 2));
    } else {
      console.log("Delivery presence migration validated and rolled back.");
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
