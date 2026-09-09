import { useEffect } from "react";
import { Platform } from "react-native";
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
    const selectedIds = profile.deliveryCanteenIds;
    if (
      !region.identifier ||
      !profile.deliveryNotificationsEnabled ||
      !profile.nearbyQuestAlertsEnabled ||
      !selectedIds.includes(region.identifier)
    ) {
      return;
    }

    const quests = await queryClient.fetchQuery(
      trpc.order.availableQuests.queryOptions({
        latitude: region.latitude,
        longitude: region.longitude,
      }),
    );
    const matchingQuests = quests.filter(
      (quest) => quest.canteenId === region.identifier,
    );
    if (matchingQuests.length === 0) return;

    const canteenName = matchingQuests[0]?.canteenName ?? "this canteen";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Delivery quest nearby",
        body: `${matchingQuests.length} quest${matchingQuests.length === 1 ? "" : "s"} available at ${canteenName}.`,
        data: { type: "NEARBY_QUEST", url: "/quests" },
        sound: "default",
      },
      trigger: null,
    });
  } catch (taskError) {
    console.warn("[GeofenceManager] Could not check nearby quests", taskError);
  }
});

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
      const selectedIds = profile?.deliveryCanteenIds ?? [];
      const enabled =
        Platform.OS === "android" &&
        Boolean(session) &&
        Boolean(profile?.deliveryNotificationsEnabled) &&
        Boolean(profile?.nearbyQuestAlertsEnabled) &&
        selectedIds.length > 0;

      if (!enabled) {
        await stop();
        return;
      }

      const watchedCanteens = (canteens ?? []).filter((canteen) =>
        selectedIds.includes(canteen.id),
      );
      if (watchedCanteens.length === 0) {
        await stop();
        return;
      }

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
      // Cleanup can run while stopGeofencingAsync is awaiting.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelled) return;

      await Location.startGeofencingAsync(
        GEOFENCE_TASK_NAME,
        watchedCanteens.map((canteen) => ({
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
  }, [
    canteens,
    profile?.deliveryCanteenIds,
    profile?.deliveryNotificationsEnabled,
    profile?.nearbyQuestAlertsEnabled,
    session,
  ]);

  return null;
}
