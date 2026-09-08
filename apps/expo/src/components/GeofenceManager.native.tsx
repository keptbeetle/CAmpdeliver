import { useEffect } from "react";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { useQuery } from "@tanstack/react-query";

import { useAuthSession } from "~/providers/AuthSessionProvider";
import { queryClient, trpc } from "~/utils/api";

const GEOFENCE_TASK_NAME = "LOCATION_GEOFENCE_TASK";

interface GeofenceEvent {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

/**
 * Android starts this task after an opted-in deliverer enters a registered
 * canteen zone. It never uploads a location trail: the only network request
 * asks whether a quest is currently open for the entered canteen.
 */
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error || !data) {
    console.warn("[GeofenceManager] Background task failed", error?.message);
    return;
  }

  const { eventType, region } = data as GeofenceEvent;
  if (eventType !== Location.GeofencingEventType.Enter) return;

  try {
    const profile = await queryClient.fetchQuery(
      trpc.auth.getMyProfile.queryOptions(),
    );
    if (!profile?.nearbyQuestAlertsEnabled) return;

    const quests = await queryClient.fetchQuery(
      trpc.order.availableQuests.queryOptions({
        latitude: region.latitude,
        longitude: region.longitude,
      }),
    );
    if (quests.length === 0) return;

    const canteenName = quests[0]?.canteenName ?? "this canteen";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Delivery quest nearby",
        body: `${quests.length} quest${quests.length === 1 ? "" : "s"} available at ${canteenName}.`,
        data: { type: "NEARBY_QUEST", url: "/quests" },
        sound: "default",
      },
      trigger: null,
    });
  } catch (taskError) {
    // A transient offline/auth failure must not crash the Android task.
    console.warn("[GeofenceManager] Could not check nearby quests", taskError);
  }
});

/**
 * Registers Android geofences only after the member opted in from Quests and
 * has explicitly granted both foreground and background location access.
 * It never presents a permission prompt by itself.
 */
export function GeofenceManager() {
  const { isLoading, session } = useAuthSession();
  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    enabled: !isLoading && Boolean(session),
  });
  const { data: canteens } = useQuery({
    ...trpc.canteen.listActive.queryOptions(),
    enabled: !isLoading && Boolean(session),
  });

  useEffect(() => {
    let cancelled = false;

    const stop = async () => {
      if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME)) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      }
    };

    const syncGeofences = async () => {
      const enabled =
        Boolean(session) && Boolean(profile?.nearbyQuestAlertsEnabled);
      if (!enabled) {
        await stop();
        return;
      }

      if (!canteens || canteens.length === 0) return;

      const [foreground, background] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      if (
        foreground.status !== Location.PermissionStatus.GRANTED ||
        background.status !== Location.PermissionStatus.GRANTED ||
        cancelled
      ) {
        return;
      }

      await stop();

      await Location.startGeofencingAsync(
        GEOFENCE_TASK_NAME,
        canteens.map((canteen) => ({
          identifier: canteen.id,
          latitude: canteen.latitude,
          longitude: canteen.longitude,
          radius: canteen.radius,
          notifyOnEntry: true,
          notifyOnExit: false,
        })),
      );
    };

    void syncGeofences().catch((syncError: unknown) =>
      console.warn("[GeofenceManager] Could not sync geofences", syncError),
    );

    return () => {
      cancelled = true;
    };
  }, [canteens, profile?.nearbyQuestAlertsEnabled, session]);

  return null;
}
