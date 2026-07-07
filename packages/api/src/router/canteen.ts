import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { eq } from "@acme/db";
import { canteens } from "@acme/db/schema";
import { adminProcedure, protectedProcedure, publicProcedure } from "../trpc";

export const canteenRouter = {
  listActive: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.canteens.findMany({
      where: eq(canteens.isActive, true),
      orderBy: (canteens, { desc }) => [desc(canteens.createdAt)],
    });
  }),
  listActiveWithMenu: protectedProcedure.query(({ ctx }) => {
    return ctx.db.query.canteens.findMany({
      where: eq(canteens.isActive, true),
      with: {
        menuItems: {
          where: (menuItems, { eq }) => eq(menuItems.isAvailable, true),
          orderBy: (menuItems, { asc }) => [asc(menuItems.name)],
        },
      },
      orderBy: (canteens, { asc }) => [asc(canteens.name)],
    });
  }),
  listAll: adminProcedure.query(({ ctx }) => {
    return ctx.db.query.canteens.findMany({
      orderBy: (canteens, { desc }) => [desc(canteens.createdAt)],
    });
  }),
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        latitude: z.number(),
        longitude: z.number(),
        radius: z.number().optional().default(50),
        isActive: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newCanteen] = await ctx.db
        .insert(canteens)
        .values({
          name: input.name,
          latitude: input.latitude,
          longitude: input.longitude,
          radius: input.radius,
          isActive: input.isActive,
        })
        .returning();
      return newCanteen;
    }),
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radius: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [updatedCanteen] = await ctx.db
        .update(canteens)
        .set(updates)
        .where(eq(canteens.id, id))
        .returning();

      if (!updatedCanteen) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Canteen not found" });
      }

      return updatedCanteen;
    }),
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedCanteen] = await ctx.db
        .delete(canteens)
        .where(eq(canteens.id, input.id))
        .returning();

      if (!deletedCanteen) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Canteen not found" });
      }

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
