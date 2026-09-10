"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { useTRPC } from "~/trpc/react";

const TRACKED_STATUSES = [
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
] as const;

export function GlobalTracker() {
  const trpc = useTRPC();
  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders } = useQuery(trpc.order.myOrders.queryOptions());
  const { data: paymentConfig } = useQuery(trpc.payment.config.queryOptions());

  const activeOrder = paymentConfig?.databaseReady
    ? orders?.find(
        (order) =>
          order.delivererId === profile?.id &&
          TRACKED_STATUSES.some((status) => status === order.status),
      )
    : undefined;
  const orderId = activeOrder?.id;

  const { broadcastLocation } = useOrderRealtime(orderId ?? "");
  const { mutateAsync: updateLocation } = useMutation(
    trpc.order.updateLocation.mutationOptions(),
  );
  const latestLocationRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("geolocation" in navigator) ||
      !orderId
    ) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        latestLocationRef.current = [latitude, longitude];
        void broadcastLocation({ latitude, longitude });
      },
      (error) => {
        console.error("GlobalTracker geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );

    const intervalId = window.setInterval(() => {
      const currentLocation = latestLocationRef.current;
      if (!currentLocation) return;

      const [latitude, longitude] = currentLocation;
      void broadcastLocation({ latitude, longitude });
      void updateLocation({ orderId, latitude, longitude }).catch((error) =>
        console.error("GlobalTracker persisting location error:", error),
      );
    }, 5000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(intervalId);
    };
  }, [broadcastLocation, orderId, updateLocation]);

  return null;
}
