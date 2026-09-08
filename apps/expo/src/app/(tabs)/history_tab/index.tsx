import { useCallback, useMemo, useState } from "react";
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
import {
  ACTIVE_ORDER_STATUSES,
  colors,
  formatCurrency,
  radius,
  shadow,
  shortId,
} from "~/components/app/theme";
import {
  EmptyState,
  MotionView,
  SkeletonBlock,
  StatusBadge,
} from "~/components/app/ui";
import { trpc } from "~/utils/api";

type Order = RouterOutputs["order"]["myOrders"][number];
type Filter = "active" | "past" | "all";

export default function OrdersTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 5000,
  });

  const filteredOrders = useMemo(() => {
    const source = orders ?? [];
    if (filter === "all") return source;
    const active = (order: Order) =>
      ACTIVE_ORDER_STATUSES.includes(order.status);
    return source.filter((order) =>
      filter === "active" ? active(order) : !active(order),
    );
  }, [filter, orders]);

  const activeCount = useMemo(
    () =>
      (orders ?? []).filter((order) =>
        ACTIVE_ORDER_STATUSES.includes(order.status),
      ).length,
    [orders],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader title="Orders" subtitle="Current and past deliveries" />
      <FlatList
        data={filteredOrders}
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
            <MotionView style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Feather name="package" size={21} color={colors.primary} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryEyebrow}>DELIVERY ACTIVITY</Text>
                <Text style={styles.summaryTitle}>
                  {activeCount > 0
                    ? `${activeCount} active ${activeCount === 1 ? "order" : "orders"}`
                    : "No active deliveries"}
                </Text>
                <Text style={styles.summarySubtitle}>
                  Orders you place and quests you accept are kept together here.
                </Text>
              </View>
            </MotionView>

            <View style={styles.filterRow}>
              <FilterChip
                label="Active"
                count={activeCount}
                selected={filter === "active"}
                onPress={() => setFilter("active")}
              />
              <FilterChip
                label="Past"
                selected={filter === "past"}
                onPress={() => setFilter("past")}
              />
              <FilterChip
                label="All"
                selected={filter === "all"}
                onPress={() => setFilter("all")}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <OrdersSkeleton />
          ) : isError ? (
            <EmptyState
              icon="wifi-off"
              title="Orders could not be loaded"
              copy="Check your connection and retry."
              actionLabel="Retry"
              onAction={() => void refetch()}
            />
          ) : filter === "active" ? (
            <EmptyState
              icon="check-circle"
              title="Nothing active right now"
              copy="Place an order or accept a nearby quest when you are ready."
              actionLabel="Browse canteens"
              onAction={() => router.push("/" as never)}
            />
          ) : filter === "past" ? (
            <EmptyState
              icon="clock"
              title="No past orders yet"
              copy="Completed and cancelled deliveries will appear here."
            />
          ) : (
            <EmptyState
              icon="package"
              title="No orders yet"
              copy="Your first order or accepted quest will appear here."
              actionLabel="Browse canteens"
              onAction={() => router.push("/" as never)}
            />
          )
        }
        renderItem={({ item, index }) => (
          <MotionView delay={Math.min(index * 40, 200)}>
            <OrderCard
              order={item}
              isBuyer={item.buyerId === profile?.id}
              onPress={() => router.push(`/orders/${item.id}/status` as never)}
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

function FilterChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
        {label}
      </Text>
      {count !== undefined ? (
        <View
          style={[styles.filterCount, selected && styles.filterCountSelected]}
        >
          <Text
            style={[
              styles.filterCountText,
              selected && styles.filterCountTextSelected,
            ]}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function OrdersSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((value) => (
        <View key={value} style={styles.skeletonCard}>
          <View style={styles.skeletonTop}>
            <SkeletonBlock height={42} width={42} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock height={15} width="58%" />
              <SkeletonBlock height={11} width="76%" />
            </View>
          </View>
          <SkeletonBlock height={11} width="44%" />
        </View>
      ))}
    </View>
  );
}

function OrderCard({
  order,
  isBuyer,
  onPress,
}: {
  order: Order;
  isBuyer: boolean;
  onPress: () => void;
}) {
  const total = order.foodPrice + order.deliveryFee;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open order ${shortId(order.id)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.orderIcon}>
          <Feather
            name={isBuyer ? "shopping-bag" : "navigation"}
            size={18}
            color={colors.primary}
          />
        </View>
        <View style={styles.cardCopy}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {order.canteenName}
            </Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>
                {isBuyer ? "Buyer" : "Deliverer"}
              </Text>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.locationText}>
            {order.deliveryLocationName}
          </Text>
        </View>
        <Feather name="chevron-right" size={19} color={colors.faint} />
      </View>

      <View style={styles.cardBottom}>
        <StatusBadge status={order.status} />
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Order value</Text>
          <Text style={styles.amountText}>{formatCurrency(total)}</Text>
        </View>
      </View>
      <View style={styles.metaFooter}>
        <Text style={styles.orderId}>#{shortId(order.id)}</Text>
        <Text style={styles.dateText}>
          {new Date(order.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amountBox: {
    alignItems: "flex-end",
  },
  amountLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  amountText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
    marginBottom: 12,
    padding: 14,
    ...shadow,
  },
  cardBottom: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 11,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  dateText: {
    color: colors.faint,
    fontSize: 10,
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterCount: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderRadius: radius.pill,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  filterCountSelected: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  filterCountText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
  },
  filterCountTextSelected: {
    color: colors.white,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 14,
    paddingTop: 16,
  },
  filterText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  filterTextSelected: {
    color: colors.white,
  },
  listContent: {
    paddingBottom: 108,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  locationText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  metaFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  orderId: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  rolePill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  roleText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  skeletonCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonList: {
    gap: 12,
  },
  skeletonTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    padding: 16,
    ...shadow,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  summaryIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  summarySubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
});
