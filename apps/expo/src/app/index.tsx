import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";

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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    const formattedEmail = email.includes("@")
      ? email.trim()
      : `${email.trim()}@campus.edu`;
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: formattedEmail,
          password,
          options: {
            data: {
              name: name || formattedEmail.split("@")[0],
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthError("Check your email for validation!");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formattedEmail,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || "An authentication error occurred.");
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
    <SafeAreaView className="flex-1 bg-zinc-950">
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

          <View className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 shadow-2xl">
            {isSignUp && (
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
            )}

            <View className="mb-4">
              <Text className="mb-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                Email Address / Dummy ID
              </Text>
              <TextInput
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-purple-500"
                placeholder="alex@campus.edu or 'alex'"
                placeholderTextColor="#52525b"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
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
              onPress={handleAuth}
              disabled={authLoading}
              className="mt-2 flex items-center justify-center rounded-xl bg-purple-600 py-4 shadow-lg shadow-purple-600/20 active:bg-purple-700"
            >
              {authLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-extrabold text-white">
                  {isSignUp ? "Sign Up" : "Sign In"}
                </Text>
              )}
            </Pressable>

            <View className="mt-6 flex-row justify-center">
              <Text className="text-sm text-zinc-400">
                {isSignUp
                  ? "Already have an account? "
                  : "New to CAmpDeliver? "}
              </Text>
              <Pressable
                onPress={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError(null);
                }}
              >
                <Text className="text-sm font-bold text-purple-400">
                  {isSignUp ? "Sign In" : "Create Account"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : (
        // DASHBOARD SCREEN
        <DashboardView user={session.user} onSignOut={handleSignOut} />
      )}
    </SafeAreaView>
  );
}

function DashboardView({
  user,
  onSignOut,
}: {
  user: User;
  onSignOut: () => void;
}) {
  // Fetch profile via tRPC (automatically creates the DB profile row if it doesn't exist!)
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery(trpc.auth.getMyProfile.queryOptions());

  // Fetch orders via tRPC
  const { data: orders } = useQuery(trpc.order.myOrders.queryOptions());

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
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(paise / 100);
  };

  return (
    <ScrollView className="flex-1 bg-zinc-950 px-6 py-4">
      {/* Header Profile */}
      <View className="mt-4 mb-6 flex-row items-center justify-between rounded-3xl border border-zinc-800/40 bg-zinc-900/40 p-4">
        <View className="flex-row items-center gap-3">
          <View className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600">
            <Text className="text-lg font-extrabold text-white">
              {profile.name[0]?.toUpperCase()}
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
          <Text className="text-xs font-semibold text-zinc-400">Sign Out</Text>
        </Pressable>
      </View>

      {/* Campus Wallet */}
      <Text className="mb-3 text-lg font-bold tracking-wide text-white">
        Campus Wallet
      </Text>
      <View className="relative mb-6 min-h-[160px] overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-tr from-purple-900/80 to-indigo-900/80 p-6 shadow-xl">
        {/* Glow overlay */}
        <View className="absolute top-0 right-0 h-24 w-24 rounded-full bg-white/10 blur-2xl"></View>

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

      {/* Side Quests */}
      <Text className="mb-3 text-lg font-bold tracking-wide text-white">
        Active Side Quests
      </Text>
      <View className="min-h-[200px] items-center justify-center rounded-3xl border border-zinc-900/60 bg-zinc-900/40 p-8">
        <View className="bg-zinc-850 mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800">
          <Text className="text-lg font-bold text-zinc-600">📦</Text>
        </View>
        <Text className="text-sm font-bold text-white">No active quests</Text>
        <Text className="mt-1 max-w-xs text-center text-xs text-zinc-400">
          Order history and quest details will be shown here.
        </Text>
      </View>
    </ScrollView>
  );
}
