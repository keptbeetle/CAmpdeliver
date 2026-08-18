import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { colors, formatCurrency, shortId } from "~/components/app/theme";
import { trpc } from "~/utils/api";

type Order = RouterOutputs["order"]["myOrders"][number];

const steps = [
  { key: "BROADCASTED", label: "Placed", icon: "clock" },
  { key: "ACCEPTED", label: "Accepted", icon: "check-circle" },
  { key: "PREPARING", label: "Preparing", icon: "coffee" },
  { key: "ON_THE_WAY", label: "Delivery", icon: "navigation" },
];

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

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 3000,
  });

  const order = useMemo(
    () => orders?.find((candidate) => candidate.id === id),
    [orders, id],
  );

  const isDeliverer = !!order && order.delivererId === profile?.id;
  const currentStep = getStepIndex(order?.status ?? "BROADCASTED");

  const confirmAvailabilityMutation = useMutation(
    trpc.order.confirmAvailability.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        }),
      onError: (error) => Alert.alert("Could not update order", error.message),
    }),
  );

  const updateStatusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        }),
      onError: (error) => Alert.alert("Could not update order", error.message),
    }),
  );

  const verifyDeliveryMutation = useMutation(
    trpc.order.verifyDelivery.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        }),
      onError: (error) => Alert.alert("OTP verification failed", error.message),
    }),
  );

  if (isLoading || !order) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.purple} size="large" />
          <Text style={styles.loadingText}>Loading order status</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Order Status Hub</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {order.canteenName} - #{shortId(order.id)}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(36, insets.bottom + 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={styles.statusPill}>
              <Text testID="order-status" style={styles.statusPillText}>
                {order.status}
              </Text>
            </View>
            <Text style={styles.viewMode}>
              {isDeliverer ? "Deliverer View" : "Buyer View"}
            </Text>
          </View>

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
                      name={step.icon as keyof typeof Feather.glyphMap}
                      size={17}
                      color={done || current ? colors.text : colors.faint}
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
        </View>

        <View style={styles.actions}>
          <ActionButton
            icon="map"
            label="Open Live Tracker Map"
            tone="purple"
            onPress={() => router.push(`/order/${order.id}/tracker` as never)}
          />
          <ActionButton
            icon="message-square"
            label="Chat with Rider"
            tone="indigo"
            onPress={() => router.push(`/order/${order.id}/chat` as never)}
          />
        </View>

        {!isDeliverer &&
        order.otp &&
        ["PREPARING", "ON_THE_WAY", "NEAR_YOU"].includes(order.status) ? (
          <View style={styles.otpCard}>
            <View style={styles.otpIcon}>
              <Feather name="key" size={20} color="#ddd6fe" />
            </View>
            <Text style={styles.otpLabel}>Share this OTP at handover</Text>
            <Text testID="delivery-otp" style={styles.otpValue}>
              {order.otp}
            </Text>
            <Text style={styles.otpCopy}>
              The deliverer needs this 4-digit code to complete the delivery.
            </Text>
          </View>
        ) : null}

        {isDeliverer ? (
          <DelivererActions
            order={order}
            otpInput={otpInput}
            setOtpInput={setOtpInput}
            confirmAvailability={() =>
              confirmAvailabilityMutation.mutate({ orderId: order.id })
            }
            markOnTheWay={() =>
              updateStatusMutation.mutate({
                orderId: order.id,
                status: "ON_THE_WAY",
              })
            }
            markNearYou={() =>
              updateStatusMutation.mutate({
                orderId: order.id,
                status: "NEAR_YOU",
              })
            }
            verifyOtp={() =>
              verifyDeliveryMutation.mutate({
                orderId: order.id,
                otp: otpInput,
              })
            }
            busy={
              confirmAvailabilityMutation.isPending ||
              updateStatusMutation.isPending ||
              verifyDeliveryMutation.isPending
            }
          />
        ) : null}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Details</Text>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  tone: "purple" | "indigo";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === "indigo" && styles.actionButtonIndigo,
        pressed && styles.pressed,
      ]}
    >
      <Feather name={icon} size={18} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function DelivererActions({
  order,
  otpInput,
  setOtpInput,
  confirmAvailability,
  markOnTheWay,
  markNearYou,
  verifyOtp,
  busy,
}: {
  order: Order;
  otpInput: string;
  setOtpInput: (value: string) => void;
  confirmAvailability: () => void;
  markOnTheWay: () => void;
  markNearYou: () => void;
  verifyOtp: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.delivererCard}>
      <Text style={styles.summaryTitle}>Rider Controls</Text>
      {order.status === "ACCEPTED" ? (
        <Pressable
          disabled={busy}
          onPress={confirmAvailability}
          style={styles.greenButton}
        >
          <Text style={styles.buttonText}>
            {busy ? "Updating" : "Confirm Item Availability"}
          </Text>
        </Pressable>
      ) : null}
      {order.status === "PREPARING" ? (
        <Pressable
          disabled={busy}
          onPress={markOnTheWay}
          style={styles.purpleButton}
        >
          <Text style={styles.buttonText}>
            {busy ? "Updating" : "Mark On The Way"}
          </Text>
        </Pressable>
      ) : null}
      {order.status === "ON_THE_WAY" ? (
        <Pressable
          disabled={busy}
          onPress={markNearYou}
          style={styles.purpleButton}
        >
          <Text style={styles.buttonText}>
            {busy ? "Updating" : "Mark Near You"}
          </Text>
        </Pressable>
      ) : null}
      {order.status === "NEAR_YOU" ? (
        <View style={styles.otpInputRow}>
          <TextInput
            value={otpInput}
            onChangeText={(value) =>
              setOtpInput(value.replace(/\D/g, "").slice(0, 4))
            }
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Delivery OTP"
            placeholder="1234"
            placeholderTextColor={colors.faint}
            style={styles.otpInput}
          />
          <Pressable
            disabled={busy || otpInput.length < 4}
            onPress={verifyOtp}
            style={[styles.greenButton, styles.verifyButton]}
          >
            <Text style={styles.buttonText}>{busy ? "..." : "Verify"}</Text>
          </Pressable>
        </View>
      ) : null}
      {!["ACCEPTED", "PREPARING", "ON_THE_WAY", "NEAR_YOU"].includes(
        order.status,
      ) ? (
        <Text style={styles.noActionText}>
          No rider action is needed right now.
        </Text>
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 17,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  actionButtonIndigo: {
    backgroundColor: colors.indigo,
  },
  actionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  actions: {
    gap: 12,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  content: {
    gap: 16,
    padding: 18,
  },
  delivererCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  greenButton: {
    backgroundColor: "#059669",
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 12,
  },
  noActionText: {
    color: colors.muted,
    fontSize: 13,
  },
  otpCard: {
    alignItems: "center",
    backgroundColor: "#211238",
    borderColor: "#6d28d9",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  otpCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  otpIcon: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  otpInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    textAlign: "center",
  },
  otpInputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  otpLabel: {
    color: "#ddd6fe",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 12,
    textTransform: "uppercase",
  },
  otpValue: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 10,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.74,
  },
  purpleButton: {
    backgroundColor: colors.purple,
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  statusCard: {
    backgroundColor: colors.panel,
    borderColor: "#6d28d9",
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  statusPill: {
    backgroundColor: "#22163b",
    borderColor: "#6d28d9",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillText: {
    color: "#ddd6fe",
    fontSize: 12,
    fontWeight: "900",
  },
  statusTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  step: {
    alignItems: "center",
    flex: 1,
    minHeight: 92,
    position: "relative",
  },
  stepLabel: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 9,
    maxWidth: 76,
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#ddd6fe",
  },
  stepLine: {
    backgroundColor: colors.border,
    height: 3,
    left: "56%",
    position: "absolute",
    right: "-44%",
    top: 20,
  },
  stepLineActive: {
    backgroundColor: colors.purple,
  },
  stepNode: {
    alignItems: "center",
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 2,
    height: 42,
    justifyContent: "center",
    width: 42,
    zIndex: 2,
  },
  stepNodeActive: {
    backgroundColor: colors.purple,
    borderColor: "#c4b5fd",
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  summaryDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 8,
  },
  summaryLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
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
    fontSize: 16,
    fontWeight: "900",
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
  },
  summaryValue: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  timeline: {
    flexDirection: "row",
    marginTop: 24,
  },
  verifyButton: {
    minWidth: 98,
  },
  viewMode: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
});
