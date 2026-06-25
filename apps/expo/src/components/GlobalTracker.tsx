import React, { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "~/utils/api";
import { useOrderRealtime } from "~/hooks/use-order-realtime";

export function GlobalTracker() {
  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders } = useQuery(trpc.order.myOrders.queryOptions());

  // Find any active order that needs tracking
  const activeOrder = orders?.find(
    (o) => o.status === "PREPARING" || o.status === "ACCEPTED"
  );
  const id = activeOrder?.id;
  const isDeliverer = activeOrder?.delivererId === profile?.id;
  const role = isDeliverer ? "deliverer" : "buyer";

  const { broadcastLocation } = useOrderRealtime(id ?? "");
  const { mutateAsync: updateLocation } = useMutation(trpc.order.updateLocation.mutationOptions());

  const myLastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!id) return;

    let locationSubscription: Location.LocationSubscription | null = null;
    let intervalId: NodeJS.Timeout;

    const startTracking = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        // We do not prompt here to avoid annoying the user on dashboard, 
        // they should have granted it on the tracker screen.
        return;
      }

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (loc: Location.LocationObject) => {
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          myLastLocationRef.current = coords;
          void broadcastLocation({
            ...coords,
            role,
          });
        }
      );

      // Periodically broadcast and save to DB
      intervalId = setInterval(() => {
        const coords = myLastLocationRef.current;
        if (coords) {
          void broadcastLocation({
            ...coords,
            role,
          });
          void updateLocation({
            orderId: id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            role,
          }).catch((err) => console.error("GlobalTracker updateLocation error:", err));
        }
      }, 5000);
    };

    void startTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
      if (intervalId) clearInterval(intervalId);
    };
  }, [id, isDeliverer, role, broadcastLocation, updateLocation]);

  return null;
}
