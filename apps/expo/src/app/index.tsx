import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { Session, User } from "@supabase/supabase-js";
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name || email.split("@")[0],
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthError("Check your email for validation!");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
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
      <View className="flex-1 justify-center items-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
        <Text className="text-zinc-400 mt-4 font-semibold">Connecting to Campus Vault...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <Stack.Screen options={{ title: "CAmpDeliver", headerShown: false }} />

      {!session ? (
        // AUTHENTICATION SCREEN
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} className="bg-zinc-950">
          <View className="flex items-center mb-8">
            <View className="w-16 h-16 rounded-3xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/30 mb-4">
              <Text className="text-white font-black text-2xl">CA</Text>
            </View>
            <Text className="text-white text-3xl font-black tracking-tight">CAmpDeliver</Text>
            <Text className="text-zinc-400 text-sm mt-1 text-center">
              {isSignUp ? "Sign up to begin your delivery quests" : "Sign in to access your digital campus wallet"}
            </Text>
          </View>

          <View className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl">
            {isSignUp && (
              <View className="mb-4">
                <Text className="text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Name</Text>
                <TextInput
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-purple-500"
                  placeholder="Alex Pierce"
                  placeholderTextColor="#52525b"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View className="mb-4">
              <Text className="text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Email Address</Text>
              <TextInput
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-purple-500"
                placeholder="alex@campus.edu"
                placeholderTextColor="#52525b"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View className="mb-4">
              <Text className="text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Password</Text>
              <TextInput
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-purple-500"
                placeholder="••••••••"
                placeholderTextColor="#52525b"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {authError && (
              <View className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                <Text className="text-red-400 text-xs text-center">{authError}</Text>
              </View>
            )}

            <Pressable
              onPress={handleAuth}
              disabled={authLoading}
              className="bg-purple-600 active:bg-purple-700 rounded-xl py-4 shadow-lg shadow-purple-600/20 mt-2 flex items-center justify-center"
            >
              {authLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-extrabold text-base">{isSignUp ? "Sign Up" : "Sign In"}</Text>
              )}
            </Pressable>

            <View className="flex-row justify-center mt-6">
              <Text className="text-zinc-400 text-sm">
                {isSignUp ? "Already have an account? " : "New to CAmpDeliver? "}
              </Text>
              <Pressable onPress={() => { setIsSignUp(!isSignUp); setAuthError(null); }}>
                <Text className="text-purple-400 font-bold text-sm">
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

function DashboardView({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  // Fetch profile via tRPC (automatically creates the DB profile row if it doesn't exist!)
  const { data: profile, isLoading, error } = useQuery(trpc.auth.getMyProfile.queryOptions());
  
  // Fetch orders via tRPC
  const { data: orders } = useQuery(trpc.order.myOrders.queryOptions());

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
        <Text className="text-zinc-400 mt-4 font-semibold">Loading Profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View className="flex-1 justify-center items-center bg-zinc-950 p-6">
        <Text className="text-red-400 text-lg font-bold text-center">Failed to Load Profile</Text>
        <Pressable onPress={onSignOut} className="bg-red-600 px-6 py-3 rounded-xl mt-4">
          <Text className="text-white font-bold">Sign Out</Text>
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
      <View className="flex-row justify-between items-center bg-zinc-900/40 border border-zinc-800/40 rounded-3xl p-4 mb-6 mt-4">
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
            <Text className="text-white font-extrabold text-lg">{profile.name[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-white font-bold text-base">{profile.name}</Text>
              <View className="bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-full">
                <Text className="text-purple-300 text-[10px] font-bold uppercase tracking-wider">{profile.role}</Text>
              </View>
            </View>
            <Text className="text-zinc-400 text-xs mt-0.5">{profile.email}</Text>
          </View>
        </View>
        <Pressable onPress={onSignOut} className="border border-zinc-800 rounded-xl px-3 py-2">
          <Text className="text-zinc-400 font-semibold text-xs">Sign Out</Text>
        </Pressable>
      </View>

      {/* Campus Wallet */}
      <Text className="text-white text-lg font-bold mb-3 tracking-wide">Campus Wallet</Text>
      <View className="bg-gradient-to-tr from-purple-900/80 to-indigo-900/80 border border-purple-500/20 rounded-3xl p-6 shadow-xl mb-6 relative overflow-hidden min-h-[160px]">
        {/* Glow overlay */}
        <View className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></View>
        
        <Text className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Available Balance</Text>
        <Text className="text-white text-3xl font-black tracking-tight mt-1">
          {formatCurrency(profile.walletBalance)}
        </Text>

        <View className="flex-row justify-between items-center mt-6 border-t border-white/10 pt-4">
          <View>
            <Text className="text-zinc-400 text-[8px] uppercase tracking-wider font-semibold">Frozen Escrow</Text>
            <Text className="text-zinc-300 font-bold text-sm mt-0.5">{formatCurrency(profile.frozenBalance)}</Text>
          </View>
          <View className="items-end">
            <Text className="text-zinc-400 text-[8px] uppercase tracking-wider font-semibold">Status</Text>
            <Text className="text-emerald-400 font-bold text-xs mt-0.5">● Active</Text>
          </View>
        </View>
      </View>

      {/* Side Quests */}
      <Text className="text-white text-lg font-bold mb-3 tracking-wide">Active Side Quests</Text>
      <View className="bg-zinc-900/40 border border-zinc-900/60 rounded-3xl p-8 items-center justify-center min-h-[200px]">
        <View className="w-14 h-14 rounded-2xl bg-zinc-850 border border-zinc-800 flex items-center justify-center mb-4">
          <Text className="text-zinc-600 text-lg font-bold">📦</Text>
        </View>
        <Text className="text-white font-bold text-sm">No active quests</Text>
        <Text className="text-zinc-400 text-xs mt-1 text-center max-w-xs">
          Order history and quest details will be shown here.
        </Text>
      </View>
    </ScrollView>
  );
}
