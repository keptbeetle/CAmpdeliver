"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { supabaseClient } from "~/auth/client";

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const formattedEmail = email.includes("@") ? email.trim() : `${email.trim()}@campus.edu`;

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabaseClient.auth.signUp({
          email: formattedEmail,
          password,
          options: {
            data: {
              name: name || formattedEmail.split("@")[0],
            },
          },
        });

        if (signUpError) throw signUpError;
        
        if (data.session) {
          setMessage("Account created and signed in!");
          router.refresh();
        } else {
          setMessage("Check your email for the confirmation link!");
        }
      } else {
        const { error: signInError } =
          await supabaseClient.auth.signInWithPassword({
            email: formattedEmail,
            password,
          });

        if (signInError) throw signInError;
        
        setMessage("Logged in successfully!");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An authentication error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-col gap-2 text-center mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          {isSignUp ? "Create an Account" : "Welcome Back"}
        </h2>
        <p className="text-sm text-zinc-400">
          {isSignUp
            ? "Sign up to begin your campus delivery side quests"
            : "Sign in to access your digital campus wallet"}
        </p>
      </div>

      <form onSubmit={handleAuth} className="flex flex-col gap-4">
        {isSignUp && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-zinc-300">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Alex Pierce"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder-zinc-500 focus:border-purple-500"
              required
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-zinc-300">Email Address / Dummy ID</Label>
          <Input
            id="email"
            type="text"
            placeholder="alex@campus.edu or 'alex'"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder-zinc-500 focus:border-purple-500"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-zinc-300">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder-zinc-500 focus:border-purple-500"
            required
          />
        </div>

        {error && (
          <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            {message}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 font-semibold"
        >
          {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <span className="text-zinc-400">
          {isSignUp ? "Already have an account? " : "New to CAmpDeliver? "}
        </span>
        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
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
