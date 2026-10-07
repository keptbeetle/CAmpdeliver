import { useMemo, useState } from "react";
import {
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
import { confirmAppAction, showAppAlert } from "~/utils/dialog";

type Order = RouterOutputs["order"]["myOrders"][number];

type ActionKey =
  | "cancelBuyer"
  | "availability"
  | "cancelDeliverer"
  | "purchase"
  | "onTheWay"
  | "nearYou"
  | "verify"
  | "confirmPaymentReceived"
  | "reportIssue"
  | null;

const steps = [
  { key: "BROADCASTED", label: "Broadcast", icon: "radio" },
  { key: "ACCEPTED", label: "Accepted", icon: "user-check" },
  { key: "ITEM_AVAILABLE", label: "Available", icon: "shopping-bag" },
  { key: "PURCHASED", label: "Purchased", icon: "check-square" },
  { key: "ON_THE_WAY", label: "On route", icon: "navigation" },
  { key: "PAYMENT_DUE", label: "Payment", icon: "credit-card" },
  { key: "DELIVERED", label: "Done", icon: "check-circle" },
] as const;

function getStepIndex(status: string) {
  switch (status) {
    case "BROADCASTED":
      return 0;
    case "ACCEPTED":
      return 1;
    case "ITEM_AVAILABLE":
    case "PREPARING":
      return 2;
    case "PURCHASED":
      return 3;
    case "ON_THE_WAY":
    case "NEAR_YOU":
      return 4;
    case "PAYMENT_DUE":
      return 5;
    case "DELIVERED":
    case "COMPLETED":
      return 6;
    default:
      return 0;
  }
}

export default function OrderStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<ActionKey>(null);
  const [otpInput, setOtpInput] = useState("");
  const [issueReason, setIssueReason] = useState("");

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: paymentConfig } = useQuery(trpc.payment.config.queryOptions());
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

  const cancelOrderMutation = useMutation(
    trpc.order.cancelOrder.mutationOptions(),
  );
  const confirmAvailabilityMutation = useMutation(
    trpc.order.confirmAvailability.mutationOptions(),
  );
  const rejectOrderMutation = useMutation(
    trpc.order.rejectOrder.mutationOptions(),
  );
  const markPurchasedMutation = useMutation(
    trpc.order.markPurchased.mutationOptions(),
  );
  const updateStatusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions(),
  );
  const verifyDeliveryMutation = useMutation(
    trpc.order.verifyDelivery.mutationOptions(),
  );
  const confirmPaymentReceivedMutation = useMutation(
    trpc.order.confirmPaymentReceived.mutationOptions(),
  );
  const reportPaymentIssueMutation = useMutation(
    trpc.order.reportPaymentIssue.mutationOptions(),
  );

  const refreshOrder = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.payment.earnings.queryKey(),
      }),
    ]);
  };

  const runAction = async (
    key: Exclude<ActionKey, null>,
    operation: () => Promise<unknown>,
    errorTitle: string,
  ) => {
    if (activeAction) return;
    setActiveAction(key);
    try {
      await operation();
      await refreshOrder();
    } catch (error) {
      showAppAlert(
        errorTitle,
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setActiveAction(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <LoadingState
            title="Loading order"
            copy="Syncing delivery and handover state."
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
            copy="This order is not in your buyer or deliverer history."
            actionLabel="Back to orders"
            onAction={() => router.replace("/history_tab" as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isBuyer = order.buyerId === profile?.id;
  const isDeliverer = order.delivererId === profile?.id;
  const isDirectPod = order.paymentModel === "DIRECT_PAY_ON_DELIVERY";
  const databaseReady = paymentConfig?.databaseReady === true;
  const totalDue = order.foodPrice + order.deliveryFee;
  const isTerminal = ["DELIVERED", "COMPLETED", "CANCELLED", "FAILED"].includes(
    order.status,
  );
  const canCancelBeforePurchase =
    isDirectPod &&
    order.purchasedAt === null &&
    ["BROADCASTED", "ACCEPTED", "ITEM_AVAILABLE"].includes(order.status);
  const canReportPostPurchaseIssue =
    databaseReady &&
    isDirectPod &&
    (isBuyer || isDeliverer) &&
    order.purchasedAt !== null &&
    ["PURCHASED", "ON_THE_WAY", "NEAR_YOU", "PAYMENT_DUE"].includes(
      order.status,
    ) &&
    order.paymentReceivedAt === null &&
    (!order.paymentIssueAt || Boolean(order.paymentIssueResolvedAt));
  const currentStep = getStepIndex(order.status);
  const tone = statusTone(order.status);

  const confirmBuyerCancel = () =>
    confirmAppAction({
      title: "Cancel this order?",
      message:
        "Cancellation is available only before the deliverer pays the canteen.",
      cancelLabel: "Keep order",
      confirmLabel: "Cancel order",
      destructive: true,
      onConfirm: () =>
        void runAction(
          "cancelBuyer",
          () => cancelOrderMutation.mutateAsync({ orderId: order.id }),
          "Could not cancel order",
        ),
    });

  const confirmDelivererCancel = () =>
    confirmAppAction({
      title: "End this delivery?",
      message:
        "Use this only before canteen purchase, for example when the requested items are unavailable.",
      cancelLabel: "Keep delivery",
      confirmLabel: "End delivery",
      destructive: true,
      onConfirm: () =>
        void runAction(
          "cancelDeliverer",
          () => rejectOrderMutation.mutateAsync({ orderId: order.id }),
          "Could not end delivery",
        ),
    });

  const confirmPurchase = () =>
    confirmAppAction({
      title: "Confirm canteen purchase",
      message:
        "Confirm that you paid " +
        formatCurrency(order.foodPrice) +
        " at the canteen from your own money. Normal cancellation ends after this step.",
      cancelLabel: "Not yet",
      confirmLabel: "I paid the canteen",
      onConfirm: () =>
        void runAction(
          "purchase",
          () => markPurchasedMutation.mutateAsync({ orderId: order.id }),
          "Could not confirm purchase",
        ),
    });

  const verifyOtp = () =>
    void runAction(
      "verify",
      () =>
        verifyDeliveryMutation.mutateAsync({
          orderId: order.id,
          otp: otpInput,
        }),
      "Could not verify handover code",
    );

  const confirmPaymentReceived = () =>
    confirmAppAction({
      title: "Confirm payment received?",
      message:
        "Confirm that you received " +
        formatCurrency(totalDue) +
        " directly from the buyer. This completes the order and records " +
        formatCurrency(order.deliveryFee) +
        " as your delivery earning.",
      cancelLabel: "Not yet",
      confirmLabel: "Payment received",
      onConfirm: () =>
        void runAction(
          "confirmPaymentReceived",
          () =>
            confirmPaymentReceivedMutation.mutateAsync({
              orderId: order.id,
            }),
          "Could not confirm payment",
        ),
    });

  const submitIssue = () => {
    const reason = issueReason.trim();
    if (reason.length < 3) {
      showAppAlert(
        "Describe the issue",
        "Add a short note explaining the payment problem for admin review.",
      );
      return;
    }
    void runAction(
      "reportIssue",
      async () => {
        await reportPaymentIssueMutation.mutateAsync({
          orderId: order.id,
          reason,
        });
        setIssueReason("");
      },
      "Could not report payment issue",
    );
  };

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
          { paddingBottom: Math.max(32, insets.bottom + 22) },
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

          <Text style={styles.statusTitle}>{headline(order, isDeliverer)}</Text>
          <Text style={styles.statusCopy}>
            {statusCopy(order, isDeliverer)}
          </Text>

          {!isTerminal && isDirectPod ? (
            <View style={styles.timeline}>
              {steps.map((step, index) => {
                const done = currentStep > index;
                const current = currentStep === index;
                return (
                  <View key={step.key} style={styles.step}>
                    {index < steps.length - 1 ? (
                      <View
                        style={[styles.stepLine, done && styles.stepLineActive]}
                      />
                    ) : null}
                    <View
                      style={[
                        styles.stepNode,
                        (done || current) && styles.stepNodeActive,
                      ]}
                    >
                      <Feather
                        name={done ? "check" : step.icon}
                        size={13}
                        color={done || current ? colors.white : colors.faint}
                      />
                    </View>
                    <Text
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
          ) : null}
        </MotionView>

        {!isDirectPod ? (
          <InlineNotice
            icon="archive"
            title="Legacy payment record"
            copy="This older order keeps its historical financial data for reference. Historical financial actions are read-only in the current app."
          />
        ) : null}

        {!databaseReady ? (
          <InlineNotice
            icon="database"
            tone="warning"
            title="Server upgrade pending"
            copy="Delivery actions are paused until the direct Pay on Delivery database migration is available on the backend."
          />
        ) : null}

        {isDirectPod ? (
          <MotionView style={styles.paymentCard}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}>
                <Feather name="shield" size={16} color={colors.primary} />
              </View>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionEyebrow}>PAY ON DELIVERY</Text>
                <Text style={styles.sectionTitle}>Direct buyer payment</Text>
              </View>
            </View>

            <SummaryLine
              label="Food reimbursement"
              value={formatCurrency(order.foodPrice)}
            />
            <SummaryLine
              label="Delivery earning"
              value={formatCurrency(order.deliveryFee)}
            />
            <View style={styles.summaryDivider} />
            <SummaryLine
              label="Buyer pays deliverer"
              value={formatCurrency(totalDue)}
              strong
            />

            {order.status === "PAYMENT_DUE" ? (
              <InlineNotice
                icon="credit-card"
                tone="warning"
                title={
                  isDeliverer
                    ? "Collect " + formatCurrency(totalDue)
                    : "Pay " + formatCurrency(totalDue) + " to your deliverer"
                }
                copy={
                  isDeliverer
                    ? "OTP is verified. Collect the full amount directly from the buyer using cash or your own payment method, then confirm receipt."
                    : "OTP is verified. Pay the full amount directly to your deliverer. CAmpDeliver does not receive or verify this payment."
                }
              />
            ) : order.status === "DELIVERED" ? (
              <InlineNotice
                icon="check-circle"
                tone="success"
                title="Direct payment confirmed"
                copy={
                  "This order is complete. The deliverer's earning is " +
                  formatCurrency(order.deliveryFee) +
                  "."
                }
              />
            ) : (
              <InlineNotice
                icon="info"
                title="No payment needed in the app"
                copy="The deliverer pays the canteen first. Buyer payment becomes due only after the handover OTP is verified."
              />
            )}

            {order.paymentIssueAt ? (
              <InlineNotice
                icon="alert-triangle"
                tone={order.paymentIssueResolvedAt ? "success" : "warning"}
                title={
                  order.paymentIssueResolvedAt
                    ? "Payment issue reviewed"
                    : "Payment issue reported"
                }
                copy={
                  order.paymentIssueResolvedAt
                    ? (order.paymentIssueResolution ??
                      "An administrator reviewed this issue.")
                    : (order.paymentIssueReason ??
                      "An administrator needs to review this handover.")
                }
              />
            ) : null}
          </MotionView>
        ) : null}

        {!isTerminal && order.delivererId ? (
          <MotionView style={styles.toolsCard}>
            <Text style={styles.sectionEyebrow}>LIVE TOOLS</Text>
            <View style={styles.toolRow}>
              <ToolButton
                icon="map"
                label="Live map"
                onPress={() =>
                  router.push(("/order/" + order.id + "/tracker") as never)
                }
              />
              <ToolButton
                icon="message-square"
                label="Order chat"
                onPress={() =>
                  router.push(("/order/" + order.id + "/chat") as never)
                }
              />
            </View>
          </MotionView>
        ) : null}

        {databaseReady && isDirectPod && isBuyer && canCancelBeforePurchase ? (
          <MotionView style={styles.actionCard}>
            <InlineNotice
              icon="x-circle"
              title="Cancellation is still available"
              copy="You may cancel until the deliverer confirms they paid the canteen. After purchase, admin review is required for exceptional problems."
            />
            <AppButton
              label="Cancel order"
              icon="x"
              tone="warning"
              loading={activeAction === "cancelBuyer"}
              disabled={activeAction !== null && activeAction !== "cancelBuyer"}
              onPress={confirmBuyerCancel}
            />
          </MotionView>
        ) : null}

        {canReportPostPurchaseIssue ? (
          <MotionView style={styles.actionCard}>
            <InlineNotice
              icon="alert-triangle"
              tone="warning"
              title={
                order.status === "PAYMENT_DUE"
                  ? "Problem with payment or handover?"
                  : "Problem after canteen purchase?"
              }
              copy="Report a delivery or handover problem for admin review. This is the exception path after the deliverer has spent real money."
            />
            <TextInput
              value={issueReason}
              onChangeText={setIssueReason}
              editable={activeAction === null}
              placeholder="Describe the delivery, handover, or payment problem"
              placeholderTextColor={colors.faint}
              multiline
              maxLength={300}
              style={styles.issueInput}
            />
            <AppButton
              label="Report handover issue"
              icon="alert-triangle"
              tone="warning"
              loading={activeAction === "reportIssue"}
              disabled={activeAction !== null || issueReason.trim().length < 3}
              onPress={submitIssue}
            />
          </MotionView>
        ) : null}

        {databaseReady && isDirectPod && isDeliverer && !isTerminal ? (
          <MotionView style={styles.actionCard}>
            <Text style={styles.sectionEyebrow}>YOUR NEXT ACTION</Text>
            <Text style={styles.sectionTitle}>Deliverer controls</Text>

            {order.status === "ACCEPTED" ? (
              <>
                <InlineNotice
                  icon="shopping-bag"
                  title="Check item availability"
                  copy="Confirm only after the canteen can fulfil the requested items."
                />
                <AppButton
                  label="Items are available"
                  icon="check"
                  loading={activeAction === "availability"}
                  disabled={
                    activeAction !== null && activeAction !== "availability"
                  }
                  onPress={() =>
                    void runAction(
                      "availability",
                      () =>
                        confirmAvailabilityMutation.mutateAsync({
                          orderId: order.id,
                        }),
                      "Could not confirm availability",
                    )
                  }
                />
                <AppButton
                  label="Items unavailable"
                  icon="x"
                  tone="warning"
                  loading={activeAction === "cancelDeliverer"}
                  disabled={
                    activeAction !== null && activeAction !== "cancelDeliverer"
                  }
                  onPress={confirmDelivererCancel}
                />
              </>
            ) : null}

            {order.status === "ITEM_AVAILABLE" ? (
              <>
                <InlineNotice
                  icon="credit-card"
                  tone="warning"
                  title={
                    "Pay " + formatCurrency(order.foodPrice) + " at the canteen"
                  }
                  copy={
                    "Use your own money for the food purchase. At handover you will collect " +
                    formatCurrency(totalDue) +
                    " from the buyer and keep " +
                    formatCurrency(order.deliveryFee) +
                    " as your earning."
                  }
                />
                <AppButton
                  label="I paid the canteen / Confirm purchase"
                  icon="shopping-bag"
                  loading={activeAction === "purchase"}
                  disabled={activeAction !== null}
                  onPress={confirmPurchase}
                />
                <AppButton
                  label="End delivery before purchase"
                  icon="x"
                  tone="warning"
                  loading={activeAction === "cancelDeliverer"}
                  disabled={
                    activeAction !== null && activeAction !== "cancelDeliverer"
                  }
                  onPress={confirmDelivererCancel}
                />
              </>
            ) : null}

            {order.status === "PURCHASED" ? (
              <>
                <InlineNotice
                  tone="success"
                  icon="check-circle"
                  title="Canteen purchase confirmed"
                  copy="Normal cancellation is now disabled. Continue to the fixed delivery point."
                />
                <AppButton
                  label="Start delivery"
                  icon="navigation"
                  loading={activeAction === "onTheWay"}
                  disabled={
                    activeAction !== null && activeAction !== "onTheWay"
                  }
                  onPress={() =>
                    void runAction(
                      "onTheWay",
                      () =>
                        updateStatusMutation.mutateAsync({
                          orderId: order.id,
                          status: "ON_THE_WAY",
                        }),
                      "Could not start delivery",
                    )
                  }
                />
              </>
            ) : null}

            {order.status === "ON_THE_WAY" ? (
              <>
                <InlineNotice
                  icon="map-pin"
                  title="Deliver to the fixed drop-off"
                  copy="Use the live map and chat. Mark Near You only when you reach the handover point."
                />
                <AppButton
                  label="Mark near you"
                  icon="map-pin"
                  loading={activeAction === "nearYou"}
                  disabled={activeAction !== null && activeAction !== "nearYou"}
                  onPress={() =>
                    void runAction(
                      "nearYou",
                      () =>
                        updateStatusMutation.mutateAsync({
                          orderId: order.id,
                          status: "NEAR_YOU",
                        }),
                      "Could not update arrival",
                    )
                  }
                />
              </>
            ) : null}

            {order.status === "NEAR_YOU" ? (
              <>
                <InlineNotice
                  tone="success"
                  icon="key"
                  title="Verify handover OTP first"
                  copy="Ask the buyer for the 4-digit code while physically handing over the food. Payment becomes due only after this succeeds."
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
                      loading={activeAction === "verify"}
                      disabled={otpInput.length !== 4 || activeAction !== null}
                      onPress={verifyOtp}
                    />
                  </View>
                </View>
              </>
            ) : null}

            {order.status === "PAYMENT_DUE" ? (
              <>
                <AppButton
                  label={"Payment received · " + formatCurrency(totalDue)}
                  icon="check-circle"
                  loading={activeAction === "confirmPaymentReceived"}
                  disabled={
                    activeAction !== null &&
                    activeAction !== "confirmPaymentReceived"
                  }
                  onPress={confirmPaymentReceived}
                />
              </>
            ) : null}
          </MotionView>
        ) : null}

        {isBuyer && isDirectPod && order.otp && order.status === "NEAR_YOU" ? (
          <MotionView style={styles.otpCard}>
            <View style={styles.otpIcon}>
              <Feather name="key" size={19} color={colors.primary} />
            </View>
            <Text style={styles.otpEyebrow}>HANDOVER CODE</Text>
            <Text testID="delivery-otp" style={styles.otpValue}>
              {order.otp}
            </Text>
            <Text style={styles.otpCopy}>
              Share this code only while physically receiving the food. After
              OTP verification, pay {formatCurrency(totalDue)} directly to your
              deliverer.
            </Text>
          </MotionView>
        ) : null}

        {order.status === "CANCELLED" ? (
          <InlineNotice
            tone="warning"
            icon="slash"
            title="Order cancelled"
            copy={
              order.cancellationReason ??
              "This order ended before canteen purchase."
            }
          />
        ) : null}

        <MotionView style={styles.summaryCard}>
          <Text style={styles.sectionEyebrow}>ORDER DETAILS</Text>
          <SummaryLine label="Canteen" value={order.canteenName} />
          <SummaryLine label="Drop-off" value={order.deliveryLocationName} />
          <SummaryLine label="Food" value={formatCurrency(order.foodPrice)} />
          <SummaryLine
            label="Delivery fee"
            value={formatCurrency(order.deliveryFee)}
          />
          <SummaryLine
            label="Platform fee"
            value={formatCurrency(order.platformFee)}
          />
          <View style={styles.summaryDivider} />
          <SummaryLine
            label={isDirectPod ? "Pay on Delivery total" : "Historical total"}
            value={formatCurrency(
              isDirectPod
                ? totalDue
                : order.foodPrice + order.deliveryFee + order.platformFee,
            )}
            strong
          />
        </MotionView>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolButton({
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
      style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
    >
      <View style={styles.toolIcon}>
        <Feather name={icon} size={17} color={colors.primary} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
      <Feather name="chevron-right" size={16} color={colors.faint} />
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
      <Text style={[styles.summaryValue, strong && styles.summaryStrong]}>
        {value}
      </Text>
    </View>
  );
}

function headline(order: Order, isDeliverer: boolean) {
  switch (order.status) {
    case "BROADCASTED":
      return "Finding a nearby deliverer";
    case "ACCEPTED":
      return isDeliverer
        ? "Check the canteen"
        : "A deliverer accepted your order";
    case "ITEM_AVAILABLE":
    case "PREPARING":
      return isDeliverer
        ? "Purchase the food at the canteen"
        : "Your deliverer is preparing to purchase";
    case "PURCHASED":
      return isDeliverer
        ? "Purchase confirmed"
        : "Your order has been purchased";
    case "ON_THE_WAY":
      return isDeliverer ? "Deliver to the buyer" : "Your order is on the way";
    case "NEAR_YOU":
      return isDeliverer
        ? "Verify the handover code"
        : "Your deliverer is nearby";
    case "PAYMENT_DUE":
      return isDeliverer
        ? "Collect payment from the buyer"
        : "Pay your deliverer directly";
    case "DELIVERED":
    case "COMPLETED":
      return "Delivery completed";
    case "CANCELLED":
      return "Order cancelled";
    case "FAILED":
      return "Order needs admin review";
    default:
      return statusLabels[order.status] ?? order.status;
  }
}

function statusCopy(order: Order, isDeliverer: boolean) {
  switch (order.status) {
    case "BROADCASTED":
      return "Eligible students near the canteen can see and accept this delivery quest.";
    case "ACCEPTED":
      return isDeliverer
        ? "Check whether the canteen can fulfil the requested items."
        : "The deliverer is checking item availability.";
    case "ITEM_AVAILABLE":
    case "PREPARING":
      return isDeliverer
        ? "Pay the canteen from your own money, then confirm the purchase."
        : "No payment is due yet. You will pay the deliverer only at handover after OTP verification.";
    case "PURCHASED":
      return "The canteen purchase is confirmed, so normal cancellation is no longer available.";
    case "ON_THE_WAY":
      return "Live map and chat remain available while the delivery is active.";
    case "NEAR_YOU":
      return "The handover OTP must be verified before buyer payment becomes due.";
    case "PAYMENT_DUE":
      return isDeliverer
        ? "Collect food reimbursement plus your delivery fee directly from the buyer, then confirm receipt."
        : "Pay the full order amount directly to the deliverer. CAmpDeliver does not handle this payment.";
    case "DELIVERED":
    case "COMPLETED":
      return "OTP and direct payment confirmation are complete.";
    case "CANCELLED":
      return order.cancellationReason ?? "This order ended before delivery.";
    case "FAILED":
      return "An exceptional failure needs admin review.";
    default:
      return "The latest order state is syncing from the backend.";
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
  headerCopy: { flex: 1 },
  headerSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
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
  issueBox: {
    backgroundColor: colors.warningSoft,
    borderColor: "#FAD8B8",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  issueInput: {
    backgroundColor: colors.panel,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12,
    minHeight: 78,
    padding: 12,
    textAlignVertical: "top",
  },
  issueLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
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
    marginTop: 8,
    maxWidth: 330,
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
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  otpInput: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 23,
    fontWeight: "900",
    height: 52,
    letterSpacing: 8,
    paddingHorizontal: 14,
    textAlign: "center",
  },
  otpInputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  otpValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 7,
    marginTop: 6,
  },
  paymentCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    ...shadow,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  rawStatus: { color: colors.faint, fontSize: 9, fontWeight: "800" },
  rolePill: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: "900",
  },
  root: { backgroundColor: colors.bg, flex: 1 },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  sectionHeadingCopy: { flex: 1 },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
    padding: 16,
    ...shadow,
  },
  statusCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusLabel: { fontSize: 10, fontWeight: "900" },
  statusTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  statusTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  step: { alignItems: "center", flex: 1, position: "relative" },
  stepLabel: {
    color: colors.faint,
    fontSize: 8,
    fontWeight: "700",
    marginTop: 7,
    textAlign: "center",
  },
  stepLabelActive: { color: colors.primaryStrong },
  stepLine: {
    backgroundColor: colors.border,
    height: 2,
    left: "58%",
    position: "absolute",
    top: 15,
    width: "84%",
  },
  stepLineActive: { backgroundColor: colors.primary },
  stepNode: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 31,
    justifyContent: "center",
    width: 31,
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
    gap: 10,
    padding: 16,
    ...shadow,
  },
  summaryDivider: { backgroundColor: colors.border, height: 1 },
  summaryLabel: { color: colors.muted, flex: 1, fontSize: 12 },
  summaryLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  summaryStrong: { color: colors.text, fontWeight: "900" },
  summaryValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  timeline: { flexDirection: "row", marginTop: 6 },
  toolButton: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  toolIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  toolLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
  },
  toolRow: { flexDirection: "row", gap: 10 },
  toolsCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  verifyAction: { minWidth: 104 },
});
