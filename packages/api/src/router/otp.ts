import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, gte, isNull, sql } from "@acme/db";
import { phoneVerifications, profiles } from "@acme/db/schema";

import {
  isOtpLocked,
  nextOtpFailureState,
  remainingLockSeconds,
  SIGNUP_OTP_LOCK_SECONDS,
} from "../services/otp-security";
import {
  generateSignupOtp,
  getFast2SmsApiKey,
  getSignupOtpHashSecret,
  hashSignupOtp,
  normalizeIndianMobile,
  sendFast2SmsOtp,
  SIGNUP_OTP_EXPIRY_SECONDS,
  SIGNUP_OTP_MAX_SENDS_PER_WINDOW,
  SIGNUP_OTP_RATE_WINDOW_SECONDS,
  SIGNUP_OTP_RESEND_SECONDS,
  signupOtpMatches,
} from "../services/signup-otp";
import { createTRPCRouter, publicProcedure } from "../trpc";

function requireIndianMobile(value: string) {
  const phoneNumber = normalizeIndianMobile(value);
  if (!phoneNumber) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
    });
  }
  return phoneNumber;
}

function requireSignupSecrets() {
  try {
    return {
      apiKey: getFast2SmsApiKey(),
      hashSecret: getSignupOtpHashSecret(),
    };
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Phone verification is temporarily unavailable.",
    });
  }
}

function requireSignupHashSecret() {
  try {
    return getSignupOtpHashSecret();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Phone verification is temporarily unavailable.",
    });
  }
}

function requireSupabaseAdminConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Account creation is temporarily unavailable.",
    });
  }
  return { supabaseUrl, serviceRoleKey };
}

const sendOtpInput = z
  .object({
    phoneNumber: z.string().trim().min(10).max(20),
  })
  .strict();

const verifySignupInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80),
    hostelName: z.string().trim().min(1, "Hostel name is required").max(80),
    phoneNumber: z.string().trim().min(10).max(20),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    otpCode: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
  })
  .strict();

