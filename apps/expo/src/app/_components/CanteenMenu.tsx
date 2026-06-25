import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

const CANTEENS = [
  {
    id: "c1",
    name: "Main Campus Cafeteria",
    items: [
      { id: "i1", name: "Masala Dosa", price: 6000 },
      { id: "i2", name: "Veg Sandwich", price: 4000 },
      { id: "i3", name: "Cold Coffee", price: 3500 },
    ],
  },
  {
    id: "c2",
    name: "Hostel Night Canteen",
    items: [
      { id: "i4", name: "Maggi", price: 3000 },
      { id: "i5", name: "Egg Roll", price: 4500 },
      { id: "i6", name: "Tea", price: 1500 },
    ],
  },
];

export function CanteenMenu() {
  const queryClient = useQueryClient();

  const [selectedCanteenId, setSelectedCanteenId] = useState(CANTEENS[0]?.id);
  const [cart, setCart] = useState<
    { id: string; name: string; price: number; quantity: number }[]
  >([]);

  const selectedCanteen = CANTEENS.find((c) => c.id === selectedCanteenId);

  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions({
      onSuccess: () => {
        Alert.alert("Success", "Order broadcasted successfully!");
        setCart([]);
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });

        // Broadcast that a new order has been created
        const globalChan = supabase.channel("global:orders");
        void globalChan.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void globalChan.send({
              type: "broadcast",
              event: "order_update",
              payload: { refresh: true },
            }).then(() => {
              void supabase.removeChannel(globalChan);
            });
          }
        });
      },
      onError: (e) => {
        Alert.alert("Error", e.message || "Failed to create order");
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
      Alert.alert("Notice", "Cart is empty");
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
    return `₹${(paise / 100).toFixed(2)}`;
  };

  return (
    <View className="mb-6 rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-5">
      <Text className="mb-4 text-lg font-bold tracking-wide text-white">
        Order Food
      </Text>

      {/* Canteen Selector */}
      <View className="mb-4 flex-row flex-wrap gap-2">
        {CANTEENS.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              setSelectedCanteenId(c.id);
              setCart([]);
            }}
            className={`rounded-xl px-4 py-2 ${
              selectedCanteenId === c.id
                ? "bg-purple-600"
                : "border border-zinc-800 bg-black/40"
            }`}
          >
            <Text
              className={`text-sm font-bold ${selectedCanteenId === c.id ? "text-white" : "text-zinc-400"}`}
            >
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mb-6 rounded-2xl border border-white/5 bg-black/20 p-4">
        <Text className="mb-3 text-xs font-bold tracking-widest text-zinc-400 uppercase">
          Menu
        </Text>
        {selectedCanteen?.items.map((item) => (
          <View
            key={item.id}
            className="mb-2 flex-row items-center justify-between rounded-xl border border-white/5 bg-zinc-900 p-3"
          >
            <View>
              <Text className="font-semibold text-white">{item.name}</Text>
              <Text className="text-xs text-zinc-400">
                {formatCurrency(item.price)}
              </Text>
            </View>
            <Pressable
              onPress={() => handleAddToCart(item)}
              className="rounded-lg bg-purple-600/20 px-4 py-2 active:bg-purple-600/40"
            >
              <Text className="text-sm font-bold text-purple-400">+ Add</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View className="rounded-2xl border border-white/5 bg-black/20 p-4">
        <Text className="mb-3 text-xs font-bold tracking-widest text-zinc-400 uppercase">
          Your Cart
        </Text>
        {cart.length === 0 ? (
          <View className="items-center justify-center py-6">
            <Text className="text-sm text-zinc-500">Cart is empty</Text>
          </View>
        ) : (
          <View>
            {cart.map((item) => (
              <View
                key={item.id}
                className="mb-2 flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-bold text-zinc-400">
                    {item.quantity}x
                  </Text>
                  <Text className="text-sm text-white">{item.name}</Text>
                </View>
                <View className="flex-row items-center gap-4">
                  <Text className="text-sm font-bold text-zinc-300">
                    {formatCurrency(item.price * item.quantity)}
                  </Text>
                  <Pressable onPress={() => handleRemoveFromCart(item.id)}>
                    <Text className="text-lg font-bold text-red-400">-</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View className="mt-4 border-t border-white/10 pt-4">
              <View className="mb-1 flex-row justify-between">
                <Text className="text-xs text-zinc-400">Items Total</Text>
                <Text className="text-xs text-zinc-400">
                  {formatCurrency(totalFoodPrice)}
                </Text>
              </View>
              <View className="mb-2 flex-row justify-between">
                <Text className="text-xs text-zinc-400">Delivery Fee</Text>
                <Text className="text-xs text-zinc-400">
                  {formatCurrency(deliveryFee)}
                </Text>
              </View>
              <View className="flex-row justify-between border-t border-white/10 pt-2">
                <Text className="text-sm font-bold text-white">Total</Text>
                <Text className="text-sm font-bold text-white">
                  {formatCurrency(totalCost)}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handlePlaceOrder}
              disabled={createOrderMutation.isPending}
              className={`mt-6 items-center justify-center rounded-xl py-4 ${
                createOrderMutation.isPending
                  ? "bg-indigo-600/50"
                  : "bg-indigo-600 active:bg-indigo-700"
              }`}
            >
              <Text className="text-base font-extrabold text-white">
                {createOrderMutation.isPending
                  ? "Broadcasting..."
                  : "Broadcast Order"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
