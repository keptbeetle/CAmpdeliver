"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";
import { CanteenFeed } from "./canteen/CanteenFeed";
import { ActiveOrderBanner } from "./order/ActiveOrderBanner";

export function Dashboard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const globalChannelRef =
    useRef<ReturnType<typeof supabaseClient.channel> | null>(null);

  useEffect(() => {
    const channel = supabaseClient
      .channel("global:orders")
      .on("broadcast", { event: "order_update" }, () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
      });

    channel.subscribe();
    globalChannelRef.current = channel;

    return () => {
      void supabaseClient.removeChannel(channel);
      globalChannelRef.current = null;
    };
  }, [queryClient, trpc]);

  // Fetch real-time user profile database info from tRPC
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
    <div className="relative flex flex-col gap-6">
      <CanteenFeed />
      <ActiveOrderBanner />
    </div>
  );
}
