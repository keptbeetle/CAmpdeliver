"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";

import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";
import { CanteenMenu } from "./CanteenMenu";
import { WalletTopUp } from "./WalletTopUp";

export function Dashboard() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const globalChannelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);

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

  const broadcastGlobalUpdate = async () => {
    if (globalChannelRef.current) {
      await globalChannelRef.current.send({
        type: "broadcast",
        event: "order_update",
        payload: { refresh: true },
      });
    }
  };

  // Fetch real-time user profile database info from tRPC
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery(trpc.auth.getMyProfile.queryOptions());

  // Fetch orders from tRPC
  const { data: orders, isLoading: isLoadingOrders } = useQuery(
    trpc.order.myOrders.queryOptions(),
  );
  const { data: availableQuests, isLoading: isLoadingQuests } = useQuery(
    trpc.order.availableQuests.queryOptions(),
  );

  const acceptOrderMutation = useMutation(
    trpc.order.acceptOrder.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
        await broadcastGlobalUpdate();
      },
    }),
  );

  const confirmAvailabilityMutation = useMutation(
    trpc.order.confirmAvailability.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
        await broadcastGlobalUpdate();
      },
    }),
  );

  const rejectOrderMutation = useMutation(
    trpc.order.rejectOrder.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
        await broadcastGlobalUpdate();
      },
    }),
  );

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-12">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        <p className="mt-4 font-medium text-zinc-400">
          Securing connection to Campus Vault...
        </p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-200">
        <h3 className="text-xl font-bold">Failed to Load Profile</h3>
        <p className="mt-2 text-sm text-red-300/80">
          {error?.message ?? "Verify your connection settings."}
        </p>
        <Button
          onClick={handleSignOut}
          className="mt-4 bg-red-600 hover:bg-red-500"
        >
          Sign Out
        </Button>
      </div>
    );
  }

  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(paise / 100);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      {/* Header bar */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-2xl font-extrabold text-white shadow-lg shadow-purple-500/20">
            {profile.name[0]?.toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-purple-300 uppercase">
                {profile.role}
              </span>
            </div>
            <p className="text-sm text-zinc-400">{profile.email}</p>
          </div>
        </div>
        <Button
          onClick={handleSignOut}
          variant="outline"
          className="border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white"
        >
          Sign Out
        </Button>
      </div>

      {/* Main dashboard content */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Left Column - Digital Wallet & TopUp */}
        <div className="flex flex-col gap-6 md:col-span-1">
          <h3 className="text-xl font-bold tracking-wide text-white">
            Campus Wallet
          </h3>

          {/* Card Layout */}
          <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-tr from-purple-900/90 to-indigo-900/90 p-6 shadow-2xl">
            {/* Glossy overlay */}
            <div className="pointer-events-none absolute top-0 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl"></div>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
                  CAmpDeliver digital card
                </p>
                <h4 className="mt-4 text-2xl font-bold tracking-wider text-white">
                  {profile.name.toUpperCase()}
                </h4>
              </div>
              <div className="h-6 w-10 rounded-md bg-white/20 backdrop-blur-sm"></div>
            </div>

            <div className="mt-8">
              <p className="text-xs tracking-widest text-zinc-400 uppercase">
                Available Balance
              </p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-white">
                {formatCurrency(profile.walletBalance)}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-zinc-400">
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
                  Status
                </span>
                <span className="font-semibold text-emerald-400">● Active</span>
              </div>
            </div>
          </div>

          <WalletTopUp />
        </div>

        {/* Right Column - Ordering and Active Orders */}
        <div className="flex flex-col gap-6 md:col-span-2">
          <CanteenMenu onOrderCreated={broadcastGlobalUpdate} />

          <h3 className="mt-4 text-xl font-bold tracking-wide text-white">
            Your Recent Orders
          </h3>

          <div className="flex flex-col gap-4">
            {isLoadingOrders ? (
              <p className="text-zinc-500">Loading orders...</p>
            ) : orders && orders.length > 0 ? (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-semibold text-white">
                        {order.canteenName}
                      </h5>
                      <p className="mt-1 text-xs text-zinc-400">
                        Status:{" "}
                        <span className="font-bold text-purple-400">
                          {order.status}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Role:{" "}
                        {order.buyerId === profile.id ? "Buyer" : "Deliverer"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">
                        {formatCurrency(order.foodPrice + order.deliveryFee)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {order.delivererId === profile.id &&
                    order.status === "ACCEPTED" && (
                      <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            disabled={
                              rejectOrderMutation.isPending ||
                              confirmAvailabilityMutation.isPending
                            }
                            onClick={() =>
                              rejectOrderMutation.mutate({ orderId: order.id })
                            }
                          >
                            {rejectOrderMutation.isPending
                              ? "Rejecting..."
                              : "Reject (Unavailable)"}
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-500"
                            disabled={
                              confirmAvailabilityMutation.isPending ||
                              rejectOrderMutation.isPending
                            }
                            onClick={() =>
                              confirmAvailabilityMutation.mutate({
                                orderId: order.id,
                              })
                            }
                          >
                            {confirmAvailabilityMutation.isPending
                              ? "Confirming..."
                              : "Confirm Item Available"}
                          </Button>
                        </div>

                        {/* Error Messages */}
                        {confirmAvailabilityMutation.error &&
                          (
                            confirmAvailabilityMutation.variables as
                              | { orderId: string }
                              | undefined
                          )?.orderId === order.id && (
                            <p className="mt-1 text-right text-xs text-red-400">
                              {confirmAvailabilityMutation.error.message}
                            </p>
                          )}
                        {rejectOrderMutation.error &&
                          (
                            rejectOrderMutation.variables as
                              | { orderId: string }
                              | undefined
                          )?.orderId === order.id && (
                            <p className="mt-1 text-right text-xs text-red-400">
                              {rejectOrderMutation.error.message}
                            </p>
                          )}
                      </div>
                    )}

                  {/* General Actions */}
                  {(order.status === "ACCEPTED" || order.status === "PREPARING") && (
                    <div className="mt-4 border-t border-white/10 pt-3">
                      <Button
                        variant="outline"
                        className="w-full border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                        onClick={() => router.push(`/order/${order.id}/tracker`)}
                      >
                        Open Tracker
                      </Button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-8 backdrop-blur-xl">
                <p className="text-center text-sm text-zinc-400">
                  No active orders found. Place an order above!
                </p>
              </div>
            )}
          </div>

          <h3 className="mt-4 text-xl font-bold tracking-wide text-white">
            Available Side Quests
          </h3>

          <div className="flex flex-col gap-4">
            {isLoadingQuests ? (
              <p className="text-zinc-500">Scanning for quests...</p>
            ) : availableQuests && availableQuests.length > 0 ? (
              availableQuests.map((quest) => (
                <div
                  key={quest.id}
                  className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-4 backdrop-blur-sm"
                >
                  <div>
                    <h5 className="font-semibold text-white">
                      {quest.canteenName}
                    </h5>
                    <p className="mt-1 text-xs text-indigo-300">
                      To: {quest.deliveryLocationName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-sm font-bold text-emerald-400">
                      Earn {formatCurrency(quest.deliveryFee)}
                    </p>
                    <Button
                      size="sm"
                      className="bg-indigo-600 text-white hover:bg-indigo-500"
                      disabled={acceptOrderMutation.isPending}
                      onClick={() =>
                        acceptOrderMutation.mutate({ orderId: quest.id })
                      }
                    >
                      {acceptOrderMutation.isPending
                        ? "Accepting..."
                        : "Accept Quest"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-8 backdrop-blur-xl">
                <p className="text-center text-sm text-zinc-400">
                  No open quests right now.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
