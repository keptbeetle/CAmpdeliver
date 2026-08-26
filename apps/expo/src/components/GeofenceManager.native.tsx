import type React from "react";
import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import * as TaskManager from "expo-task-manager";
import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient, trpc } from "~/utils/api";

const GEOFENCE_TASK_NAME = "LOCATION_GEOFENCE_TASK";

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
});

if (Platform.OS === "android") {
  void Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
  });
}

const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`[GeofenceManager] TaskManager Error: ${error.message}`);
    return;
  }

  if (!data) {
    console.warn(
      "[GeofenceManager] Geofence task completed without event data",
    );
    return;
  }

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  if (eventType === Location.GeofencingEventType.Enter) {
    console.log(`[GeofenceManager] User entered geofence region:`, region);

    try {
      const quests = await queryClient.fetchQuery(
        trpc.order.availableQuests.queryOptions({
          latitude: region.latitude,
          longitude: region.longitude,
        }),
      );

      if (quests.length > 0) {
        void Notifications.scheduleNotificationAsync({
          content: {
            title: "New Delivery Quests",
            body: `${quests.length} Quests available!`,
            sound: true,
          },
          trigger: null,
        });
      } else {
        console.log(
          `[GeofenceManager] Entered ${region.identifier}, but no active quests. Suppressing notification.`,
        );
      }
    } catch (e) {
      console.warn(
        "[GeofenceManager] Failed to check for active quests in background",
        e,
      );
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (eventType === Location.GeofencingEventType.Exit) {
      console.log(`[GeofenceManager] User exited geofence region:`, region);
    }
  }
});

export function GeofenceManager({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: canteens } = useQuery(trpc.canteen.listActive.queryOptions());
  const updatePushTokenMutation = useMutation(
    trpc.auth.updatePushToken.mutationOptions(),
  );

  // Handle notification tap interactions
  useEffect(() => {
    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | { url?: string; orderId?: string }
          | undefined;
        if (data?.url) {
          router.push(data.url as Href);
        } else if (data?.orderId) {
          router.push(`/orders/${data.orderId}/status` as Href);
        }
      });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    const setupGeofencing = async () => {
      if (!canteens || canteens.length === 0) return;

      try {
        // Request notifications permission first
        const existingNotifPerm = await Notifications.getPermissionsAsync();
        let finalNotifStatus = existingNotifPerm.status;
        if (finalNotifStatus !== Notifications.PermissionStatus.GRANTED) {
          const requestedNotifPerm =
            await Notifications.requestPermissionsAsync({
              ios: {
                allowAlert: true,
                allowBadge: true,
                allowSound: true,
              },
            });
          finalNotifStatus = requestedNotifPerm.status;
        }

        if (finalNotifStatus !== Notifications.PermissionStatus.GRANTED) {
          console.log("[GeofenceManager] Notifications permission denied");
        }

        // Register push token in background without blocking
        void (async () => {
          try {
            const extra = Constants.expoConfig?.extra as
              | { eas?: { projectId?: string } }
              | undefined;
            const projectId =
              extra?.eas?.projectId ??
              Constants.easConfig?.projectId ??
              "b658b0d5-1c62-4f07-8329-38563db9dfa3";
            const tokenData = await Notifications.getExpoPushTokenAsync({
              projectId,
            });
            if (tokenData.data) {
              await updatePushTokenMutation.mutateAsync({
                pushToken: tokenData.data,
              });
              console.log(
                "[GeofenceManager] Push token synced:",
                tokenData.data,
              );
            }
          } catch (err) {
            console.log(
              "[GeofenceManager] Push token registration skipped:",
              err,
            );
          }
        })();

        const { status: fgStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== Location.PermissionStatus.GRANTED) {
          console.log(
            "[GeofenceManager] Foreground location permission denied",
          );
          return;
        }

        const { status: bgStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== Location.PermissionStatus.GRANTED) {
          console.log(
            "[GeofenceManager] Background location permission denied",
          );
          return;
        }

        const isRegistered =
          await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
        if (isRegistered) {
          await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
        }

        const regions = canteens.map((c) => ({
          identifier: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
          radius: c.radius,
          notifyOnEntry: true,
          notifyOnExit: true,
        }));

        await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
        console.log(
          `[GeofenceManager] Geofencing started for ${regions.length} active canteens.`,
        );

        // Check if user is ALREADY inside any canteen region on startup
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const insideRegions = regions.filter(
          (r) =>
            getDistance(
              currentLocation.coords.latitude,
              currentLocation.coords.longitude,
              r.latitude,
              r.longitude,
            ) <= r.radius,
        );

        for (const region of insideRegions) {
          const quests = await queryClient.fetchQuery(
            trpc.order.availableQuests.queryOptions({
              latitude: region.latitude,
              longitude: region.longitude,
            }),
          );
          if (quests.length > 0) {
            void Notifications.scheduleNotificationAsync({
              content: {
                title: "New Delivery Quests",
                body: `You're at ${region.identifier}! ${quests.length} Quests available!`,
                sound: true,
              },
              trigger: null,
            });
          }
        }
      } catch (e) {
        console.error("[GeofenceManager] Setup error:", e);
      }
    };

    void setupGeofencing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canteens]);

  return <>{children}</>;
}

