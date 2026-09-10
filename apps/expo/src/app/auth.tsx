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
import { useMutation, useQuery } from "@tanstack/react-query";

import { colors, radius, shadow } from "~/components/app/theme";
import { AppButton, InlineNotice, LoadingState } from "~/components/app/ui";
import { useAuthSession } from "~/providers/AuthSessionProvider";
import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

function normalizeSignupPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const subscriber =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : null;
  if (!subscriber || !/^[6-9]\d{9}$/.test(subscriber)) return null;
  return `+91${subscriber}`;
}

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export default function AuthScreen() {
  const router = useRouter();
  const { isLoading: checkingSession, session } = useAuthSession();
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
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

  const requestOtpMutation = useMutation(
    trpc.auth.requestSignupEmailOtp.mutationOptions(),
  );
  const completeSignupMutation = useMutation(
    trpc.auth.completeSignup.mutationOptions(),
  );
  const signInMutation = useMutation(
    trpc.auth.signInWithIdentifier.mutationOptions(),
  );
  const profileState = useQuery({
    ...trpc.auth.hasProfile.queryOptions(),
    enabled: Boolean(session),
    retry: false,
  });

  useEffect(() => {
    if (!session || profileState.isPending) return;
    if (profileState.data?.hasProfile) {
      router.replace("/" as never);
      return;
    }
    if (profileState.data && !profileState.data.hasProfile) {
      setIsSignUp(true);
      setStep(1);
      void supabase.auth.signOut({ scope: "local" });
    }
  }, [profileState.data, profileState.isPending, router, session]);

  useEffect(() => {
    if (timer <= 0 || session) return;
    const interval = setInterval(
      () => setTimer((previous) => Math.max(0, previous - 1)),
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
    if (!identifier.trim() || !password) {
      setError("Enter your college email or phone number and password.");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await signInMutation.mutateAsync({
        identifier: identifier.trim(),
        password,
      });
      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (error) throw error;
      router.replace("/" as never);
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
      !email.trim() ||
      !phone.trim() ||
      !password
    ) {
      setError("Complete all account details before continuing.");
      return;
    }
    const signupEmail = normalizeEmail(email);
    if (!signupEmail) {
      setError("Enter your valid IIITDMJ student email address.");
      return;
    }
    const signupPhone = normalizeSignupPhone(phone);
    if (!signupPhone) {
      setError(
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      );
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError("Password must be between 8 and 72 characters.");
      return;
    }

    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await requestOtpMutation.mutateAsync({
        email: signupEmail,
        phoneNumber: signupPhone,
      });
      setEmail(result.email);
      setStep(2);
      setOtpCode("");
      setTimer(result.resendAfterSeconds);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send the verification email.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify: string) => {
    if (authLoading || codeToVerify.length !== 6) return;
    const signupEmail = normalizeEmail(email);
    const signupPhone = normalizeSignupPhone(phone);
    if (!signupEmail || !signupPhone) {
      setError(
        "Return to account details and check your email and phone number.",
      );
      return;
    }

    setAuthError(null);
    setAuthLoading(true);
    let emailVerified = false;
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: signupEmail,
        token: codeToVerify,
        type: "email",
      });
      if (verifyError) throw verifyError;
      emailVerified = true;

      const { error: passwordError } = await supabase.auth.updateUser({
        password,
        data: { name: name.trim() },
      });
      if (passwordError) throw passwordError;

      await completeSignupMutation.mutateAsync({
        name: name.trim(),
        hostelName: hostelName.trim(),
        phoneNumber: signupPhone,
      });
      router.replace("/" as never);
    } catch (error) {
      if (emailVerified) {
        await supabase.auth.signOut({ scope: "local" });
      }
      setOtpCode("");
      setError(
        error instanceof Error
          ? error.message
          : "Verification failed. Check the email code and try again.",
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

  if (
    checkingSession ||
    (session && profileState.isPending) ||
    profileState.data?.hasProfile
  ) {
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
                ? "Verify your official IIITDMJ student email. Your phone number is required for delivery contact, not OTP verification."
                : "Sign in with your college email or registered phone number."}
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
                <AuthStep active={step === 2} label="Email" number="2" />
              </View>
            ) : null}

            {!isSignUp ? (
              <>
                <Field
                  label="College email or phone number"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="rollnumber@iiitdmj.ac.in or 98765 43210"
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
                    tone="danger"
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
                  autoCapitalize="words"
                />
                <Field
                  label="Hostel Name"
                  value={hostelName}
                  onChangeText={setHostelName}
                  placeholder="Hostel block"
                  autoCapitalize="words"
                />
                <Field
                  label="IIITDMJ student email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  placeholder="rollnumber@iiitdmj.ac.in"
                />
                <Field
                  label="Phone number"
                  value={phone}
                  onChangeText={(value) =>
                    setPhone(value.replace(/[^\d+\-\s()]/g, ""))
                  }
                  keyboardType="phone-pad"
                  placeholder="98765 43210"
                />
                <Text style={styles.fieldHint}>
                  Required for delivery contact. We do not send an OTP to this
                  number.
                </Text>
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="8–72 characters"
                  secureTextEntry
                />
                <InlineNotice
                  tone="info"
                  icon="mail"
                  title="College email verification"
                  copy="We will send a 6-digit one-time code to your official college inbox."
                />
                {authError ? (
                  <InlineNotice
                    tone="danger"
                    icon="alert-circle"
                    title="Check your details"
                    copy={authError}
                  />
                ) : null}
                <AppButton
                  label="Send Email Verification Code"
                  loading={authLoading}
                  onPress={() => void handleSendOtp()}
                />
              </>
            ) : (
              <>
                <View style={styles.verifyIntro}>
                  <View style={styles.verifyIcon}>
                    <Feather name="mail" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.verifyTitle}>
                    Verify your college email
                  </Text>
                  <Text style={styles.verifyCopy}>
                    Enter the 6-digit code sent to {email}. Check spam or junk
                    if it does not appear in your inbox.
                  </Text>
                </View>
                <InlineNotice
                  tone="success"
                  icon="check-circle"
                  title="Verification email sent"
                  copy="Only this email code is required. Your phone number is not OTP-verified."
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Enter six digit email verification code"
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
                    onChangeText={(value) =>
                      setOtpCode(value.replace(/\D/g, "").slice(0, 6))
                    }
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
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
                    tone="danger"
                    icon="alert-circle"
                    title="Code not accepted"
                    copy={authError}
                  />
                ) : null}
                <AppButton
                  label="Verify Email & Create Account"
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
                    setOtpCode("");
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
                  setOtpCode("");
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
  autoCapitalize = "none",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
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
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
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
  authStep: { alignItems: "center", gap: 5 },
  brandCopy: { flex: 1 },
  brandEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 14,
    padding: 20,
    ...shadow,
  },
  disabledText: { color: colors.faint },
  eyeButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    position: "absolute",
    right: 2,
    top: 0,
    width: 44,
  },
  field: { gap: 7 },
  fieldHint: {
    color: colors.faint,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -7,
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
  heroCopyWrap: { marginBottom: 18, marginTop: 28 },
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
  keyboardRoot: { flex: 1 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800" },
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
  otpText: { color: colors.text, fontSize: 20, fontWeight: "900" },
  resendButton: { padding: 6 },
  resendRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resendText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  root: { backgroundColor: colors.bg, flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 22 },
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
  stepLabel: { color: colors.faint, fontSize: 10, fontWeight: "800" },
  stepLabelActive: { color: colors.primaryStrong },
  stepLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 2,
    marginBottom: 18,
    marginHorizontal: 8,
  },
  stepLineDone: { backgroundColor: colors.success },
  stepNumber: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  stepNumberActive: { color: colors.white },
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
  switchAction: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  switchCopy: { color: colors.muted, fontSize: 13 },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 2,
  },
  timerText: { color: colors.muted, fontSize: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
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
  verifyIntro: { alignItems: "center" },
  verifyTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
});
