import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "~/utils/api";
import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { supabase } from "~/utils/auth";

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

  // Find any active order that needs tracking (only if session exists)
  const activeOrder = hasSession ? orders?.find(
    (o) => o.status === "PREPARING" || o.status === "ACCEPTED"
  ) : undefined;
  const id = activeOrder?.id;
  const isDeliverer = activeOrder?.delivererId === profile?.id;
  const role = isDeliverer ? "deliverer" : "buyer";

  const { broadcastLocation } = useOrderRealtime(id ?? "");
  const { mutateAsync: updateLocation } = useMutation(trpc.order.updateLocation.mutationOptions());

  const myLastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!id || !hasSession) return;

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
      clearInterval(intervalId);
    };
  }, [id, isDeliverer, role, broadcastLocation, updateLocation, hasSession]);

  return null;
}
