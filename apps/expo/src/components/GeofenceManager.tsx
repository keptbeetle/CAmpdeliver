import type React from "react";
import { useEffect } from "react";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";

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

// eslint-disable-next-line @typescript-eslint/require-await
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  const { eventType, region } = data as { eventType: Location.GeofencingEventType, region: Location.LocationRegion };
  if (error) {
    console.error(`[GeofenceManager] TaskManager Error: ${error.message}`);
    return;
  }

  // region object will have identifier, latitude, longitude, radius
  if (eventType === Location.GeofencingEventType.Enter) {
    console.log(`[GeofenceManager] User entered geofence region:`, region);
    
    // Trigger local notification
    void Notifications.scheduleNotificationAsync({
      content: {
        title: "Quest Available!",
        body: `You are near ${region.identifier}! Want to accept a delivery quest?`,
        sound: true,
      },
      trigger: null, // immediate
    });
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
          notifyOnExit: false, // Or true if you want exit events
        }));

        await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
        console.log(`[GeofenceManager] Geofencing started for ${regions.length} active canteens.`);
      } catch (e) {
        console.error("[GeofenceManager] Setup error:", e);
      }
    };

    void setupGeofencing();
  }, [canteens]);

  return <>{children}</>;
}
