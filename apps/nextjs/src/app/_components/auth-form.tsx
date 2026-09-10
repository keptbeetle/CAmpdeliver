"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

function normalizeLegacySignInPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (phone.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return phone.includes("+") ? phone : `+91${phone}`;
}

function normalizeSignupPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const subscriber =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : null;
  if (!subscriber || !/^[6-9]\d{9}$/.test(subscriber)) return null;
  return `+91${subscriber}`;
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <p className="font-semibold">Needs attention</p>
      <p className="mt-0.5 text-xs leading-relaxed text-red-600">{message}</p>
    </div>
  );
}

export function AuthForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [hostelName, setHostelName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [timer, setTimer] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const sendOtpMutation = useMutation(trpc.otp.sendOtp.mutationOptions());
  const verifyOtpMutation = useMutation(
    trpc.otp.verifyOtpAndSignup.mutationOptions(),
  );

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(
      () => setTimer((previous) => previous - 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (step !== 2) return;
    const timeout = setTimeout(() => otpInputRef.current?.focus(), 150);
    return () => clearTimeout(timeout);
  }, [step]);

  const handleSendOtp = async () => {
    if (
      !name.trim() ||
      !hostelName.trim() ||
      !phoneNumber.trim() ||
      !password
    ) {
      setError("Complete all account details before continuing.");
      return;
    }
    const signupPhone = normalizeSignupPhone(phoneNumber);
    if (!signupPhone) {
      setError(
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      );
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setError("Password must be at most 72 characters.");
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await sendOtpMutation.mutateAsync({
        phoneNumber: signupPhone,
      });
      setStep(2);
      setOtpCode("");
      setTimer(result.resendAfterSeconds);
      setMessage("A real verification SMS was sent to your phone.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "The verification SMS could not be sent.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (loading || otpCode.length !== 6) return;
    const signupPhone = normalizeSignupPhone(phoneNumber);
    if (!signupPhone) {
      setError(
        "Return to account details and enter a valid Indian mobile number.",
      );
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtpMutation.mutateAsync({
        name: name.trim(),
        hostelName: hostelName.trim(),
        phoneNumber: signupPhone,
        password,
        otpCode,
      });

      const virtualEmail =
        result.user.email ?? `${signupPhone}@campus.edu`.toLowerCase();
      const { error: signInError } =
        await supabaseClient.auth.signInWithPassword({
          email: virtualEmail,
          password,
        });
      if (signInError) throw signInError;

      setMessage("Phone verified. Your account is ready.");
      router.refresh();
    } catch (err: unknown) {
      setOtpCode("");
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Check the code and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!phoneNumber.trim() || !password) {
      setError("Enter your phone number and password.");
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const formattedEmail =
        `${normalizeLegacySignInPhone(phoneNumber)}@campus.edu`.toLowerCase();
      const { error: signInError } =
        await supabaseClient.auth.signInWithPassword({
          email: formattedEmail,
          password,
        });
      if (signInError) throw signInError;
      setMessage("Signed in successfully.");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in with this account.",
      );
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (seconds: number) =>
    `00:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white/95 p-6 shadow-[0_24px_70px_rgba(26,78,130,0.14)] backdrop-blur sm:p-8">
      <div className="mb-6 text-center">
        <p className="text-xs font-bold tracking-[0.18em] text-blue-700 uppercase">
          Secure campus access
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {isSignUp
            ? "New accounts are verified using a real SMS sent to an Indian mobile number."
            : "Sign in with your existing CAmpDeliver phone number and password."}
        </p>
      </div>

      {isSignUp ? (
        <div className="mb-5 flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${step === 1 ? "bg-blue-700 text-white" : "bg-green-600 text-white"}`}
          >
            {step === 2 ? "✓" : "1"}
          </div>
          <div
            className={`h-1 flex-1 rounded-full ${step === 2 ? "bg-green-200" : "bg-blue-100"}`}
          />
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${step === 2 ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-500"}`}
          >
            2
          </div>
        </div>
      ) : null}

      {!isSignUp ? (
        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phoneNumber" className="text-slate-700">
              Phone number
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phoneNumber}
              onChange={(event) =>
                setPhoneNumber(event.target.value.replace(/[^\d+\-\s()]/g, ""))
              }
              className="border-blue-100 bg-blue-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
              maxLength={20}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-slate-700">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="border-blue-100 bg-blue-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
              required
            />
          </div>

          {error ? <ErrorNotice message={error} /> : null}
          {message ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
              {message}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 w-full bg-blue-700 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-800"
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      ) : step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-slate-700">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border-blue-100 bg-blue-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hostelName" className="text-slate-700">
              Hostel name
            </Label>
            <Input
              id="hostelName"
              type="text"
              placeholder="e.g. Block A"
              value={hostelName}
              onChange={(event) => setHostelName(event.target.value)}
              className="border-blue-100 bg-blue-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signupPhoneNumber" className="text-slate-700">
              Indian mobile number
            </Label>
            <Input
              id="signupPhoneNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phoneNumber}
              onChange={(event) =>
                setPhoneNumber(event.target.value.replace(/[^\d+\-\s()]/g, ""))
              }
              className="border-blue-100 bg-blue-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
              maxLength={20}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signupPassword" className="text-slate-700">
              Password
            </Label>
            <Input
              id="signupPassword"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="border-blue-100 bg-blue-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-200"
            />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
            <span className="font-bold">Real phone verification:</span> we will
            send a 6-digit SMS to this number. There is no dummy-code signup
            path.
          </div>
          {error ? <ErrorNotice message={error} /> : null}

          <Button
            type="button"
            onClick={() => void handleSendOtp()}
            disabled={loading}
            className="mt-1 w-full bg-blue-700 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-800"
          >
            {loading ? "Sending SMS…" : "Send Verification Code"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="font-bold">Verification SMS sent</p>
            <p className="mt-1 text-xs leading-relaxed text-green-700">
              Enter the code sent to{" "}
              {normalizeSignupPhone(phoneNumber) ?? phoneNumber}. The code
              expires in 5 minutes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => otpInputRef.current?.focus()}
            className="relative flex justify-between gap-2 rounded-2xl bg-blue-50/70 p-3"
            aria-label="Enter six digit verification code"
          >
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const value = otpCode[index] ?? "";
              return (
                <span
                  key={index}
                  className={`flex h-12 flex-1 items-center justify-center rounded-xl border-2 text-xl font-black text-slate-900 ${value ? "border-blue-500 bg-white" : "border-blue-100 bg-white/70"}`}
                >
                  {value}
                </span>
              );
            })}
            <input
              ref={otpInputRef}
              value={otpCode}
              onChange={(event) =>
                setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="absolute inset-0 h-full w-full cursor-text opacity-0"
              aria-hidden="true"
            />
          </button>

          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="text-xs font-medium text-amber-800">
              {timer > 0
                ? `Resend available in ${formatTimer(timer)}`
                : "You can request a fresh code now."}
            </span>
            <button
              type="button"
              disabled={timer > 0 || loading}
              onClick={() => void handleSendOtp()}
              className="rounded-lg px-3 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:text-amber-400"
            >
              Resend
            </button>
          </div>

          {error ? <ErrorNotice message={error} /> : null}

          <Button
            type="button"
            onClick={() => void handleVerifyOtp()}
            disabled={loading || otpCode.length !== 6}
            className="w-full bg-blue-700 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-800"
          >
            {loading ? "Verifying…" : "Verify & Create Account"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStep(1);
              setError(null);
              setMessage(null);
              setOtpCode("");
            }}
            disabled={loading}
            className="w-full border-blue-200 bg-white text-blue-800 hover:bg-blue-50"
          >
            Back to details
          </Button>
        </div>
      )}

      <div className="mt-6 text-center text-sm">
        <span className="text-slate-500">
          {isSignUp ? "Already have an account? " : "New to CAmpDeliver? "}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsSignUp((current) => !current);
            setStep(1);
            setError(null);
            setMessage(null);
            setOtpCode("");
          }}
          className="font-bold text-blue-700 hover:text-blue-900 hover:underline focus:outline-none"
        >
          {isSignUp ? "Sign In" : "Create Account"}
        </button>
      </div>
    </div>
  );
}
