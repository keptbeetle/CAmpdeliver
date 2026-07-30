import type { LocationService } from "./location.types";

function geolocation(): Geolocation {
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation is not supported by this browser.");
  }
  return navigator.geolocation;
}

function permissionState(): Promise<PermissionState | null> {
  if (!("permissions" in navigator)) {
    return Promise.resolve(null);
  }

  return navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => result.state)
    .catch(() => null);
}

export const locationService: LocationService = {
  async requestForegroundPermission() {
    return (await permissionState()) !== "denied";
  },
  async hasForegroundPermission() {
    const state = await permissionState();
    return state !== "denied";
  },
  getCurrentPosition(options) {
    return new Promise((resolve, reject) => {
      geolocation().getCurrentPosition(
        ({ coords }) =>
          resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        (error) =>
          reject(new Error(error.message || "Unable to read location.")),
        {
          enableHighAccuracy: options?.highAccuracy ?? true,
          maximumAge: 0,
          timeout: 15_000,
        },
      );
    });
  },
  watchPosition(options, callback) {
    const id = geolocation().watchPosition(
      ({ coords }) =>
        callback({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => console.warn("Location watch failed:", error.message),
      {
        enableHighAccuracy: options.highAccuracy ?? true,
        maximumAge: Math.max(options.timeInterval ?? 0, 0),
      },
    );
    return Promise.resolve({ remove: () => geolocation().clearWatch(id) });
  },
};
