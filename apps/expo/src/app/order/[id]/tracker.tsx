import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
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
  
  const order = orders?.find((o) => o.id === id);
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation, buyerLocation, broadcastLocation } = useOrderRealtime(id, {
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
    (order?.delivererLatitude && order?.delivererLongitude 
      ? { latitude: order.delivererLatitude, longitude: order.delivererLongitude }
      : (canteenCoords && (canteenCoords.latitude !== 0 || canteenCoords.longitude !== 0) ? canteenCoords : null));

  const endLoc = buyerLocation ??
    (order?.buyerLatitude && order?.buyerLongitude 
      ? { latitude: order.buyerLatitude, longitude: order.buyerLongitude }
      : (deliveryCoords && (deliveryCoords.latitude !== 0 || deliveryCoords.longitude !== 0) ? deliveryCoords : null));

  const sLat = startLoc?.latitude;
  const sLng = startLoc?.longitude;
  const eLat = endLoc?.latitude;
  const eLng = endLoc?.longitude;

  // Fetch actual street path when coordinates update
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Marker coordinate={canteenCoords} title="Canteen" description={order.canteenName} pinColor="blue" />
        )}
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

      <View className="absolute bottom-10 left-6 right-6 flex-row justify-between rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-md">
        <View className="flex-1">
          <View className="flex-row items-center flex-wrap gap-2">
            <Text className="text-sm font-bold text-white">Status: {order.status}</Text>
            {distance !== null && (
              <View className="rounded-md bg-purple-500/15 px-2 py-0.5 border border-purple-500/30">
                <Text className="text-xs font-semibold text-purple-400">{formatDistance(distance)} away</Text>
              </View>
            )}
          </View>
          <Text className="mt-1 text-xs text-zinc-400">
            {isDeliverer ? "You are delivering this order" : "Deliverer is on the way"}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push(`/order/${id}/chat`)}
          className="ml-4 items-center justify-center rounded-xl bg-purple-600 px-6 py-3 active:bg-purple-700"
        >
          <Text className="font-bold text-white">Chat</Text>
        </Pressable>
      </View>
    </View>
  );
}
