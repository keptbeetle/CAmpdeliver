import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  colors,
  radius,
  shadow,
  shortId,
  statusLabels,
} from "~/components/app/theme";
import { AppButton, EmptyState, LoadingState } from "~/components/app/ui";
import { DeliveryMap } from "~/components/maps/DeliveryMap";
import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { locationService } from "~/platform/location";
import { trpc } from "~/utils/api";

interface Coordinate {
  latitude: number;
  longitude: number;
}

function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadius = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

async function fetchMobileRoute(
  start: Coordinate,
  end: Coordinate,
): Promise<{ coordinates: Coordinate[]; distance: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const fallbackDistance = getHaversineDistance(
    start.latitude,
    start.longitude,
    end.latitude,
    end.longitude,
  );

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`,
      { signal: controller.signal },
    );
    if (!response.ok)
      throw new Error(`Route request failed with ${response.status}`);

    interface OsrmResponse {
      code: string;
      routes?: {
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
    }
    const data = (await response.json()) as OsrmResponse;
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (data.code === "Ok" && coordinates?.length) {
      return {
        coordinates: coordinates.map(([longitude, latitude]) => ({
          latitude,
          longitude,
        })),
        distance: data.routes?.[0]?.distance ?? fallbackDistance,
      };
    }
  } catch (error) {
    console.warn("Road route unavailable; using direct route fallback", error);
  } finally {
    clearTimeout(timeout);
  }

  return { coordinates: [start, end], distance: fallbackDistance };
}

function usableCoordinate(point: Coordinate | null): point is Coordinate {
  return Boolean(point && (point.latitude !== 0 || point.longitude !== 0));
}

export default function OrderTrackerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [hasPermission, setHasPermission] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [otpInput, setOtpInput] = useState("");

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 3000,
  });
  const { data: activeCanteens } = useQuery(
    trpc.canteen.listActive.queryOptions(),
  );

  const order = orders?.find((candidate) => candidate.id === id);
  const isDeliverer = Boolean(order && order.delivererId === profile?.id);
  const isAssigned = Boolean(order?.delivererId);

  const { delivererLocation } = useOrderRealtime(id, {
    onOrderUpdate: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyProfile.queryKey(),
      });
    },
  });

  const updateStatusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions(),
  );
  const verifyDeliveryMutation = useMutation(
    trpc.order.verifyDelivery.mutationOptions(),
  );

  useEffect(() => {
    if (!id || !isDeliverer) return;
    let active = true;
    void locationService.requestForegroundPermission().then((granted) => {
      if (active) setHasPermission(granted);
    });
    return () => {
      active = false;
    };
  }, [id, isDeliverer]);

  const canteenCoords = useMemo<Coordinate | null>(
    () =>
      order
        ? {
            latitude: order.canteenLatitude,
            longitude: order.canteenLongitude,
          }
        : null,
    [order],
  );
  const deliveryCoords = useMemo<Coordinate | null>(
    () =>
      order
        ? {
            latitude: order.deliveryLatitude,
            longitude: order.deliveryLongitude,
          }
        : null,
    [order],
  );

  const storedDeliverer =
    typeof order?.delivererLatitude === "number" &&
    typeof order.delivererLongitude === "number" &&
    (order.delivererLatitude !== 0 || order.delivererLongitude !== 0)
      ? {
          latitude: order.delivererLatitude,
          longitude: order.delivererLongitude,
        }
      : null;
  const startLoc = delivererLocation ?? storedDeliverer ?? canteenCoords;
  const endLoc = deliveryCoords;
  const startLatitude = startLoc?.latitude;
  const startLongitude = startLoc?.longitude;
  const endLatitude = endLoc?.latitude;
  const endLongitude = endLoc?.longitude;

  useEffect(() => {
    if (
      startLatitude === undefined ||
      startLongitude === undefined ||
      endLatitude === undefined ||
      endLongitude === undefined ||
      (startLatitude === 0 && startLongitude === 0) ||
      (endLatitude === 0 && endLongitude === 0)
    ) {
      return;
    }

    let active = true;
    void Promise.resolve().then(() => {
      if (active) setRouteLoading(true);
    });
    void fetchMobileRoute(
      { latitude: startLatitude, longitude: startLongitude },
      { latitude: endLatitude, longitude: endLongitude },
    ).then((result) => {
      if (!active) return;
      setRouteCoordinates(result.coordinates);
      setDistance(result.distance);
      setRouteLoading(false);
    });
    return () => {
      active = false;
    };
  }, [startLatitude, startLongitude, endLatitude, endLongitude]);

  const updateStatus = async (status: "ON_THE_WAY" | "NEAR_YOU") => {
    if (!order || updateStatusMutation.isPending) return;
    try {
      await updateStatusMutation.mutateAsync({ orderId: order.id, status });
      await queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      });
    } catch (error) {
      Alert.alert(
        "Status not updated",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const verifyDelivery = async () => {
    if (!order || otpInput.length !== 4 || verifyDeliveryMutation.isPending)
      return;
    try {
      await verifyDeliveryMutation.mutateAsync({
        orderId: order.id,
        otp: otpInput,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        }),
      ]);
    } catch (error) {
      Alert.alert(
        "OTP verification failed",
        error instanceof Error
          ? error.message
          : "Check the code and try again.",
      );
    }
  };

  const openNavigation = async () => {
    if (!usableCoordinate(deliveryCoords)) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${deliveryCoords.latitude},${deliveryCoords.longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Navigation unavailable",
        "A maps app or browser could not be opened.",
      );
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <LoadingState
            title="Opening live map"
            copy="Loading the latest route and delivery state."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !order || !canteenCoords || !deliveryCoords) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <EmptyState
            icon="map"
            title={
              isError
                ? "Map data could not be loaded"
                : "Tracking is unavailable"
            }
            copy={
              isError
                ? "Check your connection and try again."
                : "This order does not have the location data required for tracking."
            }
            actionLabel={isError ? "Retry" : "Back to order"}
            onAction={() =>
              isError
                ? void refetch()
                : router.replace(`/orders/${id}/status` as never)
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  if (["DELIVERED", "COMPLETED"].includes(order.status)) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.completedWrap}>
          <View style={styles.completedIcon}>
            <Feather name="check" size={30} color={colors.success} />
          </View>
          <Text testID="order-status" style={styles.completedStatus}>
            {order.status}
          </Text>
          <Text style={styles.completedTitle}>Delivery completed</Text>
          <Text style={styles.completedCopy}>
            The handover was verified and live tracking has ended for this
            order.
          </Text>
          <AppButton
            label="View Order Summary"
            icon="file-text"
            onPress={() =>
              router.replace(`/orders/${order.id}/status` as never)
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  const sheetBottom = Math.max(12, insets.bottom + 8);
  const showBuyerOtp =
    !isDeliverer &&
    Boolean(order.otp) &&
    ["PREPARING", "ON_THE_WAY", "NEAR_YOU"].includes(order.status);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Live tracking</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {order.canteenName} · #{shortId(order.id)}
          </Text>
        </View>
        {isDeliverer && usableCoordinate(deliveryCoords) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open turn by turn navigation"
            onPress={() => void openNavigation()}
            style={({ pressed }) => [
              styles.navigationButton,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="navigation" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.mapWrap}>
        <DeliveryMap
          canteen={{ ...canteenCoords, name: order.canteenName }}
          otherCanteens={(activeCanteens ?? [])
            .filter((canteen) => canteen.id !== order.canteenId)
            .map((canteen) => ({
              id: canteen.id,
              name: canteen.name,
              latitude: canteen.latitude,
              longitude: canteen.longitude,
            }))}
          delivery={{ ...deliveryCoords, name: order.deliveryLocationName }}
          deliverer={usableCoordinate(startLoc) ? startLoc : null}
          route={routeCoordinates}
          showUserLocation={hasPermission && isDeliverer}
        />
        {routeLoading ? (
          <View style={styles.routeLoadingPill}>
            <Feather name="loader" size={13} color={colors.primary} />
            <Text style={styles.routeLoadingText}>Updating route…</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.sheet, { bottom: sheetBottom }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.statusRow}>
          <View style={styles.statusCopyWrap}>
            <Text style={styles.statusEyebrow}>ORDER STATUS</Text>
            <Text testID="order-status" style={styles.statusTitle}>
              {order.status}
            </Text>
            <Text style={styles.statusHuman}>
              {statusLabels[order.status] ?? order.status}
            </Text>
          </View>
          {distance !== null ? (
            <View style={styles.distancePill}>
              <Feather name="navigation" size={13} color={colors.primary} />
              <Text testID="tracking-distance" style={styles.distanceText}>
                {formatDistance(distance)} away
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sheetActions}>
          {isAssigned ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/order/${id}/chat` as never)}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="message-square" size={15} color={colors.primary} />
              <Text style={styles.secondaryActionText}>Chat</Text>
            </Pressable>
          ) : null}
          {isDeliverer ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openNavigation()}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="navigation" size={15} color={colors.primary} />
              <Text style={styles.secondaryActionText}>Open navigation</Text>
            </Pressable>
          ) : null}
        </View>

        {showBuyerOtp ? (
          <View style={styles.otpPanel}>
            <View>
              <Text style={styles.otpEyebrow}>HANDOVER OTP</Text>
              <Text testID="delivery-otp" style={styles.otpValue}>
                {order.otp}
              </Text>
            </View>
            <Text style={styles.otpHelp}>
              Share only when the food reaches you.
            </Text>
          </View>
        ) : null}

        {isDeliverer ? (
          <View style={styles.actionArea}>
            {order.status === "ACCEPTED" ? (
              <AppButton
                label="Open Pickup Decision"
                icon="shopping-bag"
                onPress={() =>
                  router.push(`/orders/${order.id}/status` as never)
                }
              />
            ) : null}
            {order.status === "PREPARING" ? (
              <AppButton
                label="Mark On The Way"
                icon="navigation"
                loading={updateStatusMutation.isPending}
                onPress={() => void updateStatus("ON_THE_WAY")}
              />
            ) : null}
            {order.status === "ON_THE_WAY" ? (
              <AppButton
                label="Mark Near You"
                icon="map-pin"
                loading={updateStatusMutation.isPending}
                onPress={() => void updateStatus("NEAR_YOU")}
              />
            ) : null}
            {order.status === "NEAR_YOU" ? (
              <View style={styles.verifyRow}>
                <TextInput
                  accessibilityLabel="Delivery OTP"
                  value={otpInput}
                  onChangeText={(value) =>
                    setOtpInput(value.replace(/\D/g, "").slice(0, 4))
                  }
                  keyboardType="number-pad"
                  placeholder="0000"
                  placeholderTextColor={colors.faint}
                  maxLength={4}
                  style={styles.otpInput}
                />
                <View style={styles.verifyButtonWrap}>
                  <AppButton
                    label="Verify"
                    loading={verifyDeliveryMutation.isPending}
                    disabled={otpInput.length !== 4}
                    onPress={() => void verifyDelivery()}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : !isAssigned ? (
          <View style={styles.waitingPanel}>
            <Feather name="radio" size={15} color={colors.primary} />
            <Text style={styles.waitingText}>
              Waiting for a nearby deliverer to accept this order.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    marginTop: 10,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  completedCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 6,
    maxWidth: 320,
    textAlign: "center",
  },
  completedIcon: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderColor: "#B7DEC8",
    borderRadius: 28,
    borderWidth: 1,
    height: 70,
    justifyContent: "center",
    width: 70,
  },
  completedStatus: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 14,
  },
  completedTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  completedWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 26,
  },
  distancePill: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  distanceText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: "900",
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.bg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  headerCopy: {
    flex: 1,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  mapWrap: {
    flex: 1,
    position: "relative",
  },
  navigationButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  otpEyebrow: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  otpHelp: {
    color: colors.muted,
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "right",
  },
  otpInput: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 6,
    minHeight: 50,
    paddingHorizontal: 12,
    textAlign: "center",
  },
  otpPanel: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    padding: 11,
  },
  otpValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 5,
    marginLeft: 5,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  routeLoadingPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute",
    top: 14,
    ...shadow,
  },
  routeLoadingText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: "800",
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10,
  },
  secondaryActionText: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  sheet: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    left: 14,
    padding: 14,
    position: "absolute",
    right: 14,
    ...shadow,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: 10,
    width: 36,
  },
  statusCopyWrap: {
    flex: 1,
  },
  statusEyebrow: {
    color: colors.faint,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  statusHuman: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  verifyButtonWrap: {
    minWidth: 104,
  },
  verifyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  waitingPanel: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 10,
  },
  waitingText: {
    color: colors.primaryStrong,
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
  },
});
