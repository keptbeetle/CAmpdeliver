import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";
import { ActiveOrderBar } from "~/app/_components/ActiveOrderBar";
import { ShellHeader } from "~/app/_components/ShellHeader";
import { colors } from "~/app/_components/theme";

type Canteen = RouterOutputs["canteen"]["listActive"][number];

const banners = [
  {
    id: "fast",
    title: "Campus Express",
    subtitle: "Hot food routed from canteen to hostel fast.",
    badge: "Fastest",
    colors: ["#4c1d95", "#312e81"],
  },
  {
    id: "quest",
    title: "Earn on Quests",
    subtitle: "Pick up peer orders near your route.",
    badge: "Side Quest",
    colors: ["#064e3b", "#134e4a"],
  },
  {
    id: "night",
    title: "Late Night Fuel",
    subtitle: "Track open campus canteens in one feed.",
    badge: "Night",
    colors: ["#7c2d12", "#3f1d0b"],
  },
];

const fallbackThumbnails = [
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
];

export default function HomeTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const { data: canteens, isLoading } = useQuery(
    trpc.canteen.listActive.queryOptions(),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.canteen.listActive.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.auth.getMyProfile.queryKey() }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const data = useMemo(() => canteens ?? [], [canteens]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader subtitle="Canteens, quests, and live orders" />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.purple}
          />
        }
        ListHeaderComponent={
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bannerRow}
            >
              {banners.map((banner) => (
                <View
                  key={banner.id}
                  style={[
                    styles.banner,
                    { backgroundColor: banner.colors[0], borderColor: banner.colors[1] },
                  ]}
                >
                  <View style={styles.bannerTop}>
                    <Text style={styles.bannerBadge}>{banner.badge}</Text>
                    <Feather name="zap" size={16} color="#fef3c7" />
                  </View>
                  <Text style={styles.bannerTitle}>{banner.title}</Text>
                  <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Campus Canteens</Text>
                <Text style={styles.sectionSubtitle}>
                  Tap a canteen to explore the menu
                </Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countText}>{data.length} Active</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <>
                <ActivityIndicator color={colors.purple} />
                <Text style={styles.emptyTitle}>Loading canteens</Text>
              </>
            ) : (
              <>
                <Feather name="coffee" size={34} color={colors.faint} />
                <Text style={styles.emptyTitle}>No active canteens</Text>
                <Text style={styles.emptyCopy}>
                  Canteens will appear here once an admin activates them.
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <CanteenCard
            canteen={item}
            imageUrl={
              fallbackThumbnails[index % fallbackThumbnails.length] ??
              "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80"
            }
            onPress={() => router.push(`/canteen/${item.id}` as never)}
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

function CanteenCard({
  canteen,
  imageUrl,
  onPress,
}: {
  canteen: Canteen;
  imageUrl: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.thumbnailWrap}>
        <Image source={{ uri: imageUrl }} style={styles.thumbnail} resizeMode="cover" />
        <View style={styles.imageShade} />
        <View style={styles.openPill}>
          <View style={styles.openDot} />
          <Text style={styles.openText}>Open Now</Text>
        </View>
        <View style={styles.timePill}>
          <Feather name="clock" size={13} color="#ddd6fe" />
          <Text style={styles.timeText}>15-20 mins</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.canteenIcon}>
          <Feather name="coffee" size={20} color="#c4b5fd" />
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={styles.cardTitle}>{canteen.name}</Text>
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={13} color={colors.faint} />
            <Text numberOfLines={1} style={styles.metaText}>Campus landmark area</Text>
            <Text style={styles.metaDot}>.</Text>
            <Text style={styles.deliveryText}>INR 5 delivery</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "space-between",
    minHeight: 132,
    padding: 16,
    width: 270,
  },
  bannerBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    borderWidth: 1,
    color: colors.text,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    textTransform: "uppercase",
  },
  bannerRow: {
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  bannerSubtitle: {
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    maxWidth: 210,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 22,
  },
  bannerTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  canteenIcon: {
    alignItems: "center",
    backgroundColor: colors.purpleDark,
    borderColor: "#6d28d9",
    borderRadius: 15,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardBody: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    padding: 14,
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
    backgroundColor: "#22163b",
    borderColor: "#4a2a78",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countText: {
    color: "#ddd6fe",
    fontSize: 12,
    fontWeight: "900",
  },
  deliveryText: {
    color: "#c4b5fd",
    fontSize: 12,
    fontWeight: "800",
  },
  empty: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 16,
    minHeight: 180,
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
  },
  imageShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  listContent: {
    paddingHorizontal: 18,
  },
  metaDot: {
    color: colors.faint,
    fontSize: 12,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 5,
  },
  metaText: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 12,
  },
  openDot: {
    backgroundColor: colors.emerald,
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  openPill: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderColor: "rgba(16,185,129,0.5)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: "absolute",
    right: 12,
    top: 12,
  },
  openText: {
    color: "#86efac",
    fontSize: 11,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 14,
    paddingTop: 22,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
  },
  thumbnail: {
    height: "100%",
    width: "100%",
  },
  thumbnailWrap: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.panelStrong,
    position: "relative",
    width: "100%",
  },
  timePill: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    borderWidth: 1,
    bottom: 12,
    flexDirection: "row",
    gap: 6,
    left: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: "absolute",
  },
  timeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
