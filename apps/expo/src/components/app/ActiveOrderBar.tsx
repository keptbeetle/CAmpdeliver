import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import {
  ACTIVE_ORDER_STATUSES,
  colors,
  shortId,
  statusLabels,
  statusProgress,
} from "./theme";

let globalIsHidden = false;
const listeners = new Set<() => void>();

function setGlobalIsHidden(val: boolean) {
  globalIsHidden = val;
  listeners.forEach((l) => l());
}

function useGlobalIsHidden() {
  const [hidden, setHidden] = useState(globalIsHidden);
  useEffect(() => {
    const listener = () => setHidden(globalIsHidden);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return [hidden, setGlobalIsHidden] as const;
}

export function ActiveOrderBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isHidden, setIsHidden] = useGlobalIsHidden();

  useFocusEffect(
    useCallback(() => {
      if (pathname === "/") {
        setGlobalIsHidden(false);
      }
    }, [pathname]),
  );

  const { data: orders } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 5000,
  });

  const activeOrder = orders?.find((order) =>
    ACTIVE_ORDER_STATUSES.includes(order.status),
  );

  if (!activeOrder || isHidden) return null;

  const progress = statusProgress[activeOrder.status] ?? 25;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push(`/orders/${activeOrder.id}/status` as never)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <Pressable
          onPress={() => setIsHidden(true)}
          style={styles.closeBtn}
          hitSlop={10}
        >
          <Feather name="x" size={14} color="#ddd6fe" />
        </Pressable>

        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Feather name="navigation" size={18} color="#ddd6fe" />
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>
              Order #{shortId(activeOrder.id)}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {activeOrder.canteenName} -{" "}
              {statusLabels[activeOrder.status] ?? activeOrder.status}
            </Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Track</Text>
            <Feather name="chevron-right" size={14} color="#ddd6fe" />
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(24,24,27,0.98)",
    borderColor: "#6d28d9",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  closeBtn: {
    position: "absolute",
    right: -8,
    top: -8,
    zIndex: 10,
    backgroundColor: "#3f3f46",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#52525b",
    height: 24,
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.purpleDark,
    borderRadius: 13,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  progressFill: {
    backgroundColor: colors.purple,
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 5,
    marginTop: 10,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: "#31204f",
    borderRadius: 999,
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusText: {
    color: "#ddd6fe",
    fontSize: 11,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  wrap: {
    bottom: 82,
    left: 14,
    position: "absolute",
    right: 14,
    zIndex: 20,
  },
});
