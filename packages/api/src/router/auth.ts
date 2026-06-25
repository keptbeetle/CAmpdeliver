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
      const userEmail = ctx.user.email ?? "";
      let extractedPhone = null;
      if (userEmail.endsWith("@campus.edu")) {
        extractedPhone = userEmail.replace("@campus.edu", "");
      }
      
      const [newProfile] = await ctx.db
        .insert(profiles)
        .values({
          id: ctx.user.id,
          name:
            (ctx.user.user_metadata.name as string | undefined) ??
            userEmail.split("@")[0] ??
            "User",
          email: userEmail,
          phoneNumber: extractedPhone,
          role: "STUDENT",
          walletBalance: 0,
          frozenBalance: 0,
        })
        .returning();
      return newProfile;
    }

    if (!profile.phoneNumber && profile.email?.endsWith("@campus.edu")) {
      const extractedPhone = profile.email.replace("@campus.edu", "");
      const [updatedProfile] = await ctx.db
        .update(profiles)
        .set({ phoneNumber: extractedPhone })
        .where(eq(profiles.id, profile.id))
        .returning();
      return updatedProfile ?? profile;
    }

    return profile;
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can see this secret message!";
  }),
} satisfies TRPCRouterRecord;
