import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import { colors } from "~/components/app/theme";
import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (phone.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return phone.includes("+") ? phone : `+91${phone}`;
}

export default function AuthScreen() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [hostelName, setHostelName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [timer, setTimer] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const otpInputRef = useRef<TextInput>(null);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const sendOtpMutation = useMutation(trpc.otp.sendOtp.mutationOptions());
  const verifyOtpMutation = useMutation(
    trpc.otp.verifyOtpAndSignup.mutationOptions(),
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
      if (data.session) router.replace("/" as never);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);
      if (nextSession) router.replace("/" as never);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (timer <= 0 || session) return;
    const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer, session]);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const setError = (message: string) => {
    setAuthError(message);
    triggerShake();
  };

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const formattedEmail = `${sanitizePhone(phone)}@campus.edu`.toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password,
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (
      !name.trim() ||
      !hostelName.trim() ||
      !phone.trim() ||
      !password.trim()
    ) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setAuthError(null);
    setAuthLoading(true);
    try {
      await sendOtpMutation.mutateAsync({ phoneNumber: sanitizePhone(phone) });
      setStep(2);
      setOtpCode("");
      setTimer(300);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send verification code.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const sanitizedPhone = sanitizePhone(phone);
      const result = await verifyOtpMutation.mutateAsync({
        name,
        hostelName,
        phoneNumber: sanitizedPhone,
        password,
        otpCode: codeToVerify,
      });

      if (result.session) {
        const { error } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
        if (error) throw error;
      } else {
        const virtualEmail =
          result.user.email ?? `${sanitizedPhone}@campus.edu`.toLowerCase();
        const { error } = await supabase.auth.signInWithPassword({
          email: virtualEmail,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setOtpCode("");
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Invalid OTP.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (checkingSession) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.purple} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>CA</Text>
          </View>
          <Text style={styles.title}>CAmpDeliver</Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? "Create your campus delivery account"
              : "Sign in to order, track, and deliver on campus"}
          </Text>
        </View>

        <Animated.View
          style={[styles.card, { transform: [{ translateX: shakeAnimation }] }]}
        >
          {!isSignUp ? (
            <>
              <Field
                label="Phone Number"
                value={phone}
                onChangeText={(value) =>
                  setPhone(value.replace(/[^\d+\-\s()]/g, ""))
                }
                keyboardType="phone-pad"
                placeholder="9999999999"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
              />
              <ErrorBlock message={authError} />
              <PrimaryButton
                label="Sign In"
                loading={authLoading}
                onPress={handleSignIn}
              />
            </>
          ) : step === 1 ? (
            <>
              <Field
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
              />
              <Field
                label="Hostel Name"
                value={hostelName}
                onChangeText={setHostelName}
                placeholder="Hostel Block"
              />
              <Field
                label="Phone Number"
                value={phone}
                onChangeText={(value) =>
                  setPhone(value.replace(/[^\d+\-\s()]/g, ""))
                }
                keyboardType="phone-pad"
                placeholder="9999999999"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
              />
              <ErrorBlock message={authError} />
              <PrimaryButton
                label="Send Verification Code"
                loading={authLoading}
                onPress={handleSendOtp}
              />
            </>
          ) : (
            <>
              <Text style={styles.otpIntro}>
                Enter the 6-digit code sent to {sanitizePhone(phone)}
              </Text>
              <Pressable
                onPress={() => otpInputRef.current?.focus()}
                style={styles.otpRow}
              >
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <View key={idx} style={styles.otpBox}>
                    <Text style={styles.otpText}>{otpCode[idx] ?? ""}</Text>
                  </View>
                ))}
                <TextInput
                  ref={otpInputRef}
                  value={otpCode}
                  onChangeText={(value) => {
                    const clean = value.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(clean);
                    if (clean.length === 6) void handleVerifyOtp(clean);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.hiddenInput}
                />
              </Pressable>
              <View style={styles.resendRow}>
                <Text style={styles.timerText}>
                  {timer > 0
                    ? `Resend in ${formatTimer(timer)}`
                    : "Code not received?"}
                </Text>
                <Pressable
                  disabled={timer > 0 || authLoading}
                  onPress={handleSendOtp}
                  style={styles.resendButton}
                >
                  <Text
                    style={[
                      styles.resendText,
                      timer > 0 && styles.disabledText,
                    ]}
                  >
                    Resend
                  </Text>
                </Pressable>
              </View>
              <ErrorBlock message={authError} />
              {authLoading ? <ActivityIndicator color={colors.purple} /> : null}
              <Pressable
                onPress={() => {
                  setStep(1);
                  setAuthError(null);
                }}
                style={styles.secondaryButton}
              >
                <Feather name="arrow-left" size={16} color={colors.text} />
                <Text style={styles.secondaryText}>Back to details</Text>
              </Pressable>
            </>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.switchCopy}>
              {isSignUp ? "Already have an account?" : "New to CAmpDeliver?"}
            </Text>
            <Pressable
              onPress={() => {
                setIsSignUp((value) => !value);
                setStep(1);
                setAuthError(null);
              }}
            >
              <Text style={styles.switchAction}>
                {isSignUp ? "Sign In" : "Create Account"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

function ErrorBlock({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Pressable
      onPress={() => Alert.alert("Authentication", message)}
      style={styles.errorBlock}
    >
      <Text style={styles.errorText}>{message}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (pressed || loading) && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 20,
  },
  disabledText: {
    color: colors.faint,
  },
  errorBlock: {
    backgroundColor: "#2a1114",
    borderColor: "#7f1d1d",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: "#fecaca",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  field: {
    gap: 7,
  },
  hero: {
    alignItems: "center",
    marginBottom: 28,
  },
  hiddenInput: {
    bottom: 0,
    left: 0,
    opacity: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 18,
    height: 60,
    justifyContent: "center",
    marginBottom: 14,
    width: 60,
  },
  logoText: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
  },
  otpBox: {
    alignItems: "center",
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 42,
  },
  otpIntro: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative",
  },
  otpText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 16,
    minHeight: 52,
    justifyContent: "center",
  },
  primaryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  resendButton: {
    padding: 6,
  },
  resendRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resendText: {
    color: "#c4b5fd",
    fontSize: 12,
    fontWeight: "900",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 280,
    textAlign: "center",
  },
  switchAction: {
    color: "#c4b5fd",
    fontSize: 13,
    fontWeight: "900",
  },
  switchCopy: {
    color: colors.muted,
    fontSize: 13,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 4,
  },
  timerText: {
    color: colors.muted,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
  },
});
