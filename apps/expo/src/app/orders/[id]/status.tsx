import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
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

import type { RouterOutputs } from "~/utils/api";
import {
  colors,
  formatCurrency,
  radius,
  shadow,
  shortId,
  statusLabels,
  statusTone,
} from "~/components/app/theme";
import {
  AppButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  MotionView,
} from "~/components/app/ui";
import { trpc } from "~/utils/api";

type Order = RouterOutputs["order"]["myOrders"][number];
type OrderMutation =
  | "confirm"
  | "reject"
  | "onTheWay"
  | "nearYou"
  | "verify"
  | null;

const steps = [
  { key: "BROADCASTED", label: "Placed", icon: "radio" },
  { key: "ACCEPTED", label: "Accepted", icon: "user-check" },
  { key: "PREPARING", label: "Pickup", icon: "shopping-bag" },
  { key: "ON_THE_WAY", label: "On route", icon: "navigation" },
  { key: "DELIVERED", label: "Delivered", icon: "check-circle" },
] as const;

function getStepIndex(status: string) {
  switch (status) {
    case "BROADCASTED":
      return 0;
    case "ACCEPTED":
      return 1;
    case "PREPARING":
      return 2;
    case "ON_THE_WAY":
    case "NEAR_YOU":
      return 3;
    case "DELIVERED":
    case "COMPLETED":
      return 4;
    default:
      return 0;
  }
}

