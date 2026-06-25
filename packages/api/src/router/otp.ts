import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { eq, and, gte, desc, sql } from "@acme/db";
import { phoneVerifications, profiles } from "@acme/db/schema";
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
    message: "Invalid phone number format. Please provide a valid 10-digit number.",
  });
}

export const otpRouter = createTRPCRouter({
  // Send OTP with anti-abuse rate limits
  sendOtp: publicProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
      })
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
            gte(phoneVerifications.createdAt, fifteenMinutesAgo)
          )
        );

      const requestCount = Number(rateLimitCheck?.count ?? 0);
      if (requestCount >= 3) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many OTP requests. Please wait 15 minutes before trying again.",
        });
      }

      // Generate secure 6-digit code (100000 - 999999)
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

      // Save to database
      await db.insert(phoneVerifications).values({
        phoneNumber,
        otpCode,
        expiresAt,
      });

      // Dispatch SMS
      if (process.env.NODE_ENV === "development") {
        console.log("\n========================================");
        console.log(`[SMS-MOCK] OTP for ${phoneNumber} is: ${otpCode}`);
        console.log("========================================\n");
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
          const result = await response.json();
          console.log(`Fast2SMS dispatch response for ${phoneNumber}:`, result);
        } catch (error) {
          console.error("Fast2SMS API failed to send SMS:", error);
        }
      } else {
        console.warn("FAST2SMS_API_KEY not configured. Falling back to terminal log.");
        console.log(`[SMS-MOCK-FALLBACK] OTP for ${phoneNumber} is: ${otpCode}`);
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
      })
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
          message: "This phone number is already registered to another account.",
        });
      }

      // Query latest verification record
      const [verification] = await db
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

      // Check if expired
      if (new Date() > verification.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The OTP verification code has expired. Please request a new one.",
        });
      }

      // Verify code
      if (verification.otpCode !== input.otpCode) {
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
          walletBalance: 0,
          frozenBalance: 0,
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
