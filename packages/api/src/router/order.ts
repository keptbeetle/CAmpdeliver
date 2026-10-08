import { randomInt } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { db } from "@acme/db/client";
import type { OrderItem, OrderStatus } from "@acme/db/schema";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "@acme/db";
import {
  canteens,
  landmarks,
  menuItems,
  orderPayments,
  orders,
  orderSettlements,
  profiles,
} from "@acme/db/schema";

import type { ExpoPushMessage } from "../services/push-notification";
import {
  classifyDeliveryQuestAlert,
  distanceMetres,
} from "../services/delivery-eligibility";
import { expireStaleOrders } from "../services/order-expiry";
import {
  DELIVERY_OTP_LOCK_SECONDS,
  isOtpLocked,
  nextOtpFailureState,
  remainingLockSeconds,
} from "../services/otp-security";
import {
  expiresFromNow,
  getPaymentConfig,
  maskTransactionReference,
} from "../services/payment-config";
import {
  canBuyerCancelOrder,
  canConfirmCanteenPurchase,
  canReportDirectOrderIssue,
  canRevealHandoverOtp,
  delivererPrePurchaseCancellationMode,
  prePurchaseCancellationDisposition,
} from "../services/payment-policy";
import { getPaymentSchemaReadiness } from "../services/payment-schema-readiness";
import { sendExpoPushNotifications } from "../services/push-notification";
import { protectedProcedure } from "../trpc";
import {
  createOrderInputSchema,
  updateDelivererLocationInputSchema,
} from "./order-input";

const orderIdInput = z.object({ orderId: z.string().uuid() }).strict();

const ACTIVE_LOCATION_STATUSES = [
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
  "PAYMENT_DUE",
] as const;

const ACTIVE_ORDER_STATUSES = [
  "BROADCASTED",
  ...ACTIVE_LOCATION_STATUSES,
] as const;

const DELIVERY_PRESENCE_MAX_AGE_MS = 45 * 1000;

async function requirePaymentSchemaReady() {
  const database = await getPaymentSchemaReadiness();
  if (!database.ready) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "CAmpDeliver payments are being upgraded on the server. New orders and delivery actions are temporarily unavailable.",
    });
  }
}

interface LegacyOrderRow {
  id: string;
  buyerId: string;
  delivererId: string | null;
  canteenId: string | null;
  status: OrderStatus;
  items: unknown;
  foodPrice: number;
  deliveryFee: number;
  canteenName: string;
  canteenLatitude: number;
  canteenLongitude: number;
  deliveryLocationName: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  delivererLatitude: number | null;
  delivererLongitude: number | null;
  buyerLatitude: number | null;
  buyerLongitude: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeLegacyItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (
      typeof item.name !== "string" ||
      typeof item.quantity !== "number" ||
      typeof item.price !== "number"
    ) {
      return [];
    }
    return [
      {
        menuItemId:
          typeof item.menuItemId === "string"
            ? item.menuItemId
            : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      },
    ];
  });
}

async function readLegacyOrders(database: typeof db, userId: string) {
  const rows = (await database.execute(sql`
    select
      id,
      buyer_id as "buyerId",
      deliverer_id as "delivererId",
      canteen_id as "canteenId",
      status,
      items,
      food_price as "foodPrice",
      delivery_fee as "deliveryFee",
      canteen_name as "canteenName",
      canteen_latitude as "canteenLatitude",
      canteen_longitude as "canteenLongitude",
      delivery_location_name as "deliveryLocationName",
      delivery_latitude as "deliveryLatitude",
      delivery_longitude as "deliveryLongitude",
      deliverer_latitude as "delivererLatitude",
      deliverer_longitude as "delivererLongitude",
      buyer_latitude as "buyerLatitude",
      buyer_longitude as "buyerLongitude",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from public.orders
    where buyer_id = ${userId}::uuid or deliverer_id = ${userId}::uuid
    order by created_at desc
    limit 50
  `)) as unknown as LegacyOrderRow[];

  return rows.map((order) => ({
    ...order,
    items: normalizeLegacyItems(order.items),
    platformFee: 0,
    paymentModel: "LEGACY" as const,
    delivererAllowsPayAtDelivery: false,
    otp: null,
    stateExpiresAt: null,
    acceptedAt: null,
    itemsAvailableAt: null,
    purchasedAt: null,
    otpVerifiedAt: null,
    paymentReceivedAt: null,
    paymentIssueAt: null,
    paymentIssueReason: null,
    paymentIssueResolvedAt: null,
    paymentIssueResolution: null,
    deliveredAt: null,
    deliveryOtpFailedAttempts: 0,
    deliveryOtpLockedUntil: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    payment: null,
  }));
}

