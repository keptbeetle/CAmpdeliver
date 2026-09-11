"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

const EMAIL_OTP_LENGTH = 8;

function isValidEmailOtp(code: string) {
  return code.length === EMAIL_OTP_LENGTH && /^\d+$/.test(code);
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

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
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
  const trpc = useTRPC();
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
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

  const requestOtpMutation = useMutation(
    trpc.auth.requestSignupEmailOtp.mutationOptions(),
  );
  const completeSignupMutation = useMutation(
    trpc.auth.completeSignup.mutationOptions(),
  );
  const signInMutation = useMutation(
    trpc.auth.signInWithIdentifier.mutationOptions(),
  );

  useEffect(() => {
    if (timer <= 0) return;
    const interval = window.setInterval(
      () => setTimer((previous) => Math.max(0, previous - 1)),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (step !== 2) return;
    const timeout = window.setTimeout(() => otpInputRef.current?.focus(), 150);
    return () => window.clearTimeout(timeout);
  }, [step]);

  const handleSendOtp = async () => {
    if (
      !name.trim() ||
      !hostelName.trim() ||
      !email.trim() ||
      !phoneNumber.trim() ||
      !password
    ) {
      setError("Complete all account details before continuing.");
      return;
    }
    const signupEmail = normalizeEmail(email);
    if (!signupEmail) {
      setError("Enter your valid IIITDMJ student email address.");
      return;
    }
    const signupPhone = normalizeSignupPhone(phoneNumber);
    if (!signupPhone) {
      setError(
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      );
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError("Password must be between 8 and 72 characters.");
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await requestOtpMutation.mutateAsync({
        email: signupEmail,
        phoneNumber: signupPhone,
      });
      setEmail(result.email);
      setStep(2);
      setOtpCode("");
      setTimer(result.resendAfterSeconds);
      setMessage("A verification code was sent to your college email.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "The verification email could not be sent.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (loading || !isValidEmailOtp(otpCode)) return;
    const signupEmail = normalizeEmail(email);
    const signupPhone = normalizeSignupPhone(phoneNumber);
    if (!signupEmail || !signupPhone) {
      setError(
        "Return to account details and check your email and phone number.",
      );
      return;
    }

    setError(null);
    setLoading(true);
    let emailVerified = false;
    try {
      const { error: verifyError } = await supabaseClient.auth.verifyOtp({
        email: signupEmail,
        token: otpCode,
        type: "email",
      });
      if (verifyError) throw verifyError;
      emailVerified = true;

      const { error: passwordError } = await supabaseClient.auth.updateUser({
        password,
        data: { name: name.trim() },
      });
      if (passwordError) throw passwordError;

      await completeSignupMutation.mutateAsync({
        name: name.trim(),
        hostelName: hostelName.trim(),
        phoneNumber: signupPhone,
      });

      setMessage("College email verified. Your account is ready.");
      window.location.replace("/");
    } catch (err: unknown) {
      if (emailVerified) {
        await supabaseClient.auth.signOut({ scope: "local" });
      }
      setOtpCode("");
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Check the email code and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your college email or phone number and password.");
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await signInMutation.mutateAsync({
        identifier: identifier.trim(),
        password,
      });
      const { error: sessionError } = await supabaseClient.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) throw sessionError;
      setMessage("Signed in successfully.");
      window.location.replace("/");
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
            ? "Verify your official IIITDMJ student email. Your phone number is required for delivery contact, not OTP verification."
            : "Sign in with your college email or registered phone number."}
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
        <form className="space-y-4" onSubmit={handleSignIn}>
          <div className="space-y-1.5">
            <Label htmlFor="identifier">College email or phone number</Label>
            <Input
              id="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="rollnumber@iiitdmj.ac.in or 98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
          </div>
          {error ? <ErrorNotice message={error} /> : null}
          {message ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700">
              {message}
            </div>
          ) : null}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 font-bold text-white hover:bg-blue-800"
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      ) : step === 1 ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hostelName">Hostel name</Label>
            <Input
              id="hostelName"
              value={hostelName}
              onChange={(event) => setHostelName(event.target.value)}
              placeholder="e.g. Block A"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">IIITDMJ student email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="rollnumber@iiitdmj.ac.in"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber">Phone number</Label>
            <Input
              id="phoneNumber"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="98765 43210"
            />
            <p className="text-xs text-slate-500">
              Required for delivery contact. We do not send an OTP to this
              number.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signupPassword">Password</Label>
            <Input
              id="signupPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8–72 characters"
            />
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-700">
            <span className="font-semibold">College email verification:</span>{" "}
            we will send an 8-digit one-time code to your official college
            inbox.
          </div>
          {error ? <ErrorNotice message={error} /> : null}
          <Button
            type="button"
            disabled={loading}
            onClick={() => void handleSendOtp()}
            className="w-full bg-blue-700 font-bold text-white hover:bg-blue-800"
          >
            {loading ? "Sending..." : "Send Email Verification Code"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="font-bold text-green-800">Verification email sent</p>
            <p className="mt-1 text-xs leading-relaxed text-green-700">
              Enter the 8-digit code sent to {email}. Check spam/junk if it does
              not appear in your inbox.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailOtp">Email verification code</Label>
            <Input
              ref={otpInputRef}
              id="emailOtp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(event) =>
                setOtpCode(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, EMAIL_OTP_LENGTH),
                )
              }
              placeholder="00000000"
              className="text-center text-xl font-black tracking-[0.45em] placeholder:font-normal placeholder:tracking-normal"
            />
          </div>
          {message ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700">
              {message}
            </div>
          ) : null}
          {error ? <ErrorNotice message={error} /> : null}
          <Button
            type="button"
            disabled={loading || !isValidEmailOtp(otpCode)}
            onClick={() => void handleVerifyOtp()}
            className="w-full bg-blue-700 font-bold text-white hover:bg-blue-800"
          >
            {loading ? "Verifying..." : "Verify Email & Create Account"}
          </Button>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {timer > 0
                ? `Resend available in ${formatTimer(timer)}`
                : "Didn't get it?"}
            </span>
            <button
              type="button"
              disabled={timer > 0 || loading}
              onClick={() => void handleSendOtp()}
              className="font-bold text-blue-700 disabled:text-slate-400"
            >
              Resend code
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setOtpCode("");
              setError(null);
            }}
            className="w-full text-sm font-semibold text-slate-600 hover:text-blue-700"
          >
            Back to account details
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-2 text-sm">
        <span className="text-slate-500">
          {isSignUp ? "Already have an account?" : "New to CAmpDeliver?"}
        </span>
        <button
          type="button"
          className="font-bold text-blue-700 hover:text-blue-800"
          onClick={() => {
            setIsSignUp((value) => !value);
            setStep(1);
            setOtpCode("");
            setError(null);
            setMessage(null);
          }}
        >
          {isSignUp ? "Sign In" : "Create Account"}
        </button>
      </div>
    </div>
  );
}
