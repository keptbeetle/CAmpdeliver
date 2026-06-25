"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useOrderRealtime } from "~/hooks/use-order-realtime";

export function GlobalTracker() {
  const trpc = useTRPC();
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

  const myWebLocationRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator) || !id) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        myWebLocationRef.current = [latitude, longitude];

        void broadcastLocation({
          latitude,
          longitude,
          role,
        });
      },
      (error) => {
        console.error("GlobalTracker geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    const intervalId = setInterval(() => {
      const currentLoc = myWebLocationRef.current;
      if (currentLoc) {
        const [lat, lng] = currentLoc;
        void broadcastLocation({
          latitude: lat,
          longitude: lng,
          role,
        });
        void updateLocation({
          orderId: id,
          latitude: lat,
          longitude: lng,
          role,
        }).catch((err) => console.error("GlobalTracker persisting location error:", err));
      }
    }, 5000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
    };
  }, [id, isDeliverer, role, broadcastLocation, updateLocation]);

  return null;
}
