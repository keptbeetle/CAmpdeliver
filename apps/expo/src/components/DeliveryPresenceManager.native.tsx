import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { useMutation, useQuery } from "@tanstack/react-query";

import type { LocationSubscription } from "~/platform/location.types";
import { locationService } from "~/platform/location";
import { useAuthSession } from "~/providers/AuthSessionProvider";
import { trpc } from "~/utils/api";

const PRESENCE_REFRESH_MS = 10_000;
const LEGACY_GEOFENCE_TASK_NAME = "LOCATION_GEOFENCE_TASK";

export function DeliveryPresenceManager() {
  const { session } = useAuthSession();
  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    enabled: Boolean(session),
  });
  const { mutateAsync: updatePresence } = useMutation(
    trpc.auth.updateDeliveryPresence.mutationOptions(),
  );
  const lastSentAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void Location.hasStartedGeofencingAsync(LEGACY_GEOFENCE_TASK_NAME)
      .then(async (started) => {
        if (started && !cancelled) {
          await Location.stopGeofencingAsync(LEGACY_GEOFENCE_TASK_NAME);
        }
      })
      .catch((error: unknown) =>
        console.warn("Could not remove the legacy nearby geofence:", error),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || !profile?.deliveryNotificationsEnabled) return;

    let cancelled = false;
    let watch: LocationSubscription | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let permissionRetryUsed = false;
    let updateInFlight = false;

    const publish = async (coords: { latitude: number; longitude: number }) => {
      const now = Date.now();
      if (
        cancelled ||
        updateInFlight ||
        now - lastSentAt.current < PRESENCE_REFRESH_MS
      ) {
        return;
      }
      updateInFlight = true;
      try {
        await updatePresence(coords);
        lastSentAt.current = Date.now();
      } catch (error) {
        console.warn("Could not refresh delivery presence:", error);
      } finally {
        updateInFlight = false;
      }
    };

    const stopWatch = () => {
      watch?.remove();
      watch = null;
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
    };

    const startWatch = async () => {
      stopWatch();
      if (cancelled || AppState.currentState !== "active") return;

      const hasPermission = await locationService.hasForegroundPermission();
      if (!hasPermission) {
        // Permission onboarding runs at the same authenticated boundary. Retry
        // only once after its system dialog has had time to resolve; after a
        // denial we wait for the next foreground transition instead of polling.
        if (!permissionRetryUsed) {
          permissionRetryUsed = true;
          startTimer = setTimeout(() => void startWatch(), 1500);
        }
        return;
      }

      const current = await locationService.getCurrentPosition({
        highAccuracy: true,
      });
      await publish(current);
      // Cleanup/backgrounding can happen while GPS/network work is awaiting.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelled || AppState.currentState !== "active") return;

      watch = await locationService.watchPosition(
        {
          highAccuracy: true,
          timeInterval: PRESENCE_REFRESH_MS,
          // Keep a heartbeat even when the deliverer is standing still inside
          // the canteen so server-side presence does not expire spuriously.
          distanceInterval: 0,
        },
        (coords) => void publish(coords),
      );
    };

    void startWatch().catch((error: unknown) =>
      console.warn("Could not start delivery presence tracking:", error),
    );

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          lastSentAt.current = 0;
          permissionRetryUsed = false;
          void startWatch().catch((error: unknown) =>
            console.warn("Could not resume delivery presence tracking:", error),
          );
        } else {
          stopWatch();
        }
      },
    );

    return () => {
      cancelled = true;
      stopWatch();
      appStateSubscription.remove();
    };
  }, [profile?.deliveryNotificationsEnabled, session, updatePresence]);

  return null;
}
