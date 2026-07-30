import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { ActiveOrderBar } from "~/components/app/ActiveOrderBar";
import { ShellHeader } from "~/components/app/ShellHeader";
import {
  colors,
  formatCurrency,
  shortId,
  statusLabels,
} from "~/components/app/theme";
import { trpc } from "~/utils/api";

type Order = RouterOutputs["order"]["myOrders"][number];

export default function OrdersTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 5000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: trpc.order.myOrders.queryKey(),
    });
    setRefreshing(false);
  }, [queryClient]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader
        title="My Orders"
        subtitle="Track current and past deliveries"
      />
      <FlatList
        data={orders ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.purple}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <>
                <ActivityIndicator color={colors.purple} />
                <Text style={styles.emptyTitle}>Loading orders</Text>
              </>
            ) : (
              <>
                <Feather name="shopping-bag" size={34} color={colors.faint} />
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptyCopy}>
                  Orders you place or accept will appear here.
                </Text>
                <Pressable
                  onPress={() => router.push("/" as never)}
                  style={styles.homeButton}
                >
                  <Text style={styles.homeText}>Order Food</Text>
                </Pressable>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            isBuyer={item.buyerId === profile?.id}
            onPress={() => router.push(`/orders/${item.id}/status` as never)}
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
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.orderIcon}>
          <Feather name="package" size={18} color="#c4b5fd" />
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
          <Text numberOfLines={1} style={styles.locationText}>
            To: {order.deliveryLocationName}
          </Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.amountText}>{formatCurrency(total)}</Text>
          <Text style={styles.statusPill}>
            {statusLabels[order.status] ?? order.status}
          </Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.dateRow}>
          <Feather name="clock" size={13} color={colors.faint} />
          <Text style={styles.dateText}>
            {new Date(order.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.viewRow}>
          <Text style={styles.viewText}>View Details</Text>
          <Feather name="chevron-right" size={15} color="#c4b5fd" />
        </View>
      </View>
      <Text style={styles.orderId}>#{shortId(order.id)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amountBox: {
    alignItems: "flex-end",
    maxWidth: 112,
  },
  amountText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginBottom: 14,
    padding: 14,
  },
  cardBottom: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
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
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 11,
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  dateText: {
    color: colors.faint,
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 220,
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
  homeButton: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  homeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  locationText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 5,
  },
  orderIcon: {
    alignItems: "center",
    backgroundColor: colors.purpleDark,
    borderColor: "#6d28d9",
    borderRadius: 15,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  orderId: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  rolePill: {
    backgroundColor: "#22163b",
    borderColor: "#4a2a78",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  roleText: {
    color: "#ddd6fe",
    fontSize: 10,
    fontWeight: "900",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  statusPill: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: "#c4b5fd",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center",
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  viewRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  viewText: {
    color: "#c4b5fd",
    fontSize: 12,
    fontWeight: "900",
  },
});
