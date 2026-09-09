import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray, sql } from "@acme/db";
import { db } from "@acme/db/client";
import {
  orderPayments,
  orders,
  orderSettlements,
  profiles,
} from "@acme/db/schema";

import { expireStaleOrders } from "../services/order-expiry";
import {
  expiresFromNow,
  getPaymentConfig,
  normalizeTransactionReference,
} from "../services/payment-config";
import {
  canSubmitPaymentReference,
  settlementRequestDisposition,
} from "../services/payment-policy";
import { sendExpoPushNotifications } from "../services/push-notification";
import { adminProcedure, protectedProcedure } from "../trpc";

const orderIdInput = z.object({ orderId: z.string().uuid() }).strict();
const referenceSchema = z.string().trim().min(5).max(80);
const REQUESTED_SETTLEMENT_STATUSES = ["PENDING", "ON_HOLD", "FAILED"] as const;

async function notifyProfile(
  profileId: string,
  message: Omit<Parameters<typeof sendExpoPushNotifications>[0][number], "to">,
) {
  try {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
      columns: { pushToken: true },
    });
    if (!profile?.pushToken) return;
    await sendExpoPushNotifications([{ ...message, to: profile.pushToken }]);
  } catch (error) {
    console.error("[payment] Push dispatch error:", error);
  }
}

async function notifyAdmins(
  message: Omit<Parameters<typeof sendExpoPushNotifications>[0][number], "to">,
) {
  try {
    const admins = await db
      .select({ pushToken: profiles.pushToken })
      .from(profiles)
      .where(eq(profiles.role, "ADMIN"));
    const tokens = admins
      .map((admin) => admin.pushToken)
      .filter((token): token is string => Boolean(token));
    if (tokens.length === 0) return;
    await sendExpoPushNotifications([{ ...message, to: tokens }]);
  } catch (error) {
    console.error("[payment] Admin push dispatch error:", error);
  }
}

async function getAdminQueueContext() {
  const [pendingPayments, refunds, pendingSettlements] = await Promise.all([
    db
      .select()
      .from(orderPayments)
      .where(eq(orderPayments.status, "PENDING_VERIFICATION"))
      .orderBy(desc(orderPayments.submittedAt)),
    db
      .select()
      .from(orderPayments)
      .where(eq(orderPayments.status, "REFUND_REQUIRED"))
      .orderBy(desc(orderPayments.updatedAt)),
    db
      .select()
      .from(orderSettlements)
      .where(
        inArray(orderSettlements.status, [...REQUESTED_SETTLEMENT_STATUSES]),
      )
      .orderBy(desc(orderSettlements.createdAt)),
  ]);

  const hydratePayment = async (payment: (typeof pendingPayments)[number]) => {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, payment.orderId),
    });
    if (!order) return null;
    const [buyer, deliverer] = await Promise.all([
      db.query.profiles.findFirst({
        where: eq(profiles.id, order.buyerId),
        columns: { id: true, name: true },
      }),
      order.delivererId
        ? db.query.profiles.findFirst({
            where: eq(profiles.id, order.delivererId),
            columns: { id: true, name: true },
          })
        : Promise.resolve(undefined),
    ]);
    return {
      ...payment,
      order: {
        id: order.id,
        status: order.status,
        canteenName: order.canteenName,
        foodPrice: order.foodPrice,
        deliveryFee: order.deliveryFee,
        platformFee: order.platformFee,
        buyer,
        deliverer,
      },
    };
  };

  const hydrateSettlement = async (
    settlement: (typeof pendingSettlements)[number],
  ) => {
    const [order, deliverer] = await Promise.all([
      db.query.orders.findFirst({
        where: eq(orders.id, settlement.orderId),
      }),
      db.query.profiles.findFirst({
        where: eq(profiles.id, settlement.delivererId),
        columns: { id: true, name: true },
      }),
    ]);
    if (!order) return null;
    return {
      ...settlement,
      deliverer,
      order: {
        id: order.id,
        canteenName: order.canteenName,
        deliveredAt: order.deliveredAt,
      },
    };
  };

  const [paymentRows, refundRows, settlementRows] = await Promise.all([
    Promise.all(pendingPayments.map(hydratePayment)),
    Promise.all(refunds.map(hydratePayment)),
    Promise.all(pendingSettlements.map(hydrateSettlement)),
  ]);

  return {
    paymentVerifications: paymentRows.filter((row) => row !== null),
    refunds: refundRows.filter((row) => row !== null),
    settlements: settlementRows.filter((row) => row !== null),
  };
}

