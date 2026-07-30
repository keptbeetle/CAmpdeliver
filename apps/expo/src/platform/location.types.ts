export interface AppCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationSubscription {
  remove(): void;
}

export interface WatchLocationOptions {
  timeInterval?: number;
  distanceInterval?: number;
  highAccuracy?: boolean;
}

export interface LocationService {
  requestForegroundPermission(): Promise<boolean>;
  hasForegroundPermission(): Promise<boolean>;
  getCurrentPosition(options?: {
    highAccuracy?: boolean;
  }): Promise<AppCoordinates>;
  watchPosition(
    options: WatchLocationOptions,
    callback: (coordinates: AppCoordinates) => void,
  ): Promise<LocationSubscription>;
}
