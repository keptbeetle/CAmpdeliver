import { useMemo, useState } from "react";
import {
  Linking,
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
type PaymentMethod = "ADVANCE" | "PAY_AT_DELIVERY";

type ActionKey =
  | "cancelBuyer"
  | "availability"
  | "cancelDeliverer"
  | "chooseAdvance"
  | "choosePod"
  | "submitPayment"
  | "purchase"
  | "onTheWay"
  | "nearYou"
  | "verify"
  | null;

const steps = [
  { key: "BROADCASTED", label: "Broadcast", icon: "radio" },
  { key: "ACCEPTED", label: "Accepted", icon: "user-check" },
  { key: "ITEM_AVAILABLE", label: "Available", icon: "shopping-bag" },
  { key: "PURCHASED", label: "Purchased", icon: "check-square" },
  { key: "ON_THE_WAY", label: "On route", icon: "navigation" },
  { key: "DELIVERED", label: "Delivered", icon: "check-circle" },
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
    case "DELIVERED":
    case "COMPLETED":
      return 5;
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
  const [utrInput, setUtrInput] = useState("");

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
  const chooseMethodMutation = useMutation(
    trpc.payment.chooseMethod.mutationOptions(),
  );
  const submitReferenceMutation = useMutation(
    trpc.payment.submitReference.mutationOptions(),
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
            copy="Syncing delivery and payment state."
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
  const payment = order.payment;
  const paymentStatus = payment?.status ?? "NOT_STARTED";
  const paymentMethod = payment?.method ?? null;
  const paymentDatabaseReady = paymentConfig?.databaseReady === true;
  const expectedAmount =
    payment?.expectedAmount ??
    order.foodPrice + order.deliveryFee + order.platformFee;
  const isTerminal = ["DELIVERED", "COMPLETED", "CANCELLED", "FAILED"].includes(
    order.status,
  );
  const currentStep = getStepIndex(order.status);
  const tone = statusTone(order.status);

  const choosePaymentMethod = (method: PaymentMethod) =>
    void runAction(
      method === "ADVANCE" ? "chooseAdvance" : "choosePod",
      () => chooseMethodMutation.mutateAsync({ orderId: order.id, method }),
      "Could not choose payment method",
    );

  const openUpi = async () => {
    if (!paymentConfig?.upiId) {
      showAppAlert(
        "UPI is not configured",
        "The admin has not configured the pilot UPI account yet.",
      );
      return;
    }
    const params = new URLSearchParams({
      pa: paymentConfig.upiId,
      pn: paymentConfig.upiPayeeName,
      am: (expectedAmount / 100).toFixed(2),
      cu: "INR",
      tn: `CAmpDeliver ${shortId(order.id)}`,
    });
    const uri = `upi://pay?${params.toString()}`;
    try {
      await Linking.openURL(uri);
    } catch {
      showAppAlert(
        "Could not open a UPI app",
        "Open your UPI app manually, pay the exact amount to the shown UPI ID, then submit the transaction reference here.",
      );
    }
  };

  const submitReference = () => {
    const trimmed = utrInput.trim();
    if (trimmed.length < 5) {
      showAppAlert(
        "Transaction reference required",
        "Enter the UPI transaction reference or UTR.",
      );
      return;
    }
    void runAction(
      "submitPayment",
      async () => {
        await submitReferenceMutation.mutateAsync({
          orderId: order.id,
          utrNumber: trimmed,
        });
        setUtrInput("");
      },
      "Could not submit payment",
    );
  };

  const confirmBuyerCancel = () =>
    confirmAppAction({
      title: "Cancel this broadcast?",
      message:
        "Cancellation is available only before a deliverer accepts the order.",
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

  const confirmDelivererCancel = () => {
    const itemsUnavailable = order.status === "ACCEPTED";
    confirmAppAction({
      title: itemsUnavailable
        ? "Items unavailable?"
        : "Cancel after secured payment?",
      message: itemsUnavailable
        ? "Use this only when the canteen cannot fulfil the requested items. The order will end before the buyer pays."
        : "The buyer's payment is already secured. Cancelling before purchase will put the full buyer payment into the admin refund queue.",
      cancelLabel: "Keep delivery",
      confirmLabel: itemsUnavailable ? "Mark unavailable" : "Cancel & refund",
      destructive: true,
      onConfirm: () =>
        void runAction(
          "cancelDeliverer",
          () => rejectOrderMutation.mutateAsync({ orderId: order.id }),
          "Could not cancel delivery",
        ),
    });
  };

  const confirmPurchase = () =>
    confirmAppAction({
      title: "Confirm canteen purchase",
      message:
        "Only continue after you have actually paid the canteen or placed the order. This is the irreversible boundary: normal cancellation ends after confirmation.",
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
      "Could not complete delivery",
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

          {!isTerminal ? (
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
                        size={13}
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
          ) : null}
        </MotionView>

        {!isTerminal && order.delivererId ? (
          <MotionView style={styles.toolsCard}>
            <Text style={styles.sectionEyebrow}>LIVE TOOLS</Text>
            <View style={styles.toolRow}>
              <ToolButton
                icon="map"
                label="Live map"
                onPress={() =>
                  router.push(`/order/${order.id}/tracker` as never)
                }
              />
              <ToolButton
                icon="message-square"
                label="Order chat"
                onPress={() => router.push(`/order/${order.id}/chat` as never)}
              />
            </View>
          </MotionView>
        ) : null}

        <PaymentCard
          order={order}
          isBuyer={isBuyer}
          isDeliverer={isDeliverer}
          paymentConfig={paymentConfig}
          expectedAmount={expectedAmount}
          paymentMethod={paymentMethod}
          paymentStatus={paymentStatus}
          utrInput={utrInput}
          setUtrInput={setUtrInput}
          activeAction={activeAction}
          choosePaymentMethod={choosePaymentMethod}
          openUpi={() => void openUpi()}
          submitReference={submitReference}
        />

        {paymentDatabaseReady && isBuyer && order.status === "BROADCASTED" ? (
          <MotionView style={styles.actionCard}>
            <InlineNotice
              icon="clock"
              title="Still looking for a deliverer"
              copy="You can cancel while this order is still being broadcast. After someone accepts, the backend locks buyer cancellation."
            />
            <AppButton
              label="Cancel Broadcast"
              icon="x"
              tone="warning"
              loading={activeAction === "cancelBuyer"}
              disabled={activeAction !== null && activeAction !== "cancelBuyer"}
              onPress={confirmBuyerCancel}
            />
          </MotionView>
        ) : null}

        {paymentDatabaseReady && isDeliverer && !isTerminal ? (
          <MotionView style={styles.actionCard}>
            <Text style={styles.sectionEyebrow}>YOUR NEXT ACTION</Text>
            <Text style={styles.sectionTitle}>Deliverer controls</Text>

            {order.status === "ACCEPTED" ? (
              <>
                <InlineNotice
                  icon="shopping-bag"
                  title="Check item availability"
                  copy="Confirm only after the canteen can fulfil the items. No buyer money is committed at this stage."
                />
                <AppButton
                  label="Items Are Available"
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
                  label="Items Unavailable"
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
                {paymentMethod === null ? (
                  <InlineNotice
                    icon="clock"
                    title="Waiting for buyer payment choice"
                    copy={
                      order.delivererAllowsPayAtDelivery
                        ? "The buyer can choose advance payment or Pay at Delivery because you offered both."
                        : "The buyer must choose advance payment before you spend at the canteen."
                    }
                  />
                ) : paymentMethod === "ADVANCE" && paymentStatus !== "PAID" ? (
                  <InlineNotice
                    icon="shield"
                    title="Wait for verified payment"
                    copy="Do not pay the canteen yet. CAmpDeliver will mark this payment Paid only after an admin verifies the submitted UPI transaction."
                  />
                ) : paymentMethod === "PAY_AT_DELIVERY" ? (
                  <InlineNotice
                    tone="warning"
                    icon="alert-triangle"
                    title="You offered Pay at Delivery"
                    copy="You are choosing to front the food cost. The buyer must make a verified digital payment before the handover OTP can complete the order."
                  />
                ) : (
                  <InlineNotice
                    tone="success"
                    icon="shield"
                    title="Buyer payment secured"
                    copy="The advance payment is verified. You can now pay the canteen and confirm purchase."
                  />
                )}

                <AppButton
                  label="I Paid the Canteen / Order Placed"
                  icon="shopping-bag"
                  loading={activeAction === "purchase"}
                  disabled={
                    activeAction !== null ||
                    paymentMethod === null ||
                    (paymentMethod === "ADVANCE" && paymentStatus !== "PAID")
                  }
                  onPress={confirmPurchase}
                />
                {paymentStatus === "PAID" ? (
                  <AppButton
                    label="Cancel & Queue Refund"
                    icon="x"
                    tone="warning"
                    loading={activeAction === "cancelDeliverer"}
                    disabled={
                      activeAction !== null &&
                      activeAction !== "cancelDeliverer"
                    }
                    onPress={confirmDelivererCancel}
                  />
                ) : (
                  <InlineNotice
                    icon="clock"
                    title="Cancellation is server-managed while payment is pending"
                    copy="After you confirm item availability, wait for the buyer/payment flow. If either side disappears, the backend TTL cancels the order automatically. Manual deliverer cancellation becomes available only after CAmpDeliver verifies advance payment and before you purchase."
                  />
                )}
              </>
            ) : null}

            {order.status === "PURCHASED" ? (
              <>
                <InlineNotice
                  tone="success"
                  icon="check-circle"
                  title="Purchase confirmed"
                  copy="The irreversible boundary has passed. Normal cancellation is disabled; continue to the buyer."
                />
                <AppButton
                  label="Start Delivery"
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
                  copy="Use the live map and order chat. Mark Near You only when you reach the meeting area."
                />
                <AppButton
                  label="Mark Near You"
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
              paymentStatus === "PAID" ? (
                <>
                  <InlineNotice
                    tone="success"
                    icon="key"
                    title="Payment verified — complete handover"
                    copy="Ask the buyer for the 4-digit handover code only while physically handing over the order."
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
                        disabled={
                          otpInput.length !== 4 || activeAction !== null
                        }
                        onPress={verifyOtp}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <InlineNotice
                  tone="warning"
                  icon="credit-card"
                  title="Waiting for verified payment"
                  copy="Do not hand over the order or ask for the OTP yet. The buyer must pay and an admin must verify the UPI reference first."
                />
              )
            ) : null}
          </MotionView>
        ) : null}

        {isBuyer &&
        order.otp &&
        paymentStatus === "PAID" &&
        order.status === "NEAR_YOU" ? (
          <MotionView style={styles.otpCard}>
            <View style={styles.otpIcon}>
              <Feather name="key" size={19} color={colors.primary} />
            </View>
            <Text style={styles.otpEyebrow}>HANDOVER CODE</Text>
            <Text testID="delivery-otp" style={styles.otpValue}>
              {order.otp}
            </Text>
            <Text style={styles.otpCopy}>
              Share this code only when the food is physically handed to you. It
              completes the order and creates the deliverer's settlement.
            </Text>
          </MotionView>
        ) : null}

        {order.status === "CANCELLED" ? (
          <InlineNotice
            tone="warning"
            icon="slash"
            title="Order cancelled"
            copy={
              paymentStatus === "REFUND_REQUIRED"
                ? "Your payment was verified, so an admin refund is now required."
                : paymentStatus === "PENDING_VERIFICATION"
                  ? "The order ended while a submitted payment is still being reconciled. Admin can verify it and queue a refund if the money arrived."
                  : (order.cancellationReason ??
                    "This order ended before purchase.")
            }
          />
        ) : null}

        <MotionView style={styles.summaryCard}>
          <Text style={styles.sectionEyebrow}>ORDER DETAILS</Text>
          <SummaryLine label="Canteen" value={order.canteenName} />
          <SummaryLine label="Drop-off" value={order.deliveryLocationName} />
          <SummaryLine label="Food" value={formatCurrency(order.foodPrice)} />
          <SummaryLine
            label="Delivery earning"
            value={formatCurrency(order.deliveryFee)}
          />
          <SummaryLine
            label="Platform fee"
            value={formatCurrency(order.platformFee)}
          />
          <View style={styles.summaryDivider} />
          <SummaryLine
            label="Buyer total"
            value={formatCurrency(expectedAmount)}
            strong
          />
        </MotionView>
      </ScrollView>
    </SafeAreaView>
  );
}

function PaymentCard({
  order,
  isBuyer,
  isDeliverer,
  paymentConfig,
  expectedAmount,
  paymentMethod,
  paymentStatus,
  utrInput,
  setUtrInput,
  activeAction,
  choosePaymentMethod,
  openUpi,
  submitReference,
}: {
  order: Order;
  isBuyer: boolean;
  isDeliverer: boolean;
  paymentConfig: RouterOutputs["payment"]["config"] | undefined;
  expectedAmount: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: string;
  utrInput: string;
  setUtrInput: (value: string) => void;
  activeAction: ActionKey;
  choosePaymentMethod: (method: PaymentMethod) => void;
  openUpi: () => void;
  submitReference: () => void;
}) {
  if (paymentConfig?.databaseReady === false) {
    return (
      <MotionView style={styles.paymentCard}>
        <InlineNotice
          icon="database"
          tone="warning"
          title="Payment upgrade pending"
          copy="This order is available in read-only compatibility mode. Payment and delivery actions will resume after the server database migration is applied."
        />
      </MotionView>
    );
  }

  const canSelectMethod =
    isBuyer &&
    order.status === "ITEM_AVAILABLE" &&
    ["AWAITING_SELECTION", "REJECTED"].includes(paymentStatus) &&
    paymentMethod === null;
  const podNeedsPayment =
    paymentMethod === "PAY_AT_DELIVERY" && order.status === "NEAR_YOU";
  const showPaymentEntry =
    isBuyer &&
    paymentMethod !== null &&
    ["AWAITING_PAYMENT", "REJECTED"].includes(paymentStatus) &&
    (paymentMethod === "ADVANCE" || podNeedsPayment);

  return (
    <MotionView style={styles.paymentCard}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Feather name="shield" size={16} color={colors.primary} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionEyebrow}>PAYMENT</Text>
          <Text style={styles.sectionTitle}>Secure payment state</Text>
        </View>
      </View>

      {paymentMethod ? (
        <View style={styles.paymentMetaRow}>
          <Text style={styles.paymentMetaLabel}>Method</Text>
          <Text style={styles.paymentMetaValue}>
            {paymentMethod === "ADVANCE"
              ? "Advance payment"
              : "Pay at Delivery"}
          </Text>
        </View>
      ) : null}
      <View style={styles.paymentMetaRow}>
        <Text style={styles.paymentMetaLabel}>Amount</Text>
        <Text style={styles.paymentMetaValue}>
          {formatCurrency(expectedAmount)}
        </Text>
      </View>

      {canSelectMethod ? (
        <>
          <InlineNotice
            icon="shield"
            title="Choose how to pay"
            copy="Advance payment protects both sides: CAmpDeliver verifies your payment before the deliverer spends at the canteen."
          />
          <AppButton
            label="Pay Now — Advance"
            icon="shield"
            loading={activeAction === "chooseAdvance"}
            disabled={activeAction !== null && activeAction !== "chooseAdvance"}
            onPress={() => choosePaymentMethod("ADVANCE")}
          />
          {order.delivererAllowsPayAtDelivery ? (
            <AppButton
              label="Pay at Delivery"
              icon="clock"
              tone="secondary"
              loading={activeAction === "choosePod"}
              disabled={activeAction !== null && activeAction !== "choosePod"}
              onPress={() => choosePaymentMethod("PAY_AT_DELIVERY")}
            />
          ) : (
            <InlineNotice
              icon="info"
              title="Pay at Delivery unavailable"
              copy="This deliverer accepted the quest with advance payment only."
            />
          )}
        </>
      ) : null}

      {isBuyer &&
      paymentMethod === "PAY_AT_DELIVERY" &&
      !podNeedsPayment &&
      paymentStatus === "AWAITING_PAYMENT" ? (
        <InlineNotice
          icon="clock"
          title="Payment happens at handover"
          copy="The deliverer may purchase using their own money. When they reach you, pay digitally to CAmpDeliver, submit the UTR, and wait for admin verification before sharing the OTP."
        />
      ) : null}

      {showPaymentEntry ? (
        <>
          {paymentStatus === "REJECTED" ? (
            <InlineNotice
              tone="warning"
              icon="alert-circle"
              title="Reference was rejected"
              copy={
                order.payment?.rejectionReason ??
                "Check the UPI transaction and submit the correct reference again."
              }
            />
          ) : null}
          <View style={styles.upiBox}>
            <Text style={styles.upiLabel}>Pay exact amount to</Text>
            <Text selectable style={styles.upiId}>
              {paymentConfig?.upiId ?? "UPI ID not configured"}
            </Text>
            <Text style={styles.upiAmount}>
              {formatCurrency(expectedAmount)}
            </Text>
            <Text style={styles.upiReference}>
              Reference: CD-{shortId(order.id)}
            </Text>
          </View>
          <AppButton
            label="Open UPI App"
            icon="external-link"
            tone="secondary"
            disabled={!paymentConfig?.upiId || activeAction !== null}
            onPress={openUpi}
          />
          <TextInput
            value={utrInput}
            onChangeText={setUtrInput}
            autoCapitalize="characters"
            placeholder="UPI transaction reference / UTR"
            placeholderTextColor={colors.faint}
            style={styles.referenceInput}
            maxLength={80}
          />
          <AppButton
            label="Submit for Admin Verification"
            icon="send"
            loading={activeAction === "submitPayment"}
            disabled={utrInput.trim().length < 5 || activeAction !== null}
            onPress={submitReference}
          />
          <Text style={styles.paymentFinePrint}>
            A UPI app success screen is not treated as proof. The backend
            changes payment to Paid only after an admin matches your transaction
            in the CAmpDeliver account.
          </Text>
        </>
      ) : null}

      {paymentStatus === "PENDING_VERIFICATION" ? (
        <InlineNotice
          icon="clock"
          title="Payment submitted for verification"
          copy={
            isBuyer
              ? `Submitted reference: ${order.payment?.submittedUtr ?? "received"}. Keep the order open while an admin checks the bank credit.`
              : "The buyer submitted a transaction reference. Do not treat it as secured until the status becomes Paid."
          }
        />
      ) : null}
      {paymentStatus === "PAID" ? (
        <InlineNotice
          tone="success"
          icon="check-circle"
          title="Payment verified"
          copy="CAmpDeliver has confirmed the incoming payment."
        />
      ) : null}
      {paymentStatus === "REFUND_REQUIRED" ? (
        <InlineNotice
          tone="warning"
          icon="rotate-ccw"
          title="Refund required"
          copy="The payment was received but this order ended before purchase. It is now in the admin refund queue."
        />
      ) : null}
      {paymentStatus === "REFUNDED" ? (
        <InlineNotice
          tone="success"
          icon="check-circle"
          title="Refund completed"
          copy="The admin has recorded the outgoing refund transfer."
        />
      ) : null}
      {isDeliverer &&
      paymentStatus === "NOT_STARTED" &&
      order.status === "ACCEPTED" ? (
        <InlineNotice
          icon="info"
          title="Payment starts after availability"
          copy="First confirm the canteen can fulfil the order. The buyer then chooses an allowed payment method."
        />
      ) : null}
    </MotionView>
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
      return isDeliverer ? "Waiting on payment decision" : "Choose how to pay";
    case "PURCHASED":
      return isDeliverer
        ? "Purchase confirmed"
        : "Your order has been purchased";
    case "ON_THE_WAY":
      return isDeliverer ? "Deliver to the buyer" : "Your order is on the way";
    case "NEAR_YOU":
      return isDeliverer
        ? "Complete the secure handover"
        : "Your deliverer is nearby";
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
        ? "Verify item availability before the buyer commits a payment method."
        : "The deliverer is checking whether the canteen can fulfil your items.";
    case "ITEM_AVAILABLE":
    case "PREPARING":
      return "Payment and purchase are kept as separate server-verified steps.";
    case "PURCHASED":
      return "The canteen purchase is confirmed, so normal cancellation is no longer available.";
    case "ON_THE_WAY":
      return "Live map and chat remain available while the delivery is active.";
    case "NEAR_YOU":
      return "Payment must be verified before the 4-digit handover code can complete delivery.";
    case "DELIVERED":
    case "COMPLETED":
      return "The OTP handover is complete. The deliverer can request reimbursement from Earnings.";
    case "CANCELLED":
      return order.cancellationReason ?? "This order ended before delivery.";
    case "FAILED":
      return "An exceptional failure needs admin reconciliation rather than a normal cancellation.";
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
  otpInputRow: { alignItems: "center", flexDirection: "row", gap: 10 },
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
  paymentFinePrint: { color: colors.faint, fontSize: 10, lineHeight: 15 },
  paymentMetaLabel: { color: colors.muted, fontSize: 12 },
  paymentMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  paymentMetaValue: { color: colors.text, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  rawStatus: { color: colors.faint, fontSize: 9, fontWeight: "800" },
  referenceInput: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  rolePill: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleText: { color: colors.primaryStrong, fontSize: 10, fontWeight: "900" },
  root: { backgroundColor: colors.bg, flex: 1 },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionHeading: { alignItems: "center", flexDirection: "row", gap: 10 },
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
  statusCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusLabel: { fontSize: 10, fontWeight: "900" },
  statusTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
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
  summaryLine: { alignItems: "center", flexDirection: "row", gap: 16 },
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
  toolLabel: { color: colors.text, flex: 1, fontSize: 11, fontWeight: "800" },
  toolRow: { flexDirection: "row", gap: 10 },
  toolsCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  upiAmount: {
    color: colors.success,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 5,
  },
  upiBox: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  upiId: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 3 },
  upiLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  upiReference: { color: colors.faint, fontSize: 10, marginTop: 6 },
  verifyAction: { minWidth: 104 },
});
