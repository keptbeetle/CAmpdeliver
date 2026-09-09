import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, gte, sql } from "@acme/db";
import { phoneVerifications, profiles } from "@acme/db/schema";

import {
  isOtpLocked,
  nextOtpFailureState,
  remainingLockSeconds,
  SIGNUP_OTP_LOCK_SECONDS,
} from "../services/otp-security";
import { createTRPCRouter, publicProcedure } from "../trpc";

// Helper to sanitize/validate E.164 phone numbers (e.g., +91XXXXXXXXXX)
function sanitizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (phone.startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "Invalid phone number format. Please provide a valid 10-digit number.",
  });
}

function getOtpHashSecret() {
  const secret = process.env.PHONE_OTP_HASH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "campdeliver-development-only-otp-secret";
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Phone verification is not configured.",
  });
}

function hashOtp(phoneNumber: string, otpCode: string) {
  return createHmac("sha256", getOtpHashSecret())
    .update(`${phoneNumber}:${otpCode}`)
    .digest("hex");
}

function otpMatches(storedHash: string, phoneNumber: string, otpCode: string) {
  const candidate = hashOtp(phoneNumber, otpCode);
  const stored = Buffer.from(storedHash, "utf8");
  const attempted = Buffer.from(candidate, "utf8");
  return (
    stored.length === attempted.length && timingSafeEqual(stored, attempted)
  );
}

export const otpRouter = createTRPCRouter({
  // Send OTP with anti-abuse rate limits
  sendOtp: publicProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const phoneNumber = sanitizePhoneNumber(input.phoneNumber);

      // Check if phone number is already registered
      const existingProfile = await db.query.profiles.findFirst({
        where: eq(profiles.phoneNumber, phoneNumber),
      });
      if (existingProfile) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This phone number is already registered to an account.",
        });
      }

      // Check anti-abuse: limit to 3 OTP requests in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const [rateLimitCheck] = await db
        .select({ count: sql<number>`count(*)` })
        .from(phoneVerifications)
        .where(
          and(
            eq(phoneVerifications.phoneNumber, phoneNumber),
            gte(phoneVerifications.createdAt, fifteenMinutesAgo),
          ),
        );

      const requestCount = Number(rateLimitCheck?.count ?? 0);
      if (requestCount >= 3) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many OTP requests. Please wait 15 minutes before trying again.",
        });
      }

      const otpCode = randomInt(100000, 1_000_000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Store only an HMAC of the short-lived OTP. A database read alone must
      // not reveal a valid signup code.
      await db.insert(phoneVerifications).values({
        phoneNumber,
        otpCode: hashOtp(phoneNumber, otpCode),
        expiresAt,
      });

      // List of dummy/test numbers that bypass real SMS sending in development.
      const isTestNumber =
        process.env.NODE_ENV !== "production" &&
        [
          "+911234567890",
          "+911111111111",
          "+912222222222",
          "+913333333333",
          "+914444444444",
          "+915555555555",
          "+916666666666",
          "+917777777777",
          "+918888888888",
          "+919999999999",
        ].includes(phoneNumber);

      // Dispatch SMS. Development may expose the code in local logs; production
      // never logs OTP material and fails closed when SMS is not configured.
      if (isTestNumber || process.env.NODE_ENV === "development") {
        console.log(`[SMS-MOCK] OTP for ${phoneNumber}: ${otpCode}`);
      } else if (process.env.FAST2SMS_API_KEY) {
        try {
          const rawNumber = phoneNumber.replace("+91", "");
          const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
            method: "POST",
            headers: {
              authorization: process.env.FAST2SMS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              route: "otp",
              variables_values: otpCode,
              numbers: rawNumber,
            }),
          });
          if (!response.ok) {
            throw new Error(`Fast2SMS returned HTTP ${response.status}`);
          }
        } catch (error) {
          console.error("Fast2SMS API failed to send an OTP", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "The verification SMS could not be sent. Please try again.",
          });
        }
      } else {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Phone verification is not configured.",
        });
      }

      return { success: true };
    }),

  // Verify OTP and complete registration
  verifyOtpAndSignup: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        hostelName: z.string().min(1, "Hostel Name is required"),
        phoneNumber: z.string(),
        password: z.string().min(6, "Password must be at least 6 characters"),
        otpCode: z.string().length(6, "OTP must be 6 digits"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, supabase } = ctx;
      const phoneNumber = sanitizePhoneNumber(input.phoneNumber);

      // Check if phone number is already registered
      const existingProfile = await db.query.profiles.findFirst({
        where: eq(profiles.phoneNumber, phoneNumber),
      });
      if (existingProfile) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This phone number is already registered to another account.",
        });
      }

      const verificationResult = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${phoneNumber}, 0))`,
        );
        const [verification] = await tx
          .select()
          .from(phoneVerifications)
          .where(eq(phoneVerifications.phoneNumber, phoneNumber))
          .orderBy(desc(phoneVerifications.createdAt))
          .limit(1);

        if (!verification) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No verification code has been requested for this number.",
          });
        }

        const now = new Date();
        if (now > verification.expiresAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The OTP verification code has expired. Please request a new one.",
          });
        }
        if (
          verification.lockedUntil &&
          isOtpLocked(verification.lockedUntil, now)
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect verification codes. Try again in ${remainingLockSeconds(verification.lockedUntil, now)} seconds.`,
          });
        }

        if (!otpMatches(verification.otpCode, phoneNumber, input.otpCode)) {
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

        return { valid: true as const };
      });

      if (!verificationResult.valid) {
        if (verificationResult.locked && verificationResult.lockedUntil) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect verification codes. Try again in ${remainingLockSeconds(verificationResult.lockedUntil)} seconds.`,
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid OTP verification code.",
        });
      }

      // Format unique email identifier for Supabase signup using phone number
      const virtualEmail = `${phoneNumber}@campus.edu`.toLowerCase();

      // Check if we have service role key to auto-confirm user
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      let authUser;
      let authSession = null;

      if (serviceRoleKey && supabaseUrl) {
        // Use admin client to create and auto-confirm user
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
          user_metadata: {
            name: input.name,
          },
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        authUser = data.user;
      } else {
        // Fallback to anon client (requires "Confirm email" toggled off in Supabase)
        const { data, error } = await supabase.auth.signUp({
          email: virtualEmail,
          password: input.password,
          options: {
            data: {
              name: input.name,
            },
          },
        });

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        authUser = data.user;
        authSession = data.session;
      }

      if (!authUser) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Sign-up was successful, but user object is missing.",
        });
      }

      // Create local user profile
      const [newProfile] = await db
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

      // Clean up verification codes for this phone number
      await db
        .delete(phoneVerifications)
        .where(eq(phoneVerifications.phoneNumber, phoneNumber));

      return {
        profile: newProfile,
        session: authSession,
        user: authUser,
      };
    }),
});
