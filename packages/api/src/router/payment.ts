import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray, sql } from "@acme/db";
import { db } from "@acme/db/client";
import {
  orderPayments,
  orders,
  orderSettlements,
  paymentAdminActionLogs,
  platformPaymentSettings,
  platformPaymentSettingsHistory,
  profiles,
} from "@acme/db/schema";

import { expireStaleOrders } from "../services/order-expiry";
import {
  expiresFromNow,
  getPaymentConfig,
  isValidTransactionReference,
  isValidUpiId,
  maskTransactionReference,
  normalizeTransactionReference,
  normalizeUpiId,
  normalizeUpiPayeeName,
} from "../services/payment-config";
import {
  DEFAULT_UPI_PAYEE_NAME,
  getPaymentDestination,
  getPaymentDestinationHistory,
  PAYMENT_SETTINGS_ID,
} from "../services/payment-destination";
import {
  canSubmitPaymentReference,
  settlementRequestDisposition,
} from "../services/payment-policy";
import { getPaymentSchemaReadiness } from "../services/payment-schema-readiness";
import { hasAdminFinancialConflict } from "../services/payment-security";
import { sendExpoPushNotifications } from "../services/push-notification";
import { adminProcedure, protectedProcedure } from "../trpc";

const orderIdInput = z.object({ orderId: z.string().uuid() }).strict();
const referenceSchema = z
  .string()
  .trim()
  .min(5)
  .max(80)
  .transform(normalizeTransactionReference)
  .refine(
    isValidTransactionReference,
    "Use only letters, numbers, dots, dashes, underscores, or slashes in the transaction reference.",
  );
const paymentDestinationInput = z
  .object({
    upiId: z
      .string()
      .trim()
      .min(5)
      .max(100)
      .transform(normalizeUpiId)
      .refine(isValidUpiId, "Enter a valid UPI ID such as name@bank."),
    upiPayeeName: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform(normalizeUpiPayeeName),
  })
  .strict();
const REQUESTED_SETTLEMENT_STATUSES = ["PENDING", "ON_HOLD", "FAILED"] as const;

function assertAdminCanReconcileOrder(
  adminId: string,
  order: { buyerId: string; delivererId: string | null },
) {
  if (hasAdminFinancialConflict(adminId, order.buyerId, order.delivererId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Another administrator must handle financial actions for an order where you are the buyer or deliverer.",
    });
  }
}

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function requirePaymentSchemaReady() {
  const database = await getPaymentSchemaReadiness();
  if (!database.ready) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "CAmpDeliver payments are being upgraded on the server. Payment, refund, and settlement actions are temporarily unavailable.",
    });
  }
}

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

