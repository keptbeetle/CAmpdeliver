import { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

import { useAuthSession } from "~/providers/AuthSessionProvider";

export function PermissionOnboardingManager() {
  const { session } = useAuthSession();
  const promptedUserId = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId || promptedUserId.current === userId) return;
    promptedUserId.current = userId;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const notificationState = await Notifications.getPermissionsAsync();
        const notificationPermission =
          notificationState.status === Notifications.PermissionStatus.GRANTED
            ? notificationState
            : await Notifications.requestPermissionsAsync();
        if (cancelled) return;

        const locationState = await Location.getForegroundPermissionsAsync();
        const locationPermission =
          locationState.status === Location.PermissionStatus.GRANTED
            ? locationState
            : await Location.requestForegroundPermissionsAsync();
        // Cleanup can run while the Android permission sheet is awaiting input.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cancelled) return;

        const missing: string[] = [];
        if (
          notificationPermission.status !==
          Notifications.PermissionStatus.GRANTED
        ) {
          missing.push("notifications");
        }
        if (locationPermission.status !== Location.PermissionStatus.GRANTED) {
          missing.push("location");
        }
        if (missing.length === 0) return;

        Alert.alert(
          "Enable app permissions",
          `CAmpDeliver needs ${missing.join(" and ")} for live quest alerts, pickup eligibility, and delivery tracking. You can enable them in Android settings.`,
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      })().catch((error: unknown) => {
        console.warn("Permission onboarding failed:", error);
      });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session]);

  return null;
}
