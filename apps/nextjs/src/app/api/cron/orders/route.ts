import { expireStaleOrders } from "@acme/api";

import { env } from "~/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("[order-expiry-cron] CRON_SECRET is not configured");
    return Response.json({ error: "Cron is not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await expireStaleOrders();
  return Response.json({ ok: true, ...result });
}
