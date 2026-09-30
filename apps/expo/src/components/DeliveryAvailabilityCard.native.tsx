import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ensureQuestNotificationTaskRegistered } from "~/background/quest-notification-task";
import { colors, radius } from "~/components/app/theme";
import { InlineNotice, SectionCard } from "~/components/app/ui";
import { trpc } from "~/utils/api";

export function DeliveryAvailabilityCard() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: canteens, isLoading: canteensLoading } = useQuery(
    trpc.canteen.listActive.queryOptions(),
  );
  const [userSelectedCanteenIds, setUserSelectedCanteenIds] = useState<
    string[] | null
  >(null);

  const selectedCanteenIds =
    userSelectedCanteenIds ?? profile?.deliveryCanteenIds ?? [];
  const active = profile?.deliveryNotificationsEnabled ?? false;
  const backgroundAlertsCapable = profile?.nearbyQuestAlertsEnabled ?? false;

  const availabilityMutation = useMutation(
    trpc.auth.updateDeliveryAvailability.mutationOptions(),
  );

  const persist = async (
    enabled: boolean,
    canteenIds: string[],
    backgroundAlertsEnabled: boolean,
  ) => {
    try {
      await availabilityMutation.mutateAsync({
        enabled,
        canteenIds,
        nearbyQuestAlertsEnabled:
          enabled && canteenIds.length > 0 && backgroundAlertsEnabled,
      });
      setUserSelectedCanteenIds(canteenIds);
      await queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyProfile.queryKey(),
      });
    } catch (error) {
      Alert.alert(
        "Availability not updated",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const setDeliveryAvailability = async (enabled: boolean) => {
    const fallbackIds = (canteens ?? []).map((canteen) => canteen.id);
    const canteenIds =
      enabled && selectedCanteenIds.length === 0
        ? fallbackIds
        : selectedCanteenIds;

    if (enabled && canteenIds.length === 0) {
      Alert.alert(
        "No active canteens",
        "Availability can be enabled when at least one canteen is active.",
      );
      return;
    }

    let backgroundAlertsEnabled = false;
    if (enabled) {
      const existingPermission = await Notifications.getPermissionsAsync();
      const notificationPermission =
        existingPermission.status ===
        Notifications.PermissionStatus.UNDETERMINED
          ? await Notifications.requestPermissionsAsync()
          : existingPermission;

      if (
        notificationPermission.status !== Notifications.PermissionStatus.GRANTED
      ) {
        Alert.alert(
          "Notifications are required",
          "Enable notifications in system settings before marking yourself available for delivery quests.",
        );
        return;
      }

      const currentLocationPermission =
        await Location.getForegroundPermissionsAsync();
      const locationPermission =
        currentLocationPermission.status === Location.PermissionStatus.GRANTED
          ? currentLocationPermission
          : await Location.requestForegroundPermissionsAsync();
      if (locationPermission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          "Location is required",
          "Allow location while using CAmpDeliver so the server can verify that you are actually inside a selected canteen's pickup radius.",
        );
        return;
      }

      const currentBackgroundPermission =
        await Location.getBackgroundPermissionsAsync();
      const backgroundPermission =
        currentBackgroundPermission.status === Location.PermissionStatus.GRANTED
          ? currentBackgroundPermission
          : await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          "Background location is required for quest alerts",
          'Set Location to "Allow all the time" so Android can wake CAmpDeliver for a single canteen-proximity check when a quest is broadcast while the app is not on screen. CAmpDeliver does not continuously track your location in the background.',
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
        return;
      }

      try {
        await ensureQuestNotificationTaskRegistered();
      } catch (error) {
        console.warn("Background quest task registration failed:", error);
        Alert.alert(
          "Background alerts could not be enabled",
          "CAmpDeliver could not finish Android background notification setup. Please try again.",
        );
        return;
      }
      backgroundAlertsEnabled = true;
    }

    await persist(enabled, canteenIds, backgroundAlertsEnabled);
  };

  const toggleCanteen = (canteenId: string) => {
    const next = selectedCanteenIds.includes(canteenId)
      ? selectedCanteenIds.filter((id) => id !== canteenId)
      : [...selectedCanteenIds, canteenId];

    // An empty list is semantically unavailable.
    if (next.length === 0) {
      void persist(false, next, false);
      return;
    }

    void persist(active, next, active && backgroundAlertsCapable);
  };

  const isSaving = availabilityMutation.isPending;

  return (
    <SectionCard style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <Feather name="bell" size={18} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Quest alerts</Text>
          <Text style={styles.copy}>
            Choose which canteens may notify you while you are nearby.
          </Text>
        </View>
        {isSaving ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>Notify me about nearby quests</Text>
          <Text style={styles.rowDescription}>
            Android checks your location once when a selected canteen broadcasts
            a quest, including while CAmpDeliver is not on screen.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Notify me about nearby delivery quests"
          disabled={isSaving || canteensLoading}
          onValueChange={(enabled) => void setDeliveryAvailability(enabled)}
          thumbColor={colors.white}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          value={active}
        />
      </View>

      {active ? (
        <>
          <View style={styles.selectionHeader}>
            <Text style={styles.selectionLabel}>Canteens to watch</Text>
            <Text style={styles.selectionCount}>
              {selectedCanteenIds.length} selected
            </Text>
          </View>
          <View style={styles.canteens}>
            {(canteens ?? []).map((canteen) => {
              const selected = selectedCanteenIds.includes(canteen.id);
              return (
                <Pressable
                  key={canteen.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  disabled={isSaving}
                  onPress={() => toggleCanteen(canteen.id)}
                  style={({ pressed }) => [
                    styles.canteenChip,
                    selected && styles.canteenChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather
                    color={selected ? colors.primary : colors.faint}
                    name={selected ? "check-circle" : "circle"}
                    size={15}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.canteenName,
                      selected && styles.canteenNameSelected,
                    ]}
                  >
                    {canteen.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <InlineNotice
            tone="success"
            icon="crosshair"
            title="Event-driven background alerts"
            copy="No continuous GPS polling or keep-alive service runs. A silent push wakes one location check, and the alert is shown only when you are inside that canteen's pickup radius."
          />
        </>
      ) : (
        <InlineNotice
          icon="moon"
          title="Quest alerts are off"
          copy="You can still open Quests and accept a request when your current location is inside its canteen pickup radius."
        />
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  canteenChip: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  canteenChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: "#B7D7D5",
  },
  canteenName: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 150,
  },
  canteenNameSelected: {
    color: colors.primaryStrong,
  },
  canteens: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    gap: 15,
    marginBottom: 16,
  },
  copy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headingCopy: {
    flex: 1,
    gap: 2,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  selectionCount: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  selectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
});
