"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChefHat,
  Clock,
  KeyRound,
  MessageSquare,
  Navigation,
  PackageCheck,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const STEPS = [
  { key: "BROADCASTED", title: "Order Broadcasted", icon: Clock },
  { key: "ACCEPTED", title: "Accepted by Deliverer", icon: PackageCheck },
  { key: "PREPARING", title: "Food Preparing", icon: ChefHat },
  { key: "ON_THE_WAY", title: "Out for Delivery", icon: Navigation },
];

function getStepIndex(status: string): number {
  switch (status) {
    case "BROADCASTED":
      return 0;
    case "ACCEPTED":
      return 1;
    case "PREPARING":
      return 2;
    case "ON_THE_WAY":
    case "NEAR_YOU":
      return 3;
    case "DELIVERED":
    case "COMPLETED":
      return 4;
    default:
      return 0;
  }
}

export default function OrderStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [otpInput, setOtpInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 3000,
  });

  const order = orders?.find((o: { id: string }) => o.id === id);
  const isDeliverer = order?.delivererId === profile?.id;

  const confirmAvailabilityMutation = useMutation(
    trpc.order.confirmAvailability.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() });
      },
      onError: (err: { message: string }) => setErrorMsg(err.message),
    }),
  );

  const updateStatusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() });
      },
      onError: (err: { message: string }) => setErrorMsg(err.message),
    }),
  );

  const verifyDeliveryMutation = useMutation(
    trpc.order.verifyDelivery.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.auth.getMyProfile.queryKey() });
      },
      onError: (err: { message: string }) => setErrorMsg(err.message),
    }),
  );

  if (isLoading || !order) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
        <p className="mt-4 text-xs font-semibold text-zinc-400">Loading Order Status...</p>
      </div>
    );
  }

  const currentStep = getStepIndex(order.status);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-28">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-white">Order Status Hub</h1>
          <p className="text-xs text-zinc-400">{order.canteenName}</p>
        </div>
      </div>

      {/* Visual 4-Step Progress Timeline */}
      <div className="flex flex-col gap-4 rounded-3xl border border-purple-500/30 bg-zinc-900/60 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-purple-500/40 bg-purple-950/60 px-3 py-1 text-xs font-bold text-purple-300">
            Status: {order.status}
          </span>
          <span className="text-xs font-semibold text-zinc-400">
            {isDeliverer ? "Deliverer View" : "Buyer View"}
          </span>
        </div>

        {/* Stepper Nodes */}
        <div className="relative mt-4 flex items-center justify-between px-2">
          {/* Connector Line */}
          <div className="absolute top-1/2 left-6 right-6 -z-0 h-1 -translate-y-1/2 bg-zinc-800" />
          <div
            className="absolute top-1/2 left-6 h-1 -translate-y-1/2 bg-purple-500 transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, (currentStep / 3) * 88))}%`,
            }}
          />

          {STEPS.map((step, idx) => {
            const isDone = currentStep > idx;
            const isCurrent = currentStep === idx;
            const Icon = step.icon;

            return (
              <div key={step.key} className="relative z-10 flex flex-col items-center gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                    isDone || isCurrent
                      ? "border-purple-500 bg-purple-600 text-white shadow-lg shadow-purple-600/40"
                      : "border-zinc-800 bg-zinc-900 text-zinc-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`text-[10px] font-bold text-center max-w-[65px] ${
                    isCurrent ? "text-purple-400" : isDone ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Shortcuts (Tracker & Chat Integration) */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/order/${order.id}/tracker`}
          className="flex items-center justify-center gap-2 rounded-2xl border border-purple-500/50 bg-purple-950/40 p-4 text-xs font-bold text-purple-300 transition-all hover:bg-purple-900/50 active:scale-95 shadow-md"
        >
          <Navigation className="h-4 w-4 text-purple-400" />
          <span>Live Tracker Map</span>
        </Link>

        <Link
          href={`/order/${order.id}/chat`}
          className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/50 bg-indigo-950/40 p-4 text-xs font-bold text-indigo-300 transition-all hover:bg-indigo-900/50 active:scale-95 shadow-md"
        >
          <MessageSquare className="h-4 w-4 text-indigo-400" />
          <span>Chat with {isDeliverer ? "Buyer" : "Deliverer"}</span>
        </Link>
      </div>

      {/* Delivery OTP Verification Card */}
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <KeyRound className="h-4 w-4 text-purple-400" />
          Delivery OTP Verification
        </h3>

        {!isDeliverer && order.otp && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-950/30 p-4 text-center">
            <p className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">
              Share With Your Deliverer
            </p>
            <p className="mt-1 text-3xl font-black tracking-[0.2em] text-white">
              {order.otp}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Provide this 4-digit OTP to the deliverer at handover.
            </p>
          </div>
        )}

        {isDeliverer && (
          <div className="flex flex-col gap-3 pt-2">
            {order.status === "ACCEPTED" && (
              <button
                disabled={confirmAvailabilityMutation.isPending}
                onClick={() => confirmAvailabilityMutation.mutate({ orderId: order.id })}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-500"
              >
                {confirmAvailabilityMutation.isPending ? "Confirming..." : "Confirm Item Availability"}
              </button>
            )}

            {order.status === "PREPARING" && (
              <button
                disabled={updateStatusMutation.isPending}
                onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: "ON_THE_WAY" })}
                className="w-full rounded-xl bg-purple-600 py-3 text-xs font-bold text-white hover:bg-purple-500"
              >
                {updateStatusMutation.isPending ? "Updating..." : "Mark On The Way"}
              </button>
            )}

            {order.status === "ON_THE_WAY" && (
              <button
                disabled={updateStatusMutation.isPending}
                onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: "NEAR_YOU" })}
                className="w-full rounded-xl bg-purple-600 py-3 text-xs font-bold text-white hover:bg-purple-500"
              >
                {updateStatusMutation.isPending ? "Updating..." : "Mark Near You"}
              </button>
            )}

            {order.status === "NEAR_YOU" && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-400">Enter Buyer's OTP Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="1234"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-center text-lg font-bold text-white tracking-widest focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    disabled={verifyDeliveryMutation.isPending || otpInput.length < 4}
                    onClick={() => verifyDeliveryMutation.mutate({ orderId: order.id, otp: otpInput })}
                    className="rounded-xl bg-green-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-green-500 disabled:opacity-50"
                  >
                    {verifyDeliveryMutation.isPending ? "..." : "Verify"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-3 text-xs font-semibold text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Order Summary Details */}
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-4 text-xs text-zinc-300">
        <h4 className="font-bold text-white">Order Details</h4>
        <div className="flex justify-between">
          <span className="text-zinc-500">Drop-off Location:</span>
          <span className="font-semibold text-white">{order.deliveryLocationName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Total Price:</span>
          <span className="font-bold text-purple-400">
            ₹{((order.foodPrice + order.deliveryFee) / 100).toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}
