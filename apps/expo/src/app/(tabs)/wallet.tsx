import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ShellHeader } from "~/components/app/ShellHeader";
import { colors, formatCurrency, radius, shadow } from "~/components/app/theme";
import {
  AppButton,
  InlineNotice,
  MotionView,
  SkeletonBlock,
} from "~/components/app/ui";
import { trpc } from "~/utils/api";

export default function WalletTab() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning";
    title: string;
    copy: string;
  } | null>(null);

  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useQuery(trpc.auth.getMyProfile.queryOptions());

  const topUpMutation = useMutation(trpc.wallet.topUp.mutationOptions());

  const handleTopUp = async () => {
    setFeedback(null);
    const amountNumber = Number.parseFloat(amount);
    if (Number.isNaN(amountNumber) || amountNumber <= 0) {
      setFeedback({
        tone: "warning",
        title: "Enter a valid amount",
        copy: "Use a positive amount in rupees.",
      });
      return;
    }
    if (utr.trim().length < 5) {
      setFeedback({
        tone: "warning",
        title: "Reference is too short",
        copy: "Enter at least 5 characters for the test UTR reference.",
      });
      return;
    }

    try {
      await topUpMutation.mutateAsync({
        amount: Math.round(amountNumber * 100),
        utrNumber: utr.trim(),
      });
      setAmount("");
      setUtr("");
      await queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyProfile.queryKey(),
      });
      setFeedback({
        tone: "success",
        title: "Test balance updated",
        copy: "The demo top-up was accepted by the current backend.",
      });
    } catch (error) {
      setFeedback({
        tone: "warning",
        title: "Top-up was not applied",
        copy:
          error instanceof Error
            ? error.message
            : "Check the reference and try again.",
      });
    }
  };

  const walletBalance = profile?.walletBalance ?? 0;
  const frozenBalance = profile?.frozenBalance ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader title="Wallet" subtitle="Campus balance and order holds" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <View style={styles.walletSkeleton}>
              <SkeletonBlock height={18} width="38%" />
              <SkeletonBlock height={38} width="58%" />
              <SkeletonBlock height={54} />
            </View>
          ) : isError ? (
            <View style={styles.errorCard}>
              <InlineNotice
                tone="warning"
                icon="wifi-off"
                title="Wallet could not be loaded"
                copy="Your balance has not been changed. Retry when your connection is available."
              />
              <AppButton
                label="Retry"
                tone="secondary"
                onPress={() => void refetch()}
              />
            </View>
          ) : (
            <MotionView style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <View>
                  <Text style={styles.walletEyebrow}>Current Balance</Text>
                  <Text style={styles.walletBalanceText}>
                    {formatCurrency(walletBalance)}
                  </Text>
                </View>
                <View style={styles.walletIcon}>
                  <Feather
                    name="credit-card"
                    size={21}
                    color={colors.primary}
                  />
                </View>
              </View>

              <View style={styles.balanceGrid}>
                <BalanceItem
                  icon="check-circle"
                  label="Spendable"
                  value={formatCurrency(walletBalance)}
                />
                <BalanceItem
                  icon="lock"
                  label="Held for orders"
                  value={formatCurrency(frozenBalance)}
                />
              </View>
            </MotionView>
          )}

          <InlineNotice
            tone="warning"
            icon="tool"
            title="Test wallet only"
            copy="This build does not verify UPI/UTR payments with a payment provider. A submitted unique reference can credit this demo wallet immediately, so do not use it for real money."
          />

          <MotionView style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}>
                <Feather name="plus" size={17} color={colors.primary} />
              </View>
              <View style={styles.formCopy}>
                <Text style={styles.formTitle}>Add test balance</Text>
                <Text style={styles.formSubtitle}>
                  Use this only to exercise the order flow in
                  development/testing.
                </Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount in rupees</Text>
              <View style={styles.moneyInputWrap}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.moneyInput}
                  placeholder="e.g. 100"
                  placeholderTextColor={colors.faint}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(value) =>
                    setAmount(value.replace(/[^0-9.]/g, ""))
                  }
                  editable={!topUpMutation.isPending}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Test UTR / reference</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter mock UTR"
                placeholderTextColor={colors.faint}
                value={utr}
                autoCapitalize="characters"
                onChangeText={setUtr}
                editable={!topUpMutation.isPending}
              />
            </View>

            {feedback ? (
              <InlineNotice
                tone={feedback.tone}
                icon={
                  feedback.tone === "success" ? "check-circle" : "alert-circle"
                }
                title={feedback.title}
                copy={feedback.copy}
              />
            ) : null}

            <AppButton
              label="Submit Top Up"
              icon="plus"
              loading={topUpMutation.isPending}
              onPress={() => void handleTopUp()}
            />
          </MotionView>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="shield" size={17} color={colors.primary} />
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Order holds</Text>
                <Text style={styles.infoText}>
                  When a rider confirms item availability, the current order
                  total moves from available balance into the held balance until
                  delivery settles.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BalanceItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.balanceItem}>
      <Feather name={icon} size={15} color={colors.primary} />
      <View style={styles.balanceCopy}>
        <Text style={styles.balanceLabel}>{label}</Text>
        <Text style={styles.balanceValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceCopy: {
    flex: 1,
  },
  balanceGrid: {
    flexDirection: "row",
    gap: 9,
    marginTop: 22,
  },
  balanceItem: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    padding: 11,
  },
  balanceLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  balanceValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 2,
  },
  currencyPrefix: {
    color: colors.primaryStrong,
    fontSize: 18,
    fontWeight: "900",
    paddingLeft: 13,
  },
  errorCard: {
    gap: 12,
  },
  formCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 16,
    padding: 18,
    ...shadow,
  },
  formCopy: {
    flex: 1,
  },
  formHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  formIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  formSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  formTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  infoCard: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  infoCopy: {
    flex: 1,
  },
  infoRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  infoText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  infoTitle: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  keyboardView: {
    flex: 1,
  },
  moneyInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 8,
  },
  moneyInputWrap: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 108,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  walletBalanceText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 4,
  },
  walletCard: {
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 18,
    ...shadow,
  },
  walletEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  walletHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  walletIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  walletSkeleton: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
});
