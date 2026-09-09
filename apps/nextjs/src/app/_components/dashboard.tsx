"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { CanteenFeed } from "./canteen/CanteenFeed";
import { ActiveOrderBanner } from "./order/ActiveOrderBanner";

export function Dashboard() {
  const trpc = useTRPC();

  const { isLoading } = useQuery(trpc.auth.getMyProfile.queryOptions());

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-12">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        <p className="mt-4 font-medium text-zinc-400">
          Loading Campus Canteens...
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex w-full max-w-full min-w-0 flex-col gap-6">
      <CanteenFeed />
      <ActiveOrderBanner />
    </div>
  );
}
