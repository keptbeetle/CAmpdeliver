import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "@acme/db";
import { profiles } from "@acme/db/schema";
import { protectedProcedure, publicProcedure } from "../trpc";

export const authRouter = {
  getUser: publicProcedure.query(({ ctx }) => {
    return ctx.user;
  }),
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, ctx.user.id))
      .limit(1);

    if (!profile) {
      const [newProfile] = await ctx.db
        .insert(profiles)
        .values({
          id: ctx.user.id,
          name: ctx.user.user_metadata?.name || ctx.user.email?.split("@")[0] || "User",
          email: ctx.user.email || "",
          role: "STUDENT",
          walletBalance: 0,
          frozenBalance: 0,
        })
        .returning();
      return newProfile;
    }

    return profile;
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can see this secret message!";
  }),
} satisfies TRPCRouterRecord;
