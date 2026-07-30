import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DeliveryMap } from "~/components/maps/DeliveryMap";
import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { locationService } from "~/platform/location";
import { trpc } from "~/utils/api";

function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Helper to fetch actual road-routing directions between two coordinates via OSRM
async function fetchMobileRoute(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): Promise<{
  coordinates: { latitude: number; longitude: number }[];
  distance: number;
}> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`,
    );
    interface OSRMResponse {
      code: string;
      routes?: {
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
    }
    const data = (await res.json()) as OSRMResponse;
    const fallbackDist = getHaversineDistance(
      start.latitude,
      start.longitude,
      end.latitude,
      end.longitude,
    );
    if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
      const coords = data.routes[0].geometry.coordinates;
      const distance = data.routes[0].distance ?? fallbackDist;
      return {
        coordinates: coords.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        })),
        distance,
      };
    }
  } catch (error) {
    console.error("OSRM routing error:", error);
  }
  const fallbackDist = getHaversineDistance(
    start.latitude,
    start.longitude,
    end.latitude,
    end.longitude,
  );
  return {
    coordinates: [start, end],
    distance: fallbackDist,
  };
}

export default function OrderTrackerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery(
    trpc.order.myOrders.queryOptions(),
  );
  const { data: activeCanteens } = useQuery(
    trpc.canteen.listActive.queryOptions(),
  );

  const order = orders?.find((o) => o.id === id);
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation } = useOrderRealtime(id, {
    onOrderUpdate: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyProfile.queryKey(),
      });
    },
  });

  const [hasPermission, setHasPermission] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [distance, setDistance] = useState<number | null>(null);

  const [otpInput, setOtpInput] = useState("");

  const updateStatusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
      },
      onError: (err) => {
        Alert.alert("Error", err.message);
      },
    }),
  );

  const verifyDeliveryMutation = useMutation(
    trpc.order.verifyDelivery.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
        Alert.alert("Success", "Delivery verified successfully!");
      },
      onError: (err) => {
        Alert.alert("Verification Failed", err.message);
      },
    }),
  );

  useEffect(() => {
    if (!id || !isDeliverer) return;

    const askPermission = async () => {
      const granted = await locationService.requestForegroundPermission();
      if (!granted) {
        Alert.alert("Permission to access location was denied");
        return;
      }
      setHasPermission(true);
    };

    void askPermission();
  }, [id, isDeliverer]);

  const canteenCoords = order
    ? {
        latitude: order.canteenLatitude,
        longitude: order.canteenLongitude,
      }
    : null;

  const deliveryCoords = order
    ? {
        latitude: order.deliveryLatitude,
        longitude: order.deliveryLongitude,
      }
    : null;

  const startLoc =
    delivererLocation ??
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (order?.delivererLatitude && order?.delivererLongitude
      ? {
          latitude: order.delivererLatitude,
          longitude: order.delivererLongitude,
        }
      : canteenCoords &&
          (canteenCoords.latitude !== 0 || canteenCoords.longitude !== 0)
        ? canteenCoords
        : null);

  const endLoc =
    deliveryCoords &&
    (deliveryCoords.latitude !== 0 || deliveryCoords.longitude !== 0)
      ? deliveryCoords
      : null;

  const sLat = startLoc?.latitude;
  const sLng = startLoc?.longitude;
  const eLat = endLoc?.latitude;
  const eLng = endLoc?.longitude;

  // Fetch actual street path when coordinates update

  useEffect(() => {
    if (
      sLat === undefined ||
      sLng === undefined ||
      eLat === undefined ||
      eLng === undefined
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRouteCoordinates([]);

      setDistance(null);
      return;
    }

    let isMounted = true;

    void fetchMobileRoute(
      { latitude: sLat, longitude: sLng },
      { latitude: eLat, longitude: eLng },
    ).then(({ coordinates, distance }) => {
      if (isMounted) {
        setRouteCoordinates(coordinates);
        setDistance(distance);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [sLat, sLng, eLat, eLng]);

  if (isLoading || !order || !canteenCoords || !deliveryCoords) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  if (order.status === "DELIVERED" || order.status === "COMPLETED") {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 px-6">
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Delivery Complete",
            headerTintColor: "#fff",
            headerStyle: { backgroundColor: "#09090b" },
          }}
        />
        <View className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20">
          <Text className="text-4xl">🎉</Text>
        </View>
        <Text className="mb-2 text-2xl font-bold text-white">
          Delivery Completed!
        </Text>
        <Text className="text-center text-zinc-400">
          The delivery has been verified and the session is now closed.
        </Text>
        <Pressable
          onPress={() => router.replace("/" as never)}
          className="mt-8 rounded-xl bg-purple-600 px-8 py-4 active:bg-purple-700"
        >
          <Text className="font-bold text-white">Back to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-zinc-950">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Live Tracking",
          headerTintColor: "#fff",
          headerStyle: { backgroundColor: "#09090b" },
        }}
      />

      <DeliveryMap
        canteen={{ ...canteenCoords, name: order.canteenName }}
        otherCanteens={(activeCanteens ?? [])
          .filter((canteen) => canteen.name !== order.canteenName)
          .map((canteen) => ({
            id: canteen.id,
            name: canteen.name,
            latitude: canteen.latitude,
            longitude: canteen.longitude,
          }))}
        delivery={{ ...deliveryCoords, name: order.deliveryLocationName }}
        deliverer={startLoc}
        route={routeCoordinates}
        showUserLocation={hasPermission && isDeliverer}
      />

      <View className="absolute right-6 bottom-6 left-6 rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-md">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text
                testID="order-status"
                className="text-sm font-bold text-white"
              >
                Status: {order.status}
              </Text>
              {distance !== null && (
                <View className="rounded-md border border-purple-500/30 bg-purple-500/15 px-2 py-0.5">
                  <Text
                    testID="tracking-distance"
                    className="text-xs font-semibold text-purple-400"
                  >
                    {formatDistance(distance)} away
                  </Text>
                </View>
              )}
            </View>
            <Text className="mt-1 text-xs text-zinc-400">
              {isDeliverer
                ? "You are delivering this order"
                : order.status === "PREPARING"
                  ? "Your order is being prepared"
                  : order.status === "ON_THE_WAY"
                    ? "Deliverer is on the way"
                    : order.status === "NEAR_YOU"
                      ? "Deliverer is near you"
                      : "Waiting for deliverer"}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(`/order/${id}/chat` as never)}
            className="ml-4 items-center justify-center rounded-xl border border-purple-500/50 bg-purple-600/20 px-4 py-2 active:bg-purple-600/40"
          >
            <Text className="text-sm font-bold text-purple-300">Chat</Text>
          </Pressable>
        </View>

        {/* Dynamic Action Area */}
        <View className="border-t border-white/10 pt-4">
          {!isDeliverer && order.otp && (
            <View className="items-center rounded-xl bg-zinc-800/50 p-4">
              <Text className="mb-1 text-xs font-bold tracking-widest text-zinc-400 uppercase">
                Your Delivery OTP
              </Text>
              <Text
                testID="delivery-otp"
                className="text-3xl font-black tracking-widest text-white"
              >
                {order.otp}
              </Text>
              <Text className="mt-2 text-center text-xs text-zinc-500">
                Share this code with your deliverer to receive your order.
              </Text>
            </View>
          )}
          {isDeliverer && (
            <View>
              {order.status === "PREPARING" && (
                <Pressable
                  disabled={updateStatusMutation.isPending}
                  onPress={() =>
                    updateStatusMutation.mutate({
                      orderId: order.id,
                      status: "ON_THE_WAY",
                    })
                  }
                  className="w-full items-center justify-center rounded-xl bg-purple-600 py-4 active:bg-purple-700"
                >
                  <Text className="font-bold text-white">
                    {updateStatusMutation.isPending
                      ? "Updating..."
                      : "Mark On The Way"}
                  </Text>
                </Pressable>
              )}
              {order.status === "ON_THE_WAY" && (
                <Pressable
                  disabled={updateStatusMutation.isPending}
                  onPress={() =>
                    updateStatusMutation.mutate({
                      orderId: order.id,
                      status: "NEAR_YOU",
                    })
                  }
                  className="w-full items-center justify-center rounded-xl bg-purple-600 py-4 active:bg-purple-700"
                >
                  <Text className="font-bold text-white">
                    {updateStatusMutation.isPending
                      ? "Updating..."
                      : "Mark Near You"}
                  </Text>
                </Pressable>
              )}
              {order.status === "NEAR_YOU" && (
                <View className="items-center">
                  <Text className="mb-2 text-xs font-bold tracking-widest text-zinc-400 uppercase">
                    Verify Delivery
                  </Text>
                  <View className="w-full flex-row items-center gap-2">
                    <TextInput
                      className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white"
                      style={{
                        textAlign: "center",
                        fontSize: 18,
                        fontWeight: "bold",
                        letterSpacing: 8,
                      }}
                      placeholder="Enter OTP"
                      placeholderTextColor="#52525b"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={otpInput}
                      onChangeText={setOtpInput}
                    />
                    <Pressable
                      disabled={
                        verifyDeliveryMutation.isPending || otpInput.length < 4
                      }
                      onPress={() =>
                        verifyDeliveryMutation.mutate({
                          orderId: order.id,
                          otp: otpInput,
                        })
                      }
                      className={
                        otpInput.length === 4
                          ? "items-center justify-center rounded-xl bg-green-600 px-6 py-3 active:bg-green-700"
                          : "items-center justify-center rounded-xl bg-zinc-700 px-6 py-3 opacity-50"
                      }
                    >
                      <Text className="font-bold text-white">
                        {verifyDeliveryMutation.isPending ? "..." : "Verify"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
