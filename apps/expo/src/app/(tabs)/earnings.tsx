import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
import { showAppAlert } from "~/utils/dialog";

export default function EarningsTab() {
  const insets = useSafeAreaInsets();
  const earnings = useQuery(trpc.payment.earnings.queryOptions());
  const requestSettlement = useMutation(
    trpc.payment.requestSettlement.mutationOptions({
      onSuccess: () => void earnings.refetch(),
      onError: (error) =>
        showAppAlert("Could not request reimbursement", error.message),
    }),
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader
        title="Earnings"
        subtitle="Delivery earnings, reimbursements, and settlements"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(100, insets.bottom + 86) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={earnings.isRefetching}
            onRefresh={() => void earnings.refetch()}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {earnings.isLoading ? (
          <LoadingState
            title="Loading your delivery activity"
            copy="Calculating completed deliveries and settlement totals."
          />
        ) : earnings.isError || !earnings.data ? (
          <EmptyState
            icon="alert-circle"
            title="Earnings could not be loaded"
            copy="Your settlement data has not been changed. Pull down or retry when your connection is available."
            actionLabel="Retry"
            onAction={() => void earnings.refetch()}
          />
        ) : !earnings.data.databaseReady ? (
          <EmptyState
            icon="database"
            title="Payment upgrade pending"
            copy="Your connection is working. Earnings will appear after the CAmpDeliver server database is upgraded to the new payment and settlement schema."
            actionLabel="Check again"
            onAction={() => void earnings.refetch()}
          />
        ) : (
          <>
            <MotionView style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.eyebrow}>Lifetime delivery earnings</Text>
                  <Text style={styles.heroAmount}>
                    {formatCurrency(earnings.data.lifetimeEarnings)}
                  </Text>
                </View>
                <View style={styles.heroIcon}>
                  <Feather
                    name="trending-up"
                    size={22}
                    color={colors.primary}
                  />
                </View>
              </View>
              <Text style={styles.heroHelper}>
                Earnings count only the delivery fee you earned. Money spent on
                food is tracked separately as reimbursement.
              </Text>
            </MotionView>

            <View style={styles.metricsGrid}>
              <MetricCard
                icon="check-circle"
                label="Paid earnings"
                value={formatCurrency(earnings.data.paidEarnings)}
              />
              <MetricCard
                icon="shopping-bag"
                label="Food reimbursed"
                value={formatCurrency(earnings.data.foodReimbursed)}
              />
              <MetricCard
                icon="download"
                label="Ready to request"
                value={formatCurrency(earnings.data.availableSettlementAmount)}
              />
              <MetricCard
                icon="clock"
                label="Pending settlement"
                value={formatCurrency(earnings.data.pendingSettlementAmount)}
              />
              <MetricCard
                icon="check"
                label="Paid settlements"
                value={String(earnings.data.paidSettlements)}
              />
              <MetricCard
                icon="arrow-up-right"
                label="Paid settlement total"
                value={formatCurrency(earnings.data.paidSettlementAmount)}
              />
              <MetricCard
                icon="package"
                label="Deliveries"
                value={String(earnings.data.completedDeliveries)}
              />
            </View>

            {earnings.data.availableSettlementAmount > 0 ? (
              <InlineNotice
                icon="download"
                title="Reimbursement ready to request"
                copy="A completed delivery has money ready for reimbursement. Request it below and the admin will see it in the nightly settlement queue."
              />
            ) : earnings.data.pendingSettlementAmount > 0 ? (
              <InlineNotice
                icon="clock"
                tone="warning"
                title="Settlement requested"
                copy="Your reimbursement request is in the admin settlement queue. The pilot records the outgoing transfer reference when it is paid."
              />
            ) : (
              <InlineNotice
                icon="shield"
                tone="success"
                title="No settlement is waiting"
                copy="A completed delivery creates a reimbursement record here after verified payment and handover. You choose when to request the transfer."
              />
            )}

            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Recent settlements</Text>
                <Text style={styles.sectionSubtitle}>
                  System-generated records for deliveries you completed
                </Text>
              </View>
              {earnings.data.paidSettlements > 0 ? (
                <Text style={styles.paidCount}>
                  {earnings.data.paidSettlements} paid
                </Text>
              ) : null}
            </View>

            {earnings.data.recent.length === 0 ? (
              <EmptyState
                icon="navigation"
                title="No delivery earnings yet"
                copy="Every student account can buy or deliver. Your settlement history will appear here after you complete a delivery."
              />
            ) : (
              <View style={styles.list}>
                {earnings.data.recent.map((entry, index) => (
                  <MotionView key={entry.id} delay={Math.min(index * 35, 180)}>
                    <SectionCard style={styles.settlementCard}>
                      <View style={styles.settlementHeader}>
                        <View style={styles.referenceRow}>
                          <View style={styles.smallIcon}>
                            <Feather
                              name="package"
                              size={15}
                              color={colors.primary}
                            />
                          </View>
                          <View>
                            <Text style={styles.reference}>
                              Order {shortId(entry.orderId)}
                            </Text>
                            <Text style={styles.dateText}>
                              {new Date(entry.createdAt).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                        <SettlementBadge status={entry.status} />
                      </View>

                      <View style={styles.moneyRows}>
                        <MoneyRow
                          label="Food reimbursement"
                          value={entry.foodReimbursement}
                        />
                        <MoneyRow
                          label="Delivery earning"
                          value={entry.deliveryEarning}
                          strong
                        />
                        <View style={styles.divider} />
                        <MoneyRow
                          label="Settlement total"
                          value={entry.amountDue}
                          strong
                        />
                      </View>

                      {entry.status === "AVAILABLE" ? (
                        <AppButton
                          label="Request Reimbursement"
                          icon="download"
                          loading={
                            requestSettlement.isPending &&
                            requestSettlement.variables.settlementId ===
                              entry.id
                          }
                          disabled={requestSettlement.isPending}
                          onPress={() =>
                            requestSettlement.mutate({ settlementId: entry.id })
                          }
                        />
                      ) : null}

                      {entry.status === "ON_HOLD" && entry.holdReason ? (
                        <InlineNotice
                          icon="alert-triangle"
                          tone="warning"
                          title="Settlement on hold"
                          copy={entry.holdReason}
                        />
                      ) : entry.status === "FAILED" ? (
                        <InlineNotice
                          icon="alert-circle"
                          tone="warning"
                          title="Transfer needs admin attention"
                          copy="The delivery is still complete. Only the outgoing settlement needs to be retried."
                        />
                      ) : null}
                    </SectionCard>
                  </MotionView>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Feather name={icon} size={17} color={colors.primary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, strong && styles.moneyLabelStrong]}>
        {label}
      </Text>
      <Text style={[styles.moneyValue, strong && styles.moneyValueStrong]}>
        {formatCurrency(value)}
      </Text>
    </View>
  );
}

function SettlementBadge({ status }: { status: string }) {
  const label =
    status === "PAID"
      ? "Paid"
      : status === "AVAILABLE"
        ? "Ready"
        : status === "ON_HOLD"
          ? "On hold"
          : status === "FAILED"
            ? "Failed"
            : "Pending";
  const positive = status === "PAID";
  return (
    <View style={[styles.badge, positive && styles.badgePaid]}>
      <Text style={[styles.badgeText, positive && styles.badgeTextPaid]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.warningSoft,
    borderColor: "#E8CFAD",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgePaid: {
    backgroundColor: colors.successSoft,
    borderColor: "#B7DEC8",
  },
  badgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: "800",
  },
  badgeTextPaid: {
    color: colors.success,
  },
  content: {
    gap: 14,
    padding: 16,
  },
  dateText: {
    color: colors.faint,
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 2,
  },
  eyebrow: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroAmount: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 4,
  },
  heroCard: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 18,
    ...shadow,
  },
  heroHelper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  heroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  list: {
    gap: 10,
  },
  metricCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 108,
    padding: 14,
    ...shadow,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 11,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  moneyLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  moneyLabelStrong: {
    color: colors.text,
    fontWeight: "700",
  },
  moneyRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  moneyRows: {
    gap: 9,
  },
  moneyValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  moneyValueStrong: {
    fontSize: 13,
    fontWeight: "900",
  },
  paidCount: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
  },
  reference: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  referenceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  settlementCard: {
    gap: 14,
  },
  settlementHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  smallIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
});