export default function OrderStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [otpInput, setOtpInput] = useState("");
  const [activeMutation, setActiveMutation] = useState<OrderMutation>(null);

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

  const order = useMemo(
    () => orders?.find((candidate) => candidate.id === id),
    [orders, id],
  );

  const confirmAvailabilityMutation = useMutation(
    trpc.order.confirmAvailability.mutationOptions(),
  );
  const rejectOrderMutation = useMutation(
    trpc.order.rejectOrder.mutationOptions(),
  );
  const updateStatusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions(),
  );
  const verifyDeliveryMutation = useMutation(
    trpc.order.verifyDelivery.mutationOptions(),
  );

  const refreshOrder = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.order.myOrders.queryKey(),
    });
  };

  const runAction = async (
    action: Exclude<OrderMutation, null>,
    operation: () => Promise<unknown>,
    errorTitle: string,
  ) => {
    if (activeMutation) return;
    setActiveMutation(action);
    try {
      await operation();
      await refreshOrder();
    } catch (error) {
      Alert.alert(
        errorTitle,
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setActiveMutation(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <LoadingState
            title="Loading order"
            copy="Syncing the latest delivery state."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <EmptyState
            icon="wifi-off"
            title="Order could not be refreshed"
            copy="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <EmptyState
            icon="package"
            title="Order not found"
            copy="This order is not available in your recent buyer or deliverer history."
            actionLabel="Back to orders"
            onAction={() => router.replace("/history_tab" as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isDeliverer = order.delivererId === profile?.id;
  const isBuyer = order.buyerId === profile?.id;
  const isAssigned = Boolean(order.delivererId);
  const isTerminal = ["DELIVERED", "COMPLETED", "CANCELLED"].includes(
    order.status,
  );
  const currentStep = getStepIndex(order.status);
  const tone = statusTone(order.status);

  const confirmAvailability = () =>
    void runAction(
      "confirm",
      () => confirmAvailabilityMutation.mutateAsync({ orderId: order.id }),
      "Could not confirm availability",
    );

  const confirmReject = () => {
    Alert.alert(
      "Cannot fulfil this quest?",
      "Rejecting after acceptance cancels this order in the current product flow. Use this only if you cannot complete the pickup.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Reject order",
          onPress: () =>
            void runAction(
              "reject",
              () => rejectOrderMutation.mutateAsync({ orderId: order.id }),
              "Could not reject order",
            ),
        },
      ],
    );
  };

  const markOnTheWay = () =>
    void runAction(
      "onTheWay",
      () =>
        updateStatusMutation.mutateAsync({
          orderId: order.id,
          status: "ON_THE_WAY",
        }),
      "Could not start delivery",
    );

  const markNearYou = () =>
    void runAction(
      "nearYou",
      () =>
        updateStatusMutation.mutateAsync({
          orderId: order.id,
          status: "NEAR_YOU",
        }),
      "Could not update arrival",
    );

  const verifyOtp = () =>
    void runAction(
      "verify",
      () =>
        verifyDeliveryMutation.mutateAsync({
          orderId: order.id,
          otp: otpInput,
        }),
      "OTP verification failed",
    );

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
          <Text style={styles.headerTitle}>Order #{shortId(order.id)}</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {order.canteenName}
          </Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>
            {isDeliverer ? "Deliverer" : "Buyer"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(30, insets.bottom + 20) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <MotionView style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: tone.backgroundColor,
                  borderColor: tone.borderColor,
                },
              ]}
            >
              <View
                style={[styles.statusDot, { backgroundColor: tone.color }]}
              />
              <Text style={[styles.statusLabel, { color: tone.color }]}>
                {statusLabels[order.status] ?? order.status}
              </Text>
            </View>
            <Text testID="order-status" style={styles.rawStatus}>
              {order.status}
            </Text>
          </View>
          <Text style={styles.statusTitle}>
            {statusHeadline(order, isDeliverer)}
          </Text>
          <Text style={styles.statusCopy}>
            {statusCopy(order, isDeliverer)}
          </Text>

          {order.status !== "CANCELLED" ? (
            <View style={styles.timeline}>
              {steps.map((step, index) => {
                const done = currentStep > index;
                const current = currentStep === index;
                return (
                  <View key={step.key} style={styles.step}>
                    <View
                      style={[
                        styles.stepNode,
                        (done || current) && styles.stepNodeActive,
                      ]}
                    >
                      <Feather
                        name={step.icon}
                        size={14}
                        color={done || current ? colors.white : colors.faint}
                      />
                    </View>
                    {index < steps.length - 1 ? (
                      <View
                        style={[styles.stepLine, done && styles.stepLineActive]}
                      />
                    ) : null}
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.stepLabel,
                        (done || current) && styles.stepLabelActive,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <InlineNotice
              tone="warning"
              icon="slash"
              title="This order is cancelled"
              copy="No further delivery actions are available for this order."
            />
          )}
        </MotionView>

        {!isTerminal ? (
          <MotionView style={styles.shortcutCard}>
            <Text style={styles.sectionEyebrow}>LIVE TOOLS</Text>
            <View style={styles.shortcutGrid}>
              <ShortcutButton
                icon="map"
                title={isAssigned ? "Live map" : "Delivery map"}
                copy={
                  isAssigned
                    ? "Route and rider position"
                    : "Pickup and drop-off points"
                }
                onPress={() =>
                  router.push(`/order/${order.id}/tracker` as never)
                }
              />
              <ShortcutButton
                icon="message-square"
                title="Order chat"
                copy={
                  isAssigned
                    ? "Message your counterpart"
                    : "Available after a rider accepts"
                }
                disabled={!isAssigned}
                onPress={() => router.push(`/order/${order.id}/chat` as never)}
              />
            </View>
          </MotionView>
        ) : null}

        {isBuyer &&
        order.otp &&
        ["PREPARING", "ON_THE_WAY", "NEAR_YOU"].includes(order.status) ? (
          <MotionView style={styles.otpCard}>
            <View style={styles.otpIcon}>
              <Feather name="key" size={19} color={colors.primary} />
            </View>
            <Text style={styles.otpEyebrow}>HANDOVER CODE</Text>
            <Text testID="delivery-otp" style={styles.otpValue}>
              {order.otp}
            </Text>
            <Text style={styles.otpCopy}>
              Share this 4-digit code only when the food is physically handed to
              you.
            </Text>
          </MotionView>
        ) : null}

        {isDeliverer && !isTerminal ? (
          <DelivererActions
            order={order}
            otpInput={otpInput}
            setOtpInput={setOtpInput}
            activeMutation={activeMutation}
            confirmAvailability={confirmAvailability}
            rejectOrder={confirmReject}
            markOnTheWay={markOnTheWay}
            markNearYou={markNearYou}
            verifyOtp={verifyOtp}
          />
        ) : null}

        <MotionView style={styles.summaryCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionIcon}>
              <Feather name="file-text" size={16} color={colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Order details</Text>
          </View>
          <SummaryLine label="Canteen" value={order.canteenName} />
          <SummaryLine label="Drop-off" value={order.deliveryLocationName} />
          <SummaryLine label="Food" value={formatCurrency(order.foodPrice)} />
          <SummaryLine
            label="Delivery"
            value={formatCurrency(order.deliveryFee)}
          />
          <View style={styles.summaryDivider} />
          <SummaryLine
            label="Total"
            value={formatCurrency(order.foodPrice + order.deliveryFee)}
            strong
          />
        </MotionView>
      </ScrollView>
    </SafeAreaView>
  );
}

function DelivererActions({
  order,
  otpInput,
  setOtpInput,
  activeMutation,
  confirmAvailability,
  rejectOrder,
  markOnTheWay,
  markNearYou,
  verifyOtp,
}: {
  order: Order;
  otpInput: string;
  setOtpInput: (value: string) => void;
  activeMutation: OrderMutation;
  confirmAvailability: () => void;
  rejectOrder: () => void;
  markOnTheWay: () => void;
  markNearYou: () => void;
  verifyOtp: () => void;
}) {
  const busy = activeMutation !== null;

  return (
    <MotionView style={styles.actionCard}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Feather name="navigation" size={16} color={colors.primary} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionEyebrow}>YOUR NEXT ACTION</Text>
          <Text style={styles.sectionTitle}>Deliverer controls</Text>
        </View>
      </View>

      {order.status === "ACCEPTED" ? (
        <>
          <InlineNotice
            icon="shopping-bag"
            title="Check the canteen before committing the buyer's wallet"
            copy="Confirm only after you know the ordered items can be fulfilled. If you cannot complete this quest, reject it here instead of forcing the flow forward."
          />
          <AppButton
            label="Confirm Item Availability"
            icon="check"
            loading={activeMutation === "confirm"}
            disabled={busy && activeMutation !== "confirm"}
            onPress={confirmAvailability}
          />
          <AppButton
            label="Can't Fulfil — Reject Order"
            icon="x"
            tone="warning"
            loading={activeMutation === "reject"}
            disabled={busy && activeMutation !== "reject"}
            onPress={rejectOrder}
          />
        </>
      ) : null}

      {order.status === "PREPARING" ? (
        <>
          <InlineNotice
            tone="success"
            icon="check-circle"
            title="Availability confirmed"
            copy="Pick up the food, then start the live delivery route."
          />
          <AppButton
            label="Mark On The Way"
            icon="navigation"
            loading={activeMutation === "onTheWay"}
            disabled={busy && activeMutation !== "onTheWay"}
            onPress={markOnTheWay}
          />
        </>
      ) : null}

      {order.status === "ON_THE_WAY" ? (
        <>
          <InlineNotice
            icon="map-pin"
            title="Deliver to the fixed drop-off point"
            copy="Use the live map for navigation. Mark Near You only after you reach the buyer's meeting area."
          />
          <AppButton
            label="Mark Near You"
            icon="map-pin"
            loading={activeMutation === "nearYou"}
            disabled={busy && activeMutation !== "nearYou"}
            onPress={markNearYou}
          />
        </>
      ) : null}

      {order.status === "NEAR_YOU" ? (
        <>
          <InlineNotice
            tone="success"
            icon="key"
            title="Verify at handover"
            copy="Ask the buyer for their 4-digit code only when you are handing over the order."
          />
          <View style={styles.otpInputRow}>
            <TextInput
              value={otpInput}
              onChangeText={(value) =>
                setOtpInput(value.replace(/\D/g, "").slice(0, 4))
              }
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel="Delivery OTP"
              placeholder="0000"
              placeholderTextColor={colors.faint}
              style={styles.otpInput}
            />
            <View style={styles.verifyAction}>
              <AppButton
                label="Verify"
                loading={activeMutation === "verify"}
                disabled={
                  otpInput.length !== 4 || (busy && activeMutation !== "verify")
                }
                onPress={verifyOtp}
              />
            </View>
          </View>
        </>
      ) : null}

      {order.status === "BROADCASTED" ? (
        <InlineNotice
          icon="radio"
          title="Waiting for assignment"
          copy="This order has not been assigned to you yet."
        />
      ) : null}
    </MotionView>
  );
}

function ShortcutButton({
  icon,
  title,
  copy,
  disabled = false,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  copy: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcut,
        disabled && styles.shortcutDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.shortcutIcon}>
        <Feather
          name={icon}
          size={18}
          color={disabled ? colors.faint : colors.primary}
        />
      </View>
      <Text style={styles.shortcutTitle}>{title}</Text>
      <Text style={styles.shortcutCopy}>{copy}</Text>
      <Feather
        name="arrow-up-right"
        size={16}
        color={disabled ? colors.faint : colors.primary}
      />
    </Pressable>
  );
}

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.summaryValue, strong && styles.summaryStrong]}
      >
        {value}
      </Text>
    </View>
  );
}

