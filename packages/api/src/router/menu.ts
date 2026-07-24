import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { eq } from "@acme/db";
import { menuItems } from "@acme/db/schema";
import { adminProcedure, publicProcedure } from "../trpc";

export const menuRouter = {
  listByCanteen: publicProcedure
    .input(z.object({ canteenId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return ctx.db.query.menuItems.findMany({
        where: eq(menuItems.canteenId, input.canteenId),
        orderBy: (menuItems, { asc }) => [asc(menuItems.name)],
      });
    }),
  create: adminProcedure
    .input(
      z.object({
        canteenId: z.string().uuid(),
        name: z.string().min(1),
        price: z.number().int().positive(), // in paise
        isAvailable: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newItem] = await ctx.db
        .insert(menuItems)
        .values({
          canteenId: input.canteenId,
          name: input.name,
          price: input.price,
          isAvailable: input.isAvailable,
        })
        .returning();
      return newItem;
    }),
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        price: z.number().int().positive().optional(),
        isAvailable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [updatedItem] = await ctx.db
        .update(menuItems)
        .set(updates)
        .where(eq(menuItems.id, id))
        .returning();

      if (!updatedItem) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Menu item not found" });
      }

      return updatedItem;
    }),
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedItem] = await ctx.db
        .delete(menuItems)
        .where(eq(menuItems.id, input.id))
        .returning();

      if (!deletedItem) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Menu item not found" });
      }

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
