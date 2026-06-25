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

  const { delivererLocation, buyerLocation, broadcastLocation } = useOrderRealtime(id);

  const [hasPermission, setHasPermission] = useState(false);
  const mapRef = React.useRef<MapView>(null);

  useEffect(() => {
    if (!id) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission to access location was denied");
        return;
      }
      setHasPermission(true);

      const role = isDeliverer ? "deliverer" : "buyer";

      // Instantly get current position and animate the map to it on mount
      try {
        const initialLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: initialLoc.coords.latitude,
            longitude: initialLoc.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      } catch (err) {
        console.log("Error getting initial location:", err);
      }

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
            role,
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
  }, [isDeliverer, id, broadcastLocation]);

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

  const polylineCoords = [];
  
  const startLoc = delivererLocation 
    ? delivererLocation 
    : (canteenCoords.latitude !== 0 || canteenCoords.longitude !== 0 ? canteenCoords : null);

  const endLoc = buyerLocation
    ? buyerLocation
    : (deliveryCoords.latitude !== 0 || deliveryCoords.longitude !== 0 ? deliveryCoords : null);

  if (startLoc) polylineCoords.push(startLoc);
  if (endLoc) polylineCoords.push(endLoc);

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
        
        {isDeliverer && buyerLocation && (
          <Marker coordinate={buyerLocation} title="Customer / Buyer" pinColor="red" />
        )}
        {!isDeliverer && delivererLocation && (
          <Marker coordinate={delivererLocation} title="Deliverer" pinColor="purple" />
        )}

        {polylineCoords.length === 2 && (
          <Polyline 
            coordinates={polylineCoords}
            strokeColor="rgba(168, 85, 247, 0.5)"
            strokeWidth={4}
            lineDashPattern={[10, 10]}
          />
        )}
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
