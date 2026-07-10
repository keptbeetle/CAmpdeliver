import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MapView, { Marker, Polyline, UrlTile, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { useOrderRealtime } from "~/hooks/use-order-realtime";

function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
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
  end: { latitude: number; longitude: number }
): Promise<{ coordinates: { latitude: number; longitude: number }[]; distance: number }> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`
    );
    interface OSRMResponse {
      code: string;
      routes?: {
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
    }
    const data = (await res.json()) as OSRMResponse;
    const fallbackDist = getHaversineDistance(start.latitude, start.longitude, end.latitude, end.longitude);
    if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
      const coords = data.routes[0].geometry.coordinates;
      const distance = data.routes[0].distance ?? fallbackDist;
      return {
        coordinates: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
        distance,
      };
    }
  } catch (error) {
    console.error("OSRM routing error:", error);
  }
  const fallbackDist = getHaversineDistance(start.latitude, start.longitude, end.latitude, end.longitude);
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
  const { data: orders, isLoading } = useQuery(trpc.order.myOrders.queryOptions());
  const { data: activeCanteens } = useQuery(trpc.canteen.listActive.queryOptions());
  
  const order = orders?.find((o) => o.id === id);
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation, buyerLocation } = useOrderRealtime(id, {
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
  const mapRef = React.useRef<MapView>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
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
      }
    })
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
      }
    })
  );

  useEffect(() => {
    if (!id) return;

    const askPermission = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        Alert.alert("Permission to access location was denied");
        return;
      }
      setHasPermission(true);
    };

    void askPermission();
  }, [id]);

  const canteenCoords = order ? {
    latitude: order.canteenLatitude,
    longitude: order.canteenLongitude,
  } : null;

  const deliveryCoords = order ? {
    latitude: order.deliveryLatitude,
    longitude: order.deliveryLongitude,
  } : null;

  const startLoc = delivererLocation ??
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (order?.delivererLatitude && order?.delivererLongitude 
      ? { latitude: order.delivererLatitude, longitude: order.delivererLongitude }
      : (canteenCoords && (canteenCoords.latitude !== 0 || canteenCoords.longitude !== 0) ? canteenCoords : null));

  const endLoc = buyerLocation ??
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (order?.buyerLatitude && order?.buyerLongitude 
      ? { latitude: order.buyerLatitude, longitude: order.buyerLongitude }
      : (deliveryCoords && (deliveryCoords.latitude !== 0 || deliveryCoords.longitude !== 0) ? deliveryCoords : null));

  const sLat = startLoc?.latitude;
  const sLng = startLoc?.longitude;
  const eLat = endLoc?.latitude;
  const eLng = endLoc?.longitude;

  // Fetch actual street path when coordinates update
   
  useEffect(() => {
    if (sLat === undefined || sLng === undefined || eLat === undefined || eLng === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect 
      setRouteCoordinates([]);
       
      setDistance(null);
      return;
    }

    let isMounted = true;

    void fetchMobileRoute({ latitude: sLat, longitude: sLng }, { latitude: eLat, longitude: eLng }).then(({ coordinates, distance }) => {
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
        <Stack.Screen options={{ title: "Delivery Complete", headerTintColor: "#fff", headerStyle: { backgroundColor: "#09090b" } }} />
        <View className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20">
          <Text className="text-4xl">🎉</Text>
        </View>
        <Text className="mb-2 text-2xl font-bold text-white">Delivery Completed!</Text>
        <Text className="text-center text-zinc-400">
          The delivery has been verified and the session is now closed.
        </Text>
        <Pressable
          onPress={() => router.replace("/")}
          className="mt-8 rounded-xl bg-purple-600 px-8 py-4 active:bg-purple-700"
        >
          <Text className="font-bold text-white">Back to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-zinc-950">
      <Stack.Screen options={{ title: "Live Tracking", headerTintColor: "#fff", headerStyle: { backgroundColor: "#09090b" } }} />
      
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: canteenCoords.latitude !== 0 ? canteenCoords.latitude : 30.0,
          longitude: canteenCoords.longitude !== 0 ? canteenCoords.longitude : 70.0,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        mapType="none"
        showsUserLocation={hasPermission}
        showsMyLocationButton={true}
      >
        <UrlTile
          urlTemplate="https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {canteenCoords.latitude !== 0 && canteenCoords.longitude !== 0 && (
          <Marker coordinate={canteenCoords} title="Selected Canteen" description={order.canteenName} pinColor="blue" />
        )}
        {activeCanteens?.filter(c => c.name !== order.canteenName).map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            title={c.name}
            description="Active Canteen"
            pinColor="teal"
          />
        ))}
        {deliveryCoords.latitude !== 0 && deliveryCoords.longitude !== 0 && (
          <Marker coordinate={deliveryCoords} title="Dropoff" description={order.deliveryLocationName} pinColor="green" />
        )}
        
        {startLoc && (
          <Marker coordinate={startLoc} title="Deliverer" description={isDeliverer ? "You" : undefined} pinColor="purple" />
        )}
        {endLoc && (
          <Marker coordinate={endLoc} title="Customer / Buyer" description={!isDeliverer ? "You" : undefined} pinColor="red" />
        )}

        {routeCoordinates.length > 0 && (
          <Polyline 
            coordinates={routeCoordinates}
            strokeColor="rgba(168, 85, 247, 0.8)"
            strokeWidth={5}
          />
        )}
      </MapView>

      <View className="absolute bottom-6 left-6 right-6 rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-md">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm font-bold text-white">Status: {order.status}</Text>
              {distance !== null && (
                <View className="rounded-md border border-purple-500/30 bg-purple-500/15 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-purple-400">{formatDistance(distance)} away</Text>
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
            onPress={() => router.push(`/order/${id}/chat`)}
            className="ml-4 items-center justify-center rounded-xl bg-purple-600/20 px-4 py-2 border border-purple-500/50 active:bg-purple-600/40"
          >
            <Text className="text-sm font-bold text-purple-300">Chat</Text>
          </Pressable>
        </View>

        {/* Dynamic Action Area */}
        <View className="border-t border-white/10 pt-4">
          {!isDeliverer && order.otp && (
            <View className="items-center rounded-xl bg-zinc-800/50 p-4">
              <Text className="mb-1 text-xs font-bold text-zinc-400 uppercase tracking-widest">Your Delivery OTP</Text>
              <Text className="text-3xl font-black tracking-[0.2em] text-white">{order.otp}</Text>
              <Text className="mt-2 text-center text-xs text-zinc-500">Share this code with your deliverer to receive your order.</Text>
            </View>
          )}
          {isDeliverer && (
            <View>
              {order.status === "PREPARING" && (
                <Pressable
                  disabled={updateStatusMutation.isPending}
                  onPress={() => updateStatusMutation.mutate({ orderId: order.id, status: "ON_THE_WAY" })}
                  className="w-full items-center justify-center rounded-xl bg-purple-600 py-4 active:bg-purple-700"
                >
                  <Text className="font-bold text-white">
                    {updateStatusMutation.isPending ? "Updating..." : "Mark On The Way"}
                  </Text>
                </Pressable>
              )}
              {order.status === "ON_THE_WAY" && (
                <Pressable
                  disabled={updateStatusMutation.isPending}
                  onPress={() => updateStatusMutation.mutate({ orderId: order.id, status: "NEAR_YOU" })}
                  className="w-full items-center justify-center rounded-xl bg-purple-600 py-4 active:bg-purple-700"
                >
                  <Text className="font-bold text-white">
                    {updateStatusMutation.isPending ? "Updating..." : "Mark Near You"}
                  </Text>
                </Pressable>
              )}
              {order.status === "NEAR_YOU" && (
                <View className="items-center">
                  <Text className="mb-2 text-xs font-bold tracking-widest text-zinc-400 uppercase">Verify Delivery</Text>
                  <View className="w-full flex-row gap-2">
                    <TextInput
                      className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-center text-lg font-bold tracking-[0.2em] text-white"
                      placeholder="Enter OTP"
                      placeholderTextColor="#52525b"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={otpInput}
                      onChangeText={setOtpInput}
                    />
                    <Pressable
                      disabled={verifyDeliveryMutation.isPending || otpInput.length < 4}
                      onPress={() => verifyDeliveryMutation.mutate({ orderId: order.id, otp: otpInput })}
                      className={`items-center justify-center rounded-xl px-6 ${
                        otpInput.length === 4 ? "bg-green-600 active:bg-green-700" : "bg-zinc-700 opacity-50"
                      }`}
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
