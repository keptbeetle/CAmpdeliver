import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, desc, eq, ne, or, sql } from "@acme/db";
import { orders, profiles, walletTransactions } from "@acme/db/schema";

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

  availableQuests: protectedProcedure.query(({ ctx }) => {
    return ctx.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, "BROADCASTED"),
          ne(orders.buyerId, ctx.user.id), // Can't accept your own orders
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(10);
  }),

  createOrder: protectedProcedure
    .input((val: unknown) => {
      if (!val || typeof val !== "object") throw new Error("Invalid input");
      const v = val as {
        items: { name: string; quantity: number; price: number }[];
        canteenName: string;
        deliveryLocationName: string;
      };
      return v;
    })
    .mutation(async ({ ctx, input }) => {
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
          canteenName: input.canteenName,
          canteenLatitude: 0, // Mock for now
          canteenLongitude: 0,
          deliveryLocationName: input.deliveryLocationName,
          deliveryLatitude: 0,
          deliveryLongitude: 0,
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
} satisfies TRPCRouterRecord;
