"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (phone.trim().startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }
  return phone.includes("+") ? phone : `+91${phone}`;
}

export function AuthForm() {
  const router = useRouter();

  // States
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [hostelName, setHostelName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // OTP States
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState(1);
  const [timer, setTimer] = useState(0);

  const otpInputRef = useRef<HTMLInputElement>(null);

  const trpc = useTRPC();
  const sendOtpMutation = useMutation(trpc.otp.sendOtp.mutationOptions());
  const verifyOtpMutation = useMutation(
    trpc.otp.verifyOtpAndSignup.mutationOptions(),
  );

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer]);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  const handleSendOtp = async () => {
    if (
      !name.trim() ||
      !hostelName.trim() ||
      !phoneNumber.trim() ||
      !password.trim()
    ) {
      setError("All fields are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const sanitizedPhone = sanitizePhone(phoneNumber);
      await sendOtpMutation.mutateAsync({ phoneNumber: sanitizedPhone });
      setStep(2);
      setOtpCode("");
      setTimer(300);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send verification code.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify: string) => {
    setError(null);
    setLoading(true);

    try {
      const sanitizedPhone = sanitizePhone(phoneNumber);
      const result = await verifyOtpMutation.mutateAsync({
        name,
        hostelName,
        phoneNumber: sanitizedPhone,
        password,
        otpCode: codeToVerify,
      });

      if (result.session) {
        const { error } = await supabaseClient.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
        if (error) throw error;
      } else {
        const virtualEmail =
          result.user.email ?? `${sanitizedPhone}@campus.edu`.toLowerCase();
        const { error } = await supabaseClient.auth.signInWithPassword({
          email: virtualEmail,
          password,
        });
        if (error) throw error;
      }

      setMessage("Account created and signed in!");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Invalid OTP.",
      );
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const sanitizedPhone = sanitizePhone(phoneNumber);
      const formattedEmail = `${sanitizedPhone}@campus.edu`.toLowerCase();
      console.log("[Auth] Attempting sign-in with email:", formattedEmail);
      const { error: signInError } =
        await supabaseClient.auth.signInWithPassword({
          email: formattedEmail,
          password,
        });

      if (signInError) throw signInError;

      setMessage("Logged in successfully!");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "An authentication error occurred.",
      );
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 flex flex-col gap-2 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          {isSignUp ? "Create an Account" : "Welcome Back"}
        </h2>
        <p className="text-sm text-zinc-400">
          {isSignUp
            ? "Sign up to begin your campus delivery side quests"
            : "Sign in to order, deliver, and track campus payments"}
        </p>
      </div>

      {!isSignUp ? (
        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phoneNumber" className="text-zinc-300">
              Phone Number
            </Label>
            <Input
              id="phoneNumber"
              type="text"
              placeholder="9999999999"
              value={phoneNumber}
              onChange={(e) =>
                setPhoneNumber(e.target.value.replace(/[^\d+\-\s()]/g, ""))
              }
              className="border-white/10 bg-white/5 text-white placeholder-zinc-500 focus:border-purple-500"
              maxLength={20}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-zinc-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder-zinc-500 focus:border-purple-500"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              {message}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold text-white shadow-lg shadow-purple-500/20 hover:from-purple-500 hover:to-indigo-500"
          >
            {loading ? "Processing..." : "Sign In"}
          </Button>
        </form>
      ) : step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-zinc-300">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Alex Pierce"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder-zinc-500 focus:border-purple-500"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hostelName" className="text-zinc-300">
              Hostel Name
            </Label>
            <Input
              id="hostelName"
              type="text"
              placeholder="e.g. Block A"
              value={hostelName}
              onChange={(e) => setHostelName(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder-zinc-500 focus:border-purple-500"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phoneNumber" className="text-zinc-300">
              Phone Number
            </Label>
            <Input
              id="phoneNumber"
              type="text"
              placeholder="9999999999"
              value={phoneNumber}
              onChange={(e) =>
                setPhoneNumber(e.target.value.replace(/[^\d+\-\s()]/g, ""))
              }
              className="border-white/10 bg-white/5 text-white placeholder-zinc-500 focus:border-purple-500"
              maxLength={20}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-zinc-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder-zinc-500 focus:border-purple-500"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button
            type="button"
            onClick={handleSendOtp}
            disabled={loading}
            className="mt-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold text-white shadow-lg shadow-purple-500/20 hover:from-purple-500 hover:to-indigo-500"
          >
            {loading ? "Processing..." : "Send Verification Code"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-zinc-300">
            Enter the 6-digit code sent to +91 {phoneNumber}
          </p>
          <div className="relative mb-2 flex justify-between px-2">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const char = otpCode[idx] ?? "";
              const isCurrentFocus = otpCode.length === idx;
              return (
                <div
                  key={idx}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-zinc-950 ${
                    isCurrentFocus
                      ? "border-purple-500 shadow shadow-purple-500/30"
                      : char
                        ? "border-zinc-700"
                        : "border-zinc-800"
                  }`}
                >
                  <span className="text-xl font-bold text-white">{char}</span>
                </div>
              );
            })}
            <input
              ref={otpInputRef}
              value={otpCode}
              onChange={(e) => {
                const clean = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtpCode(clean);
                if (clean.length === 6) {
                  void handleVerifyOtp(clean);
                }
              }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0,
                width: "100%",
                cursor: "text",
              }}
            />
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-zinc-400">
              {timer > 0
                ? `Resend code in ${formatTimer(timer)}`
                : "Didn't receive code?"}
            </span>
            <button
              type="button"
              disabled={timer > 0 || loading}
              onClick={handleSendOtp}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                timer > 0
                  ? "text-zinc-600"
                  : "text-purple-400 hover:bg-purple-900/40"
              }`}
            >
              Resend OTP
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="mt-2 flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
              disabled={loading}
              className="flex-1 border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
            >
              Back
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 text-center text-sm">
        <span className="text-zinc-400">
          {isSignUp ? "Already have an account? " : "New to CAmpDeliver? "}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setStep(1);
            setError(null);
            setMessage(null);
          }}
          className="font-medium text-purple-400 hover:text-purple-300 hover:underline focus:outline-none"
        >
          {isSignUp ? "Sign In" : "Create Account"}
        </button>
      </div>
    </div>
  );
}