export const otpRouter = createTRPCRouter({
  sendOtp: publicProcedure
    .input(sendOtpInput)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const phoneNumber = requireIndianMobile(input.phoneNumber);
      const { apiKey, hashSecret } = requireSignupSecrets();
      const now = new Date();
      const otpCode = generateSignupOtp();
      const expiresAt = new Date(
        now.getTime() + SIGNUP_OTP_EXPIRY_SECONDS * 1000,
      );
      const windowStart = new Date(
        now.getTime() - SIGNUP_OTP_RATE_WINDOW_SECONDS * 1000,
      );

      const reservation = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${phoneNumber}, 0))`,
        );

        const [existingProfile] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.phoneNumber, phoneNumber))
          .limit(1);
        if (existingProfile) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This phone number is already registered. Sign in instead.",
          });
        }

        const [latest] = await tx
          .select({ createdAt: phoneVerifications.createdAt })
          .from(phoneVerifications)
          .where(eq(phoneVerifications.phoneNumber, phoneNumber))
          .orderBy(desc(phoneVerifications.createdAt))
          .limit(1);

        if (latest) {
          const retryAt = new Date(
            latest.createdAt.getTime() + SIGNUP_OTP_RESEND_SECONDS * 1000,
          );
          if (retryAt > now) {
            const retryAfterSeconds = Math.max(
              1,
              Math.ceil((retryAt.getTime() - now.getTime()) / 1000),
            );
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
            });
          }
        }

        const [rateLimitCheck] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(phoneVerifications)
          .where(
            and(
              eq(phoneVerifications.phoneNumber, phoneNumber),
              gte(phoneVerifications.createdAt, windowStart),
            ),
          );

        if (
          Number(rateLimitCheck?.count ?? 0) >= SIGNUP_OTP_MAX_SENDS_PER_WINDOW
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Too many verification codes were requested. Try again in 15 minutes.",
          });
        }

        await tx
          .update(phoneVerifications)
          .set({ consumedAt: now })
          .where(
            and(
              eq(phoneVerifications.phoneNumber, phoneNumber),
              isNull(phoneVerifications.consumedAt),
            ),
          );

        const [created] = await tx
          .insert(phoneVerifications)
          .values({
            phoneNumber,
            otpCode: hashSignupOtp(phoneNumber, otpCode, hashSecret),
            expiresAt,
            createdAt: now,
          })
          .returning({ id: phoneVerifications.id });

        if (!created) throw new Error("Failed to reserve signup verification");
        return created;
      });

      try {
        await sendFast2SmsOtp({ phoneNumber, otpCode, apiKey });
      } catch {
        await db
          .delete(phoneVerifications)
          .where(eq(phoneVerifications.id, reservation.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The verification SMS could not be sent. Please try again.",
        });
      }

      return {
        success: true,
        expiresInSeconds: SIGNUP_OTP_EXPIRY_SECONDS,
        resendAfterSeconds: SIGNUP_OTP_RESEND_SECONDS,
      };
    }),

  verifyOtpAndSignup: publicProcedure
    .input(verifySignupInput)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const phoneNumber = requireIndianMobile(input.phoneNumber);
      const hashSecret = requireSignupHashSecret();
      const { supabaseUrl, serviceRoleKey } = requireSupabaseAdminConfig();

      const verificationResult = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${phoneNumber}, 0))`,
        );

        const [existingProfile] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.phoneNumber, phoneNumber))
          .limit(1);
        if (existingProfile) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This phone number is already registered. Sign in instead.",
          });
        }

        const [verification] = await tx
          .select()
          .from(phoneVerifications)
          .where(eq(phoneVerifications.phoneNumber, phoneNumber))
          .orderBy(desc(phoneVerifications.createdAt))
          .limit(1);

        if (!verification || verification.consumedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Request a new verification code before creating your account.",
          });
        }

        const now = new Date();
        if (now > verification.expiresAt) {
          await tx
            .update(phoneVerifications)
            .set({ consumedAt: now })
            .where(eq(phoneVerifications.id, verification.id));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This verification code has expired. Request a new one.",
          });
        }

        if (
          verification.lockedUntil &&
          isOtpLocked(verification.lockedUntil, now)
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect codes. Try again in ${remainingLockSeconds(verification.lockedUntil, now)} seconds.`,
          });
        }

        if (
          !signupOtpMatches(
            verification.otpCode,
            phoneNumber,
            input.otpCode,
            hashSecret,
          )
        ) {
          const failureState = nextOtpFailureState(
            verification.lockedUntil ? 0 : verification.failedAttempts,
            SIGNUP_OTP_LOCK_SECONDS,
            now,
          );
          await tx
            .update(phoneVerifications)
            .set({
              failedAttempts: failureState.failedAttempts,
              lockedUntil: failureState.lockedUntil,
            })
            .where(eq(phoneVerifications.id, verification.id));

          return {
            valid: false as const,
            locked: failureState.locked,
            lockedUntil: failureState.lockedUntil,
          };
        }

        const [consumed] = await tx
          .update(phoneVerifications)
          .set({ consumedAt: now })
          .where(
            and(
              eq(phoneVerifications.id, verification.id),
              isNull(phoneVerifications.consumedAt),
            ),
          )
          .returning({ id: phoneVerifications.id });
        if (!consumed) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This verification code was already used. Request a new one.",
          });
        }

        return { valid: true as const };
      });

      if (!verificationResult.valid) {
        if (verificationResult.locked && verificationResult.lockedUntil) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect codes. Try again in ${remainingLockSeconds(verificationResult.lockedUntil)} seconds.`,
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The verification code is incorrect.",
        });
      }

      const virtualEmail = `${phoneNumber}@campus.edu`.toLowerCase();
      const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data, error } = await adminSupabase.auth.admin.createUser({
        email: virtualEmail,
        password: input.password,
        email_confirm: true,
        user_metadata: { name: input.name },
      });

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The account could not be created. If you already registered, sign in instead.",
        });
      }

      const authUser = data.user;
      try {
        const newProfile = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(profiles)
            .values({
              id: authUser.id,
              name: input.name,
              email: virtualEmail,
              phoneNumber,
              hostelName: input.hostelName,
              role: "STUDENT",
            })
            .returning();
          if (!created) throw new Error("Failed to create signup profile");

          await tx
            .delete(phoneVerifications)
            .where(eq(phoneVerifications.phoneNumber, phoneNumber));
          return created;
        });

        return {
          profile: newProfile,
          session: null,
          user: authUser,
        };
      } catch (error) {
        try {
          await adminSupabase.auth.admin.deleteUser(authUser.id);
        } catch {
          // Best-effort compensation. The original database failure is the
          // actionable error and no secret or OTP material is logged here.
        }
        throw error instanceof TRPCError
          ? error
          : new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "The account could not be completed. Request a new code and try again.",
            });
      }
    }),
});
