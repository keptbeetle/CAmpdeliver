import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { ActiveOrderBar } from "~/components/app/ActiveOrderBar";
import { ShellHeader } from "~/components/app/ShellHeader";
import { colors, radius, shadow } from "~/components/app/theme";
import { EmptyState, MotionView, SkeletonBlock } from "~/components/app/ui";
import { trpc } from "~/utils/api";

type Canteen = RouterOutputs["canteen"]["listActive"][number];

export default function HomeTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const {
    data: canteens,
    isLoading,
    isError,
    refetch,
  } = useQuery(trpc.canteen.listActive.queryOptions());

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.canteen.listActive.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader subtitle="Food delivery across campus" />
      <FlatList
        data={canteens ?? []}
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
          <View>
            <MotionView style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Feather name="navigation" size={20} color={colors.primary} />
                </View>
                <View style={styles.heroBadge}>
                  <View style={styles.heroBadgeDot} />
                  <Text style={styles.heroBadgeText}>Campus network</Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>
                Order nearby. Deliver on your route.
              </Text>
              <Text style={styles.heroCopy}>
                Browse active canteens, follow live orders, or pick up a
                delivery quest when it fits your day.
              </Text>
              <View style={styles.quickActions}>
                <QuickAction
                  icon="package"
                  label="My orders"
                  onPress={() => router.push("/history_tab" as never)}
                />
                <QuickAction
                  icon="navigation"
                  label="Find quests"
                  onPress={() => router.push("/quests" as never)}
                />
              </View>
            </MotionView>

            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.sectionEyebrow}>ORDER FOOD</Text>
                <Text style={styles.sectionTitle}>Campus Canteens</Text>
                <Text style={styles.sectionSubtitle}>
                  Availability comes directly from the campus catalog.
                </Text>
              </View>
              {!isLoading && !isError ? (
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{canteens?.length ?? 0}</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={styles.skeletonCard}>
                  <SkeletonBlock height={44} width={44} />
                  <View style={styles.skeletonCopy}>
                    <SkeletonBlock height={16} width="62%" />
                    <SkeletonBlock height={11} width="78%" />
                  </View>
                </View>
              ))}
            </View>
          ) : isError ? (
            <EmptyState
              icon="wifi-off"
              title="Canteens could not be loaded"
              copy="Check your connection and try again. Your cart and existing orders are unchanged."
              actionLabel="Retry"
              onAction={() => void refetch()}
            />
          ) : (
            <EmptyState
              icon="coffee"
              title="No canteens are active"
              copy="There is nothing available for new orders right now. Pull down to check again."
            />
          )
        }
        renderItem={({ item, index }) => (
          <MotionView delay={Math.min(index * 45, 220)}>
            <CanteenCard
              canteen={item}
              onPress={() => router.push(`/canteen/${item.id}` as never)}
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

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <Feather name={icon} size={16} color={colors.primaryStrong} />
      <Text style={styles.quickActionText}>{label}</Text>
      <Feather name="chevron-right" size={15} color={colors.primary} />
    </Pressable>
  );
}

function CanteenCard({
  canteen,
  onPress,
}: {
  canteen: Canteen;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.canteenIcon}>
        <Feather name="coffee" size={20} color={colors.primary} />
      </View>
      <View style={styles.cardCopy}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {canteen.name}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.activeDot} />
          <Text style={styles.metaText}>Accepting campus orders</Text>
        </View>
      </View>
      <View style={styles.openAction}>
        <Feather name="arrow-up-right" size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    height: 7,
    width: 7,
  },
  canteenIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    marginBottom: 11,
    padding: 14,
    ...shadow,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  countPill: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    minWidth: 38,
    paddingHorizontal: 10,
  },
  countText: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  hero: {
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
    ...shadow,
  },
  heroBadge: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderColor: "#B7DEC8",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroBadgeDot: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  heroBadgeText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "800",
  },
  heroCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 29,
    marginTop: 20,
    maxWidth: 330,
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  listContent: {
    paddingBottom: 108,
    paddingHorizontal: 18,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
  },
  openAction: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  quickAction: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 11,
  },
  quickActionText: {
    color: colors.primaryStrong,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  quickActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 17,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sectionCopy: {
    flex: 1,
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 24,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },
  skeletonCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    padding: 14,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonList: {
    gap: 11,
  },
});
