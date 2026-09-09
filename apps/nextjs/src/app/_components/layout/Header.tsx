"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  CreditCard,
  Home,
  LogOut,
  MapPin,
  Menu,
  ShieldAlert,
  ShoppingBag,
  TrendingUp,
  User,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const trpc = useTRPC();
  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    retry: false,
  });

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    setIsOpen(false);
    router.refresh();
    router.push("/");
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-xs font-black text-white shadow-md shadow-purple-600/30">
              CA
            </div>
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-lg font-black tracking-tight text-transparent">
              CAmpDeliver
            </span>
          </Link>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {profile && (
              <Link
                href="/earnings"
                className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-950/40 px-2.5 py-1 text-xs font-semibold text-purple-300"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Earnings</span>
              </Link>
            )}

            <button
              onClick={() => setIsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-95"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Slide-out Navigation Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative z-10 flex h-full w-4/5 max-w-xs flex-col border-l border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl">
            {/* Close Button */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <span className="text-sm font-bold tracking-wider text-zinc-400 uppercase">
                Navigation
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Profile Info */}
            <div className="my-4 flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600/30 text-purple-400">
                <User className="h-5 w-5" />
              </div>
              <div className="overflow-hidden">
                <p className="truncate text-sm font-bold text-white">
                  {profile?.name ?? "Guest Student"}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {profile?.hostelName ?? "Campus Hostel"}
                </p>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 space-y-1 overflow-y-auto py-2">
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
                  pathname === "/"
                    ? "bg-purple-600/20 text-purple-300"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </Link>

              <Link
                href="/quests"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
                  pathname.startsWith("/quests")
                    ? "bg-purple-600/20 text-purple-300"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <Compass className="h-4 w-4" />
                <span>Available Quests</span>
              </Link>

              <Link
                href="/orders"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
                  pathname.startsWith("/orders")
                    ? "bg-purple-600/20 text-purple-300"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                <span>My Orders</span>
              </Link>

              <Link
                href="/earnings"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
                  pathname.startsWith("/earnings")
                    ? "bg-purple-600/20 text-purple-300"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                <span>Earnings & Settlements</span>
              </Link>

              {/* Admin Section (Role Gated) */}
              {profile?.role === "ADMIN" && (
                <div className="mt-4 border-t border-zinc-800/80 pt-4">
                  <p className="mb-2 flex items-center gap-1.5 px-3.5 text-xs font-bold tracking-wider text-amber-400/90 uppercase">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Admin Section
                  </p>

                  <Link
                    href="/admin/payments"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-950/30"
                  >
                    <CreditCard className="h-4 w-4" />
                    <span>Payments & Settlements</span>
                  </Link>

                  <Link
                    href="/admin/canteens"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-950/30"
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                    <span>Canteens & Menu Admin</span>
                  </Link>

                  <Link
                    href="/admin/landmarks"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-950/30"
                  >
                    <MapPin className="h-4 w-4" />
                    <span>Landmarks Management</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Logout Button */}
            {profile && (
              <div className="border-t border-zinc-800/80 pt-4">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-950/30 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-900/40"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
