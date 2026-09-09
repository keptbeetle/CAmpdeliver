import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { ActiveOrderBar } from "~/components/app/ActiveOrderBar";
import { ShellHeader } from "~/components/app/ShellHeader";
import { colors, formatCurrency, radius, shadow } from "~/components/app/theme";
import {
  AppButton,
  EmptyState,
  InlineNotice,
  MotionView,
  SkeletonBlock,
} from "~/components/app/ui";
import { DeliveryAvailabilityCard } from "~/components/DeliveryAvailabilityCard";
import { locationService } from "~/platform/location";
import { trpc } from "~/utils/api";

type Quest = RouterOutputs["order"]["availableQuests"][number];

type LocationState =
  | { status: "loading" }
  | { status: "ready"; latitude: number; longitude: number }
  | { status: "error"; message: string };

export default function QuestsTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<LocationState>({
    status: "loading",
  });

  const loadLocation = useCallback(async () => {
    setLocationState({ status: "loading" });
    try {
      const granted = await locationService.requestForegroundPermission();
      if (!granted) {
        setLocationState({
          status: "error",
          message:
            "Location access is needed to show quests within each canteen's delivery radius.",
        });
        return;
      }
      const current = await locationService.getCurrentPosition();
      setLocationState({ status: "ready", ...current });
    } catch (error) {
      console.warn("Could not read quest location:", error);
      setLocationState({
        status: "error",
        message:
          "Your current location could not be read. Check GPS and try again.",
      });
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void loadLocation(), 0);
    return () => clearTimeout(timeout);
  }, [loadLocation]);

  const locationInput =
    locationState.status === "ready"
      ? {
          latitude: locationState.latitude,
          longitude: locationState.longitude,
        }
      : undefined;

  const {
    data: quests,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...trpc.order.availableQuests.queryOptions(locationInput ?? {}),
    enabled: locationState.status === "ready",
    refetchInterval: locationState.status === "ready" ? 8000 : false,
  });

  const acceptOrderMutation = useMutation(
    trpc.order.acceptOrder.mutationOptions(),
  );

  const acceptQuest = async (quest: Quest) => {
    if (acceptingOrderId) return;
    setAcceptingOrderId(quest.id);
    try {
      const updatedOrder = await acceptOrderMutation.mutateAsync({
        orderId: quest.id,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        }),
      ]);
      if (updatedOrder?.id) {
        router.push(`/orders/${updatedOrder.id}/status` as never);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "This quest could not be accepted. It may have been claimed already.";
      // Keep the error contextual to the action rather than replacing the list.
      alertMessage("Could not accept quest", message);
      await queryClient.invalidateQueries({
        queryKey: trpc.order.availableQuests.queryKey(),
      });
    } finally {
      setAcceptingOrderId(null);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadLocation();
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [loadLocation, refetch]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader title="Quests" subtitle="Delivery requests near you" />
      <FlatList
        data={quests ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            <MotionView style={styles.hero}>
              <View style={styles.heroIcon}>
                <Feather name="navigation" size={21} color={colors.primary} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>DELIVER ON YOUR ROUTE</Text>
                <Text style={styles.heroTitle}>Nearby quests</Text>
                <Text style={styles.heroSubtitle}>
                  Requests appear only when you are inside the canteen's
                  configured pickup radius.
                </Text>
              </View>
            </MotionView>

            <DeliveryAvailabilityCard />

            {locationState.status === "loading" ? (
              <InlineNotice
                icon="crosshair"
                title="Checking your pickup area"
                copy="Reading your current location to find nearby canteen quests."
              />
            ) : locationState.status === "ready" ? (
              <InlineNotice
                tone="success"
                icon="map-pin"
                title="Location ready"
                copy="Quest availability refreshes automatically while this screen is open."
              />
            ) : null}

            {locationState.status === "ready" ? (
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>AVAILABLE NOW</Text>
                  <Text style={styles.sectionTitle}>Pickup requests</Text>
                </View>
                {!isLoading && !isError ? (
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{quests?.length ?? 0}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          locationState.status === "loading" ? (
            <QuestSkeleton />
          ) : locationState.status === "error" ? (
            <EmptyState
              icon="map-pin"
              title="Location is unavailable"
              copy={locationState.message}
              actionLabel="Try location again"
              onAction={() => void loadLocation()}
            />
          ) : isLoading ? (
            <QuestSkeleton />
          ) : isError ? (
            <EmptyState
              icon="wifi-off"
              title="Quests could not be refreshed"
              copy="Check your connection and retry. Existing accepted orders remain in My Orders."
              actionLabel="Retry"
              onAction={() => void refetch()}
            />
          ) : (
            <EmptyState
              icon="navigation"
              title="No active quests nearby"
              copy="New orders will appear here when they are broadcast inside the canteen pickup radius."
            />
          )
        }
        renderItem={({ item, index }) => (
          <MotionView delay={Math.min(index * 45, 200)}>
            <QuestCard
              quest={item}
              accepting={acceptingOrderId === item.id}
              disabled={Boolean(
                acceptingOrderId && acceptingOrderId !== item.id,
              )}
              onAccept={() => void acceptQuest(item)}
            />
          </MotionView>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      <ActiveOrderBar />
    </SafeAreaView>
  );
}

function QuestSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1].map((value) => (
        <View key={value} style={styles.skeletonCard}>
          <View style={styles.skeletonTop}>
            <SkeletonBlock height={42} width={42} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock height={15} width="62%" />
              <SkeletonBlock height={11} width="82%" />
            </View>
          </View>
          <SkeletonBlock height={44} />
        </View>
      ))}
    </View>
  );
}

function QuestCard({
  quest,
  accepting,
  disabled,
  onAccept,
}: {
  quest: Quest;
  accepting: boolean;
  disabled: boolean;
  onAccept: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.questIcon}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {quest.canteenName}
          </Text>
          <Text numberOfLines={2} style={styles.cardSubtitle}>
            Drop-off · {quest.deliveryLocationName}
          </Text>
          {quest.nearestLandmarkName ? (
            <View style={styles.landmarkRow}>
              <Feather name="map-pin" size={12} color={colors.faint} />
              <Text numberOfLines={1} style={styles.landmarkText}>
                {quest.nearestLandmarkName}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.earningBox}>
          <Text style={styles.earningLabel}>Delivery fee</Text>
          <Text style={styles.earningValue}>
            {formatCurrency(quest.deliveryFee)}
          </Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        <View>
          <Text style={styles.valueLabel}>Food value</Text>
          <Text style={styles.valueText}>
            {formatCurrency(quest.foodPrice)}
          </Text>
        </View>
        <View style={styles.valueDivider} />
        <View style={styles.valueCopy}>
          <Text style={styles.valueLabel}>Next step</Text>
          <Text style={styles.valueText}>Check item availability</Text>
        </View>
      </View>

      <AppButton
        label={accepting ? "Accepting…" : "Accept Quest"}
        icon="arrow-right"
        loading={accepting}
        disabled={disabled}
        onPress={onAccept}
      />
    </View>
  );
}

function alertMessage(title: string, message: string) {
  Alert.alert(title, message);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 13,
    marginBottom: 12,
    padding: 15,
    ...shadow,
  },
  cardCopy: {
    flex: 1,
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  cardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 11,
  },
  countPill: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 36,
  },
  countText: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  earningBox: {
    alignItems: "flex-end",
  },
  earningLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  earningValue: {
    color: colors.success,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    marginBottom: 14,
    padding: 16,
    ...shadow,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  landmarkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  landmarkText: {
    color: colors.faint,
    flexShrink: 1,
    fontSize: 10,
  },
  listContent: {
    paddingBottom: 108,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  questIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  skeletonCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 14,
    padding: 15,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonList: {
    gap: 12,
    marginTop: 12,
  },
  skeletonTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  valueCopy: {
    flex: 1,
  },
  valueDivider: {
    alignSelf: "stretch",
    backgroundColor: colors.border,
    width: 1,
  },
  valueLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  valueRow: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 13,
    padding: 11,
  },
  valueText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
});
