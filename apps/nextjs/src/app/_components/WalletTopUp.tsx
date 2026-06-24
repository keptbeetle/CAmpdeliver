"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

export function WalletTopUp() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const topUpMutation = useMutation(
    trpc.wallet.topUp.mutationOptions({
      onSuccess: () => {
        setSuccess(true);
        setError("");
        setAmount("");
        setUtr("");
        queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
        setTimeout(() => setSuccess(false), 3000);
      },
      onError: (e) => {
        setError(e.message || "Failed to top up");
        setSuccess(false);
      },
    }),
  );

  const handleTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (utr.length < 5) {
      setError("Please enter a valid UTR number (min 5 chars).");
      return;
    }

    // Convert to paise
    const amountInPaise = Math.round(amountNum * 100);
    topUpMutation.mutate({ amount: amountInPaise, utrNumber: utr });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <h4 className="mb-4 text-lg font-bold text-white">Top Up Wallet</h4>
      <form onSubmit={handleTopUp} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Amount (₹)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white placeholder-zinc-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            placeholder="e.g. 100"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">UTR Number</label>
          <input
            type="text"
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white placeholder-zinc-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            placeholder="Enter mock UTR"
            required
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-400">Top-up successful!</p>
        )}

        <Button
          type="submit"
          disabled={topUpMutation.isPending}
          className="mt-2 w-full rounded-xl bg-purple-600 py-2 font-bold text-white transition-colors hover:bg-purple-500"
        >
          {topUpMutation.isPending ? "Processing..." : "Submit Top Up"}
        </Button>
      </form>
    </div>
  );
}
