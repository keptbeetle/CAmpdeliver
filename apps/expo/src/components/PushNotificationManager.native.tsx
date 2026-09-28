import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import {
  ensureAndroidNotificationChannel,
  getAuthorizedExpoPushToken,
} from "~/platform/push-registration";
import { useAuthSession } from "~/providers/AuthSessionProvider";
import { queryClient, trpc } from "~/utils/api";

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

interface NotificationData {
  orderId?: string;
  type?: string;
  url?: string;
}

function notificationData(
  notification: Notifications.Notification,
): NotificationData | undefined {
  return notification.request.content.data as NotificationData | undefined;
}

function notificationRoute(response: Notifications.NotificationResponse) {
  const data = notificationData(response.notification);

  if (data?.url?.startsWith("/")) return data.url;
  if (data?.orderId) return `/orders/${data.orderId}/status`;
  return null;
}

function refreshNotificationData(notification: Notifications.Notification) {
  const data = notificationData(notification);
  if (data?.type === "NEW_QUEST") {
    void queryClient.invalidateQueries({
      queryKey: trpc.order.availableQuests.queryKey(),
    });
  }
  if (data?.orderId) {
    void queryClient.invalidateQueries({
      queryKey: trpc.order.myOrders.queryKey(),
    });
  }
}

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
      refreshNotificationData(response.notification);
      const route = notificationRoute(response);
      if (route) router.push(route as never);
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      refreshNotificationData,
    );
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(navigate);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      navigate(response);
      Notifications.clearLastNotificationResponse();
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [isLoading, router, session]);

  useEffect(() => {
    if (isLoading || !session) {
      latestToken.current = null;
      return;
    }

    let cancelled = false;
    let registrationInFlight: Promise<void> | null = null;
    let permissionRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const registerDevice = () => {
      if (registrationInFlight) return registrationInFlight;

      registrationInFlight = (async () => {
        try {
          await ensureAndroidNotificationChannel();
          const permissions = await Notifications.getPermissionsAsync();

          if (permissions.status !== Notifications.PermissionStatus.GRANTED) {
            // The authenticated tabs own the user-facing permission prompt. If
            // this is a first login/signup, quietly wait for that prompt instead
            // of interrupting OTP/profile creation from the root manager.
            if (
              permissions.status ===
                Notifications.PermissionStatus.UNDETERMINED &&
              !cancelled &&
              !permissionRetryTimer
            ) {
              permissionRetryTimer = setTimeout(() => {
                permissionRetryTimer = null;
                void registerDevice();
              }, 1000);
            }
            return;
          }

          const token = await getAuthorizedExpoPushToken();
          if (!token || cancelled) return;

          // Re-submit on every foreground transition. This repairs a missing
          // server-side token without requiring the user to sign in again.
          if (
            token !== latestToken.current ||
            AppState.currentState === "active"
          ) {
            await updatePushToken({ pushToken: token });
            latestToken.current = token;
          }
        } catch (error) {
          console.warn("Push token registration failed:", error);
        } finally {
          registrationInFlight = null;
        }
      })();

      return registrationInFlight;
    };

    void registerDevice();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void registerDevice();
      },
    );
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      latestToken.current = null;
      void registerDevice();
    });

    return () => {
      cancelled = true;
      if (permissionRetryTimer) clearTimeout(permissionRetryTimer);
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [isLoading, session, updatePushToken]);

  return null;
}
