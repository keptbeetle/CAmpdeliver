"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

interface DeliveryDestination {
  latitude: number;
  longitude: number;
}
}

export function CanteenMenu({
  onOrderCreated,
}: {
  onOrderCreated?: () => void | Promise<void>;
}) {
  const trpc = useTRPC();
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
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
        setSuccess(true);
        setError("");
        setCart([]);
        resetDestination();
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        if (onOrderCreated) void onOrderCreated();
        window.setTimeout(() => setSuccess(false), 3000);
      },
      onError: (mutationError) => {
        setError(mutationError.message || "Failed to create order");
        setSuccess(false);
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
    setError("");
  };

  const captureCurrentLocation = () => {
    setDestinationMode("current");
    setDestination(null);
    setDestinationLabel("");
    setError("");

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setLocatingDestination(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const name =
          "Pinned location (" +
          latitude.toFixed(5) +
          ", " +
          longitude.toFixed(5) +
          ")";
        setDestination({ latitude, longitude });
        setDestinationLabel(name);
        setLocatingDestination(false);
      },
      () => {
        setError(
          "Could not capture this location. Enable location access or choose a campus landmark.",
        );
        setLocatingDestination(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  };

  const handleDestinationChange = (value: string) => {
    if (!value) {
      resetDestination();
      return;
    }
    if (value === "current") {
      captureCurrentLocation();
      return;
    }
    if (value.startsWith("landmark:")) {
      selectLandmark(value.slice("landmark:".length));
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
      setError("Cart is empty");
      return;
    }
    if (!selectedCanteen) {
      setError("Choose a canteen before placing the order.");
      return;
    }
    if (!destination || !destinationLabel.trim()) {
      setError("Choose and confirm a fixed delivery destination.");
      return;
    }

    setPlacingOrder(true);
    setError("");
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

  const formatCurrency = (paise: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(paise / 100);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-bold tracking-wide text-white">
          Order Food
        </h3>
        <select
          value={activeCanteenId ?? ""}
          onChange={(event) => {
            setSelectedCanteenId(event.target.value);
            setCart([]);
          }}
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
        >
          {canteens?.map((canteen) => (
            <option key={canteen.id} value={canteen.id} className="bg-zinc-900">
              {canteen.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            Menu
          </h4>
          {selectedCanteen?.menuItems.map((item) => (
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
          {(!selectedCanteen?.menuItems ||
            selectedCanteen.menuItems.length === 0) && (
            <div className="flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10">
              <p className="text-sm text-zinc-500">No items available</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="mt-2 text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            Your Cart
          </h4>
          {cart.length === 0 ? (
            <div className="flex min-h-[150px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10">
              <p className="text-sm text-zinc-500">Cart is empty</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-black/20 p-4">
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
                      aria-label={"Remove one " + item.name}
                    >
                      −
                    </button>
                  </div>
                </div>
              ))}

              <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <label
                  htmlFor="delivery-destination"
                  className="mb-2 block text-xs font-bold tracking-wider text-emerald-300 uppercase"
                >
                  Fixed delivery point
                </label>
                <select
                  id="delivery-destination"
                  value={destinationMode}
                  onChange={(event) =>
                    handleDestinationChange(event.target.value)
                  }
                  className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Choose a destination</option>
                  <option value="current">Pin my current location</option>
                  {landmarks?.map((landmark) => (
                    <option key={landmark.id} value={"landmark:" + landmark.id}>
                      {landmark.name}
                    </option>
                  ))}
                </select>

                {destinationMode === "current" && !destination && (
                  <Button
                    type="button"
                    onClick={captureCurrentLocation}
                    disabled={locatingDestination}
                    className="mt-2 w-full rounded-lg bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30"
                  >
                    {locatingDestination
                      ? "Capturing location..."
                      : "Try capturing again"}
                  </Button>
                )}

                {destination && (
                  <div className="mt-3">
                    <label
                      htmlFor="delivery-label"
                      className="mb-1 block text-xs text-zinc-400"
                    >
                      Delivery instructions or address label
                    </label>
                    <input
                      id="delivery-label"
                      value={destinationLabel}
                      onChange={(event) =>
                        setDestinationLabel(event.target.value)
                      }
                      maxLength={200}
                      className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      This pin is saved with the order and cannot follow the
                      recipient after broadcast.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 border-t border-white/10 pt-3 text-sm">
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

              {error && <p className="text-xs text-red-400">{error}</p>}
              {success && (
                <p className="text-xs text-emerald-400">
                  Order broadcasted with a fixed delivery point.
                </p>
              )}

              <Button
                onClick={() => void handlePlaceOrder()}
                disabled={
                  placingOrder ||
                  locatingDestination ||
                  createOrderMutation.isPending
                }
                className="mt-2 w-full rounded-xl bg-indigo-600 py-2 font-bold text-white transition-colors hover:bg-indigo-500"
              >
                {placingOrder || createOrderMutation.isPending
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