function statusHeadline(order: Order, isDeliverer: boolean) {
  switch (order.status) {
    case "BROADCASTED":
      return "Finding a nearby deliverer";
    case "ACCEPTED":
      return isDeliverer
        ? "Quest accepted — check the pickup"
        : "A deliverer accepted your order";
    case "PREPARING":
      return isDeliverer
        ? "Items confirmed — collect the order"
        : "Your pickup is being prepared";
    case "ON_THE_WAY":
      return isDeliverer ? "Deliver to the buyer" : "Your order is on the way";
    case "NEAR_YOU":
      return isDeliverer
        ? "Meet the buyer and verify OTP"
        : "Your deliverer is nearby";
    case "DELIVERED":
    case "COMPLETED":
      return "Delivery completed";
    case "CANCELLED":
      return "Order cancelled";
    default:
      return statusLabels[order.status] ?? order.status;
  }
}

function statusCopy(order: Order, isDeliverer: boolean) {
  switch (order.status) {
    case "BROADCASTED":
      return "The order is visible to eligible deliverers near the canteen.";
    case "ACCEPTED":
      return isDeliverer
        ? "Verify that the ordered items are available before confirming the pickup."
        : "The deliverer is checking item availability before your wallet is held.";
    case "PREPARING":
      return isDeliverer
        ? "Collect the confirmed items and mark On The Way when you leave the canteen."
        : "Keep the handover OTP private until the deliverer reaches you.";
    case "ON_THE_WAY":
      return "Live tracking and order chat are available while the delivery is active.";
    case "NEAR_YOU":
      return "Complete the handover in person using the buyer's 4-digit OTP.";
    case "DELIVERED":
    case "COMPLETED":
      return "The handover was verified and no further action is required.";
    case "CANCELLED":
      return "This delivery flow has ended and cannot be advanced further.";
    default:
      return "The order is syncing with the latest delivery state.";
  }
}

