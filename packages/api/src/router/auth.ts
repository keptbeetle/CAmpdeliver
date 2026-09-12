import type { TRPCRouterRecord } from "@trpc/server";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, ne, sql } from "@acme/db";
import { profiles } from "@acme/db/schema";

import {
  classifyLoginIdentifier,
  getCollegeEmailDomains,
  isAllowedCollegeEmail,
  normalizeEmail,
  normalizeIndianPhone,
} from "../services/auth-identity";
import {
  authenticatedProcedure,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

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

function requireCollegeDomains() {
  try {
    return getCollegeEmailDomains();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "College email signup is temporarily unavailable.",
    });
  }
}

function requireAllowedCollegeEmail(value: string) {
  const email = normalizeEmail(value);
  const domains = requireCollegeDomains();
  if (!email || !isAllowedCollegeEmail(email, domains)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Use your official college email address (${domains.map((domain) => `@${domain}`).join(", ")}).`,
    });
  }
  return email;
}

function requireIndianPhone(value: string) {
  const phoneNumber = normalizeIndianPhone(value);
  if (!phoneNumber) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
    });
  }
  return phoneNumber;
}

function createPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Authentication is temporarily unavailable.",
    });
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const signupIdentityInput = z
  .object({
    email: z.string().trim().min(3).max(254),
    phoneNumber: z.string().trim().min(10).max(20),
  })
  .strict();

const completeSignupInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    hostelName: z.string().trim().min(1).max(80),
    phoneNumber: z.string().trim().min(10).max(20),
  })
  .strict();

export const authRouter = {
  getUser: publicProcedure.query(({ ctx }) => ctx.user),

  getSignupConfig: publicProcedure.query(() => {
    const domains = requireCollegeDomains();
    return { collegeEmailDomains: domains };
  }),

  hasProfile: authenticatedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, ctx.user.id))
      .limit(1);
    return { hasProfile: Boolean(profile) };
  }),

  requestSignupEmailOtp: publicProcedure
    .input(signupIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const email = requireAllowedCollegeEmail(input.email);
      const phoneNumber = requireIndianPhone(input.phoneNumber);

      const [emailProfile] = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, email))
        .limit(1);
      if (emailProfile) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This college email is already registered. Sign in instead.",
        });
      }

      const [phoneProfile] = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.phoneNumber, phoneNumber))
        .limit(1);
      if (phoneProfile) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This phone number is already registered. Sign in instead.",
        });
      }

      const supabase = createPublicSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        throw new TRPCError({
          code: error.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
          message:
            error.status === 429
              ? "Too many email codes were requested. Please wait before trying again."
              : "The verification email could not be sent. Please try again.",
        });
      }

      return { success: true, email, resendAfterSeconds: 60 };
    }),

  signInWithIdentifier: publicProcedure
    .input(
      z
        .object({
          identifier: z.string().trim().min(3).max(254),
          password: z.string().min(1).max(72),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const identifier = classifyLoginIdentifier(input.identifier);
      if (!identifier) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter a valid college email or Indian mobile number.",
        });
      }

      let email: string;
      if (identifier.type === "email") {
        email = identifier.email;
      } else {
        const [profile] = await ctx.db
          .select({ email: profiles.email })
          .from(profiles)
          .where(eq(profiles.phoneNumber, identifier.phoneNumber))
          .limit(1);
        if (!profile) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "The email/phone number or password is incorrect.",
          });
        }
        email = profile.email;
      }

      const supabase = createPublicSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      });
      if (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "The email/phone number or password is incorrect.",
        });
      }

      const [profile] = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, data.user.id))
        .limit(1);
      if (!profile) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This account has no CAmpDeliver profile. Use Create Account to finish registration.",
        });
      }

      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }),

  completeSignup: authenticatedProcedure
    .input(completeSignupInput)
    .mutation(async ({ ctx, input }) => {
      const userEmail = ctx.user.email;
      if (!userEmail || !ctx.user.email_confirmed_at) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Verify your college email before creating your profile.",
        });
      }

      const email = requireAllowedCollegeEmail(userEmail);
      const phoneNumber = requireIndianPhone(input.phoneNumber);

      const profile = await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${email}, 11))`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${phoneNumber}, 12))`,
        );

        const [existingForUser] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, ctx.user.id))
          .limit(1);
        if (existingForUser) return existingForUser;

        const [existingEmail] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.email, email))
          .limit(1);
        if (existingEmail) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This college email is already registered.",
          });
        }

        const [existingPhone] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.phoneNumber, phoneNumber))
          .limit(1);
        if (existingPhone) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This phone number is already registered.",
          });
        }

        const [created] = await tx
          .insert(profiles)
          .values({
            id: ctx.user.id,
            name: input.name.trim(),
            email,
            phoneNumber,
            hostelName: input.hostelName.trim(),
            role: "STUDENT",
          })
          .returning();
        if (!created) throw new Error("Failed to create signup profile");
        return created;
      });

      return publicProfile(profile);
    }),

  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, ctx.user.id))
      .limit(1);

    if (!profile) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Your CAmpDeliver profile has not been created yet.",
      });
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
      const now = new Date();
      await ctx.db.transaction(async (tx) => {
        // One physical Expo token must belong to only the current signed-in
        // profile. This prevents stale profiles on the same device from
        // receiving duplicate quest pushes after account switching/reinstall.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.pushToken}, 31))`,
        );
        await tx
          .update(profiles)
          .set({ pushToken: null, updatedAt: now })
          .where(
            and(
              eq(profiles.pushToken, input.pushToken),
              ne(profiles.id, ctx.user.id),
            ),
          );
        await tx
          .update(profiles)
          .set({ pushToken: input.pushToken, updatedAt: now })
          .where(eq(profiles.id, ctx.user.id));
      });
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
          // Background geofencing was removed. Foreground presence now decides
          // whether a deliverer is close enough to receive a quest alert.
          nearbyQuestAlertsEnabled: false,
          ...(!input.enabled || input.canteenIds.length === 0
            ? {
                deliveryPresenceLatitude: null,
                deliveryPresenceLongitude: null,
                deliveryPresenceUpdatedAt: null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, ctx.user.id));
      return { success: true };
    }),

  updateDeliveryPresence: protectedProcedure
    .input(
      z
        .object({
          latitude: z.number().finite().min(-90).max(90),
          longitude: z.number().finite().min(-180).max(180),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(profiles)
        .set({
          deliveryPresenceLatitude: input.latitude,
          deliveryPresenceLongitude: input.longitude,
          deliveryPresenceUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(profiles.id, ctx.user.id),
            eq(profiles.deliveryNotificationsEnabled, true),
          ),
        )
        .returning({ id: profiles.id });
      return { accepted: Boolean(updated) };
    }),
} satisfies TRPCRouterRecord;
