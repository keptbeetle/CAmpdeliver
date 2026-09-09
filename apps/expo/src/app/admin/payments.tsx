import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import {
  colors,
  formatCurrency,
  radius,
  shadow,
  shortId,
} from "~/components/app/theme";
import {
  AppButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  MotionView,
} from "~/components/app/ui";
import { trpc } from "~/utils/api";
import { showAppAlert } from "~/utils/dialog";

type AdminDashboard = RouterOutputs["payment"]["adminDashboard"];
type Verification = AdminDashboard["paymentVerifications"][number];
type Refund = AdminDashboard["refunds"][number];
type Settlement = AdminDashboard["settlements"][number];

export default function AdminPaymentsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});
  const [holdReasons, setHoldReasons] = useState<Record<string, string>>({});

  const { data: profile, isLoading: profileLoading } = useQuery(
    trpc.auth.getMyProfile.queryOptions(),
  );
  const isAdmin = profile?.role === "ADMIN";
  const { data, isLoading, isError, refetch } = useQuery({
    ...trpc.payment.adminDashboard.queryOptions(),
    enabled: isAdmin,
    refetchInterval: isAdmin ? 10000 : false,
  });

  const confirmPaymentMutation = useMutation(
    trpc.payment.adminConfirmPayment.mutationOptions(),
  );
  const rejectPaymentMutation = useMutation(
    trpc.payment.adminRejectPayment.mutationOptions(),
  );
  const refundMutation = useMutation(
    trpc.payment.adminCompleteRefund.mutationOptions(),
  );
  const settlementMutation = useMutation(
    trpc.payment.adminMarkSettlementPaid.mutationOptions(),
  );
  const holdSettlementMutation = useMutation(
    trpc.payment.adminHoldSettlement.mutationOptions(),
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.payment.adminDashboard.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.payment.earnings.queryKey(),
      }),
    ]);
  }, [queryClient]);

  const runAdminAction = async (
    key: string,
    operation: () => Promise<unknown>,
    successTitle: string,
  ) => {
    if (busyKey) return;
    setBusyKey(key);
    try {
      await operation();
      await refresh();
      showAppAlert(successTitle);
    } catch (error) {
      showAppAlert(
        "Admin action failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <LoadingState title="Checking admin access" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) return <Redirect href="/" />;

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
          <Text style={styles.headerTitle}>Payments & settlements</Text>
          <Text style={styles.headerSubtitle}>Admin reconciliation center</Text>
        </View>
        <View style={styles.adminBadge}>
          <Feather name="shield" size={13} color={colors.primaryStrong} />
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <InlineNotice
          tone="warning"
          icon="shield"
          title="Bank history is the source of truth"
          copy="Confirm a payment only after the amount and submitted UTR match the actual CAmpDeliver bank/UPI credit. Screenshots and client callbacks are not proof."
        />

        {isLoading ? (
          <LoadingState
            title="Loading finance queues"
            copy="Fetching pending verifications, refunds and settlements."
          />
        ) : isError || !data ? (
          <EmptyState
            icon="wifi-off"
            title="Finance queues could not be loaded"
            copy="Check the connection and retry."
            actionLabel="Retry"
            onAction={() => void refetch()}
          />
        ) : (
          <>
            <Summary data={data} />

            <QueueSection
              eyebrow="INCOMING MONEY"
              title="Payments to verify"
              count={data.paymentVerifications.length}
              emptyCopy="No submitted UPI references are waiting for verification."
            >
              {data.paymentVerifications.map((payment) => (
                <VerificationCard
                  key={payment.id}
                  payment={payment}
                  busyKey={busyKey}
                  reason={rejectionReasons[payment.id] ?? ""}
                  setReason={(value) =>
                    setRejectionReasons((current) => ({
                      ...current,
                      [payment.id]: value,
                    }))
                  }
                  onConfirm={() =>
                    void runAdminAction(
                      `verify:${payment.id}`,
                      () =>
                        confirmPaymentMutation.mutateAsync({
                          orderId: payment.orderId,
                        }),
                      "Payment verified",
                    )
                  }
                  onReject={() => {
                    const reason = rejectionReasons[payment.id]?.trim() ?? "";
                    if (reason.length < 3) {
                      showAppAlert(
                        "Reason required",
                        "Enter a short reason the buyer can use to correct the payment reference.",
                      );
                      return;
                    }
                    void runAdminAction(
                      `reject:${payment.id}`,
                      () =>
                        rejectPaymentMutation.mutateAsync({
                          orderId: payment.orderId,
                          reason,
                        }),
                      "Payment reference rejected",
                    );
                  }}
                />
              ))}
            </QueueSection>

            <QueueSection
              eyebrow="OUTGOING MONEY"
              title="Refunds required"
              count={data.refunds.length}
              emptyCopy="There are no buyer refunds waiting to be sent."
            >
              {data.refunds.map((payment) => (
                <RefundCard
                  key={payment.id}
                  payment={payment}
                  busyKey={busyKey}
                  reference={references[`refund:${payment.id}`] ?? ""}
                  setReference={(value) =>
                    setReferences((current) => ({
                      ...current,
                      [`refund:${payment.id}`]: value,
                    }))
                  }
                  onComplete={() => {
                    const reference =
                      references[`refund:${payment.id}`]?.trim() ?? "";
                    if (reference.length < 5) {
                      showAppAlert(
                        "Refund reference required",
                        "Make the refund first, then enter its outgoing UPI/UTR reference.",
                      );
                      return;
                    }
                    void runAdminAction(
                      `refund:${payment.id}`,
                      () =>
                        refundMutation.mutateAsync({
                          orderId: payment.orderId,
                          refundReference: reference,
                        }),
                      "Refund recorded",
                    );
                  }}
                />
              ))}
            </QueueSection>

            <QueueSection
              eyebrow="DELIVERER MONEY"
              title="Settlements"
              count={data.settlements.length}
              emptyCopy="No completed deliveries are waiting for settlement."
            >
              {data.settlements.map((settlement) => (
                <SettlementCard
                  key={settlement.id}
                  settlement={settlement}
                  busyKey={busyKey}
                  reference={references[`settlement:${settlement.id}`] ?? ""}
                  setReference={(value) =>
                    setReferences((current) => ({
                      ...current,
                      [`settlement:${settlement.id}`]: value,
                    }))
                  }
                  holdReason={holdReasons[settlement.id] ?? ""}
                  setHoldReason={(value) =>
                    setHoldReasons((current) => ({
                      ...current,
                      [settlement.id]: value,
                    }))
                  }
                  onHold={() => {
                    const reason = holdReasons[settlement.id]?.trim() ?? "";
                    if (reason.length < 3) {
                      showAppAlert(
                        "Hold reason required",
                        "Enter why this settlement should wait before transfer.",
                      );
                      return;
                    }
                    void runAdminAction(
                      `hold:${settlement.id}`,
                      () =>
                        holdSettlementMutation.mutateAsync({
                          settlementId: settlement.id,
                          reason,
                        }),
                      "Settlement placed on hold",
                    );
                  }}
                  onComplete={() => {
                    const reference =
                      references[`settlement:${settlement.id}`]?.trim() ?? "";
                    if (reference.length < 5) {
                      showAppAlert(
                        "Payout reference required",
                        "Transfer the settlement first, then enter its outgoing UPI/UTR reference.",
                      );
                      return;
                    }
                    void runAdminAction(
                      `settlement:${settlement.id}`,
                      () =>
                        settlementMutation.mutateAsync({
                          settlementId: settlement.id,
                          payoutReference: reference,
                        }),
                      "Settlement recorded",
                    );
                  }}
                />
              ))}
            </QueueSection>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ data }: { data: AdminDashboard }) {
  return (
    <MotionView style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.eyebrow}>FINANCE OVERVIEW</Text>
          <Text style={styles.sectionTitle}>Manual pilot ledger</Text>
        </View>
        <Feather name="activity" size={20} color={colors.primary} />
      </View>
      <View style={styles.metricGrid}>
        <Metric
          label="Verify"
          value={String(data.summary.pendingPaymentVerifications)}
        />
        <Metric label="Refund" value={String(data.summary.refundsRequired)} />
        <Metric
          label="Settle"
          value={String(data.summary.pendingSettlements)}
        />
        <Metric
          label="Pending payout"
          value={formatCurrency(data.summary.pendingSettlementAmount)}
        />
      </View>
      <View style={styles.revenueRow}>
        <Text style={styles.revenueLabel}>
          Recorded platform fees on paid deliveries
        </Text>
        <Text style={styles.revenueValue}>
          {formatCurrency(data.summary.platformFeesEarned)}
        </Text>
      </View>
    </MotionView>
  );
}

function QueueSection({
  eyebrow,
  title,
  count,
  emptyCopy,
  children,
}: {
  eyebrow: string;
  title: string;
  count: number;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>
      {count === 0 ? (
        <View style={styles.emptyQueue}>
          <Feather name="check-circle" size={17} color={colors.success} />
          <Text style={styles.emptyQueueText}>{emptyCopy}</Text>
        </View>
      ) : (
        <View style={styles.queueList}>{children}</View>
      )}
    </View>
  );
}

function VerificationCard({
  payment,
  busyKey,
  reason,
  setReason,
  onConfirm,
  onReject,
}: {
  payment: Verification;
  busyKey: string | null;
  reason: string;
  setReason: (value: string) => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <MotionView style={styles.queueCard}>
      <CardHeading
        title={`Order #${shortId(payment.orderId)}`}
        subtitle={payment.order.canteenName}
        amount={formatCurrency(payment.expectedAmount)}
      />
      <InfoLine label="Buyer" value={payment.order.buyer?.name ?? "Unknown"} />
      <InfoLine
        label="Method"
        value={
          payment.method === "PAY_AT_DELIVERY" ? "Pay at Delivery" : "Advance"
        }
      />
      <View style={styles.referenceBox}>
        <Text style={styles.referenceLabel}>SUBMITTED UPI / UTR</Text>
        <Text selectable style={styles.referenceValue}>
          {payment.submittedUtr ?? "Missing"}
        </Text>
      </View>
      {payment.order.status === "CANCELLED" ||
      payment.order.status === "FAILED" ? (
        <InlineNotice
          tone="warning"
          icon="rotate-ccw"
          title="Order already ended"
          copy="If this UTR matches a real bank credit, Verify will send it directly to the refund queue rather than reopening the order."
        />
      ) : null}
      <AppButton
        label="Verify Bank Credit"
        icon="check"
        loading={busyKey === `verify:${payment.id}`}
        disabled={busyKey !== null && busyKey !== `verify:${payment.id}`}
        onPress={onConfirm}
      />
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Reason if rejecting reference"
        placeholderTextColor={colors.faint}
        style={styles.input}
        maxLength={300}
      />
      <AppButton
        label="Reject Reference"
        icon="x"
        tone="warning"
        loading={busyKey === `reject:${payment.id}`}
        disabled={reason.trim().length < 3 || busyKey !== null}
        onPress={onReject}
      />
    </MotionView>
  );
}

function RefundCard({
  payment,
  busyKey,
  reference,
  setReference,
  onComplete,
}: {
  payment: Refund;
  busyKey: string | null;
  reference: string;
  setReference: (value: string) => void;
  onComplete: () => void;
}) {
  return (
    <MotionView style={styles.queueCard}>
      <CardHeading
        title={`Refund #${shortId(payment.orderId)}`}
        subtitle={payment.order.buyer?.name ?? "Buyer"}
        amount={formatCurrency(payment.expectedAmount)}
      />
      <InfoLine label="Order" value={payment.order.canteenName} />
      <InfoLine
        label="Incoming UTR"
        value={payment.submittedUtr ?? "Verified"}
      />
      <InlineNotice
        tone="warning"
        icon="arrow-up-right"
        title="Send money before marking complete"
        copy="The app does not move bank funds. Transfer the exact refund manually, then record the outgoing reference below."
      />
      <TextInput
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
        placeholder="Outgoing refund UTR / reference"
        placeholderTextColor={colors.faint}
        style={styles.input}
        maxLength={80}
      />
      <AppButton
        label="Mark Refund Sent"
        icon="check"
        loading={busyKey === `refund:${payment.id}`}
        disabled={reference.trim().length < 5 || busyKey !== null}
        onPress={onComplete}
      />
    </MotionView>
  );
}

function SettlementCard({
  settlement,
  busyKey,
  reference,
  setReference,
  holdReason,
  setHoldReason,
  onHold,
  onComplete,
}: {
  settlement: Settlement;
  busyKey: string | null;
  reference: string;
  setReference: (value: string) => void;
  holdReason: string;
  setHoldReason: (value: string) => void;
  onHold: () => void;
  onComplete: () => void;
}) {
  return (
    <MotionView style={styles.queueCard}>
      <CardHeading
        title={`Settlement #${shortId(settlement.orderId)}`}
        subtitle={settlement.deliverer?.name ?? "Deliverer"}
        amount={formatCurrency(settlement.amountDue)}
      />
      <InfoLine label="Canteen" value={settlement.order.canteenName} />
      <InfoLine
        label="Food reimbursement"
        value={formatCurrency(settlement.foodReimbursement)}
      />
      <InfoLine
        label="Delivery earning"
        value={formatCurrency(settlement.deliveryEarning)}
      />
      {settlement.status !== "PENDING" ? (
        <InlineNotice
          tone="warning"
          icon="alert-circle"
          title={`Settlement is ${settlement.status.toLowerCase().replace("_", " ")}`}
          copy={
            settlement.holdReason ??
            "Review this settlement before sending funds."
          }
        />
      ) : null}
      <TextInput
        value={holdReason}
        onChangeText={setHoldReason}
        placeholder={
          settlement.status === "ON_HOLD"
            ? "Update hold reason"
            : "Reason to put settlement on hold"
        }
        placeholderTextColor={colors.faint}
        style={styles.input}
        maxLength={300}
      />
      <AppButton
        label={
          settlement.status === "ON_HOLD" ? "Update Hold Reason" : "Put On Hold"
        }
        icon="pause-circle"
        tone="warning"
        loading={busyKey === `hold:${settlement.id}`}
        disabled={holdReason.trim().length < 3 || busyKey !== null}
        onPress={onHold}
      />
      <TextInput
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
        placeholder="Outgoing payout UTR / reference"
        placeholderTextColor={colors.faint}
        style={styles.input}
        maxLength={80}
      />
      <AppButton
        label="Mark Settlement Paid"
        icon="check"
        loading={busyKey === `settlement:${settlement.id}`}
        disabled={reference.trim().length < 5 || busyKey !== null}
        onPress={onComplete}
      />
    </MotionView>
  );
}

function CardHeading({
  title,
  subtitle,
  amount,
}: {
  title: string;
  subtitle: string;
  amount: string;
}) {
  return (
    <View style={styles.cardHeading}>
      <View style={styles.cardHeadingCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.cardAmount}>{amount}</Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  adminBadge: {
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
  adminBadgeText: {
    color: colors.primaryStrong,
    fontSize: 9,
    fontWeight: "900",
  },
  cardAmount: { color: colors.success, fontSize: 16, fontWeight: "900" },
  cardHeading: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  cardHeadingCopy: { flex: 1 },
  cardSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  centerState: { flex: 1, justifyContent: "center", padding: 22 },
  content: { gap: 18, padding: 18, paddingBottom: 40 },
  countPill: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    minWidth: 34,
    paddingHorizontal: 9,
  },
  countText: { color: colors.primaryStrong, fontSize: 11, fontWeight: "900" },
  emptyQueue: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 14,
  },
  emptyQueueText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
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
  infoLabel: { color: colors.muted, fontSize: 11 },
  infoLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  infoValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 13,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  metric: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    width: "48%",
  },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricLabel: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
    textTransform: "uppercase",
  },
  metricValue: { color: colors.text, fontSize: 17, fontWeight: "900" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  queueCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 11,
    padding: 15,
    ...shadow,
  },
  queueList: { gap: 12 },
  referenceBox: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
  referenceLabel: { color: colors.faint, fontSize: 9, fontWeight: "900" },
  referenceValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  revenueLabel: { color: colors.muted, flex: 1, fontSize: 11 },
  revenueRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
  },
  revenueValue: { color: colors.success, fontSize: 14, fontWeight: "900" },
  root: { backgroundColor: colors.bg, flex: 1 },
  section: { gap: 10 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    ...shadow,
  },
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