async function getAdminQueueContext(adminId: string) {
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
      conflictOfInterest: hasAdminFinancialConflict(
        adminId,
        order.buyerId,
        order.delivererId,
      ),
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
      conflictOfInterest: hasAdminFinancialConflict(
        adminId,
        order.buyerId,
        settlement.delivererId,
      ),
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
  config: protectedProcedure.query(async () => {
    const config = getPaymentConfig();
    const database = await getPaymentSchemaReadiness();
    const destination = database.ready
      ? await getPaymentDestination()
      : { upiId: null, upiPayeeName: DEFAULT_UPI_PAYEE_NAME, updatedAt: null };
    return {
      deliveryFeePaise: config.deliveryFeePaise,
      platformFeePaise: config.platformFeePaise,
      paymentDestinationReady: Boolean(destination.upiId),
      manualVerification: true as const,
      databaseReady: database.ready,
      schemaVersion: database.version,
    };
  }),

  adminPaymentSettings: adminProcedure.query(async () => {
    await requirePaymentSchemaReady();
    const [destination, history] = await Promise.all([
      getPaymentDestination(),
      getPaymentDestinationHistory(10),
    ]);
    return { ...destination, history };
  }),

  adminUpdatePaymentDestination: adminProcedure
    .input(paymentDestinationInput)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      const now = new Date();

      return ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('platform-payment-settings', 0))`,
        );
        const [previous] = await tx
          .select()
          .from(platformPaymentSettings)
          .where(eq(platformPaymentSettings.id, PAYMENT_SETTINGS_ID))
          .limit(1);

        if (
          previous?.upiId === input.upiId &&
          previous.upiPayeeName === input.upiPayeeName
        ) {
          return { ...previous, changed: false as const };
        }

        const [saved] = await tx
          .insert(platformPaymentSettings)
          .values({
            id: PAYMENT_SETTINGS_ID,
            upiId: input.upiId,
            upiPayeeName: input.upiPayeeName,
            updatedByAdminId: ctx.user.id,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: platformPaymentSettings.id,
            set: {
              upiId: input.upiId,
              upiPayeeName: input.upiPayeeName,
              updatedByAdminId: ctx.user.id,
              updatedAt: now,
            },
          })
          .returning();

        if (!saved) throw new Error("Failed to save payment destination");

        await tx.insert(platformPaymentSettingsHistory).values({
          settingsId: PAYMENT_SETTINGS_ID,
          previousUpiId: previous?.upiId ?? null,
          previousUpiPayeeName: previous?.upiPayeeName ?? null,
          newUpiId: saved.upiId,
          newUpiPayeeName: saved.upiPayeeName,
          changedByAdminId: ctx.user.id,
          createdAt: now,
        });

        return { ...saved, changed: true as const };
      });
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
      await requirePaymentSchemaReady();
      await expireStaleOrders();
      const config = getPaymentConfig();
      const now = new Date();

      const result = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.orderId}, 0))`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('platform-payment-settings', 0))`,
        );
        const [destination] = await tx
          .select({
            upiId: platformPaymentSettings.upiId,
            upiPayeeName: platformPaymentSettings.upiPayeeName,
          })
          .from(platformPaymentSettings)
          .where(eq(platformPaymentSettings.id, PAYMENT_SETTINGS_ID))
          .limit(1);
        if (!destination) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "The pilot UPI account is not configured.",
          });
        }
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
            destinationUpiId: destination.upiId,
            destinationUpiPayeeName: destination.upiPayeeName,
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
          destinationUpiId: destination.upiId,
          destinationUpiPayeeName: destination.upiPayeeName,
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
      await requirePaymentSchemaReady();
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
        if (!payment.destinationUpiId || !payment.destinationUpiPayeeName) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This order has no locked payment destination. Contact an administrator before paying.",
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
        if (
          payment.status === "REJECTED" &&
          payment.submittedUtr === normalized
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Submit a different transaction reference after rejection.",
          });
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
          .where(
            and(
              eq(orderPayments.submittedUtr, normalized),
              inArray(orderPayments.status, [
                "PENDING_VERIFICATION",
                "PAID",
                "REFUND_REQUIRED",
                "REFUNDED",
              ]),
            ),
          )
          .limit(1);
        if (duplicate && duplicate.id !== payment.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This transaction reference has already been submitted.",
          });
        }

        try {
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
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This transaction reference has already been submitted.",
            });
          }
          throw error;
        }

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
    const database = await getPaymentSchemaReadiness();
    if (!database.ready) {
      return {
        databaseReady: false,
        lifetimeEarnings: 0,
        paidEarnings: 0,
        foodReimbursed: 0,
        availableSettlementAmount: 0,
        pendingSettlementAmount: 0,
        paidSettlementAmount: 0,
        availableSettlements: 0,
        pendingSettlements: 0,
        paidSettlements: 0,
        completedDeliveries: 0,
        recent: [],
      };
    }

    const settlements = await ctx.db
      .select()
      .from(orderSettlements)
      .where(eq(orderSettlements.delivererId, ctx.user.id))
      .orderBy(desc(orderSettlements.createdAt));

    return {
      databaseReady: true,
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
      recent: settlements.slice(0, 20).map((settlement) => ({
        id: settlement.id,
        orderId: settlement.orderId,
        foodReimbursement: settlement.foodReimbursement,
        deliveryEarning: settlement.deliveryEarning,
        amountDue: settlement.amountDue,
        status: settlement.status,
        requestedAt: settlement.requestedAt,
        paidAt: settlement.paidAt,
        payoutReference: maskTransactionReference(settlement.payoutReference),
        holdReason: settlement.holdReason,
        createdAt: settlement.createdAt,
        updatedAt: settlement.updatedAt,
      })),
    };
  }),

  requestSettlement: protectedProcedure
    .input(z.object({ settlementId: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
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

  adminDashboard: adminProcedure.query(async ({ ctx }) => {
    const database = await getPaymentSchemaReadiness();
    if (!database.ready) {
      return {
        databaseReady: false,
        summary: {
          pendingPaymentVerifications: 0,
          refundsRequired: 0,
          pendingSettlements: 0,
          pendingSettlementAmount: 0,
          platformFeesEarned: 0,
        },
        paymentVerifications: [],
        refunds: [],
        settlements: [],
      };
    }

    const queues = await getAdminQueueContext(ctx.user.id);
    const delivered = await db
      .select({
        platformFee: orders.platformFee,
        paymentStatus: orderPayments.status,
      })
      .from(orders)
      .leftJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .where(eq(orders.status, "DELIVERED"));

    return {
      databaseReady: true,
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
      await requirePaymentSchemaReady();
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
        assertAdminCanReconcileOrder(ctx.user.id, order);

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

        await tx.insert(paymentAdminActionLogs).values({
          adminId: ctx.user.id,
          action: "PAYMENT_VERIFIED",
          orderId: order.id,
          paymentId: payment.id,
          fromState: payment.status,
          toState: verifiedStatus,
          createdAt: now,
        });

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
      await requirePaymentSchemaReady();
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
        assertAdminCanReconcileOrder(ctx.user.id, relatedOrder);

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
        await tx.insert(paymentAdminActionLogs).values({
          adminId: ctx.user.id,
          action: "PAYMENT_REJECTED",
          orderId: relatedOrder.id,
          paymentId: payment.id,
          fromState: payment.status,
          toState: "REJECTED",
          createdAt: now,
        });
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
      await requirePaymentSchemaReady();
      const normalized = input.refundReference;
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
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, payment.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        assertAdminCanReconcileOrder(ctx.user.id, order);

        if (payment.status === "REFUNDED") {
          if (payment.refundReference !== normalized) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This refund was already completed with another reference.",
            });
          }
          return { payment, alreadyRefunded: true };
        }
        if (payment.status !== "REFUND_REQUIRED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment does not require a refund.",
          });
        }

        let updated;
        try {
          [updated] = await tx
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
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "That refund reference is already in use.",
            });
          }
          throw error;
        }
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Refund state changed.",
          });
        }

        await tx.insert(paymentAdminActionLogs).values({
          adminId: ctx.user.id,
          action: "REFUND_COMPLETED",
          orderId: order.id,
          paymentId: payment.id,
          fromState: payment.status,
          toState: "REFUNDED",
          createdAt: now,
        });
        return { payment: updated, alreadyRefunded: false };
      });

      if (!result.alreadyRefunded) {
        await notifyProfile(result.payment.buyerId, {
          title: "Refund completed",
          body: `Your ₹${(result.payment.expectedAmount / 100).toFixed(2)} refund has been marked paid.`,
          data: {
            orderId: result.payment.orderId,
            type: "REFUND_COMPLETED",
            url: `/orders/${result.payment.orderId}/status`,
          },
          sound: "default",
          priority: "high",
          channelId: "default",
        });
      }
      return { success: true, alreadyRefunded: result.alreadyRefunded };
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
      await requirePaymentSchemaReady();
      const normalized = input.payoutReference;
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
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, settlement.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        assertAdminCanReconcileOrder(ctx.user.id, order);

        if (settlement.status === "PAID") {
          if (settlement.payoutReference !== normalized) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Settlement was already paid with another reference.",
            });
          }
          return { settlement, alreadyPaid: true };
        }

        let updated;
        try {
          [updated] = await tx
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
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "That payout reference is already in use.",
            });
          }
          throw error;
        }
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Settlement state changed.",
          });
        }

        await tx.insert(paymentAdminActionLogs).values({
          adminId: ctx.user.id,
          action: "SETTLEMENT_PAID",
          orderId: order.id,
          settlementId: settlement.id,
          fromState: settlement.status,
          toState: "PAID",
          createdAt: now,
        });
        return { settlement: updated, alreadyPaid: false };
      });

      if (!result.alreadyPaid) {
        await notifyProfile(result.settlement.delivererId, {
          title: "Settlement paid",
          body: `₹${(result.settlement.amountDue / 100).toFixed(2)} has been marked transferred by the admin.`,
          data: {
            orderId: result.settlement.orderId,
            type: "SETTLEMENT_PAID",
            url: "/earnings",
          },
          sound: "default",
          priority: "high",
          channelId: "default",
        });
      }
      return { success: true, alreadyPaid: result.alreadyPaid };
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
      await requirePaymentSchemaReady();
      const now = new Date();
      const updated = await ctx.db.transaction(async (tx) => {
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
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, settlement.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        assertAdminCanReconcileOrder(ctx.user.id, order);

        const [held] = await tx
          .update(orderSettlements)
          .set({
            status: "ON_HOLD",
            holdReason: input.reason,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderSettlements.id, input.settlementId),
              inArray(orderSettlements.status, [
                "PENDING",
                "FAILED",
                "ON_HOLD",
              ]),
            ),
          )
          .returning();
        if (!held) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This settlement cannot be put on hold.",
          });
        }
        await tx.insert(paymentAdminActionLogs).values({
          adminId: ctx.user.id,
          action: "SETTLEMENT_HELD",
          orderId: order.id,
          settlementId: settlement.id,
          fromState: settlement.status,
          toState: "ON_HOLD",
          createdAt: now,
        });
        return held;
      });

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
