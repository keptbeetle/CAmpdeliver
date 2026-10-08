import { useMemo, useState } from "react";
import {
  RefreshControl,
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
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ShellHeader } from "~/components/app/ShellHeader";
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
  SectionCard,
} from "~/components/app/ui";
import { trpc } from "~/utils/api";
import { confirmAppAction, showAppAlert } from "~/utils/dialog";

type Filter = "ALL" | "ACTIVE" | "COMPLETED" | "PROBLEMS" | "CANCELLED";

const ACTIVE = new Set([
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
  "PAYMENT_DUE",
]);

export default function AdminOrderOperationsScreen() {
  const insets = useSafeAreaInsets();
  const dashboard = useQuery(trpc.payment.adminDashboard.queryOptions());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const resolveIssue = useMutation(
    trpc.payment.adminResolvePaymentIssue.mutationOptions({
      onSuccess: () => void dashboard.refetch(),
      onError: (error) =>
        showAppAlert("Could not resolve issue", error.message),
    }),
  );

  const orders = useMemo(() => {
    const source = dashboard.data?.orderOperations ?? [];
    if (filter === "ACTIVE") {
      return source.filter((order) => ACTIVE.has(order.status));
    }
    if (filter === "COMPLETED") {
      return source.filter((order) => order.status === "DELIVERED");
    }
    if (filter === "PROBLEMS") {
      return source.filter(
        (order) => order.paymentIssueAt && !order.paymentIssueResolvedAt,
      );
    }
    if (filter === "CANCELLED") {
      return source.filter((order) => order.status === "CANCELLED");
    }
    return source;
  }, [dashboard.data?.orderOperations, filter]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader
        title="Order operations"
        subtitle="Full delivery lifecycle and handover issues"
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(80, insets.bottom + 40) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching}
            onRefresh={() => void dashboard.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {dashboard.isLoading ? (
          <LoadingState
            title="Loading order operations"
            copy="Fetching recent orders and handover states."
          />
        ) : dashboard.isError || !dashboard.data ? (
          <EmptyState
            icon="alert-circle"
            title="Order operations unavailable"
            copy="Check the connection and retry. No order data was changed."
            actionLabel="Retry"
            onAction={() => void dashboard.refetch()}
          />
        ) : !dashboard.data.databaseReady ? (
          <EmptyState
            icon="database"
            title="Server upgrade pending"
            copy="Order operations will become available after the direct Pay on Delivery migration is applied."
            actionLabel="Check again"
            onAction={() => void dashboard.refetch()}
          />
        ) : (
          <>
            <View style={styles.metrics}>
              <Metric
                label="Active"
                value={dashboard.data.summary.activeOrders}
                icon="activity"
              />
              <Metric
                label="Completed"
                value={dashboard.data.summary.deliveredOrders}
                icon="check-circle"
              />
              <Metric
                label="Problems"
                value={dashboard.data.summary.unresolvedIssues}
                icon="alert-triangle"
              />
              <Metric
                label="Total"
                value={dashboard.data.summary.totalOrders}
                icon="package"
              />
            </View>

            <InlineNotice
              icon="shield"
              tone="success"
              title="Direct Pay on Delivery"
              copy="CAmpDeliver does not hold or settle money for new orders. Admin operations focus on order state, OTP handover and unresolved payment issues."
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                [
                  "ALL",
                  "ACTIVE",
                  "COMPLETED",
                  "PROBLEMS",
                  "CANCELLED",
                ] as Filter[]
              ).map((item) => (
                <AppButton
                  key={item}
                  label={
                    item === "ALL"
                      ? "All"
                      : item.charAt(0) + item.slice(1).toLowerCase()
                  }
                  tone={filter === item ? "primary" : "secondary"}
                  onPress={() => setFilter(item)}
                />
              ))}
            </ScrollView>

            {orders.length === 0 ? (
              <EmptyState
                icon="inbox"
                title="No orders in this view"
                copy="Change the filter or pull down to refresh."
              />
            ) : (
              <View style={styles.list}>
                {orders.map((order, index) => {
                  const issueOpen = Boolean(
                    order.paymentIssueAt && !order.paymentIssueResolvedAt,
                  );
                  const resolution = resolutions[order.id] ?? "";
                  const canCompletePaid =
                    order.status === "PAYMENT_DUE" &&
                    Boolean(order.otpVerifiedAt) &&
                    !order.paymentReceivedAt;
                  const canCloseFailed =
                    Boolean(order.purchasedAt) &&
                    [
                      "PURCHASED",
                      "ON_THE_WAY",
                      "NEAR_YOU",
                      "PAYMENT_DUE",
                    ].includes(order.status) &&
                    !order.paymentReceivedAt;
                  return (
                    <MotionView
                      key={order.id}
                      delay={Math.min(index * 25, 150)}
                    >
                      <SectionCard style={styles.orderCard}>
                        <View style={styles.orderTop}>
                          <View style={styles.orderTitleWrap}>
                            <Text style={styles.orderTitle}>
                              Order {shortId(order.id)}
                            </Text>
                            <Text style={styles.orderSub}>
                              {order.canteenName} · {order.paymentModel}
                            </Text>
                          </View>
                          <StatusBadge
                            status={order.status}
                            problem={issueOpen}
                          />
                        </View>

                        <View style={styles.participants}>
                          <InfoLine label="Buyer" value={order.buyer.name} />
                          <InfoLine
                            label="Buyer contact"
                            value={order.buyer.phoneNumber ?? order.buyer.email}
                          />
                          <InfoLine
                            label="Deliverer"
                            value={
                              order.deliverer?.name ??
                              order.deliverer?.email ??
                              (order.deliverer
                                ? shortId(order.deliverer.id)
                                : "Not assigned")
                            }
                          />
                          <InfoLine
                            label="Deliverer contact"
                            value={
                              order.deliverer?.phoneNumber ??
                              order.deliverer?.email ??
                              "—"
                            }
                          />
                          <InfoLine
                            label="Drop-off"
                            value={order.deliveryLocationName}
                          />
                          <InfoLine
                            label="Drop-off coordinates"
                            value={
                              order.deliveryLatitude.toFixed(5) +
                              ", " +
                              order.deliveryLongitude.toFixed(5)
                            }
                          />
                          <InfoLine
                            label="Canteen coordinates"
                            value={
                              order.canteenLatitude.toFixed(5) +
                              ", " +
                              order.canteenLongitude.toFixed(5)
                            }
                          />
                        </View>

                        <View style={styles.itemsPanel}>
                          <Text style={styles.itemsTitle}>Items</Text>
                          {order.items.map((item) => (
                            <InfoLine
                              key={item.menuItemId}
                              label={item.quantity + "× " + item.name}
                              value={formatCurrency(item.price * item.quantity)}
                            />
                          ))}
                        </View>

                        <View style={styles.moneyPanel}>
                          <MoneyLine label="Food" value={order.foodPrice} />
                          <MoneyLine
                            label="Delivery fee"
                            value={order.deliveryFee}
                          />
                          <MoneyLine
                            label="Buyer total"
                            value={order.totalAmount}
                            strong
                          />
                        </View>

                        <View style={styles.timeline}>
                          <TimelineLine
                            label="Created"
                            value={formatDate(order.createdAt)}
                          />
                          <TimelineLine
                            label="Accepted"
                            value={formatDate(order.acceptedAt)}
                          />
                          <TimelineLine
                            label="Items available"
                            value={formatDate(order.itemsAvailableAt)}
                          />
                          <TimelineLine
                            label="Purchased"
                            value={formatDate(order.purchasedAt)}
                          />
                          <TimelineLine
                            label="OTP verified"
                            value={formatDate(order.otpVerifiedAt)}
                          />
                          <TimelineLine
                            label="Payment received"
                            value={formatDate(order.paymentReceivedAt)}
                          />
                          <TimelineLine
                            label="Completed"
                            value={formatDate(order.deliveredAt)}
                          />
                        </View>

                        {issueOpen ? (
                          <View style={styles.issuePanel}>
                            <InlineNotice
                              icon="alert-triangle"
                              tone="warning"
                              title="Handover payment issue"
                              copy={
                                order.paymentIssueReason ??
                                "Payment has not been confirmed."
                              }
                            />
                            <TextInput
                              value={resolution}
                              onChangeText={(value) =>
                                setResolutions((current) => ({
                                  ...current,
                                  [order.id]: value,
                                }))
                              }
                              placeholder="Admin resolution note"
                              placeholderTextColor={colors.faint}
                              multiline
                              style={styles.resolutionInput}
                            />
                            <AppButton
                              label="Save resolution note"
                              icon="file-text"
                              tone="secondary"
                              loading={
                                resolveIssue.isPending &&
                                resolveIssue.variables.orderId === order.id &&
                                resolveIssue.variables.outcome === "NOTE_ONLY"
                              }
                              disabled={
                                resolveIssue.isPending ||
                                resolution.trim().length < 3
                              }
                              onPress={() =>
                                resolveIssue.mutate({
                                  orderId: order.id,
                                  resolution: resolution.trim(),
                                  outcome: "NOTE_ONLY",
                                })
                              }
                            />
                            {canCompletePaid ? (
                              <AppButton
                                label="Resolve as paid & complete"
                                icon="check-circle"
                                loading={
                                  resolveIssue.isPending &&
                                  resolveIssue.variables.orderId === order.id &&
                                  resolveIssue.variables.outcome ===
                                    "COMPLETE_PAID"
                                }
                                disabled={
                                  resolveIssue.isPending ||
                                  resolution.trim().length < 3
                                }
                                onPress={() =>
                                  confirmAppAction({
                                    title: "Complete this order as paid?",
                                    message:
                                      "The OTP was verified. This records buyer payment as received, completes the order, and counts the delivery fee as earned.",
                                    cancelLabel: "Cancel",
                                    confirmLabel: "Complete as paid",
                                    onConfirm: () =>
                                      resolveIssue.mutate({
                                        orderId: order.id,
                                        resolution: resolution.trim(),
                                        outcome: "COMPLETE_PAID",
                                      }),
                                  })
                                }
                              />
                            ) : null}
                            {canCloseFailed ? (
                              <AppButton
                                label="Close order as failed"
                                icon="x-circle"
                                tone="danger"
                                loading={
                                  resolveIssue.isPending &&
                                  resolveIssue.variables.orderId === order.id &&
                                  resolveIssue.variables.outcome ===
                                    "CLOSE_FAILED"
                                }
                                disabled={
                                  resolveIssue.isPending ||
                                  resolution.trim().length < 3
                                }
                                onPress={() =>
                                  confirmAppAction({
                                    title: "Close this order as failed?",
                                    message:
                                      "This is a terminal exception action. It releases the buyer and deliverer from the active order but does not record payment or delivery earnings.",
                                    cancelLabel: "Keep open",
                                    confirmLabel: "Close as failed",
                                    destructive: true,
                                    onConfirm: () =>
                                      resolveIssue.mutate({
                                        orderId: order.id,
                                        resolution: resolution.trim(),
                                        outcome: "CLOSE_FAILED",
                                      }),
                                  })
                                }
                              />
                            ) : null}
                          </View>
                        ) : order.paymentIssueResolvedAt ? (
                          <InlineNotice
                            icon="check-circle"
                            tone="success"
                            title="Issue resolved"
                            copy={
                              order.paymentIssueResolution ??
                              "Admin marked this issue resolved."
                            }
                          />
                        ) : null}

                        {order.cancellationReason ? (
                          <InlineNotice
                            icon="x-circle"
                            tone="warning"
                            title="Order cancelled"
                            copy={order.cancellationReason}
                          />
                        ) : null}
                      </SectionCard>
                    </MotionView>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={styles.metric}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({
  status,
  problem,
}: {
  status: string;
  problem: boolean;
}) {
  return (
    <View style={[styles.badge, problem && styles.badgeProblem]}>
      <Text style={[styles.badgeText, problem && styles.badgeTextProblem]}>
        {problem ? "Problem" : status.replaceAll("_", " ")}
      </Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function MoneyLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <View style={styles.infoLine}>
      <Text style={[styles.infoLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.infoValue, strong && styles.strong]}>
        {formatCurrency(value)}
      </Text>
    </View>
  );
}

function TimelineLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timelineLine}>
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeProblem: { backgroundColor: colors.warningSoft },
  badgeText: {
    color: colors.primaryStrong,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  badgeTextProblem: { color: colors.warning },
  content: { gap: 14, padding: 16 },
  filterRow: { gap: 8, paddingRight: 12 },
  infoLabel: { color: colors.muted, fontSize: 11 },
  infoLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  infoValue: {
    color: colors.text,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  issuePanel: { gap: 10 },
  itemsPanel: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 7,
    padding: 12,
  },
  itemsTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 2,
  },
  list: { gap: 10 },
  metric: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 13,
    ...shadow,
  },
  metricLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moneyPanel: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    gap: 7,
    padding: 12,
  },
  orderCard: { gap: 13 },
  orderSub: { color: colors.muted, fontSize: 10, marginTop: 3 },
  orderTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  orderTitleWrap: { flex: 1 },
  orderTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  participants: { gap: 8 },
  resolutionInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12,
    minHeight: 76,
    padding: 12,
    textAlignVertical: "top",
  },
  root: { backgroundColor: colors.bg, flex: 1 },
  strong: { color: colors.success, fontWeight: "900" },
  timeline: {
    borderLeftColor: colors.border,
    borderLeftWidth: 2,
    gap: 7,
    paddingLeft: 11,
  },
  timelineLabel: { color: colors.muted, fontSize: 10 },
  timelineLine: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timelineValue: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
});
