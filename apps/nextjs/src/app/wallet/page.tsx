"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wallet as WalletIcon } from "lucide-react";

import { WalletTopUp } from "~/app/_components/WalletTopUp";
import { useTRPC } from "~/trpc/react";

export default function WalletPage() {
  const trpc = useTRPC();
  const { data: profile, isLoading } = useQuery(trpc.auth.getMyProfile.queryOptions());

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  const formatCurrency = (paise: number) => {
    return `₹${(paise / 100).toFixed(2)}`;
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-28">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-white">Campus Wallet</h1>
          <p className="text-xs text-zinc-400">Digital card & simulative top-up</p>
        </div>
      </div>

      {/* Digital Wallet Card */}
      <div className="relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-tr from-purple-900/90 via-indigo-900/90 to-purple-950 p-6 shadow-2xl">
        <div className="pointer-events-none absolute top-0 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />

        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest text-purple-300 uppercase">
              CAmpDeliver Digital Pass
            </p>
            <h4 className="mt-2 text-xl font-bold tracking-wider text-white">
              {profile.name.toUpperCase()}
            </h4>
          </div>
          <WalletIcon className="h-8 w-8 text-white/40" />
        </div>

        <div className="mt-6">
          <p className="text-xs tracking-widest text-zinc-400 uppercase">
            Available Balance
          </p>
          <p className="mt-1 text-3xl font-black tracking-tight text-white">
            {formatCurrency(profile.walletBalance)}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-zinc-400">
          <div>
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">
              Frozen Escrow
            </span>
            <span className="font-semibold text-zinc-300">
              {formatCurrency(profile.frozenBalance)}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase">
              Hostel
            </span>
            <span className="font-semibold text-purple-300">
              {profile.hostelName ?? "Campus"}
            </span>
          </div>
        </div>
      </div>

      {/* Top Up Form */}
      <WalletTopUp />
    </div>
  );
}
