import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";
import { useCart } from "~/components/cart/CartContext";
import { colors, formatCurrency } from "~/app/_components/theme";

type MenuItem = RouterOutputs["menu"]["listByCanteen"][number];

const coverImages = [
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=80",
];

export default function CanteenDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: canteens } = useQuery(trpc.canteen.listActive.queryOptions());
  const { data: menuItems, isLoading } = useQuery({
    ...trpc.menu.listByCanteen.queryOptions({ canteenId: id }),
    enabled: !!id,
  });

  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    totalItems,
    totalPrice,
  } = useCart();

  const canteen = canteens?.find((item) => item.id === id);
  const coverImage = coverImages[Math.abs(id?.length ?? 0) % coverImages.length] ?? coverImages[0];

  return (
    <View style={styles.root}>
      <FlatList
        data={menuItems ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Image source={{ uri: coverImage }} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.heroShade} />
              <SafeAreaView style={styles.heroControls} edges={["top"]}>
                <Pressable onPress={() => router.back()} style={styles.iconButton}>
                  <Feather name="arrow-left" size={20} color={colors.text} />
                </Pressable>
                <View style={styles.openPill}>
                  <View style={styles.openDot} />
                  <Text style={styles.openText}>Open Now</Text>
                </View>
              </SafeAreaView>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>{canteen?.name ?? "Campus Canteen"}</Text>
                <View style={styles.heroMetaRow}>
                  <Feather name="clock" size={14} color="#ddd6fe" />
                  <Text style={styles.heroMeta}>15-20 mins</Text>
                  <Text style={styles.heroMetaDot}>.</Text>
                  <Feather name="map-pin" size={14} color="#ddd6fe" />
                  <Text style={styles.heroMeta}>Campus landmark area</Text>
                </View>
              </View>
            </View>

            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Recommended Menu</Text>
              <Text style={styles.menuSubtitle}>
                Fresh items ready for campus delivery
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <>
                <ActivityIndicator color={colors.purple} />
                <Text style={styles.emptyTitle}>Loading menu</Text>
              </>
            ) : (
              <>
                <Feather name="coffee" size={34} color={colors.faint} />
                <Text style={styles.emptyTitle}>No menu items yet</Text>
                <Text style={styles.emptyCopy}>
                  This canteen has not published items for mobile ordering.
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const cartItem = items.find((cartItem) => cartItem.id === item.id);
          const quantity = cartItem?.quantity ?? 0;
          return (
            <DishRow
              item={item}
              quantity={quantity}
              canteenId={id}
              canteenName={canteen?.name ?? "Campus Canteen"}
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
          );
        }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(120, insets.bottom + 112) },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {totalItems > 0 ? (
        <View style={[styles.cartBarWrap, { bottom: Math.max(18, insets.bottom + 14) }]}>
          <View style={styles.cartBar}>
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{totalItems}</Text>
            </View>
            <View style={styles.cartCopy}>
              <Text style={styles.cartLabel}>Cart Total</Text>
              <Text style={styles.cartTotal}>{formatCurrency(totalPrice)}</Text>
            </View>
            <Pressable
              onPress={() => router.push("/checkout")}
              style={({ pressed }) => [styles.cartButton, pressed && styles.pressed]}
            >
              <Text style={styles.cartButtonText}>View Cart</Text>
              <Feather name="chevron-up" size={16} color={colors.text} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DishRow({
  item,
  quantity,
  canteenId,
  canteenName,
  onAdd,
  onRemove,
  onIncrease,
}: {
  item: MenuItem;
  quantity: number;
  canteenId: string;
  canteenName: string;
  onAdd: () => void;
  onRemove: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.dishCard}>
      <View style={styles.dishCopy}>
        <View style={styles.dishTitleRow}>
          <View style={[styles.availabilityDot, !item.isAvailable && styles.unavailableDot]} />
          <Text numberOfLines={2} style={styles.dishName}>{item.name}</Text>
        </View>
        <Text style={styles.dishPrice}>{formatCurrency(item.price)}</Text>
        <Text numberOfLines={2} style={styles.dishDescription}>
          {item.isAvailable
            ? `A campus favorite from ${canteenName}.`
            : "Temporarily unavailable from this canteen."}
        </Text>
        <View style={[styles.availabilityPill, !item.isAvailable && styles.unavailablePill]}>
          <Text style={[styles.availabilityText, !item.isAvailable && styles.unavailableText]}>
            {item.isAvailable ? "Available" : "Unavailable"}
          </Text>
        </View>
      </View>

      <View style={styles.stepperWrap}>
        {quantity === 0 ? (
          <Pressable
            disabled={!item.isAvailable}
            onPress={onAdd}
            style={({ pressed }) => [
              styles.addButton,
              !item.isAvailable && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.addText}>ADD</Text>
          </Pressable>
        ) : (
          <View style={styles.stepper}>
            <Pressable onPress={onRemove} style={styles.stepButton}>
              <Feather name="minus" size={16} color="#ddd6fe" />
            </Pressable>
            <Text style={styles.quantityText}>{quantity}</Text>
            <Pressable
              onPress={onIncrease}
              disabled={!item.isAvailable}
              style={[styles.stepButton, styles.stepButtonAccent]}
            >
              <Feather name="plus" size={16} color={colors.text} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    backgroundColor: "#22163b",
    borderColor: "#6d28d9",
    borderRadius: 13,
    borderWidth: 1,
    minWidth: 74,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addText: {
    color: "#ddd6fe",
    fontSize: 13,
    fontWeight: "900",
  },
  availabilityDot: {
    backgroundColor: colors.emerald,
    borderRadius: 99,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  availabilityPill: {
    alignSelf: "flex-start",
    backgroundColor: "#062d22",
    borderColor: "#14532d",
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  availabilityText: {
    color: "#86efac",
    fontSize: 10,
    fontWeight: "900",
  },
  cartBar: {
    alignItems: "center",
    backgroundColor: "#211238",
    borderColor: "#6d28d9",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  cartBarWrap: {
    left: 16,
    position: "absolute",
    right: 16,
  },
  cartButton: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 14,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  cartButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  cartCopy: {
    flex: 1,
  },
  cartCount: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  cartCountText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  cartLabel: {
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "800",
  },
  cartTotal: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 2,
  },
  content: {
    backgroundColor: colors.bg,
  },
  disabledButton: {
    opacity: 0.45,
  },
  dishCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    marginBottom: 13,
    marginHorizontal: 18,
    padding: 14,
  },
  dishCopy: {
    flex: 1,
  },
  dishDescription: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  dishName: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  dishPrice: {
    color: "#c4b5fd",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },
  dishTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  empty: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginHorizontal: 18,
    minHeight: 180,
    justifyContent: "center",
    padding: 24,
  },
  emptyCopy: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 10,
  },
  hero: {
    backgroundColor: colors.panelStrong,
    height: 270,
    marginBottom: 22,
    position: "relative",
  },
  heroControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 16,
    position: "absolute",
    right: 16,
    top: 0,
  },
  heroCopy: {
    bottom: 22,
    left: 18,
    position: "absolute",
    right: 18,
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  heroMeta: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "800",
  },
  heroMetaDot: {
    color: colors.muted,
    fontSize: 12,
  },
  heroMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 8,
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  menuHeader: {
    marginBottom: 14,
    paddingHorizontal: 18,
  },
  menuSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  menuTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
  },
  openDot: {
    backgroundColor: colors.emerald,
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  openPill: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    borderColor: "rgba(16,185,129,0.5)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  openText: {
    color: "#86efac",
    fontSize: 11,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.74,
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
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderRadius: 11,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  stepButtonAccent: {
    backgroundColor: colors.purple,
  },
  stepper: {
    alignItems: "center",
    backgroundColor: "#211238",
    borderColor: "#6d28d9",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 4,
  },
  stepperWrap: {
    alignItems: "flex-end",
  },
  unavailableDot: {
    backgroundColor: colors.faint,
  },
  unavailablePill: {
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
  },
  unavailableText: {
    color: colors.faint,
  },
});
