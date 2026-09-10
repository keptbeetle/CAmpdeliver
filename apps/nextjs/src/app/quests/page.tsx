"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Compass, MapPin, Sparkles, Utensils } from "lucide-react";

import { useTRPC } from "~/trpc/react";

export default function QuestsPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  }>();

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition((position) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const paymentConfig = useQuery(trpc.payment.config.queryOptions());
  const { data: quests, isLoading } = useQuery({
    ...trpc.order.availableQuests.queryOptions(location ?? {}),
    enabled: !!location && paymentConfig.data?.databaseReady === true,
  });

  const acceptOrderMutation = useMutation(
    trpc.order.acceptOrder.mutationOptions({
      onSuccess: (updatedOrder) => {
        void queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        router.push(`/orders/${updatedOrder.id}/status`);
      },
    }),
  );

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
          <h1 className="text-xl font-black text-white">Available Quests</h1>
          <p className="text-xs text-zinc-400">
            Pick up deliveries for campus peers & earn payouts
          </p>
        </div>
      </div>

      {paymentConfig.data?.databaseReady === false && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 text-amber-100">
          <p className="text-sm font-black">
            Quest delivery is temporarily paused
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            Your connection is working. Quest acceptance will resume after the
            payment/security database migration is applied.
          </p>
        </div>
      )}

      {/* Quests List */}
      <div className="flex flex-col gap-4">
        {paymentConfig.isLoading || isLoading ? (
          [1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-28 w-full animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50"
            />
          ))
        ) : paymentConfig.data?.databaseReady === false ? (
          <div className="rounded-3xl border border-amber-500/20 bg-amber-950/10 p-8 text-center text-sm text-amber-200">
            New quests will appear here after the server database upgrade
            completes.
          </div>
        ) : quests && quests.length > 0 ? (
          quests.map(
            (quest: {
              id: string;
              canteenName: string;
              deliveryLocationName: string;
              deliveryFee: number;
              foodPrice: number;
            }) => (
              <div
                key={quest.id}
                className="flex flex-col gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-4 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Utensils className="h-4 w-4 text-purple-400" />
                      <h3 className="font-bold text-white">
                        {quest.canteenName}
                      </h3>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-indigo-300">
                      <MapPin className="h-3.5 w-3.5 text-indigo-400" />
                      Drop-off: {quest.deliveryLocationName}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-zinc-400">Earn Fee</span>
                    <p className="text-base font-black text-emerald-400">
                      ₹{(quest.deliveryFee / 100).toFixed(0)}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-zinc-400">
                  Advance only is safer: CAmpDeliver verifies buyer payment
                  before you spend. If you offer Pay at Delivery, you may front
                  the canteen cost until handover.
                </p>
                <div className="flex items-center justify-between gap-3 border-t border-indigo-500/20 pt-3">
                  <span className="text-[11px] text-zinc-400">
                    Food Order Value: ₹{(quest.foodPrice / 100).toFixed(0)}
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      disabled={acceptOrderMutation.isPending}
                      onClick={() =>
                        acceptOrderMutation.mutate({
                          orderId: quest.id,
                          allowPayAtDelivery: false,
                        })
                      }
                      className="rounded-xl border border-indigo-500/40 bg-indigo-950/50 px-3 py-2 text-[11px] font-extrabold text-indigo-200 transition-all hover:bg-indigo-900/60 disabled:opacity-50"
                    >
                      Advance only
                    </button>
                    <button
                      disabled={acceptOrderMutation.isPending}
                      onClick={() =>
                        acceptOrderMutation.mutate({
                          orderId: quest.id,
                          allowPayAtDelivery: true,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-extrabold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>
                        {acceptOrderMutation.isPending
                          ? "Accepting..."
                          : "Offer Pay at Delivery"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ),
          )
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <Compass className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-400">
              No active delivery quests available right now.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              New requests from students will appear here in real time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
