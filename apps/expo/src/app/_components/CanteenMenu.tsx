import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc } from "~/utils/api";

interface DeliveryDestination {
  latitude: number;
  longitude: number;
}

export function CanteenMenu({
  onOrderCreated,
}: {
  onOrderCreated?: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const { data: canteens } = useQuery(
    trpc.canteen.listActiveWithMenu.queryOptions(),
  );
  const { data: landmarks } = useQuery(trpc.landmark.list.queryOptions());

  const [selectedCanteenId, setSelectedCanteenId] = useState<string>();
  const [cart, setCart] = useState<
    { id: string; name: string; price: number; quantity: number }[]
  >([]);
  const [destinationMode, setDestinationMode] = useState("");
  const [destination, setDestination] = useState<DeliveryDestination | null>(
    null,
  );
  const [destinationLabel, setDestinationLabel] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [locatingDestination, setLocatingDestination] = useState(false);

  const activeCanteenId = selectedCanteenId ?? canteens?.[0]?.id;
  const selectedCanteen = canteens?.find(
    (canteen) => canteen.id === activeCanteenId,
  );

  const resetDestination = () => {
    setDestinationMode("");
    setDestination(null);
    setDestinationLabel("");
  };

  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions({
      onSuccess: () => {
        Alert.alert(
          "Order broadcasted",
          "The selected delivery point is now locked for this order.",
        );
        setCart([]);
        resetDestination();
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        if (onOrderCreated) void onOrderCreated();
      },
      onError: (error) => {
        Alert.alert("Could not place order", error.message);
      },
    }),
  );

  const handleAddToCart = (item: {
    id: string;
    name: string;
    price: number;
  }) => {
    setCart((previous) => {
      const existing = previous.find((entry) => entry.id === item.id);
      if (existing) {
        return previous.map((entry) =>
          entry.id === item.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [...previous, { ...item, quantity: 1 }];
    });
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((previous) => {
      const existing = previous.find((entry) => entry.id === itemId);
      if (existing && existing.quantity > 1) {
        return previous.map((entry) =>
          entry.id === itemId
            ? { ...entry, quantity: entry.quantity - 1 }
            : entry,
        );
      }
      return previous.filter((entry) => entry.id !== itemId);
    });
  };

  const selectLandmark = (landmarkId: string) => {
    const landmark = landmarks?.find((entry) => entry.id === landmarkId);
    if (!landmark) return;

    setDestinationMode("landmark:" + landmark.id);
    setDestination({
      latitude: landmark.latitude,
      longitude: landmark.longitude,
    });
    setDestinationLabel(landmark.name);
  };

  const captureCurrentLocation = async () => {
    setDestinationMode("current");
    setDestination(null);
    setDestinationLabel("");
    setLocatingDestination(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          "Location access needed",
          "Enable location access or choose a campus landmark.",
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const latitude = location.coords.latitude;
      const longitude = location.coords.longitude;
      const name =
        "Pinned location (" +
        latitude.toFixed(5) +
        ", " +
        longitude.toFixed(5) +
        ")";
      setDestination({ latitude, longitude });
      setDestinationLabel(name);
    } catch (error) {
      console.error("Failed to capture delivery destination:", error);
      Alert.alert(
        "Location unavailable",
        "Try again or choose a campus landmark.",
      );
    } finally {
      setLocatingDestination(false);
    }
  };

  const totalFoodPrice = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const deliveryFee = 500;
  const totalCost = totalFoodPrice + deliveryFee;

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      Alert.alert("Cart is empty", "Add at least one item before ordering.");
      return;
    }
    if (!selectedCanteen) {
      Alert.alert("Choose a canteen", "Select a canteen before ordering.");
      return;
    }
    if (!destination || !destinationLabel.trim()) {
      Alert.alert(
        "Choose a delivery point",
        "Pin your current location or select a campus landmark.",
      );
      return;
    }

    setPlacingOrder(true);
    try {
      await createOrderMutation.mutateAsync({
        canteenId: selectedCanteen.id,
        items: cart.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        deliveryLocationName: destinationLabel.trim(),
        deliveryLatitude: destination.latitude,
        deliveryLongitude: destination.longitude,
      });
    } catch {
      // The mutation callback already presents the error to the user.
    } finally {
      setPlacingOrder(false);
    }
  };

  const formatCurrency = (paise: number) => "₹" + (paise / 100).toFixed(2);

  return (
    <View className="mb-6 rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-5">
      <Text className="mb-4 text-lg font-bold tracking-wide text-white">
        Order Food
      </Text>

      <View className="mb-4 flex-row flex-wrap gap-2">
        {canteens?.map((canteen) => (
          <Pressable
            key={canteen.id}
            onPress={() => {
              setSelectedCanteenId(canteen.id);
              setCart([]);
            }}
            className={
              activeCanteenId === canteen.id
                ? "rounded-xl bg-purple-600 px-4 py-2"
                : "rounded-xl border border-zinc-800 bg-black/40 px-4 py-2"
            }
          >
            <Text
              className={
                activeCanteenId === canteen.id
                  ? "text-sm font-bold text-white"
                  : "text-sm font-bold text-zinc-400"
              }
            >
              {canteen.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mb-6 rounded-2xl border border-white/5 bg-black/20 p-4">
        <Text className="mb-3 text-xs font-bold tracking-widest text-zinc-400 uppercase">
          Menu
        </Text>
        {selectedCanteen?.menuItems.map((item) => (
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
        {(!selectedCanteen?.menuItems ||
          selectedCanteen.menuItems.length === 0) && (
          <View className="items-center justify-center py-4">
            <Text className="text-sm text-zinc-500">No items available</Text>
          </View>
        )}
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
                    <Text className="text-lg font-bold text-red-400">−</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <Text className="mb-3 text-xs font-bold tracking-widest text-emerald-300 uppercase">
                Fixed delivery point
              </Text>

              <Pressable
                onPress={() => void captureCurrentLocation()}
                disabled={locatingDestination}
                className={
                  destinationMode === "current"
                    ? "mb-2 rounded-xl border border-emerald-400 bg-emerald-500/20 px-4 py-3"
                    : "mb-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                }
              >
                <Text className="text-center text-sm font-bold text-white">
                  {locatingDestination
                    ? "Capturing location..."
                    : "Pin my current location"}
                </Text>
              </Pressable>

              <Text className="my-2 text-center text-xs text-zinc-500">
                or choose a campus landmark
              </Text>

              <View className="flex-row flex-wrap gap-2">
                {landmarks?.map((landmark) => {
                  const selected =
                    destinationMode === "landmark:" + landmark.id;
                  return (
                    <Pressable
                      key={landmark.id}
                      onPress={() => selectLandmark(landmark.id)}
                      className={
                        selected
                          ? "rounded-lg border border-emerald-400 bg-emerald-500/20 px-3 py-2"
                          : "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                      }
                    >
                      <Text
                        className={
                          selected
                            ? "text-xs font-bold text-emerald-200"
                            : "text-xs font-bold text-zinc-300"
                        }
                      >
                        {landmark.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {destination && (
                <View className="mt-4">
                  <Text className="mb-1 text-xs text-zinc-400">
                    Delivery instructions or address label
                  </Text>
                  <TextInput
                    value={destinationLabel}
                    onChangeText={setDestinationLabel}
                    maxLength={200}
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                    placeholder="Where should the deliverer meet you?"
                    placeholderTextColor="#71717a"
                  />
                  <Text className="mt-2 text-xs leading-5 text-zinc-400">
                    This pin is saved with the order and will not move with the
                    recipient after broadcast.
                  </Text>
                </View>
              )}
            </View>

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
              onPress={() => void handlePlaceOrder()}
              disabled={
                placingOrder ||
                locatingDestination ||
                createOrderMutation.isPending
              }
              className={
                placingOrder || createOrderMutation.isPending
                  ? "mt-6 items-center justify-center rounded-xl bg-indigo-600/50 py-4"
                  : "mt-6 items-center justify-center rounded-xl bg-indigo-600 py-4 active:bg-indigo-700"
              }
            >
              <Text className="text-base font-extrabold text-white">
                {placingOrder || createOrderMutation.isPending
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
