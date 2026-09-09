import { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import { colors, radius, shadow } from "~/components/app/theme";
import { AppButton, InlineNotice, LoadingState } from "~/components/app/ui";
import { useAuthSession } from "~/providers/AuthSessionProvider";
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
  const { isLoading: checkingSession, session } = useAuthSession();
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
    if (session) router.replace("/" as never);
  }, [router, session]);

  useEffect(() => {
    if (timer <= 0 || session) return;
    const interval = setInterval(
      () => setTimer((previous) => previous - 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [timer, session]);

  useEffect(() => {
    if (step !== 2) return;
    const timeout = setTimeout(() => otpInputRef.current?.focus(), 180);
    return () => clearTimeout(timeout);
  }, [step]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 8,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -8,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 70,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const setError = (message: string) => {
    setAuthError(message);
    triggerShake();
  };

  const handleSignIn = async () => {
    if (!phone.trim() || !password) {
      setError("Enter your phone number and password.");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const formattedEmail = `${sanitizePhone(phone)}@campus.edu`.toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password,
      });
      if (error) throw error;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
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
      setError("Complete all account details before continuing.");
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
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send the verification code.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify: string) => {
    if (authLoading) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const sanitizedPhone = sanitizePhone(phone);
      const result = await verifyOtpMutation.mutateAsync({
        name: name.trim(),
        hostelName: hostelName.trim(),
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
    } catch (error) {
      setOtpCode("");
      setError(
        error instanceof Error
          ? error.message
          : "Verification failed. Check the code and try again.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remaining
      .toString()
      .padStart(2, "0")}`;
  };

  if (checkingSession || session) {
    return (
      <View style={styles.loadingRoot}>
        <LoadingState
          title="Opening CAmpDeliver"
          copy="Restoring your secure campus session."
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardRoot}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Feather name="navigation" size={22} color={colors.white} />
            </View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandEyebrow}>CAMPUS DELIVERY</Text>
              <Text style={styles.title}>CAmpDeliver</Text>
            </View>
          </View>

          <View style={styles.heroCopyWrap}>
            <Text style={styles.heroTitle}>
              {isSignUp
                ? "Create your campus delivery account"
                : "Welcome back"}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? "One account lets you order food and take delivery quests."
                : "Sign in to order, deliver, chat, and track in one place."}
            </Text>
          </View>

          <Animated.View
            style={[
              styles.card,
              { transform: [{ translateX: shakeAnimation }] },
            ]}
          >
            {isSignUp ? (
              <View style={styles.stepRow}>
                <AuthStep active label="Account" number="1" done={step === 2} />
                <View
                  style={[styles.stepLine, step === 2 && styles.stepLineDone]}
                />
                <AuthStep active={step === 2} label="Verify" number="2" />
              </View>
            ) : null}

            {!isSignUp ? (
              <>
                <Field
                  label="Phone number"
                  value={phone}
                  onChangeText={(value) =>
                    setPhone(value.replace(/[^\d+\-\s()]/g, ""))
                  }
                  keyboardType="phone-pad"
                  placeholder="99999 99999"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  secureTextEntry
                />
                {authError ? (
                  <InlineNotice
                    tone="warning"
                    icon="alert-circle"
                    title="Sign in needs attention"
                    copy={authError}
                  />
                ) : null}
                <AppButton
                  label="Sign In"
                  loading={authLoading}
                  onPress={() => void handleSignIn()}
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
                  placeholder="Hostel block"
                />
                <Field
                  label="Phone number"
                  value={phone}
                  onChangeText={(value) =>
                    setPhone(value.replace(/[^\d+\-\s()]/g, ""))
                  }
                  keyboardType="phone-pad"
                  placeholder="99999 99999"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  secureTextEntry
                />
                {authError ? (
                  <InlineNotice
                    tone="warning"
                    icon="alert-circle"
                    title="Check your details"
                    copy={authError}
                  />
                ) : null}
                <AppButton
                  label="Send Verification Code"
                  loading={authLoading}
                  onPress={() => void handleSendOtp()}
                />
              </>
            ) : (
              <>
                <View style={styles.verifyIntro}>
                  <View style={styles.verifyIcon}>
                    <Feather
                      name="smartphone"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={styles.verifyTitle}>Verify your phone</Text>
                  <Text style={styles.verifyCopy}>
                    Enter the 6-digit code sent for {sanitizePhone(phone)}.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Enter six digit verification code"
                  onPress={() => otpInputRef.current?.focus()}
                  style={styles.otpRow}
                >
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.otpBox,
                        otpCode[index] ? styles.otpBoxFilled : null,
                      ]}
                    >
                      <Text style={styles.otpText}>{otpCode[index] ?? ""}</Text>
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
                      ? `New code in ${formatTimer(timer)}`
                      : "You can request another code."}
                  </Text>
                  <Pressable
                    disabled={timer > 0 || authLoading}
                    onPress={() => void handleSendOtp()}
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
                {authError ? (
                  <InlineNotice
                    tone="warning"
                    icon="alert-circle"
                    title="Code not accepted"
                    copy={authError}
                  />
                ) : null}
                <AppButton
                  label={authLoading ? "Verifying…" : "Verify Account"}
                  loading={authLoading}
                  disabled={otpCode.length !== 6}
                  onPress={() => void handleVerifyOtp(otpCode)}
                />
                <AppButton
                  label="Back to details"
                  icon="arrow-left"
                  tone="quiet"
                  onPress={() => {
                    setStep(1);
                    setAuthError(null);
                  }}
                />
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

          <Text style={styles.footerCopy}>
            Campus-only peer delivery · Your session stays on this device until
            you sign out.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthStep({
  active,
  done = false,
  label,
  number,
}: {
  active: boolean;
  done?: boolean;
  label: string;
  number: string;
}) {
  return (
    <View style={styles.authStep}>
      <View style={[styles.stepDot, active && styles.stepDotActive]}>
        {done ? (
          <Feather name="check" size={13} color={colors.white} />
        ) : (
          <Text style={[styles.stepNumber, active && styles.stepNumberActive]}>
            {number}
          </Text>
        )}
      </View>
      <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>
        {label}
      </Text>
    </View>
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
  const [visible, setVisible] = useState(false);
  const hidden = Boolean(secureTextEntry && !visible);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize="none"
          style={styles.input}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={visible ? "Conceal entry" : "Reveal entry"}
            onPress={() => setVisible((current) => !current)}
            style={styles.eyeButton}
          >
            <Feather
              name={visible ? "eye-off" : "eye"}
              size={17}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authStep: {
    alignItems: "center",
    gap: 5,
  },
  brandCopy: {
    flex: 1,
  },
  brandEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 14,
    padding: 20,
    ...shadow,
  },
  disabledText: {
    color: colors.faint,
  },
  eyeButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    position: "absolute",
    right: 2,
    top: 0,
    width: 44,
  },
  field: {
    gap: 7,
  },
  footerCopy: {
    color: colors.faint,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 18,
    textAlign: "center",
  },
  hiddenInput: {
    bottom: 0,
    left: 0,
    opacity: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  heroCopyWrap: {
    marginBottom: 18,
    marginTop: 28,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingRight: 46,
  },
  inputWrap: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
    position: "relative",
  },
  keyboardRoot: {
    flex: 1,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  loadingRoot: {
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  otpBox: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 42,
  },
  otpBoxFilled: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
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
  resendButton: {
    padding: 6,
  },
  resendRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resendText: {
    color: colors.primary,
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
  stepDot: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepLabel: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: "800",
  },
  stepLabelActive: {
    color: colors.primaryStrong,
  },
  stepLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 2,
    marginBottom: 18,
    marginHorizontal: 8,
  },
  stepLineDone: {
    backgroundColor: colors.primary,
  },
  stepNumber: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  stepNumberActive: {
    color: colors.white,
  },
  stepRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  switchAction: {
    color: colors.primary,
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
    marginTop: 2,
  },
  timerText: {
    color: colors.muted,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  verifyCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    textAlign: "center",
  },
  verifyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    marginBottom: 9,
    width: 42,
  },
  verifyIntro: {
    alignItems: "center",
  },
  verifyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
});
