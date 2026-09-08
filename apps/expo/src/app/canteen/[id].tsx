import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { colors, formatCurrency, radius, shadow } from "~/components/app/theme";
import { EmptyState, MotionView, SkeletonBlock } from "~/components/app/ui";
import { useCart } from "~/components/cart/CartContext";
import { trpc } from "~/utils/api";

type MenuItem = RouterOutputs["menu"]["listByCanteen"][number];

export default function CanteenDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: canteens } = useQuery(trpc.canteen.listActive.queryOptions());
  const {
    data: menuItems,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...trpc.menu.listByCanteen.queryOptions({ canteenId: id }),
    enabled: Boolean(id),
  });

  const { items, addItem, removeItem, updateQuantity, totalItems, totalPrice } =
    useCart();
  const canteen = canteens?.find((item) => item.id === id);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {canteen?.name ?? "Canteen"}
          </Text>
          <Text style={styles.headerSubtitle}>Menu and ordering</Text>
        </View>
      </View>

      <FlatList
        data={menuItems ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <MotionView style={styles.canteenSummary}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryIcon}>
                  <Feather name="coffee" size={22} color={colors.primary} />
                </View>
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Active</Text>
                </View>
              </View>
              <Text style={styles.summaryTitle}>
                {canteen?.name ?? "Campus canteen"}
              </Text>
              <Text style={styles.summaryCopy}>
                Choose available items below. Your cart stays with this canteen
                until checkout.
              </Text>
              <View style={styles.feeRow}>
                <Feather name="truck" size={15} color={colors.primary} />
                <Text style={styles.feeText}>
                  {formatCurrency(500)} delivery fee added at checkout
                </Text>
              </View>
            </MotionView>

            <View style={styles.menuHeader}>
              <View>
                <Text style={styles.menuEyebrow}>MENU</Text>
                <Text style={styles.menuTitle}>Available items</Text>
              </View>
              {!isLoading && !isError ? (
                <Text style={styles.itemCount}>
                  {menuItems?.length ?? 0} items
                </Text>
              ) : null}
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2].map((value) => (
                <View key={value} style={styles.skeletonCard}>
                  <View style={styles.skeletonCopy}>
                    <SkeletonBlock height={16} width="62%" />
                    <SkeletonBlock height={12} width="38%" />
                    <SkeletonBlock height={11} width="88%" />
                  </View>
                  <SkeletonBlock height={40} width={74} />
                </View>
              ))}
            </View>
          ) : isError ? (
            <EmptyState
              icon="wifi-off"
              title="Menu could not be loaded"
              copy="Your existing cart is safe. Retry when your connection is available."
              actionLabel="Retry"
              onAction={() => void refetch()}
            />
          ) : (
            <EmptyState
              icon="coffee"
              title="No menu items available"
              copy="This canteen is active, but it has no menu items available for ordering right now."
            />
          )
        }
        renderItem={({ item, index }) => {
          const cartItem = items.find((candidate) => candidate.id === item.id);
          const quantity = cartItem?.quantity ?? 0;
          return (
            <MotionView delay={Math.min(index * 40, 200)}>
              <DishRow
                item={item}
                quantity={quantity}
                onAdd={() =>
                  addItem({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    canteenId: id,
                    canteenName: canteen?.name ?? "Campus Canteen",
                  })
                }
                onRemove={() => removeItem(item.id)}
                onIncrease={() => updateQuantity(item.id, quantity + 1)}
              />
            </MotionView>
          );
        }}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              totalItems > 0 ? 118 + insets.bottom : 30 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {totalItems > 0 ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(160)}
          style={[
            styles.cartBarWrap,
            { bottom: Math.max(12, insets.bottom + 8) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View cart and checkout"
            onPress={() => router.push("/checkout" as never)}
            style={({ pressed }) => [styles.cartBar, pressed && styles.pressed]}
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{totalItems}</Text>
            </View>
            <View style={styles.cartCopy}>
              <Text style={styles.cartLabel}>Cart total</Text>
              <Text style={styles.cartTotal}>{formatCurrency(totalPrice)}</Text>
            </View>
            <View style={styles.cartAction}>
              <Text style={styles.cartActionText}>View Cart</Text>
              <Feather name="arrow-right" size={16} color={colors.white} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function DishRow({
  item,
  quantity,
  onAdd,
  onRemove,
  onIncrease,
}: {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  onIncrease: () => void;
}) {
  return (
    <View
      style={[styles.dishCard, !item.isAvailable && styles.dishUnavailable]}
    >
      <View style={styles.dishCopy}>
        <View style={styles.dishTitleRow}>
          <View
            style={[
              styles.availabilityDot,
              !item.isAvailable && styles.unavailableDot,
            ]}
          />
          <Text numberOfLines={2} style={styles.dishName}>
            {item.name}
          </Text>
        </View>
        <Text style={styles.dishPrice}>{formatCurrency(item.price)}</Text>
        <Text style={styles.dishDescription}>
          {item.isAvailable
            ? "Available for this order"
            : "Temporarily unavailable"}
        </Text>
      </View>

      {quantity === 0 ? (
        <Pressable
          accessibilityRole="button"
          disabled={!item.isAvailable}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addButton,
            !item.isAvailable && styles.disabledButton,
            pressed && item.isAvailable && styles.pressed,
          ]}
        >
          <Feather name="plus" size={15} color={colors.primaryStrong} />
          <Text style={styles.addText}>ADD</Text>
        </Pressable>
      ) : (
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel={`Remove one ${item.name}`}
            onPress={onRemove}
            style={styles.stepButton}
          >
            <Feather name="minus" size={16} color={colors.primaryStrong} />
          </Pressable>
          <Text style={styles.quantityText}>{quantity}</Text>
          <Pressable
            accessibilityLabel={`Add one ${item.name}`}
            onPress={onIncrease}
            disabled={!item.isAvailable}
            style={[styles.stepButton, styles.stepButtonAccent]}
          >
            <Feather name="plus" size={16} color={colors.white} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    height: 7,
    width: 7,
  },
  activePill: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderColor: "#B7DEC8",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minWidth: 76,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  addText: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  availabilityDot: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  cartAction: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  cartActionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  cartBar: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: "#B7D7D5",
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 11,
    ...shadow,
  },
  cartBarWrap: {
    left: 16,
    position: "absolute",
    right: 16,
  },
  cartCopy: {
    flex: 1,
  },
  cartCount: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  cartCountText: {
    color: colors.primaryStrong,
    fontSize: 15,
    fontWeight: "900",
  },
  cartLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  cartTotal: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  canteenSummary: {
    backgroundColor: colors.panel,
    borderColor: "#BAD9D7",
    borderRadius: radius.xl,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
    ...shadow,
  },
  content: {
    paddingHorizontal: 18,
  },
  disabledButton: {
    opacity: 0.45,
  },
  dishCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    marginBottom: 11,
    padding: 14,
  },
  dishCopy: {
    flex: 1,
  },
  dishDescription: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 5,
  },
  dishName: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  dishPrice: {
    color: colors.primaryStrong,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 5,
  },
  dishTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  dishUnavailable: {
    backgroundColor: colors.bgElevated,
  },
  feeRow: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 8,
    marginTop: 15,
    padding: 11,
  },
  feeText: {
    color: colors.primaryStrong,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.bg,
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
    fontSize: 18,
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
  itemCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  menuEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  menuHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 24,
  },
  menuTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
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
  skeletonCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonList: {
    gap: 11,
  },
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
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
    gap: 7,
    padding: 4,
  },
  summaryCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  summaryIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 18,
  },
  summaryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  unavailableDot: {
    backgroundColor: colors.faint,
  },
});
