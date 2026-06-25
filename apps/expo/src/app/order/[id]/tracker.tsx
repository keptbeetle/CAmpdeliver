import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MapView, { Marker, Polyline, UrlTile, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { useOrderRealtime } from "~/hooks/use-order-realtime";

export default function OrderTrackerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery(trpc.order.myOrders.queryOptions());
  
  const order = orders?.find((o) => o.id === id);
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation, broadcastLocation } = useOrderRealtime(id);

  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (!isDeliverer) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission to access location was denied");
        return;
      }
      setHasPermission(true);

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (loc: Location.LocationObject) => {
          void broadcastLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    };

    void startTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isDeliverer]);

  if (isLoading || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  const canteenCoords = {
    latitude: order.canteenLatitude,
    longitude: order.canteenLongitude,
  };

  const deliveryCoords = {
    latitude: order.deliveryLatitude,
    longitude: order.deliveryLongitude,
  };

  return (
    <View className="flex-1 bg-zinc-950">
      <Stack.Screen options={{ title: "Live Tracking", headerTintColor: "#fff", headerStyle: { backgroundColor: "#09090b" } }} />
      
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: canteenCoords.latitude,
          longitude: canteenCoords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        mapType="none"
        showsUserLocation={isDeliverer && hasPermission}
      >
        {/* Use OpenStreetMap tiles so no Google Maps API key is needed */}
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        <Marker coordinate={canteenCoords} title="Canteen" description={order.canteenName} pinColor="blue" />
        <Marker coordinate={deliveryCoords} title="Dropoff" description={order.deliveryLocationName} pinColor="green" />
        
        {!isDeliverer && delivererLocation && (
          <Marker coordinate={delivererLocation} title="Deliverer" pinColor="purple" />
        )}

        <Polyline 
          coordinates={[canteenCoords, deliveryCoords]}
          strokeColor="rgba(168, 85, 247, 0.5)"
          strokeWidth={4}
          lineDashPattern={[10, 10]}
        />
      </MapView>

      <View className="absolute bottom-10 left-6 right-6 flex-row justify-between rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-md">
        <View className="flex-1">
          <Text className="text-sm font-bold text-white">Status: {order.status}</Text>
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
