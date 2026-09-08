import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import {
  ACTIVE_ORDER_STATUSES,
  colors,
  radius,
  shadow,
  shortId,
  statusLabels,
  statusProgress,
} from "./theme";

let globalIsHidden = false;
const listeners = new Set<() => void>();

function setGlobalIsHidden(value: boolean) {
  globalIsHidden = value;
  listeners.forEach((listener) => listener());
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
      if (pathname === "/") setGlobalIsHidden(false);
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

  const progress = statusProgress[activeOrder.status] ?? 20;

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open active order ${shortId(activeOrder.id)}`}
        onPress={() => router.push(`/orders/${activeOrder.id}/status` as never)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Feather name="navigation" size={18} color={colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.eyebrow}>
              ACTIVE ORDER · #{shortId(activeOrder.id)}
            </Text>
            <Text numberOfLines={1} style={styles.title}>
              {statusLabels[activeOrder.status] ?? activeOrder.status}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {activeOrder.canteenName}
            </Text>
          </View>
          <View style={styles.trackAction}>
            <Text style={styles.trackText}>Open</Text>
            <Feather name="chevron-right" size={15} color={colors.primary} />
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Pressable
          accessibilityLabel="Hide active order shortcut"
          onPress={(event) => {
            event.stopPropagation();
            setIsHidden(true);
          }}
          style={styles.closeBtn}
          hitSlop={10}
        >
          <Feather name="x" size={14} color={colors.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: "#B7D7D5",
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 13,
    ...shadow,
  },
  closeBtn: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: -10,
    width: 26,
  },
  copy: {
    flex: 1,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: colors.panelStrong,
    borderRadius: radius.pill,
    height: 4,
    marginTop: 11,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  trackAction: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 2,
    marginRight: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  trackText: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  wrap: {
    bottom: 12,
    left: 14,
    position: "absolute",
    right: 14,
    zIndex: 20,
  },
});