export const orderRouter = {
  myOrders: protectedProcedure.query(async ({ ctx }) => {
    const database = await getPaymentSchemaReadiness();
    if (!database.ready) {
      return readLegacyOrders(ctx.db, ctx.user.id);
    }

    await expireStaleOrders();

    const rows = await ctx.db
      .select({
        order: orders,
        paymentId: orderPayments.id,
        paymentMethod: orderPayments.method,
        paymentStatus: orderPayments.status,
        expectedAmount: orderPayments.expectedAmount,
        paymentDestinationUpiId: orderPayments.destinationUpiId,
        paymentDestinationUpiPayeeName: orderPayments.destinationUpiPayeeName,
        submittedUtr: orderPayments.submittedUtr,
        paymentRejectionReason: orderPayments.rejectionReason,
      })
      .from(orders)
      .leftJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .where(
        or(
          eq(orders.buyerId, ctx.user.id),
          eq(orders.delivererId, ctx.user.id),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    return rows.map((row) => {
      const isBuyer = row.order.buyerId === ctx.user.id;
      const canRevealOtp =
        isBuyer &&
        (row.order.paymentModel === "DIRECT_PAY_ON_DELIVERY"
          ? row.order.status === "NEAR_YOU"
          : canRevealHandoverOtp(row.order.status, row.paymentStatus));
      const canRevealPaymentDestination =
        isBuyer &&
        row.paymentStatus !== null &&
        ["AWAITING_PAYMENT", "PENDING_VERIFICATION", "REJECTED"].includes(
          row.paymentStatus,
        );
      return {
        ...row.order,
        // The handover code is withheld until the buyer is at the actual
        // handover stage and payment is verified. A deliverer never receives it
        // through the API and must obtain it in person from the buyer.
        otp: canRevealOtp ? row.order.otp : null,
        payment: row.paymentId
          ? {
              method: row.paymentMethod,
              status: row.paymentStatus,
              expectedAmount: row.expectedAmount,
              destinationUpiId: canRevealPaymentDestination
                ? row.paymentDestinationUpiId
                : null,
              destinationUpiPayeeName: canRevealPaymentDestination
                ? row.paymentDestinationUpiPayeeName
                : null,
              submittedReferenceDisplay: isBuyer
                ? maskTransactionReference(row.submittedUtr)
                : null,
              rejectionReason: isBuyer ? row.paymentRejectionReason : null,
            }
          : null,
      };
    });
  }),

  availableQuests: protectedProcedure
    .input(
      z
        .object({
          latitude: z.number().finite().min(-90).max(90).optional(),
          longitude: z.number().finite().min(-180).max(180).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const database = await getPaymentSchemaReadiness();
      if (!database.ready) return [];

      await expireStaleOrders();

      if (input.latitude === undefined || input.longitude === undefined) {
        return [];
      }
      const latitude = input.latitude;
      const longitude = input.longitude;

      const ordersList = await ctx.db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.status, "BROADCASTED"),
            eq(orders.paymentModel, "DIRECT_PAY_ON_DELIVERY"),
            ne(orders.buyerId, ctx.user.id),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(50);

      const allCanteens = await ctx.db.query.canteens.findMany({
        columns: { id: true, radius: true },
      });
      const canteenRadiusMap = new Map(
        allCanteens.map((canteen) => [canteen.id, canteen.radius]),
      );
      const allLandmarks = await ctx.db.query.landmarks.findMany({
        where: eq(landmarks.isActive, true),
      });

      return ordersList
        .filter((order) => {
          const pickupRadius =
            (order.canteenId
              ? canteenRadiusMap.get(order.canteenId)
              : undefined) ?? 150;
          return (
            distanceMetres(
              latitude,
              longitude,
              order.canteenLatitude,
              order.canteenLongitude,
            ) <= pickupRadius
          );
        })
        .map((order) => {
          let nearestLandmarkName: string | null = null;
          let nearestDistance = Number.POSITIVE_INFINITY;
          for (const landmark of allLandmarks) {
            const distance = distanceMetres(
              order.deliveryLatitude,
              order.deliveryLongitude,
              landmark.latitude,
              landmark.longitude,
            );
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestLandmarkName =
                distance <= landmark.radius
                  ? landmark.name
                  : `near ${landmark.name}`;
            }
          }

          return {
            id: order.id,
            canteenId: order.canteenId,
            canteenName: order.canteenName,
            deliveryLocationName: nearestLandmarkName ?? "Campus drop-off",
            nearestLandmarkName,
            foodPrice: order.foodPrice,
            deliveryFee: order.deliveryFee,
            totalDue: order.foodPrice + order.deliveryFee,
            paymentModel: order.paymentModel,
            createdAt: order.createdAt,
          };
        });
    }),

  createOrder: protectedProcedure
    .input(createOrderInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      await expireStaleOrders();

      const uniqueIds = new Set(input.items.map((item) => item.menuItemId));
      if (uniqueIds.size !== input.items.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Each menu item may appear only once in an order.",
        });
      }

      const canteen = await ctx.db.query.canteens.findFirst({
        where: and(
          eq(canteens.id, input.canteenId),
          eq(canteens.isActive, true),
        ),
      });
      if (!canteen) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Canteen not found",
        });
      }

      const requestedIds = [...uniqueIds];
      const authoritativeItems = await ctx.db
        .select({
          id: menuItems.id,
          canteenId: menuItems.canteenId,
          name: menuItems.name,
          price: menuItems.price,
          isAvailable: menuItems.isAvailable,
        })
        .from(menuItems)
        .where(inArray(menuItems.id, requestedIds));

      if (authoritativeItems.length !== requestedIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more menu items no longer exist.",
        });
      }

      const byId = new Map(authoritativeItems.map((item) => [item.id, item]));
      const snapshot = input.items.map((requested) => {
        const item = byId.get(requested.menuItemId);
        if (!item || item.canteenId !== canteen.id || !item.isAvailable) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "One or more selected items are unavailable at this canteen.",
          });
        }
        return {
          menuItemId: item.id,
          name: item.name,
          quantity: requested.quantity,
          price: item.price,
        };
      });

      const foodPrice = snapshot.reduce(
        (total, item) => total + item.price * item.quantity,
        0,
      );
      const config = getPaymentConfig();
      const now = new Date();

      const newOrder = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${ctx.user.id}, 1))`,
        );
        const [activeBuyerOrder] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.buyerId, ctx.user.id),
              inArray(orders.status, [...ACTIVE_ORDER_STATUSES]),
            ),
          )
          .limit(1);
        if (activeBuyerOrder) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Finish or cancel your active order before placing another one.",
          });
        }

        const [created] = await tx
          .insert(orders)
          .values({
            buyerId: ctx.user.id,
            paymentModel: "DIRECT_PAY_ON_DELIVERY",
            status: "BROADCASTED",
            items: snapshot,
            foodPrice,
            deliveryFee: config.deliveryFeePaise,
            platformFee: 0,
            delivererAllowsPayAtDelivery: true,
            canteenId: canteen.id,
            canteenName: canteen.name,
            canteenLatitude: canteen.latitude,
            canteenLongitude: canteen.longitude,
            deliveryLocationName: input.deliveryLocationName,
            deliveryLatitude: input.deliveryLatitude,
            deliveryLongitude: input.deliveryLongitude,
            stateExpiresAt: expiresFromNow(config.ttls.broadcasted, now),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (!created) {
          throw new Error("Failed to create order");
        }

        return created;
      });

      try {
        const presenceCutoff = new Date(
          now.getTime() - DELIVERY_PRESENCE_MAX_AGE_MS,
        );
        const potentialDeliverers = await ctx.db
          .select({
            pushToken: profiles.pushToken,
            latitude: profiles.deliveryPresenceLatitude,
            longitude: profiles.deliveryPresenceLongitude,
            presenceUpdatedAt: profiles.deliveryPresenceUpdatedAt,
            backgroundAlertsEnabled: profiles.nearbyQuestAlertsEnabled,
          })
          .from(profiles)
          .where(
            and(
              ne(profiles.id, ctx.user.id),
              isNotNull(profiles.pushToken),
              eq(profiles.deliveryNotificationsEnabled, true),
              sql`${profiles.deliveryCanteenIds} @> ${JSON.stringify([canteen.id])}::jsonb`,
            ),
          );

        const freshNearbyTokens = new Set<string>();
        const backgroundCandidateTokens = new Set<string>();
        for (const profile of potentialDeliverers) {
          if (!profile.pushToken) continue;
          const mode = classifyDeliveryQuestAlert({
            latitude: profile.latitude,
            longitude: profile.longitude,
            presenceUpdatedAt: profile.presenceUpdatedAt,
            presenceCutoff,
            backgroundAlertsEnabled: profile.backgroundAlertsEnabled,
            canteenLatitude: canteen.latitude,
            canteenLongitude: canteen.longitude,
            pickupRadiusMetres: canteen.radius,
          });
          if (mode === "VISIBLE") {
            freshNearbyTokens.add(profile.pushToken);
          } else if (mode === "BACKGROUND_CHECK") {
            backgroundCandidateTokens.add(profile.pushToken);
          }
        }

        const messages: ExpoPushMessage[] = [];
        if (freshNearbyTokens.size > 0) {
          messages.push({
            to: [...freshNearbyTokens],
            title: "New delivery quest",
            body: `Pickup at ${canteen.name}. Earn \u20b9${(
              config.deliveryFeePaise / 100
            ).toFixed(2)}.`,
            data: {
              orderId: newOrder.id,
              canteenId: canteen.id,
              type: "NEW_QUEST",
              url: "/quests",
            },
            sound: "default",
            priority: "high",
            channelId: "default",
          });
        }

        if (backgroundCandidateTokens.size > 0) {
          messages.push({
            to: [...backgroundCandidateTokens],
            data: {
              type: "NEW_QUEST_CANDIDATE",
              orderId: newOrder.id,
              canteenId: canteen.id,
              canteenName: canteen.name,
              canteenLatitude: canteen.latitude,
              canteenLongitude: canteen.longitude,
              pickupRadiusMetres: canteen.radius,
              deliveryFeePaise: config.deliveryFeePaise,
              expiresAtMs: newOrder.stateExpiresAt?.getTime() ?? Date.now(),
              url: "/quests",
            },
            priority: "high",
          });
        }

        if (messages.length > 0) {
          await sendExpoPushNotifications(messages);
        }
      } catch (error) {
        console.error("[createOrder] Push dispatch error:", error);
      }

      return { ...newOrder, otp: null };
    }),

  cancelOrder: protectedProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      await expireStaleOrders();
      const now = new Date();

      return ctx.db.transaction(async (tx) => {
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
            message: "Only the buyer can cancel this order.",
          });
        }

        const directPrePurchase =
          order.paymentModel === "DIRECT_PAY_ON_DELIVERY" &&
          canBuyerCancelOrder({
            status: order.status,
            purchasedAt: order.purchasedAt,
          });
        const legacyBroadcast =
          order.paymentModel === "LEGACY" && order.status === "BROADCASTED";
        if (!directPrePurchase && !legacyBroadcast) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: order.purchasedAt
              ? "This order cannot be cancelled normally after the deliverer has paid the canteen."
              : "This order can no longer be cancelled from the buyer flow.",
          });
        }

        const [cancelled] = await tx
          .update(orders)
          .set({
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: "BUYER",
            cancellationReason:
              order.paymentModel === "DIRECT_PAY_ON_DELIVERY"
                ? "Cancelled by buyer before canteen purchase."
                : "Cancelled by buyer before assignment.",
            stateExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, order.id),
              inArray(orders.status, [
                "BROADCASTED",
                "ACCEPTED",
                "ITEM_AVAILABLE",
              ]),
              isNull(orders.purchasedAt),
            ),
          )
          .returning({ id: orders.id });
        if (!cancelled) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Order state changed before cancellation completed.",
          });
        }
        return { success: true };
      });
    }),

  acceptOrder: protectedProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          // Retained as an optional compatibility field for older clients.
          // Direct Pay on Delivery is mandatory for every new order.
          allowPayAtDelivery: z.boolean().optional(),
          latitude: z.number().finite().min(-90).max(90),
          longitude: z.number().finite().min(-180).max(180),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      await expireStaleOrders();
      const config = getPaymentConfig();
      const now = new Date();

      const updated = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${ctx.user.id}, 1))`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.orderId}, 0))`,
        );

        const [candidateOrder] = await tx
          .select({
            paymentModel: orders.paymentModel,
            status: orders.status,
            canteenId: orders.canteenId,
            canteenLatitude: orders.canteenLatitude,
            canteenLongitude: orders.canteenLongitude,
          })
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .limit(1);
        if (
          candidateOrder?.status !== "BROADCASTED" ||
          candidateOrder.paymentModel !== "DIRECT_PAY_ON_DELIVERY"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This quest is no longer available.",
          });
        }

        const [canteenConfig] = candidateOrder.canteenId
          ? await tx
              .select({ radius: canteens.radius })
              .from(canteens)
              .where(eq(canteens.id, candidateOrder.canteenId))
              .limit(1)
          : [];
        const pickupRadius = canteenConfig?.radius ?? 150;
        if (
          distanceMetres(
            input.latitude,
            input.longitude,
            candidateOrder.canteenLatitude,
            candidateOrder.canteenLongitude,
          ) > pickupRadius
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You must be inside this canteen's pickup radius before accepting the quest.",
          });
        }

        const [activeDelivery] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.delivererId, ctx.user.id),
              inArray(orders.status, [...ACTIVE_LOCATION_STATUSES]),
              ne(orders.id, input.orderId),
            ),
          )
          .limit(1);
        if (activeDelivery) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Finish your active delivery before accepting another quest.",
          });
        }

        const [accepted] = await tx
          .update(orders)
          .set({
            status: "ACCEPTED",
            delivererId: ctx.user.id,
            delivererAllowsPayAtDelivery: true,
            acceptedAt: now,
            stateExpiresAt: expiresFromNow(config.ttls.accepted, now),
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, input.orderId),
              eq(orders.status, "BROADCASTED"),
              eq(orders.paymentModel, "DIRECT_PAY_ON_DELIVERY"),
              isNull(orders.delivererId),
              ne(orders.buyerId, ctx.user.id),
              gt(orders.stateExpiresAt, now),
            ),
          )
          .returning();
        return accepted;
      });

      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This quest is no longer available.",
        });
      }

      try {
        const buyer = await ctx.db.query.profiles.findFirst({
          where: eq(profiles.id, updated.buyerId),
          columns: { pushToken: true },
        });
        if (buyer?.pushToken) {
          await sendExpoPushNotifications([
            {
              to: buyer.pushToken,
              title: "Deliverer assigned",
              body: "Your deliverer will pay the canteen and collect your full order total directly at handover after OTP verification.",
              data: {
                orderId: updated.id,
                type: "ORDER_ACCEPTED",
                url: `/orders/${updated.id}/status`,
              },
              sound: "default",
              priority: "high",
              channelId: "default",
            },
          ]);
        }
      } catch (error) {
        console.error("[acceptOrder] Push dispatch error:", error);
      }

      return { ...updated, otp: null };
    }),

  confirmAvailability: protectedProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      await expireStaleOrders();
      const config = getPaymentConfig();
      const now = new Date();
      const deliveryOtp = randomInt(1000, 10_000).toString();

      const updated = await ctx.db.transaction(async (tx) => {
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
        if (order.delivererId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the assigned deliverer can confirm availability.",
          });
        }
        if (order.status !== "ACCEPTED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Item availability can only be confirmed after acceptance.",
          });
        }

        const [result] = await tx
          .update(orders)
          .set({
            status: "ITEM_AVAILABLE",
            otp: deliveryOtp,
            itemsAvailableAt: now,
            stateExpiresAt: expiresFromNow(
              config.ttls.paidAwaitingPurchase,
              now,
            ),
            updatedAt: now,
          })
          .where(and(eq(orders.id, order.id), eq(orders.status, "ACCEPTED")))
          .returning();
        return result;
      });

      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Order state changed.",
        });
      }

      try {
        const buyer = await ctx.db.query.profiles.findFirst({
          where: eq(profiles.id, updated.buyerId),
          columns: { pushToken: true },
        });
        if (buyer?.pushToken) {
          await sendExpoPushNotifications([
            {
              to: buyer.pushToken,
              title: "Items are available",
              body: "Your deliverer is ready to purchase the order. You will pay the full total directly at handover after OTP verification.",
              data: {
                orderId: updated.id,
                type: "ITEMS_AVAILABLE",
                url: `/orders/${updated.id}/status`,
              },
              sound: "default",
              priority: "high",
              channelId: "default",
            },
          ]);
        }
      } catch (error) {
        console.error("[confirmAvailability] Push dispatch error:", error);
      }

      return { success: true };
    }),

  rejectOrder: protectedProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      await expireStaleOrders();
      const now = new Date();

      return ctx.db.transaction(async (tx) => {
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
        if (order.delivererId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the assigned deliverer can cancel this order.",
          });
        }
        if (
          order.purchasedAt ||
          !["ACCEPTED", "ITEM_AVAILABLE"].includes(order.status)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This order cannot be cancelled after the canteen purchase has been confirmed.",
          });
        }

        if (order.paymentModel === "DIRECT_PAY_ON_DELIVERY") {
          await tx
            .update(orders)
            .set({
              status: "CANCELLED",
              cancelledAt: now,
              cancelledBy: "DELIVERER",
              cancellationReason:
                "Deliverer could not fulfil the order before purchasing it.",
              stateExpiresAt: null,
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));
          return { success: true, refundRequired: false };
        }

        const [payment] = await tx
          .select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, order.id))
          .limit(1);
        const cancellationMode = delivererPrePurchaseCancellationMode(
          order.status,
          payment?.status ?? null,
        );
        if (!cancellationMode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "After item availability is confirmed, deliverer cancellation is available only after CAmpDeliver has verified the buyer payment. Otherwise the server TTL handles an abandoned order.",
          });
        }

        const paymentDisposition = prePurchaseCancellationDisposition(
          payment?.status ?? null,
        );
        const refundRequired = cancellationMode === "SECURED_PAYMENT_REFUND";

        if (
          payment &&
          paymentDisposition !== "PRESERVE_PENDING_VERIFICATION" &&
          paymentDisposition !== "UNCHANGED"
        ) {
          await tx
            .update(orderPayments)
            .set({
              status: paymentDisposition,
              rejectionReason: refundRequired
                ? payment.rejectionReason
                : "Canteen items were unavailable before payment.",
              updatedAt: now,
            })
            .where(eq(orderPayments.id, payment.id));
        }

        await tx
          .update(orders)
          .set({
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: "DELIVERER",
            cancellationReason: refundRequired
              ? "Deliverer cancelled after payment was secured and before purchase."
              : "Canteen items were unavailable before payment.",
            stateExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(orders.id, order.id));

        return { success: true, refundRequired };
      });
    }),

  markPurchased: protectedProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      await expireStaleOrders();
      const now = new Date();

      return ctx.db.transaction(async (tx) => {
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
        if (order.delivererId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the assigned deliverer can confirm purchase.",
          });
        }
        if (order.status === "PURCHASED" && order.purchasedAt) {
          return { success: true, alreadyPurchased: true };
        }
        if (order.status !== "ITEM_AVAILABLE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The order is not ready to be marked purchased.",
          });
        }

        if (order.paymentModel === "DIRECT_PAY_ON_DELIVERY") {
          const [updated] = await tx
            .update(orders)
            .set({
              status: "PURCHASED",
              purchasedAt: now,
              stateExpiresAt: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(orders.id, order.id),
                eq(orders.status, "ITEM_AVAILABLE"),
                isNull(orders.purchasedAt),
              ),
            )
            .returning({ id: orders.id });
          if (!updated) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Order state changed before purchase confirmation.",
            });
          }
          return { success: true, alreadyPurchased: false };
        }

        const [payment] = await tx
          .select()
          .from(orderPayments)
          .where(eq(orderPayments.orderId, order.id))
          .limit(1);
        if (!payment?.method) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The buyer must choose a payment method first.",
          });
        }
        if (
          !canConfirmCanteenPurchase({
            method: payment.method,
            paymentStatus: payment.status,
            delivererAllowsPayAtDelivery: order.delivererAllowsPayAtDelivery,
          })
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              payment.method === "ADVANCE"
                ? "Advance payment must be verified before you spend money."
                : "Pay at Delivery was not offered for this order.",
          });
        }

        const [updated] = await tx
          .update(orders)
          .set({
            status: "PURCHASED",
            purchasedAt: now,
            stateExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(eq(orders.id, order.id), eq(orders.status, "ITEM_AVAILABLE")),
          )
          .returning({ id: orders.id });
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Order state changed.",
          });
        }
        return { success: true, alreadyPurchased: false };
      });
    }),

  updateLocation: protectedProcedure
    .input(updateDelivererLocationInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      const [order] = await ctx.db
        .select({
          id: orders.id,
          buyerId: orders.buyerId,
          delivererId: orders.delivererId,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }
      if (order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the assigned deliverer can update location.",
        });
      }
      if (
        !ACTIVE_LOCATION_STATUSES.includes(
          order.status as (typeof ACTIVE_LOCATION_STATUSES)[number],
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Location tracking is not active for this order.",
        });
      }

      await ctx.db
        .update(orders)
        .set({
          delivererLatitude: input.latitude,
          delivererLongitude: input.longitude,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      return { success: true };
    }),

  getOrderContactPhoneNumber: protectedProcedure
    .input(orderIdInput)
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select({
          buyerId: orders.buyerId,
          delivererId: orders.delivererId,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }
      if (order.buyerId !== ctx.user.id && order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized for this order.",
        });
      }
      if (
        !ACTIVE_LOCATION_STATUSES.includes(
          order.status as (typeof ACTIVE_LOCATION_STATUSES)[number],
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Contact details are available only during an active delivery.",
        });
      }

      const targetId =
        ctx.user.id === order.buyerId ? order.delivererId : order.buyerId;
      if (!targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No contact is available for this order yet.",
        });
      }
      const contact = await ctx.db.query.profiles.findFirst({
        where: eq(profiles.id, targetId),
        columns: { phoneNumber: true },
      });
      const phoneNumber = contact?.phoneNumber;
      if (!phoneNumber) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact phone number is not available.",
        });
      }
      return { phoneNumber };
    }),

  updateOrderStatus: protectedProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          status: z.enum(["ON_THE_WAY", "NEAR_YOU"]),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }
      if (order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the assigned deliverer can update this order.",
        });
      }

      const expectedCurrent =
        input.status === "ON_THE_WAY" ? "PURCHASED" : "ON_THE_WAY";
      if (order.status !== expectedCurrent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Order must be ${expectedCurrent} before moving to ${input.status}.`,
        });
      }

      const [updated] = await ctx.db
        .update(orders)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, expectedCurrent)))
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Order state changed.",
        });
      }

      try {
        const buyer = await ctx.db.query.profiles.findFirst({
          where: eq(profiles.id, order.buyerId),
          columns: { pushToken: true },
        });
        if (buyer?.pushToken) {
          const near = input.status === "NEAR_YOU";
          await sendExpoPushNotifications([
            {
              to: buyer.pushToken,
              title: near ? "Your deliverer is nearby" : "Order on the way",
              body: near
                ? `Meet your deliverer. Share the handover code first, then pay ₹${((order.foodPrice + order.deliveryFee) / 100).toFixed(2)} directly to them.`
                : `Your order from ${order.canteenName} is on the way. Payment is due only at handover after OTP verification.`,
              data: {
                orderId: order.id,
                type: input.status,
                url: `/orders/${order.id}/status`,
              },
              sound: "default",
              priority: "high",
              channelId: "default",
            },
          ]);
        }
      } catch (error) {
        console.error("[updateOrderStatus] Push dispatch error:", error);
      }

      return { ...updated, otp: null };
    }),

  verifyDelivery: protectedProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          otp: z.string().regex(/^\d{4}$/),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
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
        if (order.delivererId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the assigned deliverer can complete this order.",
          });
        }
        if (order.status === "DELIVERED") {
          return {
            success: true,
            alreadyCompleted: true,
            alreadyVerified: true,
            paymentDue: false,
            order,
          };
        }
        if (
          order.paymentModel === "DIRECT_PAY_ON_DELIVERY" &&
          order.status === "PAYMENT_DUE" &&
          order.otpVerifiedAt
        ) {
          return {
            success: true,
            alreadyCompleted: false,
            alreadyVerified: true,
            paymentDue: true,
            order,
          };
        }
        if (order.status !== "NEAR_YOU") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The order must be at the handover stage before OTP verification.",
          });
        }

        if (order.paymentModel === "LEGACY") {
          const [payment] = await tx
            .select({ status: orderPayments.status })
            .from(orderPayments)
            .where(eq(orderPayments.orderId, order.id))
            .limit(1);
          if (payment?.status !== "PAID") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Legacy orders still require their verified payment before handover.",
            });
          }
        }

        if (
          order.deliveryOtpLockedUntil &&
          isOtpLocked(order.deliveryOtpLockedUntil, now)
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect handover codes. Try again in ${remainingLockSeconds(order.deliveryOtpLockedUntil, now)} seconds.`,
          });
        }

        if (order.otp !== input.otp) {
          const failureState = nextOtpFailureState(
            order.deliveryOtpLockedUntil ? 0 : order.deliveryOtpFailedAttempts,
            DELIVERY_OTP_LOCK_SECONDS,
            now,
          );
          await tx
            .update(orders)
            .set({
              deliveryOtpFailedAttempts: failureState.failedAttempts,
              deliveryOtpLockedUntil: failureState.lockedUntil,
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));

          return {
            success: false as const,
            invalidOtp: true as const,
            locked: failureState.locked,
            lockedUntil: failureState.lockedUntil,
            order,
          };
        }

        const directPayment = order.paymentModel === "DIRECT_PAY_ON_DELIVERY";
        const [handover] = await tx
          .update(orders)
          .set({
            status: directPayment ? "PAYMENT_DUE" : "DELIVERED",
            otpVerifiedAt: now,
            deliveredAt: directPayment ? null : now,
            deliveryOtpFailedAttempts: 0,
            deliveryOtpLockedUntil: null,
            stateExpiresAt: null,
            updatedAt: now,
          })
          .where(and(eq(orders.id, order.id), eq(orders.status, "NEAR_YOU")))
          .returning();
        if (!handover) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Order state changed.",
          });
        }

        if (!directPayment) {
          await tx
            .insert(orderSettlements)
            .values({
              orderId: order.id,
              delivererId: ctx.user.id,
              foodReimbursement: order.foodPrice,
              deliveryEarning: order.deliveryFee,
              amountDue: order.foodPrice + order.deliveryFee,
              status: "AVAILABLE",
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing({ target: orderSettlements.orderId });
        }

        return {
          success: true,
          alreadyCompleted: false,
          alreadyVerified: false,
          paymentDue: directPayment,
          order: handover,
        };
      });

      if ("invalidOtp" in result) {
        if (result.locked && result.lockedUntil) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect handover codes. Try again in ${remainingLockSeconds(result.lockedUntil, now)} seconds.`,
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OTP" });
      }

      if (!result.alreadyCompleted && !result.alreadyVerified) {
        try {
          const [buyer, deliverer] = await Promise.all([
            ctx.db.query.profiles.findFirst({
              where: eq(profiles.id, result.order.buyerId),
              columns: { pushToken: true },
            }),
            ctx.db.query.profiles.findFirst({
              where: eq(profiles.id, ctx.user.id),
              columns: { pushToken: true },
            }),
          ]);
          const messages: Parameters<typeof sendExpoPushNotifications>[0] = [];
          if (buyer?.pushToken) {
            messages.push({
              to: buyer.pushToken,
              title: result.paymentDue
                ? "OTP verified — payment due"
                : "Delivery completed",
              body: result.paymentDue
                ? `Pay ₹${((result.order.foodPrice + result.order.deliveryFee) / 100).toFixed(2)} directly to your deliverer to finish the order.`
                : `Your order from ${result.order.canteenName} was handed over successfully.`,
              data: {
                orderId: result.order.id,
                type: result.paymentDue
                  ? "DIRECT_PAYMENT_DUE"
                  : "ORDER_DELIVERED",
                url: `/orders/${result.order.id}/status`,
              },
              sound: "default",
              priority: "high",
              channelId: "default",
            });
          }
          if (deliverer?.pushToken) {
            messages.push({
              to: deliverer.pushToken,
              title: result.paymentDue
                ? "OTP verified — collect payment"
                : "Delivery completed",
              body: result.paymentDue
                ? `Collect ₹${((result.order.foodPrice + result.order.deliveryFee) / 100).toFixed(2)} directly from the buyer, then confirm payment received.`
                : "The legacy delivery was completed successfully.",
              data: {
                orderId: result.order.id,
                type: result.paymentDue
                  ? "DIRECT_PAYMENT_DUE"
                  : "ORDER_DELIVERED",
                url: `/orders/${result.order.id}/status`,
              },
              sound: "default",
              priority: "high",
              channelId: "default",
            });
          }
          if (messages.length > 0) {
            await sendExpoPushNotifications(messages);
          }
        } catch (error) {
          console.error("[verifyDelivery] Push dispatch error:", error);
        }
      }

      return {
        success: true,
        alreadyCompleted: result.alreadyCompleted,
        alreadyVerified: result.alreadyVerified,
        paymentDue: result.paymentDue,
      };
    }),

  confirmPaymentReceived: protectedProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await requirePaymentSchemaReady();
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
        if (order.paymentModel !== "DIRECT_PAY_ON_DELIVERY") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This action is only available for direct Pay on Delivery orders.",
          });
        }
        if (order.delivererId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the assigned deliverer can confirm receipt of payment.",
          });
        }
        if (order.status === "DELIVERED" && order.paymentReceivedAt) {
          return { order, alreadyCompleted: true };
        }
        if (order.status !== "PAYMENT_DUE" || !order.otpVerifiedAt) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Verify the buyer's handover OTP before collecting payment.",
          });
        }

        const [completed] = await tx
          .update(orders)
          .set({
            status: "DELIVERED",
            paymentReceivedAt: now,
            deliveredAt: now,
            paymentIssueResolvedAt: order.paymentIssueAt
              ? (order.paymentIssueResolvedAt ?? now)
              : null,
            paymentIssueResolution: order.paymentIssueAt
              ? (order.paymentIssueResolution ??
                "Payment later confirmed received by the deliverer.")
              : null,
            stateExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.status, "PAYMENT_DUE"),
              isNull(orders.paymentReceivedAt),
            ),
          )
          .returning();
        if (!completed) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Order state changed before payment confirmation completed.",
          });
        }
        return { order: completed, alreadyCompleted: false };
      });

      if (!result.alreadyCompleted) {
        try {
          const buyer = await ctx.db.query.profiles.findFirst({
            where: eq(profiles.id, result.order.buyerId),
            columns: { pushToken: true },
          });
          if (buyer?.pushToken) {
            await sendExpoPushNotifications([
              {
                to: buyer.pushToken,
                title: "Order completed",
                body: `Payment was confirmed. Your order from ${result.order.canteenName} is complete.`,
                data: {
                  orderId: result.order.id,
                  type: "ORDER_DELIVERED",
                  url: `/orders/${result.order.id}/status`,
                },
                sound: "default",
                priority: "high",
                channelId: "default",
              },
            ]);
          }
        } catch (error) {
          console.error("[confirmPaymentReceived] Push dispatch error:", error);
        }
      }

      return {
        success: true,
        alreadyCompleted: result.alreadyCompleted,
        earnedAmount: result.order.deliveryFee,
        collectedAmount: result.order.foodPrice + result.order.deliveryFee,
      };
    }),

  reportPaymentIssue: protectedProcedure
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
      const now = new Date();

      const updated = await ctx.db.transaction(async (tx) => {
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
        if (
          order.paymentModel !== "DIRECT_PAY_ON_DELIVERY" ||
          !canReportDirectOrderIssue({
            status: order.status,
            purchasedAt: order.purchasedAt,
            paymentReceivedAt: order.paymentReceivedAt,
          })
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A handover issue can only be reported after the canteen purchase and before the order is completed.",
          });
        }
        if (
          order.delivererId !== ctx.user.id &&
          order.buyerId !== ctx.user.id
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the buyer or assigned deliverer can report a handover payment issue.",
          });
        }

        const [result] = await tx
          .update(orders)
          .set({
            paymentIssueAt: order.paymentIssueAt ?? now,
            paymentIssueReason: input.reason,
            paymentIssueResolvedAt: null,
            paymentIssueResolution: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, order.id),
              inArray(orders.status, [
                "PURCHASED",
                "ON_THE_WAY",
                "NEAR_YOU",
                "PAYMENT_DUE",
              ]),
              isNotNull(orders.purchasedAt),
              isNull(orders.paymentReceivedAt),
            ),
          )
          .returning();
        if (!result) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Order state changed before the issue could be recorded.",
          });
        }
        return result;
      });

      return {
        success: true,
        paymentIssueAt: updated.paymentIssueAt,
        paymentIssueReason: updated.paymentIssueReason,
      };
    }),
} satisfies TRPCRouterRecord;
