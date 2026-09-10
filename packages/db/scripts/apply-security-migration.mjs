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
const preflight = process.argv.includes("--preflight");

if ([checkOnly, apply, preflight].filter(Boolean).length !== 1) {
  throw new Error(
    "Choose exactly one mode: --preflight inspects readiness without changes; --check validates inside a rolled-back transaction; --apply performs the live migration.",
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
  if (preflight) {
    const activeByStatus = await sql.unsafe(`
      select status, count(*)::int as count
      from public.orders
      where status in ('BROADCASTED','ACCEPTED','PREPARING','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU')
      group by status
      order by status
    `);
    const [legacyRoles] = await sql.unsafe(`
      select count(*)::int as count
      from public.profiles
      where role = 'DELIVERER'
    `);
    const [schema] = await sql.unsafe(`
      select
        to_regclass('public.order_payments') is not null as order_payments,
        to_regclass('public.order_settlements') is not null as order_settlements,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'orders'
            and column_name = 'platform_fee'
        ) as platform_fee
    `);

    const activeOrders = activeByStatus.reduce(
      (total, row) => total + Number(row.count ?? 0),
      0,
    );

    console.log(
      JSON.stringify(
        {
          migrationCanApply: activeOrders === 0,
          activeOrders,
          activeOrdersByStatus: Object.fromEntries(
            activeByStatus.map((row) => [row.status, Number(row.count ?? 0)]),
          ),
          legacyDelivererProfiles: Number(legacyRoles?.count ?? 0),
          paymentSchema: {
            platformFeeColumn: Boolean(schema?.platform_fee),
            orderPaymentsTable: Boolean(schema?.order_payments),
            orderSettlementsTable: Boolean(schema?.order_settlements),
          },
        },
        null,
        2,
      ),
    );
  } else {
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
        throw new Error(
          "Could not prepare migration for rolled-back check mode",
        );
      }
    }

    await sql.unsafe(executable);
    console.log(
      checkOnly
        ? "Payment/security migration validated and rolled back."
        : "Payment/security migration applied successfully.",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
