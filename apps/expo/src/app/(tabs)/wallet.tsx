import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { colors, formatCurrency } from "~/components/app/theme";
import { trpc } from "~/utils/api";

export default function WalletTab() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");

  const { data: profile, isLoading } = useQuery(
    trpc.auth.getMyProfile.queryOptions(),
  );

  const topUpMutation = useMutation(
    trpc.wallet.topUp.mutationOptions({
      onSuccess: () => {
        setAmount("");
        setUtr("");
        void queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
        Alert.alert("Success", "Wallet topped up successfully!");
      },
      onError: (err) => {
        Alert.alert("Top-Up Failed", err.message || "Failed to top up wallet.");
      },
    }),
  );

  const handleTopUp = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }
    if (utr.trim().length < 5) {
      Alert.alert(
        "Invalid UTR",
        "Please enter a valid UTR number (min 5 chars).",
      );
      return;
    }

    // Convert to paise
    const amountInPaise = Math.round(amountNum * 100);
    topUpMutation.mutate({ amount: amountInPaise, utrNumber: utr.trim() });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ShellHeader title="My Wallet" subtitle="Manage your campus funds" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Digital Wallet Card */}
          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <View>
                <Text style={styles.walletTitle}>Current Balance</Text>
                <Text style={styles.walletSubtitle}>Campus Digital Wallet</Text>
              </View>
              <Feather
                name="credit-card"
                size={28}
                color="rgba(255,255,255,0.4)"
              />
            </View>
            <View style={styles.walletBalanceWrap}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.walletBalanceText}>
                  {formatCurrency(profile?.walletBalance ?? 0)}
                </Text>
              )}
            </View>
          </View>

          {/* Top-up Form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Top Up Wallet</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 100"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>UTR Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter mock UTR"
                placeholderTextColor={colors.muted}
                value={utr}
                onChangeText={setUtr}
              />
            </View>

            <Pressable
              onPress={handleTopUp}
              disabled={topUpMutation.isPending}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && styles.pressed,
                topUpMutation.isPending && styles.disabled,
              ]}
            >
              <Text style={styles.submitText}>
                {topUpMutation.isPending ? "Processing..." : "Submit Top Up"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.6,
  },
  formCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    padding: 20,
  },
  formTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  input: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  keyboardView: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 150,
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 16,
  },
  submitText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  walletBalanceText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  walletBalanceWrap: {
    alignItems: "flex-start",
    marginTop: 24,
    minHeight: 40,
  },
  walletCard: {
    backgroundColor: "#1e1b4b", // deep purple background
    borderColor: "#4c1d95",
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 24,
    padding: 24,
  },
  walletHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  walletSubtitle: {
    color: "#a78bfa",
    fontSize: 13,
    marginTop: 4,
  },
  walletTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
