import * as Location from "expo-location";

import type { LocationService } from "./location.types";

export const locationService: LocationService = {
  async requestForegroundPermission() {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === Location.PermissionStatus.GRANTED) return true;

    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.status === Location.PermissionStatus.GRANTED;
  },
  async hasForegroundPermission() {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  },
  async getCurrentPosition(options) {
    const highAccuracy = options?.highAccuracy ?? false;
    const accuracy = highAccuracy
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced;
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: 10_000,
      requiredAccuracy: highAccuracy ? 50 : 100,
    });
    if (recent) {
      return {
        latitude: recent.coords.latitude,
        longitude: recent.coords.longitude,
      };
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let subscription: Location.LocationSubscription | null = null;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        subscription?.remove();
        reject(
          new Error(
            "Current location timed out. Move to an open area and try again.",
          ),
        );
      }, 10_000);

      void Location.watchPositionAsync(
        {
          accuracy,
          timeInterval: 0,
          distanceInterval: 0,
        },
        (location) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          subscription?.remove();
          resolve({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        },
      )
        .then((createdSubscription) => {
          subscription = createdSubscription;
          if (settled) subscription.remove();
        })
        .catch((error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error("Unable to read location."));
        });
    });
  },
  async watchPosition(options, callback) {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: options.highAccuracy
          ? Location.Accuracy.High
          : Location.Accuracy.Balanced,
        timeInterval: options.timeInterval,
        distanceInterval: options.distanceInterval,
      },
      (location) =>
        callback({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }),
    );
    return { remove: () => subscription.remove() };
  },
};
