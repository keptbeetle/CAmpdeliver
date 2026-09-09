import { and, eq, inArray, lte, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { orderPayments, orders } from "@acme/db/schema";

import { prePurchaseCancellationDisposition } from "./payment-policy";

const EXPIRABLE_ORDER_STATUSES = [
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
] as const;

/**
 * Cancels pre-purchase orders whose server-side state deadline elapsed.
 * Purchased/on-route orders are deliberately excluded: after a deliverer has
 * spent real money, the order requires fulfilment or an admin dispute rather
 * than an automatic cancellation.
 */
export async function expireStaleOrders(now = new Date()) {
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.status, [...EXPIRABLE_ORDER_STATUSES]),
        lte(orders.stateExpiresAt, now),
      ),
    );

  let expired = 0;
  let refundsRequired = 0;

  for (const candidate of candidates) {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${candidate.id}, 0))`,
      );
      const [current] = await tx
        .select({
          id: orders.id,
          status: orders.status,
          stateExpiresAt: orders.stateExpiresAt,
        })
        .from(orders)
        .where(eq(orders.id, candidate.id))
        .limit(1);

      if (
        !current?.stateExpiresAt ||
        current.stateExpiresAt.getTime() > now.getTime() ||
        !EXPIRABLE_ORDER_STATUSES.includes(
          current.status as (typeof EXPIRABLE_ORDER_STATUSES)[number],
        )
      ) {
        return { expired: false, refundRequired: false };
      }

      const [payment] = await tx
        .select({ status: orderPayments.status })
        .from(orderPayments)
        .where(eq(orderPayments.orderId, current.id))
        .limit(1);

      const paymentDisposition = prePurchaseCancellationDisposition(
        payment?.status ?? null,
      );
      const refundRequired = paymentDisposition === "REFUND_REQUIRED";
      if (payment && paymentDisposition === "REFUND_REQUIRED") {
        await tx
          .update(orderPayments)
          .set({
            status: "REFUND_REQUIRED",
            updatedAt: now,
          })
          .where(eq(orderPayments.orderId, current.id));
      } else if (payment && paymentDisposition === "REJECTED") {
        // A submitted payment reference may represent real money that already
        // reached the pilot UPI account. Keep PENDING_VERIFICATION intact even
        // though the order expires so an admin can verify it and queue a
        // refund instead of silently discarding that reconciliation work.
        await tx
          .update(orderPayments)
          .set({
            status: "REJECTED",
            rejectionReason: "Order expired before payment was submitted.",
            updatedAt: now,
          })
          .where(eq(orderPayments.orderId, current.id));
      }

      await tx
        .update(orders)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          cancelledBy: "SYSTEM",
          cancellationReason: refundRequired
            ? "Order timed out after payment was secured and before purchase."
            : "Order timed out before purchase.",
          stateExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(orders.id, current.id));

      return { expired: true, refundRequired };
    });

    if (result.expired) expired += 1;
    if (result.refundRequired) refundsRequired += 1;
  }

  return { expired, refundsRequired };
}
