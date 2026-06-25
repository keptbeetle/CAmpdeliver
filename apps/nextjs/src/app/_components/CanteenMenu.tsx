"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";
import { supabaseClient } from "~/auth/client";

const CANTEENS = [
  {
    id: "c1",
    name: "Main Campus Cafeteria",
    items: [
      { id: "i1", name: "Masala Dosa", price: 6000 }, // in paise
      { id: "i2", name: "Veg Sandwich", price: 4000 },
      { id: "i3", name: "Cold Coffee", price: 3500 },
    ],
  },
  {
    id: "c2",
    name: "Library Brews",
    items: [
      { id: "i4", name: "Cappuccino", price: 4500 },
      { id: "i5", name: "Blueberry Muffin", price: 3000 },
      { id: "i6", name: "Green Tea", price: 2500 },
    ],
  },
];

export function CanteenMenu() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [selectedCanteenId, setSelectedCanteenId] = useState(CANTEENS[0]?.id);
  const [cart, setCart] = useState<
    { id: string; name: string; price: number; quantity: number }[]
  >([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const selectedCanteen = CANTEENS.find((c) => c.id === selectedCanteenId);

  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions({
      onSuccess: () => {
        setSuccess(true);
        setError("");
        setCart([]);
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        
        // Broadcast that a new order has been created
        const globalChan = supabaseClient.channel("global:orders");
        void globalChan.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void globalChan.send({
              type: "broadcast",
              event: "order_update",
              payload: { refresh: true },
            }).then(() => {
              void supabaseClient.removeChannel(globalChan);
            });
          }
        });

        setTimeout(() => setSuccess(false), 3000);
      },
      onError: (e) => {
        setError(e.message || "Failed to create order");
        setSuccess(false);
      },
    }),
  );

  const handleAddToCart = (item: {
    id: string;
    name: string;
    price: number;
  }) => {
    setCart((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      if (existing) {
        return prev.map((p) =>
          p.id === item.id ? { ...p, quantity: p.quantity + 1 } : p,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((p) => p.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map((p) =>
          p.id === itemId ? { ...p, quantity: p.quantity - 1 } : p,
        );
      }
      return prev.filter((p) => p.id !== itemId);
    });
  };

  const totalFoodPrice = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const deliveryFee = 500; // 5 rupees default
  const totalCost = totalFoodPrice + deliveryFee;

  const handlePlaceOrder = () => {
    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }

    createOrderMutation.mutate({
      canteenName: selectedCanteen?.name ?? "Unknown",
      items: cart.map((c) => ({
        name: c.name,
        price: c.price,
        quantity: c.quantity,
      })),
      deliveryLocationName: "My Hostel Room", // Hardcoded for demo
    });
  };

  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(paise / 100);
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold tracking-wide text-white">
          Order Food
        </h3>
        <select
          value={selectedCanteenId}
          onChange={(e) => {
            setSelectedCanteenId(e.target.value);
            setCart([]); // Clear cart on canteen change
          }}
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
        >
          {CANTEENS.map((c) => (
            <option key={c.id} value={c.id} className="bg-zinc-900">
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Menu Items */}
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            Menu
          </h4>
          {selectedCanteen?.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3"
            >
              <div>
                <p className="font-medium text-white">{item.name}</p>
                <p className="text-xs text-zinc-400">
                  {formatCurrency(item.price)}
                </p>
              </div>
              <Button
                onClick={() => handleAddToCart(item)}
                size="sm"
                className="rounded-lg bg-purple-600/20 text-purple-300 hover:bg-purple-600/40"
              >
                + Add
              </Button>
            </div>
          ))}
        </div>

        {/* Cart */}
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            Your Cart
          </h4>
          {cart.length === 0 ? (
            <div className="flex min-h-[150px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10">
              <p className="text-sm text-zinc-500">Cart is empty</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-black/20 p-4">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">{item.quantity}x</span>
                    <span className="text-white">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-300">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                    <button
                      onClick={() => handleRemoveFromCart(item.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      -
                    </button>
                  </div>
                </div>
              ))}

              <div className="mt-3 flex flex-col gap-1 border-t border-white/10 pt-3 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Items Total</span>
                  <span>{formatCurrency(totalFoodPrice)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Delivery Fee</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-bold text-white">
                  <span>Total</span>
                  <span>{formatCurrency(totalCost)}</span>
                </div>
              </div>

              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              {success && (
                <p className="mt-2 text-xs text-emerald-400">
                  Order broadcasted!
                </p>
              )}

              <Button
                onClick={handlePlaceOrder}
                disabled={createOrderMutation.isPending}
                className="mt-4 w-full rounded-xl bg-indigo-600 py-2 font-bold text-white transition-colors hover:bg-indigo-500"
              >
                {createOrderMutation.isPending
                  ? "Broadcasting..."
                  : "Broadcast Order"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
