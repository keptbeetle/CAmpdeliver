import type React from "react";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

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

interface EasConfig {
  projectId?: string;
}

export function PushNotificationManager({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const updatePushTokenMutation = useMutation(
    trpc.auth.updatePushToken.mutationOptions(),
  );

  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null,
  );
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const mutateRef = useRef(updatePushTokenMutation.mutateAsync);
  mutateRef.current = updatePushTokenMutation.mutateAsync;

  useEffect(() => {
    let isMounted = true;

    async function registerForPushNotificationsAsync(): Promise<string | null> {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default Notifications",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#1F104A",
          sound: "default",
          enableVibrate: true,
          showBadge: true,
        });
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== Notifications.PermissionStatus.GRANTED) {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
        console.log(
          "[PushNotificationManager] Notification permissions not granted.",
        );
        return null;
      }

      try {
        const extra = Constants.expoConfig?.extra as
          | { eas?: EasConfig }
          | undefined;
        const projectId =
          extra?.eas?.projectId ??
          (Constants.easConfig as EasConfig | undefined)?.projectId ??
          "b658b0d5-1c62-4f07-8329-38563db9dfa3";

        const pushTokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });

        console.log(
          "[PushNotificationManager] Registered push token:",
          pushTokenData.data,
        );
        return pushTokenData.data;
      } catch (err) {
        console.warn(
          "[PushNotificationManager] Could not obtain Expo push token:",
          err,
        );
        return null;
      }
    }

    async function syncPushToken() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const token = await registerForPushNotificationsAsync();
      if (token && isMounted) {
        try {
          await mutateRef.current({ pushToken: token });
          console.log("[PushNotificationManager] Push token synced to backend");
        } catch (err) {
          console.warn(
            "[PushNotificationManager] Failed to sync push token with backend:",
            err,
          );
        }
      }
    }

    void syncPushToken();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          void syncPushToken();
        }
      },
    );

    // Foreground notification listener
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log(
          "[PushNotificationManager] Received notification in foreground:",
          notification.request.content,
        );
      });

    // Tap on notification listener (background & foreground)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | { url?: string; orderId?: string }
          | undefined;

        console.log(
          "[PushNotificationManager] Notification response received:",
          data,
        );

        if (data?.url) {
          router.push(data.url as Href);
        } else if (data?.orderId) {
          router.push(`/orders/${data.orderId}/status` as Href);
        }
      });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);

  return <>{children}</>;
}
