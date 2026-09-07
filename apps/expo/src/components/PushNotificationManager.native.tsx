import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { useAuthSession } from "~/providers/AuthSessionProvider";
import { trpc } from "~/utils/api";

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

function notificationRoute(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as
    | { orderId?: string; url?: string }
    | undefined;

  if (data?.url?.startsWith("/")) return data.url;
  if (data?.orderId) return `/orders/${data.orderId}/status`;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pushProjectId(): string | null {
  const easConfig: unknown = Constants.easConfig;
  if (isRecord(easConfig) && typeof easConfig.projectId === "string") {
    return easConfig.projectId;
  }

  const expoConfig: unknown = Constants.expoConfig;
  if (!isRecord(expoConfig) || !isRecord(expoConfig.extra)) return null;
  const eas = expoConfig.extra.eas;
  return isRecord(eas) && typeof eas.projectId === "string"
    ? eas.projectId
    : null;
}

async function configureAndroidChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Order updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
  });
}

/**
 * Keeps the signed-in device registered for remote push independently of
 * location/geofencing permissions. It intentionally only asks for the Android
 * notification permission after a user has signed in.
 */
export function PushNotificationManager() {
  const router = useRouter();
  const { isLoading, session } = useAuthSession();
  const { mutateAsync: updatePushToken } = useMutation(
    trpc.auth.updatePushToken.mutationOptions(),
  );
  const latestToken = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !session) return;

    const navigate = (response: Notifications.NotificationResponse) => {
      const route = notificationRoute(response);
      if (route) router.push(route as never);
    };

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(navigate);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      navigate(response);
      Notifications.clearLastNotificationResponse();
    });

    return () => responseSubscription.remove();
  }, [isLoading, router, session]);

  useEffect(() => {
    if (isLoading || !session) {
      latestToken.current = null;
      return;
    }

    let cancelled = false;
    const registerDevice = async () => {
      try {
        // Android 13 requires the channel to exist before the notification
        // permission prompt and before an Expo token can be requested.
        await configureAndroidChannel();
        const currentPermissions = await Notifications.getPermissionsAsync();
        const permissions =
          currentPermissions.status ===
          Notifications.PermissionStatus.UNDETERMINED
            ? await Notifications.requestPermissionsAsync()
            : currentPermissions;

        if (permissions.status !== Notifications.PermissionStatus.GRANTED) {
          console.info("Push notifications are not enabled for this device.");
          return;
        }

        const projectId = pushProjectId();
        if (!projectId) {
          console.warn(
            "Push token registration skipped: missing EAS project ID.",
          );
          return;
        }

        const tokenResponse: unknown =
          await Notifications.getExpoPushTokenAsync({ projectId });
        const token =
          isRecord(tokenResponse) && typeof tokenResponse.data === "string"
            ? tokenResponse.data
            : null;
        if (!token || cancelled || token === latestToken.current) return;

        await updatePushToken({ pushToken: token });
        latestToken.current = token;
      } catch (error) {
        console.warn("Push token registration failed:", error);
      }
    };

    void registerDevice();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, updatePushToken]);

  return null;
}
