import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";

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
                contentStyle: { backgroundColor: "#09090b" },
              }}
            >
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
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
            <StatusBar />
          </SafeAreaProvider>
        </CartProvider>
      </AuthSessionProvider>
    </QueryClientProvider>
  );
}
