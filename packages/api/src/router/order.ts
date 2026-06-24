import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq, or } from "@acme/db";
import { orders } from "@acme/db/schema";
import { protectedProcedure } from "../trpc";

export const orderRouter = {
  myOrders: protectedProcedure.query(({ ctx }) => {
    return ctx.db
      .select()
      .from(orders)
      .where(
        or(
          eq(orders.buyerId, ctx.user.id),
          eq(orders.delivererId, ctx.user.id)
        )
      )
      .orderBy(desc(orders.createdAt))
      .limit(10);
  }),
} satisfies TRPCRouterRecord;
