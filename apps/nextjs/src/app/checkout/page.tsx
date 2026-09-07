"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import { useCart } from "~/app/_components/cart/CartContext";
import { useTRPC } from "~/trpc/react";

/** Haversine distance in metres */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckoutPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const {
    items,
    canteenId,
    canteenName,
    removeItem,
    updateQuantity,
    clearCart,
    totalPrice,
  } = useCart();

  const { data: landmarks } = useQuery(trpc.landmark.list.queryOptions());

  // Auto-detected location state
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [locationError, setLocationError] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const captureLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLocationStatus("error");
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    // Browsers only expose geolocation on HTTPS (localhost is also allowed).
    // Reporting this up front avoids a misleading generic GPS failure.
    if (!window.isSecureContext) {
      setLocationStatus("error");
      setLocationError(
        "Location is available only on a secure (HTTPS) connection.",
      );
      return;
    }

    setLocationStatus("loading");
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationStatus("success");
      },
      (err) => {
        setLocationStatus("error");
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in your browser, then try again."
            : err.code === err.TIMEOUT
              ? "Location took too long. Check that location services are on, then try again."
              : "Could not detect your location. Check location services, then try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []);

  const resolvedLocationName = useMemo(() => {
    if (!userCoords || !landmarks || landmarks.length === 0) {
      return "Current Location";
    }

    let nearest: { name: string; distance: number } | null = null;
    for (const lm of landmarks as {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      radius: number;
    }[]) {
      const dist = haversineDistance(
        userCoords.lat,
        userCoords.lng,
        lm.latitude,
        lm.longitude,
      );
      if (!nearest || dist < nearest.distance) {
        nearest = { name: lm.name, distance: dist };
      }
    }

    if (nearest) {
      return nearest.distance <= 100 ? nearest.name : `Near ${nearest.name}`;
    }
    return "Current Location";
  }, [userCoords, landmarks]);

  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions({
      onSuccess: (newOrder) => {
        clearCart();
        if (newOrder.id) {
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
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900 text-zinc-500">
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

  const deliveryFee = 500; // ₹5 in paise
  const finalTotal = totalPrice + deliveryFee;

  const handlePlaceOrder = () => {
    setErrorMsg(null);

    if (!canteenId) {
      setErrorMsg("Missing canteen information.");
      return;
    }

    if (!userCoords) {
      setErrorMsg(
        "Could not detect your location. Please enable location services and reload.",
      );
      return;
    }

    createOrderMutation.mutate({
      canteenId,
      deliveryLocationName: resolvedLocationName,
      deliveryLatitude: userCoords.lat,
      deliveryLongitude: userCoords.lng,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
    });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 pb-28 sm:px-6">
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
            <div
              key={item.id}
              className="flex items-center justify-between pt-2"
            >
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{item.name}</p>
                <p className="text-xs font-semibold text-purple-400">
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

      {/* Auto-Detected Delivery Location */}
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <MapPin className="h-4 w-4 text-purple-400" />
          Delivery Location
        </h3>

        <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5">
          {locationStatus === "loading" && (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              <div>
                <p className="text-sm font-semibold text-zinc-300">
                  Detecting your location…
                </p>
                <p className="text-xs text-zinc-500">
                  Please allow location access if prompted
                </p>
              </div>
            </>
          )}
          {locationStatus === "success" && (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-950/80 text-emerald-400">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {resolvedLocationName}
                </p>
                <p className="text-xs text-zinc-500">
                  GPS: {userCoords?.lat.toFixed(5)},{" "}
                  {userCoords?.lng.toFixed(5)}
                </p>
              </div>
            </>
          )}
          {locationStatus === "error" && (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-950/80 text-red-400">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-300">
                  Location unavailable
                </p>
                <p className="text-xs text-zinc-500">{locationError}</p>
              </div>
            </>
          )}
          {locationStatus === "idle" && (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-950/80 text-purple-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-200">
                  Use your current location
                </p>
                <p className="text-xs text-zinc-500">
                  Only used to create this delivery order
                </p>
              </div>
            </>
          )}
        </div>
        {locationStatus !== "success" && locationStatus !== "loading" && (
          <button
            type="button"
            onClick={captureLocation}
            className="self-start rounded-xl border border-purple-500/50 px-3 py-2 text-xs font-bold text-purple-300 transition-colors hover:bg-purple-500/10"
          >
            {locationStatus === "error"
              ? "Try location again"
              : "Use my location"}
          </button>
        )}
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
        disabled={createOrderMutation.isPending || locationStatus !== "success"}
        onClick={handlePlaceOrder}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 py-4 text-sm font-black text-white shadow-xl shadow-purple-600/30 transition-all hover:bg-purple-500 active:scale-95 disabled:opacity-50"
      >
        <CheckCircle2 className="h-5 w-5" />
        <span>
          {createOrderMutation.isPending
            ? "Broadcasting Order…"
            : `Place Order • ₹${(finalTotal / 100).toFixed(0)}`}
        </span>
      </button>
    </div>
  );
}
