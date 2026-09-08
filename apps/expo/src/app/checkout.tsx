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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { colors, formatCurrency, radius, shadow } from "~/components/app/theme";
import { EmptyState, InlineNotice, MotionView } from "~/components/app/ui";
import { useCart } from "~/components/cart/CartContext";
import { locationService } from "~/platform/location";
import { trpc } from "~/utils/api";

const deliveryFee = 500;
const convenienceFee = 0;

type CheckoutStage = "idle" | "locating" | "broadcasting";

interface NearestLandmark {
  name: string;
  distance: number;
  radius: number;
}

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
  const [stage, setStage] = useState<CheckoutStage>("idle");

  const { data: landmarks } = useQuery(trpc.landmark.list.queryOptions());
  const createOrderMutation = useMutation(
    trpc.order.createOrder.mutationOptions(),
  );

  const finalAmount = totalPrice + deliveryFee + convenienceFee;
  const busy = stage !== "idle" || createOrderMutation.isPending;

  const placeOrder = async () => {
    if (busy) return;
    if (!canteenId || items.length === 0) {
      Alert.alert("Cart is empty", "Add dishes before placing an order.");
      return;
    }

    setStage("locating");
    try {
      const permissionGranted =
        await locationService.requestForegroundPermission();
      if (!permissionGranted) {
        Alert.alert(
          "Location is required",
          "CAmpDeliver needs your current location to lock the delivery point for this order.",
        );
        return;
      }

      const current = await locationService.getCurrentPosition();
      const deliveryLatitude = current.latitude;
      const deliveryLongitude = current.longitude;

      let nearest: NearestLandmark | null = null;
      for (const landmark of landmarks ?? []) {
        const toRad = (value: number) => (value * Math.PI) / 180;
        const radius = 6371e3;
        const deltaLatitude = toRad(landmark.latitude - deliveryLatitude);
        const deltaLongitude = toRad(landmark.longitude - deliveryLongitude);
        const a =
          Math.sin(deltaLatitude / 2) ** 2 +
          Math.cos(toRad(deliveryLatitude)) *
            Math.cos(toRad(landmark.latitude)) *
            Math.sin(deltaLongitude / 2) ** 2;
        const distance =
          radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (!nearest || distance < nearest.distance) {
          nearest = {
            name: landmark.name,
            distance,
            radius: landmark.radius,
          };
        }
      }

      let deliveryLocationName = "Current location";
      if (nearest) {
        deliveryLocationName =
          nearest.distance <= nearest.radius
            ? nearest.name
            : `Near ${nearest.name}`;
      }

      const trimmedInstructions = instructions.trim();
      if (trimmedInstructions) {
        deliveryLocationName = `${deliveryLocationName} - ${trimmedInstructions}`;
      }

      setStage("broadcasting");
      const order = await createOrderMutation.mutateAsync({
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

      clearCart();
      await queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      });
      router.replace(`/orders/${order.id}/status` as never);
    } catch (error) {
      Alert.alert(
        "Order was not placed",
        error instanceof Error
          ? error.message
          : "Check your connection and try again. Your cart is still here.",
      );
    } finally {
      setStage("idle");
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="shopping-cart"
            title="Your cart is empty"
            copy="Add items from a canteen before opening checkout."
            actionLabel="Browse canteens"
            onAction={() => router.replace("/" as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardRoot}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            disabled={busy}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Checkout</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              {canteenName}
            </Text>
          </View>
          <View style={styles.itemPill}>
            <Text style={styles.itemPillText}>{totalItems} items</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(132, insets.bottom + 118) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MotionView style={styles.flowCard}>
            <FlowStep icon="shopping-bag" label="Cart" done />
            <View style={styles.flowLine} />
            <FlowStep
              icon="map-pin"
              label="Location"
              active={stage === "locating"}
              done={stage === "broadcasting"}
            />
            <View style={styles.flowLine} />
            <FlowStep
              icon="radio"
              label="Broadcast"
              active={stage === "broadcasting"}
            />
          </MotionView>

          <Section title="Order summary" icon="shopping-bag">
            <View style={styles.itemsList}>
              {items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={1} style={styles.itemName}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {formatCurrency(item.price * item.quantity)}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel={`Remove one ${item.name}`}
                      disabled={busy}
                      onPress={() => removeItem(item.id)}
                      style={styles.stepButton}
                    >
                      <Feather
                        name="minus"
                        size={15}
                        color={colors.primaryStrong}
                      />
                    </Pressable>
                    <Text style={styles.quantityText}>{item.quantity}</Text>
                    <Pressable
                      accessibilityLabel={`Add one ${item.name}`}
                      disabled={busy}
                      onPress={() => updateQuantity(item.id, item.quantity + 1)}
                      style={[styles.stepButton, styles.stepButtonAccent]}
                    >
                      <Feather name="plus" size={15} color={colors.white} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Delivery point" icon="map-pin">
            <InlineNotice
              icon="crosshair"
              title="Auto GPS Location"
              copy="The drop-off coordinate is then fixed for this delivery so the rider gets one consistent destination."
            />
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Delivery instructions (optional)
              </Text>
              <TextInput
                value={instructions}
                onChangeText={setInstructions}
                editable={!busy}
                placeholder="Room number, gate, or meeting point"
                placeholderTextColor={colors.faint}
                style={styles.instructionsInput}
                multiline
                maxLength={160}
              />
              <Text style={styles.characterCount}>
                {instructions.length}/160
              </Text>
            </View>
          </Section>

          <Section title="Payment summary" icon="credit-card">
            <BillLine label="Items" value={formatCurrency(totalPrice)} />
            <BillLine
              label="Delivery fee"
              value={formatCurrency(deliveryFee)}
            />
            <BillLine label="Convenience fee" value="Waived" />
            <View style={styles.billDivider} />
            <BillLine
              label="Order total"
              value={formatCurrency(finalAmount)}
              strong
            />
            <Text style={styles.paymentNote}>
              Payment is handled through your CAmpDeliver wallet when a rider
              confirms availability.
            </Text>
          </Section>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(12, insets.bottom + 8) },
          ]}
        >
          {busy ? (
            <View style={styles.operationRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <View style={styles.operationCopy}>
                <Text style={styles.operationTitle}>
                  {stage === "locating"
                    ? "Locking your delivery point"
                    : "Broadcasting your order"}
                </Text>
                <Text style={styles.operationText}>
                  {stage === "locating"
                    ? "Checking permission and current GPS location…"
                    : "Creating the order and finding a nearby deliverer…"}
                </Text>
              </View>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void placeOrder()}
            style={({ pressed }) => [
              styles.placeButton,
              pressed && !busy && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <View>
              <Text style={styles.placeText}>
                {busy ? "Working…" : "Place Order"}
              </Text>
              <Text style={styles.placeSubtext}>
                {busy
                  ? "Please keep this screen open"
                  : "Location is checked next"}
              </Text>
            </View>
            <View style={styles.placeAmountWrap}>
              <Text style={styles.placeAmount}>
                {formatCurrency(finalAmount)}
              </Text>
              <Feather name="arrow-right" size={16} color={colors.white} />
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FlowStep({
  icon,
  label,
  active = false,
  done = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <View style={styles.flowStep}>
      <View
        style={[styles.flowIcon, (active || done) && styles.flowIconActive]}
      >
        {done ? (
          <Feather name="check" size={14} color={colors.white} />
        ) : (
          <Feather
            name={icon}
            size={14}
            color={active ? colors.white : colors.faint}
          />
        )}
      </View>
      <Text
        style={[styles.flowLabel, (active || done) && styles.flowLabelActive]}
      >
        {label}
      </Text>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <MotionView style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </MotionView>
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
      <Text style={[styles.billLabel, strong && styles.billStrong]}>
        {label}
      </Text>
      <Text style={[styles.billValue, strong && styles.billStrong]}>
        {value}
      </Text>
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
    fontWeight: "600",
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
  characterCount: {
    color: colors.faint,
    fontSize: 10,
    marginTop: 5,
    textAlign: "right",
  },
  content: {
    gap: 14,
    padding: 18,
  },
  disabled: {
    opacity: 0.55,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  flowCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    padding: 14,
    ...shadow,
  },
  flowIcon: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  flowIconActive: {
    backgroundColor: colors.primary,
  },
  flowLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 5,
  },
  flowLabelActive: {
    color: colors.primaryStrong,
  },
  flowLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 2,
    marginBottom: 15,
    marginHorizontal: 5,
  },
  flowStep: {
    alignItems: "center",
    width: 64,
  },
  footer: {
    backgroundColor: "rgba(244,248,248,0.98)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    position: "absolute",
    right: 0,
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  headerCopy: {
    flex: 1,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  inputGroup: {
    marginTop: 14,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 7,
  },
  instructionsInput: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 84,
    paddingHorizontal: 13,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  itemCopy: {
    flex: 1,
  },
  itemName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  itemPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  itemPillText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: "800",
  },
  itemPrice: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  itemRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 11,
  },
  itemsList: {
    marginTop: 8,
  },
  keyboardRoot: {
    flex: 1,
  },
  operationCopy: {
    flex: 1,
  },
  operationRow: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    padding: 10,
  },
  operationText: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  operationTitle: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "900",
  },
  paymentNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  placeAmount: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  placeAmountWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  placeButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  placeSubtext: {
    color: "#D5EBE9",
    fontSize: 9,
    marginTop: 2,
  },
  placeText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  quantityText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    minWidth: 20,
    textAlign: "center",
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  section: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    ...shadow,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 10,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: 9,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  stepButtonAccent: {
    backgroundColor: colors.primary,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 4,
  },
});
