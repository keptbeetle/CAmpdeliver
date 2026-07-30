import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import type {
  AppCoordinates,
  LocationSubscription,
} from "~/platform/location.types";
import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { locationService } from "~/platform/location";
import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

const TRACKED_STATUSES = [
  "ACCEPTED",
  "PREPARING",
  "ON_THE_WAY",
  "NEAR_YOU",
] as const;

export function GlobalTracker() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    enabled: hasSession,
  });
  const { data: orders } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    enabled: hasSession,
  });

  const activeOrder = hasSession
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
  const latestLocationRef = useRef<AppCoordinates | null>(null);

  useEffect(() => {
    if (!orderId || !hasSession) return;

    let locationSubscription: LocationSubscription | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const startTracking = async () => {
      if (!(await locationService.hasForegroundPermission()) || cancelled)
        return;

      locationSubscription = await locationService.watchPosition(
        { highAccuracy: true, timeInterval: 5000, distanceInterval: 10 },
        (coordinates) => {
          latestLocationRef.current = coordinates;
          void broadcastLocation(coordinates);
        },
      );

      intervalId = setInterval(() => {
        const coordinates = latestLocationRef.current;
        if (!coordinates) return;

        void broadcastLocation(coordinates);
        void updateLocation({ orderId, ...coordinates }).catch((error) =>
          console.error("GlobalTracker updateLocation error:", error),
        );
      }, 5000);
    };

    void startTracking().catch((error) =>
      console.warn("GlobalTracker could not start:", error),
    );

    return () => {
      cancelled = true;
      locationSubscription?.remove();
      if (intervalId) clearInterval(intervalId);
    };
  }, [broadcastLocation, hasSession, orderId, updateLocation]);

  return null;
}
