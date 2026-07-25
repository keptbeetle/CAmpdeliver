import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";
import { ActiveOrderBar } from "~/app/_components/ActiveOrderBar";
import { ShellHeader } from "~/app/_components/ShellHeader";
import { colors, formatCurrency } from "~/app/_components/theme";

type Quest = RouterOutputs["order"]["availableQuests"][number];

export default function QuestsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const loadLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationError("Enable location to see nearby quests.");
      return;
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setLocation({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    });
    setLocationError(null);
  }, []);

  useEffect(() => {
    void loadLocation();
  }, [loadLocation]);

  const { data: quests, isLoading } = useQuery({
    ...trpc.order.availableQuests.queryOptions({
      latitude: location?.latitude,
      longitude: location?.longitude,
    }),
    enabled: !!location,
    refetchInterval: 8000,
  });

  const acceptOrderMutation = useMutation(
    trpc.order.acceptOrder.mutationOptions({
      onSuccess: async (updatedOrder) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.order.availableQuests.queryKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() }),
        ]);
        if (updatedOrder?.id) {
          router.push(`/orders/${updatedOrder.id}/status` as never);
        }
      },
      onError: (error) => Alert.alert("Could not accept quest", error.message),
    }),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLocation();
    await queryClient.invalidateQueries({
      queryKey: trpc.order.availableQuests.queryKey(),
    });
    setRefreshing(false);
  }, [loadLocation, queryClient]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader title="Quests" subtitle="Nearby delivery requests" />
      <FlatList
        data={quests ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Feather name="compass" size={22} color="#c7d2fe" />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Delivery side quests</Text>
              <Text style={styles.heroSubtitle}>
                Accept food runs that are close to your current campus location.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <>
                <ActivityIndicator color={colors.purple} />
                <Text style={styles.emptyTitle}>Scanning nearby quests</Text>
              </>
            ) : (
              <>
                <Feather name={locationError ? "map-pin" : "compass"} size={34} color={colors.faint} />
                <Text style={styles.emptyTitle}>
                  {locationError ?? "No active quests nearby"}
                </Text>
                <Text style={styles.emptyCopy}>
                  New broadcasted orders will appear here when they are inside canteen range.
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <QuestCard
            quest={item}
            accepting={acceptOrderMutation.isPending}
            onAccept={() => acceptOrderMutation.mutate({ orderId: item.id })}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(170, insets.bottom + 152) },
        ]}
        showsVerticalScrollIndicator={false}
      />
      <ActiveOrderBar />
    </SafeAreaView>
  );
}

function QuestCard({
  quest,
  accepting,
  onAccept,
}: {
  quest: Quest;
  accepting: boolean;
  onAccept: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.questIcon}>
          <Feather name="shopping-bag" size={18} color="#c7d2fe" />
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={styles.cardTitle}>{quest.canteenName}</Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            Drop-off: {quest.deliveryLocationName}
          </Text>
          {quest.nearestLandmarkName ? (
            <Text numberOfLines={1} style={styles.landmarkText}>
              Near {quest.nearestLandmarkName}
            </Text>
          ) : null}
        </View>
        <View style={styles.earningBox}>
          <Text style={styles.earningLabel}>Earn</Text>
          <Text style={styles.earningValue}>{formatCurrency(quest.deliveryFee)}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.orderValue}>
          Food value {formatCurrency(quest.foodPrice)}
        </Text>
        <Pressable
          disabled={accepting}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.acceptButton,
            (pressed || accepting) && styles.pressed,
          ]}
        >
          <Feather name="zap" size={14} color={colors.text} />
          <Text style={styles.acceptText}>{accepting ? "Accepting" : "Accept Quest"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  acceptButton: {
    alignItems: "center",
    backgroundColor: colors.indigo,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  acceptText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  card: {
    backgroundColor: "#17172a",
    borderColor: "#4338ca",
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    marginBottom: 14,
    padding: 14,
  },
  cardBottom: {
    alignItems: "center",
    borderTopColor: "rgba(99,102,241,0.25)",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  cardCopy: {
    flex: 1,
  },
  cardSubtitle: {
    color: "#c7d2fe",
    fontSize: 12,
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
  earningBox: {
    alignItems: "flex-end",
  },
  earningLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  earningValue: {
    color: "#86efac",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 190,
    justifyContent: "center",
    padding: 24,
  },
  emptyCopy: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 10,
    textAlign: "center",
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    marginBottom: 18,
    padding: 16,
  },
  heroCopy: {
    flex: 1,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: "#312e81",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  landmarkText: {
    color: colors.faint,
    fontSize: 11,
    marginTop: 3,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  orderValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
  questIcon: {
    alignItems: "center",
    backgroundColor: "#312e81",
    borderRadius: 15,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
});
