import { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ensureQuestNotificationTaskRegistered } from "~/background/quest-notification-task";
import {
  ensureAndroidNotificationChannel,
  getAuthorizedExpoPushToken,
} from "~/platform/push-registration";
import { useAuthSession } from "~/providers/AuthSessionProvider";
import { trpc } from "~/utils/api";

export function PermissionOnboardingManager() {
  const queryClient = useQueryClient();
  const { session } = useAuthSession();
  const promptedUserId = useRef<string | null>(null);
  const backgroundPromptedUserId = useRef<string | null>(null);
  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    enabled: Boolean(session),
  });
  const { mutateAsync: updatePushToken } = useMutation(
    trpc.auth.updatePushToken.mutationOptions(),
  );
  const { mutateAsync: updateDeliveryAvailability } = useMutation(
    trpc.auth.updateDeliveryAvailability.mutationOptions(),
  );

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId || promptedUserId.current === userId) return;
    promptedUserId.current = userId;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        await ensureAndroidNotificationChannel();
        const notificationState = await Notifications.getPermissionsAsync();
        const notificationPermission =
          notificationState.status === Notifications.PermissionStatus.GRANTED
            ? notificationState
            : await Notifications.requestPermissionsAsync();
        if (cancelled) return;

        if (
          notificationPermission.status ===
          Notifications.PermissionStatus.GRANTED
        ) {
          try {
            const token = await getAuthorizedExpoPushToken();
            if (token) {
              await updatePushToken({ pushToken: token });
            }
          } catch (error) {
            console.warn(
              "Could not finish first-run push registration:",
              error,
            );
          }
        }

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
          `CAmpDeliver needs ${missing.join(
            " and ",
          )} for live quest alerts, pickup eligibility, and delivery tracking. You can enable them in Android settings.`,
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
  }, [session, updatePushToken]);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (
      !userId ||
      !profile?.deliveryNotificationsEnabled ||
      backgroundPromptedUserId.current === userId
    ) {
      return;
    }
    backgroundPromptedUserId.current = userId;

    let cancelled = false;

    const setBackgroundCapability = async (requestedEnabled: boolean) => {
      let enabled = requestedEnabled;
      if (enabled) {
        try {
          await ensureQuestNotificationTaskRegistered();
        } catch (error) {
          enabled = false;
          console.warn("Background quest task registration failed:", error);
        }
      }

      if (profile.nearbyQuestAlertsEnabled === enabled) return;
      try {
        await updateDeliveryAvailability({
          enabled: true,
          canteenIds: profile.deliveryCanteenIds,
          nearbyQuestAlertsEnabled: enabled,
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
      } catch (error) {
        console.warn("Could not sync background quest capability:", error);
      }
    };

    const timer = setTimeout(() => {
      void (async () => {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (foreground.status !== Location.PermissionStatus.GRANTED) {
          await setBackgroundCapability(false);
          return;
        }

        const background = await Location.getBackgroundPermissionsAsync();
        // Cleanup can run while the permission request is awaiting Android.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cancelled) return;
        if (background.status === Location.PermissionStatus.GRANTED) {
          await setBackgroundCapability(true);
          return;
        }

        await setBackgroundCapability(false);
        // The network mutation above can outlive this component.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cancelled) return;

        Alert.alert(
          "Keep quest alerts working in background",
          'Android needs Location set to "Allow all the time" so CAmpDeliver can check your canteen proximity only when a new quest is broadcast. It does not continuously poll GPS.',
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Continue",
              onPress: () => {
                void Location.requestBackgroundPermissionsAsync()
                  .then(async (permission) => {
                    if (cancelled) return;
                    if (
                      permission.status === Location.PermissionStatus.GRANTED
                    ) {
                      await setBackgroundCapability(true);
                      return;
                    }

                    await setBackgroundCapability(false);
                    // The network mutation above can outlive this component.
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (cancelled) return;
                    Alert.alert(
                      "Background quest alerts are limited",
                      'Set Location to "Allow all the time" in Android settings for reliable nearby quest alerts while CAmpDeliver is not on screen.',
                      [
                        { text: "Not now", style: "cancel" },
                        {
                          text: "Open settings",
                          onPress: () => void Linking.openSettings(),
                        },
                      ],
                    );
                  })
                  .catch((error: unknown) =>
                    console.warn(
                      "Background location permission request failed:",
                      error,
                    ),
                  );
              },
            },
          ],
        );
      })().catch((error: unknown) =>
        console.warn("Background quest permission onboarding failed:", error),
      );
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile, queryClient, session, updateDeliveryAvailability]);

  return null;
}
