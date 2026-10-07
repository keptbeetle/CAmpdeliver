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
import { useQuery } from "@tanstack/react-query";

import { ShellHeader } from "~/components/app/ShellHeader";
import {
  colors,
  formatCurrency,
  radius,
  shadow,
  shortId,
} from "~/components/app/theme";
import {
  EmptyState,
  InlineNotice,
  LoadingState,
  MotionView,
  SectionCard,
} from "~/components/app/ui";
import { trpc } from "~/utils/api";

export default function EarningsTab() {
  const insets = useSafeAreaInsets();
  const earnings = useQuery(trpc.payment.earnings.queryOptions());

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader
        title="Earnings"
        subtitle="Completed deliveries and what you earned"
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
            title="Loading your earnings"
            copy="Calculating completed Pay on Delivery orders."
          />
        ) : earnings.isError || !earnings.data ? (
          <EmptyState
            icon="alert-circle"
            title="Earnings could not be loaded"
            copy="Your order history is safe. Pull down or retry when your connection is available."
            actionLabel="Retry"
            onAction={() => void earnings.refetch()}
          />
        ) : !earnings.data.databaseReady ? (
          <EmptyState
            icon="database"
            title="Server upgrade pending"
            copy="Earnings will appear after the direct Pay on Delivery database migration is applied."
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
                Only delivery fees from completed orders count as earnings. Food
                money is recovered directly from the buyer at handover.
              </Text>
            </MotionView>

            <View style={styles.metricsGrid}>
              <MetricCard
                icon="package"
                label="Completed deliveries"
                value={String(earnings.data.completedDeliveries)}
              />
              <MetricCard
                icon="dollar-sign"
                label="Delivery fees earned"
                value={formatCurrency(earnings.data.lifetimeEarnings)}
              />
            </View>

            <InlineNotice
              icon="shield"
              tone="success"
              title="Paid directly at handover"
              copy="You pay the canteen yourself, then collect the food cost plus your delivery fee directly from the buyer after OTP verification. CAmpDeliver never holds your money."
            />

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Completed deliveries</Text>
              <Text style={styles.sectionSubtitle}>
                Recent direct Pay on Delivery orders
              </Text>
            </View>

            {earnings.data.completedDirectDeliveries.length === 0 ? (
              <EmptyState
                icon="navigation"
                title="No delivery earnings yet"
                copy="Completed deliveries will appear here after the buyer's payment is confirmed."
              />
            ) : (
              <View style={styles.list}>
                {earnings.data.completedDirectDeliveries
                  .slice(0, 20)
                  .map((entry, index) => (
                    <MotionView
                      key={entry.id}
                      delay={Math.min(index * 35, 180)}
                    >
                      <SectionCard style={styles.orderCard}>
                        <View style={styles.orderHeader}>
                          <View style={styles.referenceRow}>
                            <View style={styles.smallIcon}>
                              <Feather
                                name="check-circle"
                                size={15}
                                color={colors.success}
                              />
                            </View>
                            <View style={styles.orderTitleWrap}>
                              <Text style={styles.reference}>
                                Order {shortId(entry.id)}
                              </Text>
                              <Text numberOfLines={1} style={styles.dateText}>
                                {entry.canteenName}
                                {entry.paymentReceivedAt
                                  ? " · " +
                                    new Date(
                                      entry.paymentReceivedAt,
                                    ).toLocaleDateString()
                                  : ""}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.earnedBadge}>
                            +{formatCurrency(entry.deliveryFee)}
                          </Text>
                        </View>
                        <View style={styles.moneyRows}>
                          <MoneyRow
                            label="Paid at canteen"
                            value={entry.foodPrice}
                          />
                          <MoneyRow
                            label="Collected from buyer"
                            value={entry.totalAmount}
                          />
                          <View style={styles.divider} />
                          <MoneyRow
                            label="Your earning"
                            value={entry.deliveryFee}
                            strong
                          />
                        </View>
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

const styles = StyleSheet.create({
  content: { gap: 14, padding: 16 },
  dateText: { color: colors.faint, fontSize: 11, marginTop: 2 },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: 2 },
  earnedBadge: { color: colors.success, fontSize: 13, fontWeight: "900" },
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
  list: { gap: 10 },
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
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moneyLabel: { color: colors.muted, fontSize: 12 },
  moneyLabelStrong: { color: colors.text, fontWeight: "700" },
  moneyRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  moneyRows: { gap: 9 },
  moneyValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  moneyValueStrong: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "900",
  },
  orderCard: { gap: 14 },
  orderHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderTitleWrap: { flexShrink: 1 },
  reference: { color: colors.text, fontSize: 13, fontWeight: "800" },
  referenceRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
  },
  root: { backgroundColor: colors.bg, flex: 1 },
  sectionHeading: { marginTop: 4 },
  sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  smallIcon: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
});
