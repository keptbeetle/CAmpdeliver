import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { desc, eq } from "@acme/db";
import { chatMessages, orders } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const chatRouter = {
  getMessages: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }).strict())
    .query(async ({ ctx, input }) => {
      // Select only participant IDs so legacy orders remain readable while a
      // payment-schema rollout is pending.
      const [order] = await ctx.db
        .select({ buyerId: orders.buyerId, delivererId: orders.delivererId })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      if (order.buyerId !== ctx.user.id && order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this chat",
        });
      }

      const messages = await ctx.db.query.chatMessages.findMany({
        where: eq(chatMessages.orderId, input.orderId),
        orderBy: [desc(chatMessages.createdAt)],
        with: {
          sender: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      });

      return messages;
    }),

  sendMessage: protectedProcedure
    .input(
      z
        .object({
          orderId: z.string().uuid(),
          message: z.string().trim().min(1).max(1000),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      // Select only participant IDs so chat remains compatible with legacy rows
      // during a staged payment-schema rollout.
      const [order] = await ctx.db
        .select({ buyerId: orders.buyerId, delivererId: orders.delivererId })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      if (order.buyerId !== ctx.user.id && order.delivererId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this chat",
        });
      }

      const [newMessage] = await ctx.db
        .insert(chatMessages)
        .values({
          orderId: input.orderId,
          senderId: ctx.user.id,
          message: input.message,
        })
        .returning();

      return newMessage;
    }),
} satisfies TRPCRouterRecord;