const styles = StyleSheet.create({
  actionCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    ...shadow,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  content: {
    gap: 14,
    padding: 18,
  },
  header: {
    alignItems: "center",
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
  otpCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    ...shadow,
  },
  otpCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    maxWidth: 300,
    textAlign: "center",
  },
  otpEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginTop: 10,
  },
  otpIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  otpInput: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 7,
    minHeight: 52,
    paddingHorizontal: 14,
    textAlign: "center",
  },
  otpInputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  otpValue: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 9,
    marginLeft: 9,
    marginTop: 3,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  rawStatus: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  rolePill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  roleText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 2,
  },
  sectionHeadingCopy: {
    flex: 1,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  shortcut: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 142,
    padding: 12,
  },
  shortcutCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    ...shadow,
  },
  shortcutCopy: {
    color: colors.muted,
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  shortcutDisabled: {
    opacity: 0.5,
  },
  shortcutGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  shortcutIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    marginBottom: 8,
    width: 34,
  },
  shortcutTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusCard: {
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    ...shadow,
  },
  statusCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  statusDot: {
    borderRadius: radius.pill,
    height: 7,
    width: 7,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: "900",
  },
  statusTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 16,
  },
  statusTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  step: {
    alignItems: "center",
    flex: 1,
    minHeight: 74,
    position: "relative",
  },
  stepLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 7,
    textAlign: "center",
  },
  stepLabelActive: {
    color: colors.primaryStrong,
  },
  stepLine: {
    backgroundColor: colors.border,
    height: 2,
    left: "58%",
    position: "absolute",
    right: "-42%",
    top: 17,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
  },
  stepNode: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
    zIndex: 2,
  },
  stepNodeActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    ...shadow,
  },
  summaryDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 7,
  },
  summaryLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  summaryStrong: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  summaryValue: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  timeline: {
    flexDirection: "row",
    marginTop: 22,
  },
  verifyAction: {
    minWidth: 104,
  },
});
