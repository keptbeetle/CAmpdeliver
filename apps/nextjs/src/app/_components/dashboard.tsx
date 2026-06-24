"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@acme/ui/button";
import { supabaseClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";
import { WalletTopUp } from "./WalletTopUp";
import { CanteenMenu } from "./CanteenMenu";

export function Dashboard() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  
  // Fetch real-time user profile database info from tRPC
  const { data: profile, isLoading, error } = useQuery(trpc.auth.getMyProfile.queryOptions());
  
  // Fetch orders from tRPC
  const { data: orders, isLoading: isLoadingOrders } = useQuery(trpc.order.myOrders.queryOptions());
  const { data: availableQuests, isLoading: isLoadingQuests } = useQuery(trpc.order.availableQuests.queryOptions());

  const acceptOrderMutation = useMutation(trpc.order.acceptOrder.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.order.availableQuests.queryKey() });
    }
  }));

  const confirmAvailabilityMutation = useMutation(trpc.order.confirmAvailability.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.auth.getMyProfile.queryKey() });
    }
  }));

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-zinc-400 font-medium">Securing connection to Campus Vault...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="w-full max-w-md p-6 text-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200">
        <h3 className="text-xl font-bold">Failed to Load Profile</h3>
        <p className="mt-2 text-sm text-red-300/80">{error?.message || "Verify your connection settings."}</p>
        <Button onClick={handleSignOut} className="mt-4 bg-red-600 hover:bg-red-500">Sign Out</Button>
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
    <div className="w-full max-w-5xl px-4 py-8 mx-auto flex flex-col gap-8">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center font-extrabold text-2xl text-white shadow-lg shadow-purple-500/20">
            {profile.name[0]?.toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {profile.role}
              </span>
            </div>
            <p className="text-sm text-zinc-400">{profile.email}</p>
          </div>
        </div>
        <Button
          onClick={handleSignOut}
          variant="outline"
          className="border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white"
        >
          Sign Out
        </Button>
      </div>

      {/* Main dashboard content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column - Digital Wallet & TopUp */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <h3 className="text-xl font-bold text-white tracking-wide">Campus Wallet</h3>
          
          {/* Card Layout */}
          <div className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-tr from-purple-900/90 to-indigo-900/90 border border-white/10 shadow-2xl flex flex-col justify-between min-h-[220px]">
            {/* Glossy overlay */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">CAmpDeliver digital card</p>
                <h4 className="text-2xl font-bold text-white mt-4 tracking-wider">
                  {profile.name.toUpperCase()}
                </h4>
              </div>
              <div className="w-10 h-6 bg-white/20 rounded-md backdrop-blur-sm"></div>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-widest text-zinc-400">Available Balance</p>
              <p className="text-4xl font-extrabold text-white mt-1 tracking-tight">
                {formatCurrency(profile.walletBalance)}
              </p>
            </div>

            <div className="mt-4 flex justify-between items-center text-xs text-zinc-400 border-t border-white/10 pt-4">
              <div>
                <span className="block text-[10px] uppercase text-zinc-500 font-bold">Frozen Escrow</span>
                <span className="font-semibold text-zinc-300">{formatCurrency(profile.frozenBalance)}</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] uppercase text-zinc-500 font-bold">Status</span>
                <span className="font-semibold text-emerald-400">● Active</span>
              </div>
            </div>
          </div>

          <WalletTopUp />
        </div>

        {/* Right Column - Ordering and Active Orders */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <CanteenMenu />

          <h3 className="text-xl font-bold text-white tracking-wide mt-4">Your Recent Orders</h3>

          <div className="flex flex-col gap-4">
            {isLoadingOrders ? (
              <p className="text-zinc-500">Loading orders...</p>
            ) : orders && orders.length > 0 ? (
              orders.map((order) => (
                <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 backdrop-blur-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="text-white font-semibold">{order.canteenName}</h5>
                      <p className="text-xs text-zinc-400 mt-1">Status: <span className="text-purple-400 font-bold">{order.status}</span></p>
                      <p className="text-xs text-zinc-500 mt-1">Role: {order.buyerId === profile.id ? "Buyer" : "Deliverer"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{formatCurrency(order.foodPrice + order.deliveryFee)}</p>
                      <p className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  {order.delivererId === profile.id && order.status === "ACCEPTED" && (
                    <div className="border-t border-white/10 pt-3 flex justify-end">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        disabled={confirmAvailabilityMutation.isPending}
                        onClick={() => confirmAvailabilityMutation.mutate({ orderId: order.id })}
                      >
                        {confirmAvailabilityMutation.isPending ? "Confirming..." : "Confirm Item Available"}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl">
                <p className="text-sm text-zinc-400 text-center">
                  No active orders found. Place an order above!
                </p>
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold text-white tracking-wide mt-4">Available Side Quests</h3>

          <div className="flex flex-col gap-4">
            {isLoadingQuests ? (
              <p className="text-zinc-500">Scanning for quests...</p>
            ) : availableQuests && availableQuests.length > 0 ? (
              availableQuests.map((quest) => (
                <div key={quest.id} className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-4 flex justify-between items-center backdrop-blur-sm">
                  <div>
                    <h5 className="text-white font-semibold">{quest.canteenName}</h5>
                    <p className="text-xs text-indigo-300 mt-1">To: {quest.deliveryLocationName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-emerald-400 font-bold text-sm">Earn {formatCurrency(quest.deliveryFee)}</p>
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white"
                      disabled={acceptOrderMutation.isPending}
                      onClick={() => acceptOrderMutation.mutate({ orderId: quest.id })}
                    >
                      {acceptOrderMutation.isPending ? "Accepting..." : "Accept Quest"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl">
                <p className="text-sm text-zinc-400 text-center">
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
