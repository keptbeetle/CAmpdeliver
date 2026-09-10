import { sql } from "@acme/db";
import { db } from "@acme/db/client";

const REQUIRED_ORDER_COLUMNS = [
  "platform_fee",
  "deliverer_allows_pay_at_delivery",
  "state_expires_at",
  "accepted_at",
  "items_available_at",
  "purchased_at",
  "delivered_at",
  "delivery_otp_failed_attempts",
  "delivery_otp_locked_until",
  "cancelled_at",
  "cancelled_by",
  "cancellation_reason",
] as const;

const READINESS_CACHE_MS = 10_000;

export interface PaymentSchemaReadiness {
  ready: boolean;
  missing: string[];
  version: "payment-settlement-security-v2";
}

let cachedReadiness:
  | { value: PaymentSchemaReadiness; expiresAt: number }
  | undefined;
let inFlightReadiness: Promise<PaymentSchemaReadiness> | undefined;

async function loadPaymentSchemaReadiness(): Promise<PaymentSchemaReadiness> {
  const rows = await db.execute(sql`
    select
      to_regclass('public.order_payments') is not null as order_payments,
      to_regclass('public.order_settlements') is not null as order_settlements,
      to_regclass('public.platform_payment_settings') is not null as platform_payment_settings,
      to_regclass('public.platform_payment_settings_history') is not null as platform_payment_settings_history,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'order_payments'
          and column_name = 'destination_upi_id'
      ) as payment_destination_upi_id,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'order_payments'
          and column_name = 'destination_upi_payee_name'
      ) as payment_destination_upi_payee_name,
      coalesce((
        select array_agg(required.column_name order by required.column_name)
        from unnest(array[${sql.join(
          REQUIRED_ORDER_COLUMNS.map((column) => sql`${column}`),
          sql`, `,
        )}]::text[]) as required(column_name)
        where not exists (
          select 1
          from information_schema.columns actual
          where actual.table_schema = 'public'
            and actual.table_name = 'orders'
            and actual.column_name = required.column_name
        )
      ), array[]::text[]) as missing_order_columns
  `);

  const row = rows[0] as
    | {
        order_payments?: boolean;
        order_settlements?: boolean;
        platform_payment_settings?: boolean;
        platform_payment_settings_history?: boolean;
        payment_destination_upi_id?: boolean;
        payment_destination_upi_payee_name?: boolean;
        missing_order_columns?: string[];
      }
    | undefined;

  const missing = [...(row?.missing_order_columns ?? [])].map(
    (column) => `orders.${column}`,
  );
  if (!row?.order_payments) missing.push("order_payments");
  if (!row?.order_settlements) missing.push("order_settlements");
  if (!row?.platform_payment_settings)
    missing.push("platform_payment_settings");
  if (!row?.platform_payment_settings_history)
    missing.push("platform_payment_settings_history");
  if (!row?.payment_destination_upi_id)
    missing.push("order_payments.destination_upi_id");
  if (!row?.payment_destination_upi_payee_name)
    missing.push("order_payments.destination_upi_payee_name");

  return {
    ready: missing.length === 0,
    missing,
    version: "payment-settlement-security-v2",
  };
}

export async function getPaymentSchemaReadiness(options?: {
  fresh?: boolean;
}): Promise<PaymentSchemaReadiness> {
  const now = Date.now();
  if (!options?.fresh && cachedReadiness && cachedReadiness.expiresAt > now) {
    return cachedReadiness.value;
  }

  if (!options?.fresh && inFlightReadiness) return inFlightReadiness;

  const request = loadPaymentSchemaReadiness();
  if (!options?.fresh) inFlightReadiness = request;

  try {
    const value = await request;
    cachedReadiness = { value, expiresAt: Date.now() + READINESS_CACHE_MS };
    return value;
  } finally {
    if (inFlightReadiness === request) inFlightReadiness = undefined;
  }
}
