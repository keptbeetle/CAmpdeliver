import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CanteenMenu } from "~/app/_components/CanteenMenu";
import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (phone.trim().startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }
  return phone.includes("+") ? phone : `+91${phone}`;
}

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth Inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // OTP Signup Flow States
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hostelName, setHostelName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState(1); // 1: Intake Form, 2: OTP Verification
  const [timer, setTimer] = useState(0);

  const otpInputRef = useRef<TextInput>(null);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  // countdown timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timer > 0 && !session) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer, session]);

  // focus on OTP input when step changes to 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // tRPC Mutations for OTP
  const sendOtpMutation = useMutation(trpc.otp.sendOtp.mutationOptions());
  const verifyOtpMutation = useMutation(trpc.otp.verifyOtpAndSignup.mutationOptions());

  useEffect(() => {
    // Get initial session
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) {
        setTimer(0);
        setStep(1);
        setOtpCode("");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(
        "Supabase onAuthStateChange triggered:",
        event,
        "session user:",
        session?.user.id,
      );
      setSession(session);
      if (session) {
        setTimer(0);
        setStep(1);
        setOtpCode("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const sanitizedPhone = sanitizePhone(email);
      const formattedEmail = `${sanitizedPhone}@campus.edu`.toLowerCase();
      console.log("[Auth Expo] Attempting sign-in with email:", formattedEmail);
      const { error } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password,
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An authentication error occurred.";
      setAuthError(message);
      triggerShake();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!name.trim() || !hostelName.trim() || !phoneNumber.trim() || !password.trim()) {
      setAuthError("All fields are required");
      triggerShake();
      return;
    }
    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters");
      triggerShake();
      return;
    }
    setAuthError(null);
    setAuthLoading(true);

    try {
      const sanitizedPhone = sanitizePhone(phoneNumber);
      await sendOtpMutation.mutateAsync({ phoneNumber: sanitizedPhone });
      setStep(2);
      setOtpCode("");
      setTimer(300); // 5 minutes timer
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to send verification code.";
      setAuthError(message);
      triggerShake();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify: string) => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const sanitizedPhone = sanitizePhone(phoneNumber);
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
        // Fallback sign in using the exact email returned by the server
        const virtualEmail = result.user.email ?? `${sanitizedPhone}@campus.edu`.toLowerCase();
        const { error } = await supabase.auth.signInWithPassword({
          email: virtualEmail,
          password,
        });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Verification failed. Invalid OTP.";
      setAuthError(message);
      setOtpCode("");
      triggerShake();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
        <Text className="mt-4 font-semibold text-zinc-400">
          Connecting to Campus Vault...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <Stack.Screen options={{ title: "CAmpDeliver", headerShown: false }} />

      {!session ? (
        // AUTHENTICATION SCREEN
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
          className="bg-zinc-950"
        >
          <View className="mb-8 flex items-center">
            <View className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-purple-600 shadow-lg shadow-purple-600/30">
              <Text className="text-2xl font-black text-white">CA</Text>
            </View>
            <Text className="text-3xl font-black tracking-tight text-white">
              CAmpDeliver
            </Text>
            <Text className="mt-1 text-center text-sm text-zinc-400">
              {isSignUp
                ? "Sign up to begin your delivery quests"
                : "Sign in to access your digital campus wallet"}
            </Text>
          </View>

          <Animated.View 
            style={{ transform: [{ translateX: shakeAnimation }] }}
            className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 shadow-2xl"
          >
            {!isSignUp ? (
              // SIGN IN LAYOUT
              <>
                <View className="mb-4">
                  <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Phone Number
                  </Text>
                  <TextInput
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                    placeholder="9999999999"
                    placeholderTextColor="#52525b"
                    keyboardType="phone-pad"
                    maxLength={20}
                    value={email}
                    onChangeText={(val) => setEmail(val.replace(/[^\d+\-\s()]/g, ""))}
                  />
                </View>

                <View className="mb-4">
                  <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Password
                  </Text>
                  <TextInput
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                    placeholder="••••••••"
                    placeholderTextColor="#52525b"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                {authError && (
                  <View className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                    <Text className="text-center text-xs text-red-400">
                      {authError}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={handleSignIn}
                  disabled={authLoading}
                  className="mt-2 flex items-center justify-center rounded-xl bg-purple-600 py-4 shadow-lg shadow-purple-600/20 active:bg-purple-700"
                >
                  {authLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-base font-extrabold text-white">
                      Sign In
                    </Text>
                  )}
                </Pressable>
              </>
            ) : step === 1 ? (
              // SIGN UP STEP 1: Form Intake
              <>
                <View className="mb-4">
                  <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Name
                  </Text>
                  <TextInput
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                    placeholder="Alex Pierce"
                    placeholderTextColor="#52525b"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View className="mb-4">
                  <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Hostel Name
                  </Text>
                  <TextInput
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                    placeholder="e.g. Block A"
                    placeholderTextColor="#52525b"
                    value={hostelName}
                    onChangeText={setHostelName}
                  />
                </View>

                <View className="mb-4">
                  <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Phone Number
                  </Text>
                  <TextInput
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                    placeholder="9999999999"
                    placeholderTextColor="#52525b"
                    keyboardType="phone-pad"
                    maxLength={20}
                    value={phoneNumber}
                    onChangeText={(val) => setPhoneNumber(val.replace(/[^\d+\-\s()]/g, ""))}
                  />
                </View>

                <View className="mb-4">
                  <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                    Password
                  </Text>
                  <TextInput
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                    placeholder="••••••••"
                    placeholderTextColor="#52525b"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                {authError && (
                  <View className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                    <Text className="text-center text-xs text-red-400">
                      {authError}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={handleSendOtp}
                  disabled={authLoading}
                  className="mt-2 flex items-center justify-center rounded-xl bg-purple-600 py-4 shadow-lg shadow-purple-600/20 active:bg-purple-700"
                >
                  {authLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-base font-extrabold text-white">
                      Send Verification Code
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              // SIGN UP STEP 2: OTP Box Overlay
              <>
                <Text className="mb-4 text-center text-sm font-semibold text-zinc-300">
                  Enter the 6-digit code sent to +91 {phoneNumber}
                </Text>

                <View className="relative mb-6 flex-row justify-between w-full px-2">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const char = otpCode[idx] ?? "";
                    const isCurrentFocus = otpCode.length === idx;
                    return (
                      <View
                        key={idx}
                        className={`h-12 w-12 items-center justify-center rounded-xl border-2 bg-zinc-950 ${
                          isCurrentFocus
                            ? "border-purple-500 shadow shadow-purple-500/30"
                            : char
                            ? "border-zinc-700"
                            : "border-zinc-800"
                        }`}
                      >
                        <Text className="text-xl font-bold text-white">
                          {char}
                        </Text>
                      </View>
                    );
                  })}
                  <TextInput
                    ref={otpInputRef}
                    value={otpCode}
                    onChangeText={(val) => {
                      const clean = val.replace(/\D/g, "").slice(0, 6);
                      setOtpCode(clean);
                      if (clean.length === 6) {
                        void handleVerifyOtp(clean);
                      }
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      opacity: 0,
                    }}
                  />
                </View>

                <View className="mb-6 flex-row items-center justify-between">
                  <Text className="text-xs text-zinc-400">
                    {timer > 0 ? `Resend code in ${formatTimer(timer)}` : "Didn't receive code?"}
                  </Text>
                  <Pressable
                    disabled={timer > 0 || authLoading}
                    onPress={handleSendOtp}
                    className={`rounded-lg px-3 py-1.5 ${timer > 0 ? "bg-transparent" : "bg-purple-900/40 active:bg-purple-900/60"}`}
                  >
                    <Text className={`text-xs font-bold ${timer > 0 ? "text-zinc-600" : "text-purple-400"}`}>
                      Resend OTP
                    </Text>
                  </Pressable>
                </View>

                {authError && (
                  <View className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                    <Text className="text-center text-xs text-red-400">
                      {authError}
                    </Text>
                  </View>
                )}

                <View className="flex-row justify-between mt-2">
                  <Pressable
                    onPress={() => {
                      setStep(1);
                      setAuthError(null);
                    }}
                    disabled={authLoading}
                    className="flex-1 mr-2 items-center justify-center rounded-xl bg-zinc-800 py-3 active:bg-zinc-700"
                  >
                    <Text className="text-sm font-semibold text-white">Back</Text>
                  </Pressable>
                  
                  {authLoading && (
                    <View className="flex-1 ml-2 items-center justify-center py-3">
                      <ActivityIndicator size="small" color="#a855f7" />
                    </View>
                  )}
                </View>
              </>
            )}

            <View className="mt-6 flex-row justify-center">
              <Text className="text-sm text-zinc-400">
                {isSignUp ? "Already have an account? " : "New to CAmpDeliver? "}
              </Text>
              <Pressable
                onPress={() => {
                  setIsSignUp(!isSignUp);
                  setStep(1);
                  setAuthError(null);
                }}
              >
                <Text className="text-sm font-bold text-purple-400">
                  {isSignUp ? "Sign In" : "Create Account"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      ) : (
        // DASHBOARD SCREEN
        <DashboardView onSignOut={handleSignOut} />
      )}
    </SafeAreaView>
  );
}

function DashboardView({
  onSignOut,
}: {
  onSignOut: () => void;
}) {

  const queryClient = useQueryClient();
  const globalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("global:orders")
      .on("broadcast", { event: "order_update" }, () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
      });

    channel.subscribe();
    globalChannelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      globalChannelRef.current = null;
    };
  }, [queryClient]);

  const broadcastGlobalUpdate = async () => {
    if (globalChannelRef.current) {
      await globalChannelRef.current.send({
        type: "broadcast",
        event: "order_update",
        payload: { refresh: true },
      });
    }
  };

  // Fetch profile via tRPC (automatically creates the DB profile row if it doesn't exist!)
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery(trpc.auth.getMyProfile.queryOptions());

  // Fetch orders via tRPC
  const { data: orders } = useQuery(
    trpc.order.myOrders.queryOptions(),
  );
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | undefined>();

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          // Get initial position quickly
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });

          // Watch for live updates as the user moves
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 3000,
              distanceInterval: 5,
            },
            (newLocation) => {
              setUserLocation({
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
              });
            }
          );
        }
      } catch (e) {
        console.warn("Failed to get location for quests", e);
      }
    };

    void startWatching();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  const { data: availableQuests } = useQuery({
    ...trpc.order.availableQuests.queryOptions({
      latitude: userLocation?.latitude,
      longitude: userLocation?.longitude,
    } as any),
    enabled: !!userLocation,
  });

  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Location is auto-tracked via watchPositionAsync, so no need to fetchLocation manually here
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.auth.getMyProfile.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.order.availableQuests.queryKey(),
      }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const acceptOrderMutation = useMutation(
    trpc.order.acceptOrder.mutationOptions({
      onSuccess: async () => {
        Alert.alert("Success", "Quest accepted!");
        await queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
        await broadcastGlobalUpdate();
      },
      onError: (e) => {
        Alert.alert("Error", e.message || "Failed to accept quest");
      },
    }),
  );

  const confirmAvailabilityMutation = useMutation(
    trpc.order.confirmAvailability.mutationOptions({
      onSuccess: async () => {
        Alert.alert("Success", "Availability confirmed, money frozen.");
        await queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
        await broadcastGlobalUpdate();
      },
      onError: (e) => {
        Alert.alert("Error", e.message || "Failed to confirm availability");
      },
    }),
  );

  const rejectOrderMutation = useMutation(
    trpc.order.rejectOrder.mutationOptions({
      onSuccess: async () => {
        Alert.alert("Success", "Order cancelled and rejected.");
        await queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.order.availableQuests.queryKey(),
        });
        await broadcastGlobalUpdate();
      },
      onError: (e) => {
        Alert.alert("Error", e.message || "Failed to reject order");
      },
    }),
  );



  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
        <Text className="mt-4 font-semibold text-zinc-400">
          Loading Profile...
        </Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 p-6">
        <Text className="text-center text-lg font-bold text-red-400">
          Failed to Load Profile
        </Text>
        <Pressable
          onPress={onSignOut}
          className="mt-4 rounded-xl bg-red-600 px-6 py-3"
        >
          <Text className="font-bold text-white">Sign Out</Text>
        </Pressable>
      </View>
    );
  }

  const formatCurrency = (paise: number) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
      }).format(paise / 100);
    } catch (e) {
      console.warn("Intl.NumberFormat failed, using fallback formatter:", e);
      return `₹${(paise / 100).toFixed(2)}`;
    }
  };

  try {
    return (
      <ScrollView
        className="flex-1 bg-zinc-950 px-6 py-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#a855f7"
          />
        }
      >
        {/* Header Profile */}
        <View className="mt-4 mb-6 flex-row items-center justify-between rounded-3xl border border-zinc-800/40 bg-zinc-900/40 p-4">
          <View className="flex-row items-center gap-3">
            <View className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600">
              <Text className="text-lg font-extrabold text-white">
                {profile.name[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <View>
              <View className="flex-row items-center gap-1.5">
                <Text className="text-base font-bold text-white">
                  {profile.name}
                </Text>
                <View className="rounded-full border border-purple-500/30 bg-purple-500/20 px-2 py-0.5">
                  <Text className="text-[10px] font-bold tracking-wider text-purple-300 uppercase">
                    {profile.role}
                  </Text>
                </View>
              </View>
              <Text className="mt-0.5 text-xs text-zinc-400">
                {profile.email}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onSignOut}
            className="rounded-xl border border-zinc-800 px-3 py-2"
          >
            <Text className="text-xs font-semibold text-zinc-400">
              Sign Out
            </Text>
          </Pressable>
        </View>

        {/* Campus Wallet */}
        <Text className="mb-3 text-lg font-bold tracking-wide text-white">
          Campus Wallet
        </Text>
        <View className="relative mb-6 min-h-[160px] overflow-hidden rounded-3xl border border-purple-500/20 bg-purple-950 p-6 shadow-xl">
          {/* Glow overlay */}
          <View className="absolute top-0 right-0 h-24 w-24 rounded-full bg-white/5"></View>

          <Text className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
            Available Balance
          </Text>
          <Text className="mt-1 text-3xl font-black tracking-tight text-white">
            {formatCurrency(profile.walletBalance)}
          </Text>

          <View className="mt-6 flex-row items-center justify-between border-t border-white/10 pt-4">
            <View>
              <Text className="text-[8px] font-semibold tracking-wider text-zinc-400 uppercase">
                Frozen Escrow
              </Text>
              <Text className="mt-0.5 text-sm font-bold text-zinc-300">
                {formatCurrency(profile.frozenBalance)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[8px] font-semibold tracking-wider text-zinc-400 uppercase">
                Status
              </Text>
              <Text className="mt-0.5 text-xs font-bold text-emerald-400">
                ● Active
              </Text>
            </View>
          </View>
        </View>

        {/* Order Food */}
        <CanteenMenu onOrderCreated={broadcastGlobalUpdate} />

        {/* Active Side Quests (Available Quests to accept) */}
        <Text className="mb-3 text-lg font-bold tracking-wide text-white">
          Available Quests
        </Text>
        {availableQuests && availableQuests.length > 0 ? (
          availableQuests.map((quest) => (
            <View
              key={quest.id}
              className="mb-4 rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-5"
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-base font-bold text-white">
                    {quest.canteenName}
                  </Text>
                  <Text className="text-xs text-zinc-400">
                    To: {quest.deliveryLocationName}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-purple-400">
                    +{formatCurrency(quest.deliveryFee)}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() =>
                  acceptOrderMutation.mutate({ orderId: quest.id })
                }
                disabled={acceptOrderMutation.isPending}
                className={`mt-4 items-center justify-center rounded-xl py-3 ${
                  acceptOrderMutation.isPending
                    ? "bg-purple-600/50"
                    : "bg-purple-600 active:bg-purple-700"
                }`}
              >
                <Text className="text-sm font-bold text-white">
                  {acceptOrderMutation.isPending
                    ? "Accepting..."
                    : "Accept Quest"}
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View className="min-h-[160px] items-center justify-center rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-8">
            <View className="bg-zinc-850 mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800">
              <Text className="text-lg font-bold text-zinc-600">🗺️</Text>
            </View>
            <Text className="text-sm font-bold text-white">
              No quests available
            </Text>
            <Text className="mt-1 max-w-xs text-center text-xs text-zinc-400">
              Wait for other students to broadcast their food orders.
            </Text>
          </View>
        )}

        {/* My Orders / Side Quests */}
        <Text className="mt-6 mb-3 text-lg font-bold tracking-wide text-white">
          My Active Orders
        </Text>
        {orders && orders.length > 0 ? (
          orders.map((order) => (
            <View
              key={order.id}
              className="mb-4 rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-5"
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-base font-bold text-white">
                    {order.canteenName}
                  </Text>
                  <Text className="mt-1 text-xs text-zinc-400">
                    Status:{" "}
                    <Text className="font-bold text-purple-400">
                      {order.status}
                    </Text>
                  </Text>
                  <Text className="mt-1 text-xs text-zinc-500">
                    Role: {order.buyerId === profile.id ? "Buyer" : "Deliverer"}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-zinc-300">
                    {formatCurrency(order.foodPrice + order.deliveryFee)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons for Deliverer */}
              {order.delivererId === profile.id &&
                order.status === "ACCEPTED" && (
                  <View className="mt-4 flex-col gap-2 border-t border-white/10 pt-4">
                    <Pressable
                      onPress={() =>
                        confirmAvailabilityMutation.mutate({
                          orderId: order.id,
                        })
                      }
                      disabled={
                        confirmAvailabilityMutation.isPending ||
                        rejectOrderMutation.isPending
                      }
                      className={`items-center justify-center rounded-xl py-3 ${
                        confirmAvailabilityMutation.isPending
                          ? "bg-purple-600/50"
                          : "bg-purple-600 active:bg-purple-700"
                      }`}
                    >
                      <Text className="text-sm font-bold text-white">
                        {confirmAvailabilityMutation.isPending
                          ? "Confirming..."
                          : "Confirm Availability"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        rejectOrderMutation.mutate({ orderId: order.id })
                      }
                      disabled={
                        rejectOrderMutation.isPending ||
                        confirmAvailabilityMutation.isPending
                      }
                      className={`items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 py-3 ${
                        rejectOrderMutation.isPending
                          ? "opacity-50"
                          : "active:bg-red-500/20"
                      }`}
                    >
                      <Text className="text-sm font-bold text-red-400">
                        {rejectOrderMutation.isPending
                          ? "Rejecting..."
                          : "Reject (Unavailable)"}
                      </Text>
                    </Pressable>
                  </View>
                )}

              {/* General Actions */}
              {order.status === "ACCEPTED" && (
                <View className="mt-4 border-t border-white/10 pt-4">
                  <Pressable
                    onPress={() => router.push(`/order/${order.id}/chat`)}
                    className="items-center justify-center rounded-xl border border-purple-500/50 bg-purple-500/10 py-3 active:bg-purple-500/20"
                  >
                    <Text className="text-sm font-bold text-purple-300">Open Chat</Text>
                  </Pressable>
                </View>
              )}

              {order.status === "PREPARING" && (
                <View className="mt-4 border-t border-white/10 pt-4">
                  <Pressable
                    onPress={() => router.push(`/order/${order.id}/tracker`)}
                    className="items-center justify-center rounded-xl border border-purple-500/50 bg-purple-500/10 py-3 active:bg-purple-500/20"
                  >
                    <Text className="text-sm font-bold text-purple-300">Open Tracker</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        ) : (
          <View className="min-h-[160px] items-center justify-center rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-8">
            <View className="bg-zinc-850 mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800">
              <Text className="text-lg font-bold text-zinc-600">📦</Text>
            </View>
            <Text className="text-sm font-bold text-white">
              No active orders
            </Text>
            <Text className="mt-1 max-w-xs text-center text-xs text-zinc-400">
              Orders you placed or accepted will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  } catch (err: unknown) {
    console.error("DashboardView Render Crash:", err);
    const message = err instanceof Error ? err.message : String(err);
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 p-6">
        <Text className="text-center text-lg font-bold text-red-400">
          Render Crash
        </Text>
        <Text className="mt-2 text-center text-sm text-zinc-400">
          {message}
        </Text>
        <Pressable
          onPress={onSignOut}
          className="mt-6 rounded-xl bg-red-600 px-6 py-3"
        >
          <Text className="font-bold text-white">Sign Out</Text>
        </Pressable>
      </View>
    );
  }
}
