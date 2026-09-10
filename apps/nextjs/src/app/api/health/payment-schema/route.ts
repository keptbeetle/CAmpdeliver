import { getPaymentSchemaReadiness } from "@acme/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await getPaymentSchemaReadiness({ fresh: true });
    return Response.json(
      {
        ok: database.ready,
        databaseReady: database.ready,
        schemaVersion: database.version,
      },
      {
        status: database.ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[payment-schema-health] readiness check failed", error);
    return Response.json(
      {
        ok: false,
        databaseReady: false,
        schemaVersion: "payment-settlement-security-v2",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