export const paymentRouter = {
  config: protectedProcedure.query(() => {
    const config = getPaymentConfig();
    return {
      deliveryFeePaise: config.deliveryFeePaise,
      platformFeePaise: config.platformFeePaise,
      upiId: config.upiId,
      upiPayeeName: config.upiPayeeName,
      manualVerification: true as const,
    };
  }),

  chooseMethod: protectedProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          method: z.enum(["ADVANCE", "PAY_AT_DELIVERY"]),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await expireStaleOrders();
      const config = getPaymentConfig();
      if (!config.upiId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The pilot UPI account is not configured.",
        });
      }
      const now = new Date();

      const result = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.orderId}, 0))`,
        );
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        if (order.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the buyer can select the payment method.",
          });
        }
        if (order.status !== "ITEM_AVAILABLE" || order.purchasedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment method can only be selected before purchase.",
          });
        }
        if (
          input.method === "PAY_AT_DELIVERY" &&
          !order.delivererAllowsPayAtDelivery
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This deliverer did not offer Pay at Delivery.",
          });
        }

        const [payment] = await tx
          .select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, order.id))
          .limit(1);
        if (!payment) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Payment record is missing.",
          });
        }
        if (
          payment.status !== "AWAITING_SELECTION" ||
          payment.method !== null
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment selection is already locked for this order.",
          });
        }

        await tx
          .update(orderPayments)
          .set({
            method: input.method,
            status: "AWAITING_PAYMENT",
            submittedUtr: null,
            submittedAt: null,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(eq(orderPayments.id, payment.id));
        await tx
          .update(orders)
          .set({
            stateExpiresAt: expiresFromNow(config.ttls.paymentSelection, now),
            updatedAt: now,
          })
          .where(eq(orders.id, order.id));

        return {
          success: true,
          method: input.method,
          expectedAmount: payment.expectedAmount,
        };
      });
      return result;
    }),

  submitReference: protectedProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          utrNumber: referenceSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await expireStaleOrders();
      const config = getPaymentConfig();
      const normalized = normalizeTransactionReference(input.utrNumber);
      const now = new Date();

      if (normalized.length < 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter a valid UPI transaction reference.",
        });
      }

      const result = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.orderId}, 0))`,
        );
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        if (order.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the buyer can submit a payment reference.",
          });
        }
        if (["CANCELLED", "FAILED", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This order is not accepting payments.",
          });
        }

        const [payment] = await tx
          .select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, order.id))
          .limit(1);
        if (!payment?.method) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a payment method before submitting a reference.",
          });
        }
        if (!canSubmitPaymentReference(payment.method, order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              payment.method === "ADVANCE"
                ? "Advance payment can only be submitted before purchase."
                : "Pay at Delivery can only be submitted at handover.",
          });
        }
        if (payment.status === "PAID") {
          return { success: true, alreadyVerified: true };
        }
        if (
          payment.status === "PENDING_VERIFICATION" &&
          payment.submittedUtr === normalized
        ) {
          return { success: true, alreadySubmitted: true };
        }
        if (!["AWAITING_PAYMENT", "REJECTED"].includes(payment.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A payment reference is already awaiting review.",
          });
        }

        const [duplicate] = await tx
          .select({ id: orderPayments.id })
          .from(orderPayments)
          .where(eq(orderPayments.submittedUtr, normalized))
          .limit(1);
        if (duplicate && duplicate.id !== payment.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This transaction reference has already been submitted.",
          });
        }

        await tx
          .update(orderPayments)
          .set({
            status: "PENDING_VERIFICATION",
            submittedUtr: normalized,
            submittedAt: now,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(eq(orderPayments.id, payment.id));

        if (!order.purchasedAt) {
          await tx
            .update(orders)
            .set({
              stateExpiresAt: expiresFromNow(
                config.ttls.paymentVerification,
                now,
              ),
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));
        }

        return { success: true, alreadySubmitted: false };
      });

      if ("alreadySubmitted" in result && result.alreadySubmitted === false) {
        await notifyAdmins({
          title: "Payment verification needed",
          body: "A buyer submitted a UPI transaction reference. Match it against the actual bank credit before approving.",
          data: {
            orderId: input.orderId,
            type: "ADMIN_PAYMENT_REVIEW",
            url: "/admin/payments",
          },
          sound: "default",
          priority: "high",
          channelId: "default",
        });
      }
      return result;
    }),

  earnings: protectedProcedure.query(async ({ ctx }) => {
    const settlements = await ctx.db
      .select()
      .from(orderSettlements)
      .where(eq(orderSettlements.delivererId, ctx.user.id))
      .orderBy(desc(orderSettlements.createdAt));

    return {
      lifetimeEarnings: settlements.reduce(
        (total, settlement) => total + settlement.deliveryEarning,
        0,
      ),
      paidEarnings: settlements
        .filter((settlement) => settlement.status === "PAID")
        .reduce((total, settlement) => total + settlement.deliveryEarning, 0),
      foodReimbursed: settlements
        .filter((settlement) => settlement.status === "PAID")
        .reduce((total, settlement) => total + settlement.foodReimbursement, 0),
      availableSettlementAmount: settlements
        .filter((settlement) => settlement.status === "AVAILABLE")
        .reduce((total, settlement) => total + settlement.amountDue, 0),
      pendingSettlementAmount: settlements
        .filter((settlement) =>
          REQUESTED_SETTLEMENT_STATUSES.includes(
            settlement.status as (typeof REQUESTED_SETTLEMENT_STATUSES)[number],
          ),
        )
        .reduce((total, settlement) => total + settlement.amountDue, 0),
      paidSettlementAmount: settlements
        .filter((settlement) => settlement.status === "PAID")
        .reduce((total, settlement) => total + settlement.amountDue, 0),
      availableSettlements: settlements.filter(
        (settlement) => settlement.status === "AVAILABLE",
      ).length,
      pendingSettlements: settlements.filter((settlement) =>
        REQUESTED_SETTLEMENT_STATUSES.includes(
          settlement.status as (typeof REQUESTED_SETTLEMENT_STATUSES)[number],
        ),
      ).length,
      paidSettlements: settlements.filter(
        (settlement) => settlement.status === "PAID",
      ).length,
      completedDeliveries: settlements.length,
      recent: settlements.slice(0, 20),
    };
  }),

  requestSettlement: protectedProcedure
    .input(z.object({ settlementId: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const result = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.settlementId}, 0))`,
        );
        const [settlement] = await tx
          .select()
          .from(orderSettlements)
          .where(eq(orderSettlements.id, input.settlementId))
          .limit(1);
        if (!settlement) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Settlement not found",
          });
        }
        if (settlement.delivererId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the deliverer who completed this order can request reimbursement.",
          });
        }
        const requestDisposition = settlementRequestDisposition(
          settlement.status,
        );
        if (requestDisposition === "ALREADY_PAID") {
          return {
            alreadyPaid: true,
            alreadyRequested: true,
            orderId: settlement.orderId,
          };
        }
        if (requestDisposition === "ALREADY_REQUESTED") {
          return {
            alreadyPaid: false,
            alreadyRequested: true,
            orderId: settlement.orderId,
          };
        }

        const [requested] = await tx
          .update(orderSettlements)
          .set({
            status: "PENDING",
            requestedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderSettlements.id, settlement.id),
              eq(orderSettlements.status, "AVAILABLE"),
            ),
          )
          .returning({ id: orderSettlements.id });
        if (!requested) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Settlement state changed.",
          });
        }
        return {
          alreadyPaid: false,
          alreadyRequested: false,
          orderId: settlement.orderId,
        };
      });

      if (!result.alreadyRequested) {
        await notifyAdmins({
          title: "Settlement request waiting",
          body: "A deliverer requested reimbursement. Review the completed order and send the payout from the admin finance queue.",
          data: {
            orderId: result.orderId,
            settlementId: input.settlementId,
            type: "ADMIN_SETTLEMENT_REVIEW",
            url: "/admin/payments",
          },
          sound: "default",
          priority: "high",
          channelId: "default",
        });
      }

      return { success: true, ...result };
    }),

  adminDashboard: adminProcedure.query(async () => {
    const queues = await getAdminQueueContext();
    const delivered = await db
      .select({
        platformFee: orders.platformFee,
        paymentStatus: orderPayments.status,
      })
      .from(orders)
      .leftJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .where(eq(orders.status, "DELIVERED"));

    return {
      summary: {
        pendingPaymentVerifications: queues.paymentVerifications.length,
        refundsRequired: queues.refunds.length,
        pendingSettlements: queues.settlements.length,
        pendingSettlementAmount: queues.settlements.reduce(
          (total, settlement) => total + settlement.amountDue,
          0,
        ),
        platformFeesEarned: delivered
          .filter((row) => row.paymentStatus === "PAID")
          .reduce((total, row) => total + row.platformFee, 0),
      },
      ...queues,
    };
  }),

  adminConfirmPayment: adminProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await expireStaleOrders();
      const config = getPaymentConfig();
      const now = new Date();

      const result = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.orderId}, 0))`,
        );
        const [payment] = await tx
          .select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, input.orderId))
          .limit(1);
        if (!payment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payment not found",
          });
        }
        if (payment.status === "PAID") {
          return { payment, alreadyVerified: true };
        }
        if (
          payment.status !== "PENDING_VERIFICATION" ||
          !payment.submittedUtr
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment is not awaiting verification.",
          });
        }

        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, payment.orderId))
          .limit(1);
        if (!order || order.status === "DELIVERED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The related order cannot accept payment verification.",
          });
        }

        // A payment can reach the bank just before a pre-purchase TTL or
        // deliverer cancellation fires. We still reconcile the submitted UTR;
        // a verified payment on an already-cancelled/failed order goes
        // straight to the refund queue instead of reopening the order.
        const refundRequired = ["CANCELLED", "FAILED"].includes(order.status);
        const verifiedStatus = refundRequired ? "REFUND_REQUIRED" : "PAID";

        const [updatedPayment] = await tx
          .update(orderPayments)
          .set({
            status: verifiedStatus,
            verifiedAt: now,
            verifiedByAdminId: ctx.user.id,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderPayments.id, payment.id),
              eq(orderPayments.status, "PENDING_VERIFICATION"),
            ),
          )
          .returning();
        if (!updatedPayment) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Payment state changed.",
          });
        }

        if (!order.purchasedAt && !refundRequired) {
          await tx
            .update(orders)
            .set({
              stateExpiresAt: expiresFromNow(
                config.ttls.paidAwaitingPurchase,
                now,
              ),
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));
        }

        return {
          payment: updatedPayment,
          alreadyVerified: false,
          order,
          refundRequired,
        };
      });

      const verifiedOrder = "order" in result ? result.order : undefined;
      const refundRequired =
        "refundRequired" in result ? result.refundRequired : false;
      if (!result.alreadyVerified && verifiedOrder) {
        await notifyProfile(verifiedOrder.buyerId, {
          title: refundRequired
            ? "Payment verified — refund queued"
            : "Payment verified",
          body: refundRequired
            ? "Your payment reached CAmpDeliver after this order ended. An admin refund is now required."
            : "CAmpDeliver has verified your payment.",
          data: {
            orderId: verifiedOrder.id,
            type: refundRequired ? "REFUND_REQUIRED" : "PAYMENT_VERIFIED",
            url: `/orders/${verifiedOrder.id}/status`,
          },
          sound: "default",
          priority: "high",
          channelId: "default",
        });

        if (!refundRequired && verifiedOrder.delivererId) {
          await notifyProfile(verifiedOrder.delivererId, {
            title: "Payment secured",
            body:
              result.payment.method === "ADVANCE"
                ? "Payment is verified. You may now purchase the order at the canteen."
                : "The buyer's digital payment has been verified.",
            data: {
              orderId: verifiedOrder.id,
              type: "PAYMENT_VERIFIED",
              url: `/orders/${verifiedOrder.id}/status`,
            },
            sound: "default",
            priority: "high",
            channelId: "default",
          });
        }
      }

      return {
        success: true,
        alreadyVerified: result.alreadyVerified,
        refundRequired,
      };
    }),

  adminRejectPayment: adminProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          reason: z.string().trim().min(3).max(300),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await expireStaleOrders();
      const config = getPaymentConfig();
      const now = new Date();

      const order = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.orderId}, 0))`,
        );
        const [payment] = await tx
          .select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, input.orderId))
          .limit(1);
        if (payment?.status !== "PENDING_VERIFICATION") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment is not awaiting verification.",
          });
        }
        const [relatedOrder] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, payment.orderId))
          .limit(1);
        if (!relatedOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }

        const [rejected] = await tx
          .update(orderPayments)
          .set({
            status: "REJECTED",
            rejectionReason: input.reason,
            verifiedAt: null,
            verifiedByAdminId: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderPayments.id, payment.id),
              eq(orderPayments.status, "PENDING_VERIFICATION"),
            ),
          )
          .returning({ id: orderPayments.id });
        if (!rejected) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Payment state changed while it was being reviewed.",
          });
        }
        if (
          !relatedOrder.purchasedAt &&
          relatedOrder.status === "ITEM_AVAILABLE"
        ) {
          await tx
            .update(orders)
            .set({
              stateExpiresAt: expiresFromNow(config.ttls.paymentSelection, now),
              updatedAt: now,
            })
            .where(eq(orders.id, relatedOrder.id));
        }
        return relatedOrder;
      });

      await notifyProfile(order.buyerId, {
        title: "Payment reference needs attention",
        body: input.reason,
        data: {
          orderId: order.id,
          type: "PAYMENT_REJECTED",
          url: `/orders/${order.id}/status`,
        },
        sound: "default",
        priority: "high",
        channelId: "default",
      });
      return { success: true };
    }),

  adminCompleteRefund: adminProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          refundReference: referenceSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const normalized = normalizeTransactionReference(input.refundReference);
      const now = new Date();

      const [payment] = await ctx.db
        .select()
        .from(orderPayments)
        .where(eq(orderPayments.orderId, input.orderId))
        .limit(1);
      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        });
      }
      if (payment.status === "REFUNDED") {
        if (payment.refundReference !== normalized) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This refund was already completed with another reference.",
          });
        }
        return { success: true, alreadyRefunded: true };
      }
      if (payment.status !== "REFUND_REQUIRED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment does not require a refund.",
        });
      }

      try {
        const [updated] = await ctx.db
          .update(orderPayments)
          .set({
            status: "REFUNDED",
            refundReference: normalized,
            refundedAt: now,
            refundedByAdminId: ctx.user.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderPayments.id, payment.id),
              eq(orderPayments.status, "REFUND_REQUIRED"),
            ),
          )
          .returning();
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Refund state changed.",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "CONFLICT",
          message: "That refund reference is already in use.",
        });
      }

      await notifyProfile(payment.buyerId, {
        title: "Refund completed",
        body: `Your ₹${(payment.expectedAmount / 100).toFixed(2)} refund has been marked paid.`,
        data: {
          orderId: payment.orderId,
          type: "REFUND_COMPLETED",
          url: `/orders/${payment.orderId}/status`,
        },
        sound: "default",
        priority: "high",
        channelId: "default",
      });
      return { success: true, alreadyRefunded: false };
    }),

  adminMarkSettlementPaid: adminProcedure
    .input(
      z
        .object({
          settlementId: z.string().uuid(),
          payoutReference: referenceSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const normalized = normalizeTransactionReference(input.payoutReference);
      const now = new Date();
      const [settlement] = await ctx.db
        .select()
        .from(orderSettlements)
        .where(eq(orderSettlements.id, input.settlementId))
        .limit(1);
      if (!settlement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Settlement not found",
        });
      }
      if (settlement.status === "PAID") {
        if (settlement.payoutReference !== normalized) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Settlement was already paid with another reference.",
          });
        }
        return { success: true, alreadyPaid: true };
      }

      try {
        const [updated] = await ctx.db
          .update(orderSettlements)
          .set({
            status: "PAID",
            payoutReference: normalized,
            paidAt: now,
            paidByAdminId: ctx.user.id,
            holdReason: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderSettlements.id, settlement.id),
              inArray(orderSettlements.status, [
                "PENDING",
                "ON_HOLD",
                "FAILED",
              ]),
            ),
          )
          .returning();
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Settlement state changed.",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "CONFLICT",
          message: "That payout reference is already in use.",
        });
      }

      await notifyProfile(settlement.delivererId, {
        title: "Settlement paid",
        body: `₹${(settlement.amountDue / 100).toFixed(2)} has been marked transferred by the admin.`,
        data: {
          orderId: settlement.orderId,
          type: "SETTLEMENT_PAID",
          url: "/earnings",
        },
        sound: "default",
        priority: "high",
        channelId: "default",
      });
      return { success: true, alreadyPaid: false };
    }),

  adminHoldSettlement: adminProcedure
    .input(
      z
        .object({
          settlementId: z.string().uuid(),
          reason: z.string().trim().min(3).max(300),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(orderSettlements)
        .set({
          status: "ON_HOLD",
          holdReason: input.reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orderSettlements.id, input.settlementId),
            inArray(orderSettlements.status, ["PENDING", "FAILED", "ON_HOLD"]),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This settlement cannot be put on hold.",
        });
      }

      await notifyProfile(updated.delivererId, {
        title: "Reimbursement on hold",
        body: input.reason,
        data: {
          orderId: updated.orderId,
          type: "SETTLEMENT_ON_HOLD",
          url: "/earnings",
        },
        sound: "default",
        priority: "high",
        channelId: "default",
      });
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
