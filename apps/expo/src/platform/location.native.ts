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
    const location = await Location.getCurrentPositionAsync({
      accuracy: options?.highAccuracy
        ? Location.Accuracy.High
        : Location.Accuracy.Balanced,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
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
