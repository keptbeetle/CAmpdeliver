"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, MapPin, Minus, Plus, ShoppingBag, Utensils } from "lucide-react";

import { useCart } from "~/app/_components/cart/CartContext";
import { useTRPC } from "~/trpc/react";

export default function CanteenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();

  const { data: canteens } = useQuery(trpc.canteen.listActive.queryOptions());
  const canteen = canteens?.find((c: { id: string }) => c.id === id);

  const { data: menuItems, isLoading } = useQuery(
    trpc.menu.listByCanteen.queryOptions({ canteenId: id }),
  );

  const { items, addItem, removeItem, updateQuantity, totalItems, totalPrice } =
    useCart();

  return (
    <div className="relative flex flex-col pb-28">
      {/* Top Banner / Hero Header */}
      <div className="relative h-48 w-full overflow-hidden bg-zinc-900">
        <img
          src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80"
          alt={canteen?.name ?? "Canteen Cover"}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-black/60" />

        {/* Back Button */}
        <Link
          href="/"
          className="absolute top-4 left-4 flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-md transition-all hover:bg-black/80 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {/* Canteen Info overlay */}
        <div className="absolute bottom-4 left-4 right-4">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-950/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-md">
            Open Now
          </span>
          <h1 className="mt-1 text-2xl font-black text-white">
            {canteen?.name ?? "Campus Canteen"}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-300">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-purple-400" />
              8:00 AM - 10:00 PM
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-zinc-400" />
              Campus Location
            </span>
          </div>
        </div>
      </div>

      {/* Menu Header */}
      <div className="px-4 pt-6 sm:px-6">
        <h2 className="text-lg font-bold text-white">Recommended Menu</h2>
        <p className="text-xs text-zinc-400">
          Freshly prepared items available for instant delivery
        </p>
      </div>

      {/* Food Items List */}
      <div className="flex flex-col gap-4 px-4 pt-4 sm:px-6 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-24 w-full animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50"
            />
          ))
        ) : menuItems && menuItems.length > 0 ? (
          menuItems.map((item: { id: string; name: string; price: number; isAvailable: boolean }) => {
            const cartItem = items.find((i) => i.id === item.id);
            const quantity = cartItem?.quantity ?? 0;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 transition-all hover:border-zinc-700"
              >
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <h3 className="font-bold text-white">{item.name}</h3>
                  </div>
                  <p className="mt-1 text-sm font-black text-purple-400">
                    ₹{(item.price / 100).toFixed(0)}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {item.isAvailable ? "In Stock" : "Currently Unavailable"}
                  </p>
                </div>

                {/* Quantity Control Stepper */}
                <div className="shrink-0">
                  {quantity === 0 ? (
                    <button
                      disabled={!item.isAvailable}
                      onClick={() =>
                        addItem({
                          id: item.id,
                          name: item.name,
                          price: item.price,
                          canteenId: id,
                          canteenName: canteen?.name ?? "Campus Canteen",
                        })
                      }
                      className="flex items-center gap-1 rounded-xl border border-purple-500/50 bg-purple-600/20 px-4 py-2 text-xs font-bold text-purple-300 transition-all hover:bg-purple-600/30 active:scale-95 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>ADD</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-purple-500/60 bg-purple-950/60 p-1 text-white shadow-md">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-purple-300 transition-colors hover:bg-zinc-700 active:scale-90"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>

                      <span className="w-5 text-center text-xs font-black">
                        {quantity}
                      </span>

                      <button
                        onClick={() => updateQuantity(item.id, quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-white transition-colors hover:bg-purple-500 active:scale-90"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <Utensils className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm font-semibold text-zinc-400">
              No menu items available for this canteen yet.
            </p>
          </div>
        )}
      </div>

      {/* Sticky Bottom Cart Card */}
      {totalItems > 0 && (
        <div className="fixed bottom-16 left-1/2 z-40 w-full -translate-x-1/2 max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between rounded-2xl border border-purple-500/50 bg-purple-950/95 p-3.5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white font-black text-xs">
                {totalItems}
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-300">Total Bill</p>
                <p className="text-base font-black text-white">
                  ₹{(totalPrice / 100).toFixed(0)}
                </p>
              </div>
            </div>

            <Link
              href="/checkout"
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-purple-600/30 transition-all hover:bg-purple-500 active:scale-95"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Checkout</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
