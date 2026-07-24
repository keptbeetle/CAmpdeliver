"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  MapPin,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import { useCart } from "~/app/_components/cart/CartContext";
import { useTRPC } from "~/trpc/react";

export default function CheckoutPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { items, canteenId, canteenName, removeItem, updateQuantity, clearCart, totalPrice } =
    useCart();

  const { data: landmarks } = useQuery(trpc.landmark.list.queryOptions());

  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string>("");
  const [roomNumber, setRoomNumber] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions({
      onSuccess: (newOrder) => {
        clearCart();
        if (newOrder?.id) {
          router.push(`/orders/${newOrder.id}/status`);
        }
      },
      onError: (err) => {
        setErrorMsg(err.message);
      },
    }),
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-900 border border-zinc-800 text-zinc-500 mb-4">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-white">Your Cart is Empty</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Browse canteens and add items to your cart to checkout.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-xl bg-purple-600 px-6 py-3 text-xs font-extrabold text-white shadow-lg shadow-purple-600/30 transition-all hover:bg-purple-500"
        >
          Explore Canteens
        </Link>
      </div>
    );
  }

  const selectedLandmark = landmarks?.find((l: { id: string }) => l.id === selectedLandmarkId);

  const deliveryFee = 500; // ₹5 in paise
  const finalTotal = totalPrice + deliveryFee;

  const handlePlaceOrder = () => {
    setErrorMsg(null);

    if (!canteenId) {
      setErrorMsg("Missing canteen information.");
      return;
    }

    if (!selectedLandmark) {
      setErrorMsg("Please select a drop-off landmark.");
      return;
    }

    const fullLocationName = roomNumber.trim()
      ? `${selectedLandmark.name} (${roomNumber.trim()})`
      : selectedLandmark.name;

    createOrderMutation.mutate({
      canteenId,
      deliveryLocationName: fullLocationName,
      deliveryLatitude: selectedLandmark.latitude,
      deliveryLongitude: selectedLandmark.longitude,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
    });
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-28">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href={canteenId ? `/canteen/${canteenId}` : "/"}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-white">Order Checkout</h1>
          <p className="text-xs text-zinc-400">{canteenName}</p>
        </div>
      </div>

      {/* Itemized Cart Breakdown */}
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <h3 className="text-sm font-bold text-white">Items Review</h3>
          <button
            onClick={clearCart}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>

        <div className="flex flex-col gap-3 divide-y divide-zinc-800/40">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between pt-2">
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{item.name}</p>
                <p className="text-xs text-purple-400 font-semibold">
                  ₹{(item.price / 100).toFixed(0)} × {item.quantity} = ₹
                  {((item.price * item.quantity) / 100).toFixed(0)}
                </p>
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-1 text-white">
                <button
                  onClick={() => removeItem(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-4 text-center text-xs font-bold">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-500"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campus Drop-off Landmark Picker */}
      <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <MapPin className="h-4 w-4 text-purple-400" />
          Delivery Drop-off Location
        </h3>

        {/* Landmark Dropdown */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Select Hostel / Landmark
          </label>
          <select
            value={selectedLandmarkId}
            onChange={(e) => setSelectedLandmarkId(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="">-- Choose Drop-off Landmark --</option>
            {landmarks?.map((l: { id: string; name: string }) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Specific Room / Block Details */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Room / Floor / Block (Optional)
          </label>
          <div className="relative">
            <Building2 className="absolute top-3.5 left-3.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="e.g. Room 304, Block B"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Bill Summary Card */}
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Receipt className="h-4 w-4 text-purple-400" />
          Bill Summary
        </h3>

        <div className="flex flex-col gap-2 text-xs text-zinc-300">
          <div className="flex justify-between">
            <span className="text-zinc-400">Items Total</span>
            <span className="font-bold text-white">
              ₹{(totalPrice / 100).toFixed(0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Campus Delivery Fee</span>
            <span className="font-bold text-white">₹5</span>
          </div>
          <div className="flex justify-between border-t border-zinc-800/80 pt-2 text-sm font-black text-white">
            <span>To Pay</span>
            <span className="text-purple-400">
              ₹{(finalTotal / 100).toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-3 text-xs font-semibold text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Place Order CTA Button */}
      <button
        disabled={createOrderMutation.isPending}
        onClick={handlePlaceOrder}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 py-4 text-sm font-black text-white shadow-xl shadow-purple-600/30 transition-all hover:bg-purple-500 active:scale-95 disabled:opacity-50"
      >
        <CheckCircle2 className="h-5 w-5" />
        <span>
          {createOrderMutation.isPending
            ? "Broadcasting Order..."
            : `Place Order • ₹${(finalTotal / 100).toFixed(0)}`}
        </span>
      </button>
    </div>
  );
}
