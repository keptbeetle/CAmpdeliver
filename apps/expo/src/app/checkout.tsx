import { useMemo, useState } from "react";
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
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { useCart } from "~/components/cart/CartContext";
import { colors, formatCurrency } from "~/app/_components/theme";

const deliveryFee = 500;
const convenienceFee = 0;

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const {
    items,
    canteenId,
    canteenName,
    totalItems,
    totalPrice,
    removeItem,
    updateQuantity,
    clearCart,
  } = useCart();
  const [instructions, setInstructions] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const { data: landmarks, isLoading: loadingLandmarks } = useQuery(
    trpc.landmark.list.queryOptions(),
  );

  const finalAmount = totalPrice + deliveryFee + convenienceFee;

  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions({
      onSuccess: async (order) => {
        clearCart();
        await queryClient.invalidateQueries({ queryKey: trpc.order.myOrders.queryKey() });
        if (order?.id) {
          router.replace(`/orders/${order.id}/status` as never);
        } else {
          router.replace("/orders" as never);
        }
      },
      onError: (error) => Alert.alert("Failed to place order", error.message),
    }),
  );

  const placeOrder = async () => {
    if (!canteenId || items.length === 0) {
      Alert.alert("Cart is empty", "Add dishes before placing an order.");
      return;
    }

    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location required", "Please enable location access to place an order.");
        setIsLocating(false);
        return;
      }
      
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const deliveryLatitude = current.coords.latitude;
      const deliveryLongitude = current.coords.longitude;

      // Resolve nearest landmark
      let nearest = null;
      if (landmarks && landmarks.length > 0) {
        for (const lm of landmarks) {
          const toRad = (v: number) => (v * Math.PI) / 180;
          const R = 6371e3;
          const dLat = toRad(lm.latitude - deliveryLatitude);
          const dLon = toRad(lm.longitude - deliveryLongitude);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(deliveryLatitude)) * Math.cos(toRad(lm.latitude)) * Math.sin(dLon / 2) ** 2;
          const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          
          if (!nearest || distance < nearest.distance) {
            nearest = { name: lm.name, distance, radius: lm.radius };
          }
        }
      }
      
      let deliveryLocationName = "Current Location";
      if (nearest) {
        deliveryLocationName = nearest.distance <= nearest.radius ? nearest.name : `Near ${nearest.name}`;
      }

      const trimmedInstructions = instructions.trim();
      if (trimmedInstructions) {
        deliveryLocationName = `${deliveryLocationName} - ${trimmedInstructions}`;
      }

      createOrderMutation.mutate({
        canteenId,
        items: items.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        deliveryLocationName,
        deliveryLatitude,
        deliveryLongitude,
      });
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to get location. Please try again.");
    } finally {
      setIsLocating(false);
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Feather name="shopping-cart" size={38} color={colors.faint} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyCopy}>Add a dish from a canteen to continue.</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardRoot}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Checkout</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>{canteenName}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(128, insets.bottom + 112) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            <View style={styles.itemsList}>
              {items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemPrice}>
                      {formatCurrency(item.price * item.quantity)}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => removeItem(item.id)} style={styles.stepButton}>
                      <Feather name="minus" size={15} color="#ddd6fe" />
                    </Pressable>
                    <Text style={styles.quantityText}>{item.quantity}</Text>
                    <Pressable
                      onPress={() => updateQuantity(item.id, item.quantity + 1)}
                      style={[styles.stepButton, styles.stepButtonAccent]}
                    >
                      <Feather name="plus" size={15} color={colors.text} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Location</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }}>
              <View style={{ backgroundColor: "rgba(52, 211, 153, 0.15)", padding: 10, borderRadius: 12 }}>
                <Feather name="map-pin" size={18} color="#34d399" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>
                  Auto GPS Location
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  We'll detect your location to deliver to you.
                </Text>
              </View>
            </View>

            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Room number or delivery instructions"
              placeholderTextColor={colors.faint}
              style={styles.instructionsInput}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bill Breakdown</Text>
            <BillLine label="Items" value={formatCurrency(totalPrice)} />
            <BillLine label="Delivery fee" value={formatCurrency(deliveryFee)} />
            <BillLine label="Convenience fee" value="Waived" />
            <View style={styles.billDivider} />
            <BillLine label={`${totalItems} item total`} value={formatCurrency(finalAmount)} strong />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
          <Pressable
            disabled={createOrderMutation.isPending || isLocating}
            onPress={placeOrder}
            style={({ pressed }) => [
              styles.placeButton,
              (pressed || createOrderMutation.isPending || isLocating) && styles.pressed,
            ]}
          >
            {createOrderMutation.isPending || isLocating ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
                <ActivityIndicator color={colors.text} />
                <Text style={styles.placeText}>{isLocating ? "Getting location..." : "Broadcasting Order..."}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.placeText}>Place Order</Text>
                <Text style={styles.placeAmount}>{formatCurrency(finalAmount)}</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BillLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.billLine}>
      <Text style={[styles.billLabel, strong && styles.billStrong]}>{label}</Text>
      <Text style={[styles.billValue, strong && styles.billStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  billDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 8,
  },
  billLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  billLine: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  billStrong: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  billValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  content: {
    gap: 16,
    padding: 18,
  },
  empty: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  emptyCopy: {
    color: colors.faint,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 14,
  },
  footer: {
    backgroundColor: "rgba(9,9,11,0.98)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  instructionsInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  itemCopy: {
    flex: 1,
  },
  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  itemPrice: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 11,
  },
  itemsList: {
    gap: 2,
    marginTop: 8,
  },
  keyboardRoot: {
    flex: 1,
  },
  landmarkChip: {
    alignItems: "center",
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 190,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  landmarkChipSelected: {
    backgroundColor: colors.purple,
    borderColor: "#c4b5fd",
  },
  landmarkLoader: {
    alignSelf: "flex-start",
    marginTop: 14,
  },
  landmarkRow: {
    gap: 9,
    paddingTop: 12,
  },
  landmarkText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  landmarkTextSelected: {
    color: colors.text,
  },
  placeAmount: {
    color: "#ede9fe",
    fontSize: 13,
    fontWeight: "900",
  },
  placeButton: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  placeText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
  },
  primaryButton: {
    backgroundColor: colors.purple,
    borderRadius: 15,
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  primaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  quantityText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    minWidth: 22,
    textAlign: "center",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  section: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stepButtonAccent: {
    backgroundColor: colors.purple,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: "#211238",
    borderColor: "#6d28d9",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 4,
  },
});
