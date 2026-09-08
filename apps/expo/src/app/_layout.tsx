import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";

import { colors } from "~/components/app/theme";
import { CartProvider } from "~/components/cart/CartContext";
import { GeofenceManager } from "~/components/GeofenceManager";
import { GlobalTracker } from "~/components/GlobalTracker";
import { PushNotificationManager } from "~/components/PushNotificationManager";
import { AuthSessionProvider } from "~/providers/AuthSessionProvider";
import { queryClient } from "~/utils/api";

import "../styles.css";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>
        <CartProvider>
          <SafeAreaProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation:
                  Platform.OS === "android" ? "slide_from_right" : "default",
                animationDuration: 220,
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="auth" options={{ animation: "fade" }} />
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
              <Stack.Screen name="canteen/[id]" />
              <Stack.Screen name="checkout" />
              <Stack.Screen name="orders/[id]/status" />
              <Stack.Screen name="order/[id]/tracker" />
              <Stack.Screen name="order/[id]/chat" />
              <Stack.Screen name="admin/canteens" />
              <Stack.Screen name="admin/landmarks" />
            </Stack>
            <GlobalTracker />
            <GeofenceManager />
            <PushNotificationManager />
            <StatusBar style="dark" backgroundColor={colors.bg} />
          </SafeAreaProvider>
        </CartProvider>
      </AuthSessionProvider>
    </QueryClientProvider>
  );
}
