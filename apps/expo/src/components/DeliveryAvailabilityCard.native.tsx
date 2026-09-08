import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { colors } from "~/components/app/theme";
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

  const availabilityMutation = useMutation(
    trpc.auth.updateDeliveryAvailability.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
      },
      onError: (error) =>
        Alert.alert("Could not update availability", error.message),
    }),
  );

  const save = (
    enabled: boolean,
    canteenIds: string[],
    nearbyQuestAlertsEnabled: boolean,
  ) =>
    availabilityMutation.mutate({
      enabled,
      canteenIds,
      nearbyQuestAlertsEnabled,
    });

  const setDeliveryAvailability = (enabled: boolean) => {
    const canteenIds =
      enabled && selectedCanteenIds.length === 0
        ? (canteens ?? []).map((canteen) => canteen.id)
        : selectedCanteenIds;
    setUserSelectedCanteenIds(canteenIds);
    save(enabled, canteenIds, profile?.nearbyQuestAlertsEnabled ?? false);
  };

  const toggleCanteen = (canteenId: string) => {
    const next = selectedCanteenIds.includes(canteenId)
      ? selectedCanteenIds.filter((id) => id !== canteenId)
      : [...selectedCanteenIds, canteenId];
    setUserSelectedCanteenIds(next);
    save(
      profile?.deliveryNotificationsEnabled ?? false,
      next,
      profile?.nearbyQuestAlertsEnabled ?? false,
    );
  };

  const setNearbyAlerts = (enabled: boolean) => {
    if (!enabled) {
      save(
        profile?.deliveryNotificationsEnabled ?? false,
        selectedCanteenIds,
        false,
      );
      return;
    }

    Alert.alert(
      "Notify near a canteen?",
      "CAmpDeliver will use Android geofences to alert you when you enter a selected canteen area. Your live location is not continuously sent to us. Android may delay these alerts to save battery.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            void (async () => {
              const notificationPermission =
                await Notifications.getPermissionsAsync();
              const notificationStatus =
                notificationPermission.status ===
                Notifications.PermissionStatus.GRANTED
                  ? notificationPermission
                  : await Notifications.requestPermissionsAsync();
              if (
                notificationStatus.status !==
                Notifications.PermissionStatus.GRANTED
              ) {
                Alert.alert(
                  "Notifications are needed",
                  "Enable notifications so Android can show nearby quest alerts.",
                );
                return;
              }

              const foreground =
                await Location.requestForegroundPermissionsAsync();
              if (foreground.status !== Location.PermissionStatus.GRANTED) {
                Alert.alert(
                  "Location is needed",
                  "Allow location while using the app before enabling nearby canteen alerts.",
                );
                return;
              }

              const background =
                await Location.requestBackgroundPermissionsAsync();
              if (background.status !== Location.PermissionStatus.GRANTED) {
                Alert.alert(
                  "Allow location all the time",
                  'Android requires the "Allow all the time" location setting for alerts after the app is closed.',
                );
                return;
              }

              save(
                profile?.deliveryNotificationsEnabled ?? false,
                selectedCanteenIds,
                true,
              );
            })().catch((error: unknown) => {
              console.warn("Could not enable nearby quest alerts", error);
              Alert.alert(
                "Could not enable nearby alerts",
                "Please try again from this screen.",
              );
            });
          },
        },
      ],
    );
  };

  const active = profile?.deliveryNotificationsEnabled ?? false;
  const nearbyEnabled = profile?.nearbyQuestAlertsEnabled ?? false;
  const isSaving = availabilityMutation.isPending;

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <Feather name="bell" size={18} color="#c7d2fe" />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Deliverer availability</Text>
          <Text style={styles.copy}>
            Get quest alerts only for canteens you choose.
          </Text>
        </View>
        {isSaving ? (
          <ActivityIndicator color={colors.purple} size="small" />
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>Available for quests</Text>
          <Text style={styles.rowDescription}>
            Receive remote alerts even when the app is closed.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Available for delivery quests"
          disabled={isSaving || canteensLoading}
          onValueChange={setDeliveryAvailability}
          thumbColor={active ? colors.text : "#a1a1aa"}
          trackColor={{ false: "#3f3f46", true: colors.purple }}
          value={active}
        />
      </View>

      {active ? (
        <>
          <Text style={styles.selectionLabel}>Canteens to watch</Text>
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
                    color={selected ? colors.text : colors.faint}
                    name={selected ? "check-circle" : "circle"}
                    size={14}
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

          <View style={[styles.row, styles.nearbyRow]}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Alert when I am nearby</Text>
              <Text style={styles.rowDescription}>
                Optional Android geofences. No continuous location sharing.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Alert when near a selected canteen"
              disabled={isSaving || selectedCanteenIds.length === 0}
              onValueChange={setNearbyAlerts}
              thumbColor={nearbyEnabled ? colors.text : "#a1a1aa"}
              trackColor={{ false: "#3f3f46", true: colors.purple }}
              value={nearbyEnabled}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canteenChip: {
    alignItems: "center",
    backgroundColor: "#18181b",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  canteenChipSelected: {
    backgroundColor: "rgba(124,58,237,0.2)",
    borderColor: "#8b5cf6",
  },
  canteenName: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 130,
  },
  canteenNameSelected: { color: colors.text },
  canteens: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    backgroundColor: "#121216",
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
    padding: 16,
  },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  heading: { alignItems: "center", flexDirection: "row", gap: 10 },
  headingCopy: { flex: 1, gap: 2 },
  icon: {
    alignItems: "center",
    backgroundColor: "rgba(124,58,237,0.22)",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  nearbyRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  pressed: { opacity: 0.7 },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  rowCopy: { flex: 1, gap: 3 },
  rowDescription: { color: colors.faint, fontSize: 11, lineHeight: 16 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  selectionLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  title: { color: colors.text, fontSize: 15, fontWeight: "900" },
});
