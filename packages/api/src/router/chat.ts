import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { desc, eq } from "@acme/db";
import { chatMessages, orders } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";
import type { TRPCRouterRecord } from "@trpc/server";

export const chatRouter = {
  getMessages: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Validate user has access to order
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

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
      z.object({
        orderId: z.string(),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate user has access
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

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
