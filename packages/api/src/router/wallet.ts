import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "@acme/db";
import { profiles, walletTransactions } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const walletRouter = {
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const userProfile = await ctx.db.query.profiles.findFirst({
      where: eq(profiles.id, ctx.user.id),
      columns: {
        walletBalance: true,
        frozenBalance: true,
      },
    });

    if (!userProfile) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Profile not found",
      });
    }

    return userProfile;
  }),

  topUp: protectedProcedure
    .input((val) => {
      if (typeof val !== "object" || !val) return val;
      const { amount, utrNumber } = val as { amount: number; utrNumber: string };
      if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Invalid amount");
      }
      if (typeof utrNumber !== "string" || utrNumber.length < 5) {
        throw new Error("Invalid UTR number");
      }
      return { amount, utrNumber };
    })
    .mutation(async ({ ctx, input }) => {
      const { amount, utrNumber } = input as { amount: number; utrNumber: string };

      // In Drizzle with Supabase, transactions over HTTP can be tricky if not using the postgres connection directly,
      // but we can try using a single statement to update balance or a regular sequence.
      // For a top-up, we insert the transaction and increment the profile balance.
      // We will do this via a transaction if supported, else sequentially.
      
      try {
        await ctx.db.transaction(async (tx) => {
          // Check if UTR already exists
          const existingTx = await tx.query.walletTransactions.findFirst({
            where: eq(walletTransactions.utrNumber, utrNumber),
          });
          
          if (existingTx) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "UTR number already used for a top-up.",
            });
          }

          // Create transaction record
          await tx.insert(walletTransactions).values({
            userId: ctx.user.id,
            amount: amount,
            type: "TOP_UP",
            status: "SUCCESS",
            utrNumber: utrNumber,
          });

          // Update user's wallet balance
          await tx
            .update(profiles)
            .set({
              walletBalance: sql`${profiles.walletBalance} + ${amount}`,
            })
            .where(eq(profiles.id, ctx.user.id));
        });

        return { success: true, message: "Wallet topped up successfully" };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to process top-up",
        });
      }
    }),
} satisfies TRPCRouterRecord;
