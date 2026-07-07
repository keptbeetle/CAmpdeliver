import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, ne, or, sql } from "@acme/db";
import { canteens, landmarks, orders, profiles, walletTransactions } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const orderRouter = {
  myOrders: protectedProcedure.query(({ ctx }) => {
    return ctx.db
      .select()
      .from(orders)
      .where(
        or(
          eq(orders.buyerId, ctx.user.id),
          eq(orders.delivererId, ctx.user.id),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(10);
  }),

  availableQuests: protectedProcedure
    .input(z.object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const ordersList = await ctx.db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.status, "BROADCASTED"),
            ne(orders.buyerId, ctx.user.id), // Can't accept your own orders
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(50);
        
      if (input.latitude === undefined || input.longitude === undefined) {
        // If location is not provided, return nothing or all? The user wants geofencing to hide them if not in area.
        return []; 
      }

      // Fetch all canteens to get their defined radius
      const allCanteens = await ctx.db.query.canteens.findMany({
        columns: {
          id: true,
          radius: true,
        },
      });
      const canteenRadiusMap = new Map(allCanteens.map(c => [c.id, c.radius]));

      // Fetch all active landmarks for delivery context
      const allLandmarks = await ctx.db.query.landmarks.findMany({
        where: eq(landmarks.isActive, true),
      });

      // Haversine formula to filter by dynamic radius
      const toRad = (value: number) => (value * Math.PI) / 180;
      const R = 6371e3; // metres

      const lat1 = input.latitude;
      const lon1 = input.longitude;

      const filtered = ordersList.filter((order) => {
        const lat2 = order.canteenLatitude;
        const lon2 = order.canteenLongitude;

        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const deltaPhi = toRad(lat2 - lat1);
        const deltaLambda = toRad(lon2 - lon1);

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distance = R * c; // in metres

        // Get the specific canteen's radius from the DB, fallback to 150m if somehow missing
        const maxRadius = (order.canteenId ? canteenRadiusMap.get(order.canteenId) : undefined) ?? 150;

        // Return only orders within the specific canteen's radius
        return distance <= maxRadius;
      });

      // Add nearestLandmarkName to each order
      const ordersWithLandmarks = filtered.map(order => {
        let nearestLandmark = null;
        let minDistance = Infinity;

        for (const landmark of allLandmarks) {
          const lat1 = order.deliveryLatitude;
          const lon1 = order.deliveryLongitude;
          const lat2 = landmark.latitude;
          const lon2 = landmark.longitude;

          const phi1 = toRad(lat1);
          const phi2 = toRad(lat2);
          const deltaPhi = toRad(lat2 - lat1);
          const deltaLambda = toRad(lon2 - lon1);

          const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                    Math.cos(phi1) * Math.cos(phi2) *
                    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          const distance = R * c; // in metres

          if (distance < minDistance) {
            minDistance = distance;
            nearestLandmark = landmark;
          }
        }

        let nearestLandmarkName = null;
        if (nearestLandmark) {
          if (minDistance <= nearestLandmark.radius) {
            nearestLandmarkName = nearestLandmark.name;
          } else {
            nearestLandmarkName = `near ${nearestLandmark.name}`;
          }
        }

        return {
          ...order,
          nearestLandmarkName
        };
      });

      return ordersWithLandmarks;
    }),

  createOrder: protectedProcedure
    .input((val: unknown) => {
      if (!val || typeof val !== "object") throw new Error("Invalid input");
      const v = val as {
        items: { name: string; quantity: number; price: number }[];
        canteenId: string;
        deliveryLocationName: string;
        deliveryLatitude: number;
        deliveryLongitude: number;
      };
      return v;
    })
    .mutation(async ({ ctx, input }) => {
      const canteen = await ctx.db.query.canteens.findFirst({
        where: eq(canteens.id, input.canteenId),
      });

      if (!canteen) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Canteen not found" });
      }

      // Calculate total food price
      const foodPrice = input.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      const deliveryFee = 500; // 5 rupees default

      const [newOrder] = await ctx.db
        .insert(orders)
        .values({
          buyerId: ctx.user.id,
          status: "BROADCASTED",
          items: input.items,
          foodPrice,
          deliveryFee,
          canteenId: canteen.id,
          canteenName: canteen.name,
          canteenLatitude: canteen.latitude,
          canteenLongitude: canteen.longitude,
          deliveryLocationName: input.deliveryLocationName,
          deliveryLatitude: input.deliveryLatitude,
          deliveryLongitude: input.deliveryLongitude,
          otp: Math.floor(1000 + Math.random() * 9000).toString(), // Mock OTP
        })
        .returning();

      return newOrder;
    }),

  acceptOrder: protectedProcedure
    .input((val: unknown) => {
      if (
        !val ||
        typeof val !== "object" ||
        !("orderId" in val) ||
        typeof (val as { orderId: unknown }).orderId !== "string"
      )
        throw new Error("Invalid input");
      return val as { orderId: string };
    })
    .mutation(async ({ ctx, input }) => {
      // Verify order exists and is broadcasted
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (order?.status !== "BROADCASTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order cannot be accepted.",
        });
      }

      if (order.buyerId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot accept your own order.",
        });
      }

      const [updatedOrder] = await ctx.db
        .update(orders)
        .set({
          status: "ACCEPTED",
          delivererId: ctx.user.id,
        })
        .where(eq(orders.id, input.orderId))
        .returning();

      return updatedOrder;
    }),

  confirmAvailability: protectedProcedure
    .input((val: unknown) => {
      if (
        !val ||
        typeof val !== "object" ||
        !("orderId" in val) ||
        typeof val.orderId !== "string"
      ) {
        throw new Error("Invalid input");
      }
      return val as { orderId: string };
    })
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the order
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      if (order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to confirm this order",
        });
      }

      if (order.status !== "ACCEPTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order must be in ACCEPTED state to confirm availability",
        });
      }

      const totalCost = order.foodPrice + order.deliveryFee;

      // 2. Transaction: Freeze buyer's balance, update order status
      try {
        const cancelReason = await ctx.db.transaction(async (tx) => {
          // Fetch buyer's profile
          const buyerProfile = await tx.query.profiles.findFirst({
            where: eq(profiles.id, order.buyerId),
          });

          if (!buyerProfile) {
            return "Buyer not found";
          }

          if (buyerProfile.walletBalance < totalCost) {
            // Cancel order if not enough funds
            await tx
              .update(orders)
              .set({ status: "CANCELLED" })
              .where(eq(orders.id, order.id));
            return "Buyer has insufficient funds. Order cancelled.";
          }

          // Deduct from wallet, add to frozen
          await tx
            .update(profiles)
            .set({
              walletBalance: sql`${profiles.walletBalance} - ${totalCost}`,
              frozenBalance: sql`${profiles.frozenBalance} + ${totalCost}`,
            })
            .where(eq(profiles.id, order.buyerId));

          // Log transaction
          await tx.insert(walletTransactions).values({
            userId: order.buyerId,
            amount: -totalCost, // Deduct
            type: "ORDER_FREEZE",
            status: "SUCCESS",
            referenceId: order.id,
          });

          // Update order status
          await tx
            .update(orders)
            .set({ status: "PREPARING" })
            .where(eq(orders.id, order.id));

          return null;
        });

        if (cancelReason) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: cancelReason,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const msg =
          error instanceof Error
            ? error.message
            : "Failed to confirm availability";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: msg,
        });
      }
    }),

  rejectOrder: protectedProcedure
    .input((val: unknown) => {
      if (
        !val ||
        typeof val !== "object" ||
        !("orderId" in val) ||
        typeof val.orderId !== "string"
      ) {
        throw new Error("Invalid input");
      }
      return val as { orderId: string };
    })
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      if (order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to reject this order",
        });
      }

      if (order.status !== "ACCEPTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order must be in ACCEPTED state to reject",
        });
      }

      await ctx.db
        .update(orders)
        .set({ status: "CANCELLED" })
        .where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  updateLocation: protectedProcedure
    .input((val: unknown) => {
      if (!val || typeof val !== "object") throw new Error("Invalid input");
      const v = val as {
        orderId: string;
        latitude: number;
        longitude: number;
        role: "deliverer" | "buyer";
      };
      return v;
    })
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      if (order.buyerId !== ctx.user.id && order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized for this order",
        });
      }

      if (input.role === "deliverer") {
        await ctx.db
          .update(orders)
          .set({
            delivererLatitude: input.latitude,
            delivererLongitude: input.longitude,
          })
          .where(eq(orders.id, input.orderId));
      } else {
        await ctx.db
          .update(orders)
          .set({
            buyerLatitude: input.latitude,
            buyerLongitude: input.longitude,
          })
          .where(eq(orders.id, input.orderId));
      }

      return { success: true };
    }),

  getOrderContactPhoneNumber: protectedProcedure
    .input((val: unknown) => {
      if (
        !val ||
        typeof val !== "object" ||
        !("orderId" in val) ||
        typeof val.orderId !== "string"
      ) {
        throw new Error("Invalid input");
      }
      return val as { orderId: string };
    })
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      if (order.buyerId !== ctx.user.id && order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized for this order",
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

      const contactProfile = await ctx.db.query.profiles.findFirst({
        where: eq(profiles.id, targetId),
      });

      let phoneNumber = contactProfile?.phoneNumber;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!phoneNumber && contactProfile?.email?.endsWith("@campus.edu")) {
        phoneNumber = contactProfile.email.replace("@campus.edu", "");
      }

      if (!phoneNumber) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact phone number is not available.",
        });
      }

      return { phoneNumber };
    }),
} satisfies TRPCRouterRecord;
