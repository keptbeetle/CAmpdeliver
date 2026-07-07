import { z } from "zod";
import { eq } from "@acme/db";

import { landmarks } from "@acme/db/schema";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../trpc";

export const landmarkRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.landmarks.findMany({
      where: eq(landmarks.isActive, true),
      orderBy: (landmarks, { asc }) => [asc(landmarks.name)],
    });
  }),
  
  listAll: adminProcedure.query(({ ctx }) => {
    return ctx.db.query.landmarks.findMany({
      orderBy: (landmarks, { asc }) => [asc(landmarks.name)],
    });
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        latitude: z.number(),
        longitude: z.number(),
        radius: z.number().min(1).default(50),
        isActive: z.boolean().default(true).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.insert(landmarks).values(input);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radius: z.number().min(1).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.update(landmarks).set(data).where(eq(landmarks.id, id));
    }),

  delete: adminProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.delete(landmarks).where(eq(landmarks.id, input));
    }),
});
