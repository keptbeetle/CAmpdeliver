import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationUrl = new URL(
  "../migrations/0001_payment_settlement_security.sql",
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);
const checkOnly = process.argv.includes("--check");
const apply = process.argv.includes("--apply");

if (checkOnly === apply) {
  throw new Error(
    "Choose exactly one mode: --check validates inside a rolled-back transaction; --apply performs the live migration.",
  );
}

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL is required");
}

const sql = postgres(process.env.POSTGRES_URL, {
  max: 1,
  prepare: false,
});

try {
  if (apply) {
    const [active] = await sql.unsafe(`
      select count(*)::int as count
      from public.orders
      where status in ('BROADCASTED','ACCEPTED','PREPARING','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU')
    `);

    if ((active?.count ?? 0) > 0) {
      throw new Error(
        `Refusing payment migration while ${active.count} active order(s) exist. Finish or cancel them first.`,
      );
    }
  }

  const migration = await readFile(migrationPath, "utf8");
  let executable = migration;

  if (checkOnly) {
    // Live pilot data may legitimately contain multiple legacy active orders.
    // `--apply` refuses to run until all active orders are closed, so those two
    // partial unique indexes cannot be meaningfully populated during a check.
    // Skip only their creation here so the rest of the migration (including
    // RLS/Realtime policy SQL) can be validated inside the rolled-back tx.
    executable = executable
      .replace(
        /create unique index if not exists orders_one_active_buyer_unique[\s\S]*?;\s*/i,
        "",
      )
      .replace(
        /create unique index if not exists orders_one_active_deliverer_unique[\s\S]*?;\s*/i,
        "",
      )
      .replace(/commit;\s*$/i, "rollback;");

    if (executable === migration || !/rollback;\s*$/i.test(executable)) {
      throw new Error("Could not prepare migration for rolled-back check mode");
    }
  }

  await sql.unsafe(executable);
  console.log(
    checkOnly
      ? "Payment/security migration validated and rolled back."
      : "Payment/security migration applied successfully.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
