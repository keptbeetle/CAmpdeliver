import type React from "react";
import { useEffect } from "react";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";

import { trpc, queryClient } from "~/utils/api";

const GEOFENCE_TASK_NAME = "LOCATION_GEOFENCE_TASK";

Notifications.setNotificationHandler({
  // eslint-disable-next-line @typescript-eslint/require-await
  handleNotification: async () => ({
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

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  const { eventType, region } = data as { eventType: Location.GeofencingEventType, region: Location.LocationRegion };
  if (error) {
    console.error(`[GeofenceManager] TaskManager Error: ${error.message}`);
    return;
  }

  if (eventType === Location.GeofencingEventType.Enter) {
    console.log(`[GeofenceManager] User entered geofence region:`, region);
    
    try {
      const quests = await queryClient.fetchQuery(
        trpc.order.availableQuests.queryOptions({
          latitude: region.latitude,
          longitude: region.longitude,
        })
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
        console.log(`[GeofenceManager] Entered ${region.identifier}, but no active quests. Suppressing notification.`);
      }
    } catch (e) {
      console.warn("[GeofenceManager] Failed to check for active quests in background", e);
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (eventType === Location.GeofencingEventType.Exit) {
      console.log(`[GeofenceManager] User exited geofence region:`, region);
    }
  }
});

export function GeofenceManager({ children }: { children: React.ReactNode }) {
  const { data: canteens } = useQuery(trpc.canteen.listActive.queryOptions());

  useEffect(() => {
    const setupGeofencing = async () => {
      if (!canteens || canteens.length === 0) return;

      try {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== Location.PermissionStatus.GRANTED) {
          console.log("[GeofenceManager] Foreground location permission denied");
          return;
        }

        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== Location.PermissionStatus.GRANTED) {
          console.log("[GeofenceManager] Background location permission denied");
          return;
        }

        const { status: notifStatus } = await Notifications.requestPermissionsAsync();
        if (notifStatus !== Notifications.PermissionStatus.GRANTED) {
          console.log("[GeofenceManager] Notifications permission denied");
          return;
        }

        const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
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
        console.log(`[GeofenceManager] Geofencing started for ${regions.length} active canteens.`);

        // Check if user is ALREADY inside any canteen region on startup
        const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const insideRegions = regions.filter(r => 
          getDistance(currentLocation.coords.latitude, currentLocation.coords.longitude, r.latitude, r.longitude) <= r.radius
        );

        for (const region of insideRegions) {
          const quests = await queryClient.fetchQuery(
            trpc.order.availableQuests.queryOptions({
              latitude: region.latitude,
              longitude: region.longitude,
            })
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
  }, [canteens]);

  return <>{children}</>;
}
