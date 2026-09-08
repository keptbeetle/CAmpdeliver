import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  const nearbyEnabled = profile?.nearbyQuestAlertsEnabled ?? false;
  const supportsNearbyGeofences = Platform.OS === "android";

  const availabilityMutation = useMutation(
    trpc.auth.updateDeliveryAvailability.mutationOptions(),
  );

  const persist = async (
    enabled: boolean,
    canteenIds: string[],
    nearbyQuestAlertsEnabled: boolean,
  ) => {
    try {
      await availabilityMutation.mutateAsync({
        enabled,
        canteenIds,
        nearbyQuestAlertsEnabled,
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

  const setDeliveryAvailability = (enabled: boolean) => {
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

    void persist(enabled, canteenIds, enabled ? nearbyEnabled : false);
  };

  const toggleCanteen = (canteenId: string) => {
    const next = selectedCanteenIds.includes(canteenId)
      ? selectedCanteenIds.filter((id) => id !== canteenId)
      : [...selectedCanteenIds, canteenId];

    // An empty watch list is semantically unavailable. Keeping availability or
    // background geofencing enabled here would create a misleading state.
    if (next.length === 0) {
      void persist(false, next, false);
      return;
    }

    void persist(active, next, nearbyEnabled);
  };

  const setNearbyAlerts = (enabled: boolean) => {
    if (!enabled) {
      void persist(active, selectedCanteenIds, false);
      return;
    }

    if (!active || selectedCanteenIds.length === 0) return;

    Alert.alert(
      "Alert when you reach a canteen?",
      "Android can notify you when you enter a selected canteen area. CAmpDeliver does not continuously upload your background location for this feature.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            void (async () => {
              const existingNotification =
                await Notifications.getPermissionsAsync();
              const notificationPermission =
                existingNotification.status ===
                Notifications.PermissionStatus.GRANTED
                  ? existingNotification
                  : await Notifications.requestPermissionsAsync();
              if (
                notificationPermission.status !==
                Notifications.PermissionStatus.GRANTED
              ) {
                Alert.alert(
                  "Notifications are off",
                  "Enable notifications in Android settings to receive nearby quest alerts.",
                );
                return;
              }

              const foreground =
                await Location.requestForegroundPermissionsAsync();
              if (foreground.status !== Location.PermissionStatus.GRANTED) {
                Alert.alert(
                  "Location is off",
                  "Allow location while using the app first, then try again.",
                );
                return;
              }

              const background =
                await Location.requestBackgroundPermissionsAsync();
              if (background.status !== Location.PermissionStatus.GRANTED) {
                Alert.alert(
                  "Background location is off",
                  'Choose "Allow all the time" in Android settings for canteen arrival alerts.',
                );
                return;
              }

              await persist(true, selectedCanteenIds, true);
            })().catch((error: unknown) => {
              console.warn("Could not enable nearby quest alerts", error);
              Alert.alert(
                "Nearby alerts not enabled",
                "Please try again from the Quests screen.",
              );
            });
          },
        },
      ],
    );
  };

  const isSaving = availabilityMutation.isPending;

  return (
    <SectionCard style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <Feather name="bell" size={18} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Quest availability</Text>
          <Text style={styles.copy}>
            Choose when and where you want delivery requests.
          </Text>
        </View>
        {isSaving ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>Available for quests</Text>
          <Text style={styles.rowDescription}>
            Receive delivery notifications for your selected canteens.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Available for delivery quests"
          disabled={isSaving || canteensLoading}
          onValueChange={setDeliveryAvailability}
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

          {supportsNearbyGeofences ? (
            <View style={[styles.row, styles.nearbyRow]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Alert when I am nearby</Text>
                <Text style={styles.rowDescription}>
                  Optional Android arrival alerts for selected canteens.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Alert when near a selected canteen"
                disabled={isSaving || selectedCanteenIds.length === 0}
                onValueChange={setNearbyAlerts}
                thumbColor={colors.white}
                trackColor={{
                  false: colors.borderStrong,
                  true: colors.primary,
                }}
                value={nearbyEnabled}
              />
            </View>
          ) : null}

          {supportsNearbyGeofences && nearbyEnabled ? (
            <InlineNotice
              tone="success"
              icon="shield"
              title="Nearby alerts are on"
              copy="Android watches only the selected canteen areas. Turn off availability to stop these alerts."
            />
          ) : null}
        </>
      ) : (
        <InlineNotice
          icon="moon"
          title="You are currently unavailable"
          copy="You can still place and track your own orders."
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
  nearbyRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 14,
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
