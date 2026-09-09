import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { profiles } from "@acme/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

type ProfileRow = typeof profiles.$inferSelect;

function publicProfile(profile: ProfileRow) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    rollNumber: profile.rollNumber,
    hostelName: profile.hostelName,
    avatarUrl: profile.avatarUrl,
    role: profile.role,
    deliveryNotificationsEnabled: profile.deliveryNotificationsEnabled,
    deliveryCanteenIds: profile.deliveryCanteenIds,
    nearbyQuestAlertsEnabled: profile.nearbyQuestAlertsEnabled,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export const authRouter = {
  getUser: publicProcedure.query(({ ctx }) => ctx.user),

  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, ctx.user.id))
      .limit(1);

    if (!profile) {
      const userEmail = ctx.user.email ?? "";
      const extractedPhone = userEmail.endsWith("@campus.edu")
        ? userEmail.replace("@campus.edu", "")
        : null;
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
        })
        .returning();
      if (!newProfile) throw new Error("Failed to create profile");
      return publicProfile(newProfile);
    }

    if (!profile.phoneNumber && profile.email.endsWith("@campus.edu")) {
      const [updatedProfile] = await ctx.db
        .update(profiles)
        .set({
          phoneNumber: profile.email.replace("@campus.edu", ""),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, profile.id))
        .returning();
      return publicProfile(updatedProfile ?? profile);
    }

    return publicProfile(profile);
  }),

  updatePushToken: protectedProcedure
    .input(
      z
        .object({
          pushToken: z.string().regex(/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(profiles)
        .set({ pushToken: input.pushToken, updatedAt: new Date() })
        .where(eq(profiles.id, ctx.user.id));
      return { success: true };
    }),

  clearPushToken: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(profiles)
      .set({ pushToken: null, updatedAt: new Date() })
      .where(eq(profiles.id, ctx.user.id));
    return { success: true };
  }),

  updateDeliveryAvailability: protectedProcedure
    .input(
      z
        .object({
          enabled: z.boolean(),
          canteenIds: z.array(z.string().uuid()).max(100),
          nearbyQuestAlertsEnabled: z.boolean(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(profiles)
        .set({
          deliveryNotificationsEnabled: input.enabled,
          deliveryCanteenIds: input.canteenIds,
          nearbyQuestAlertsEnabled: input.nearbyQuestAlertsEnabled,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, ctx.user.id));
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
