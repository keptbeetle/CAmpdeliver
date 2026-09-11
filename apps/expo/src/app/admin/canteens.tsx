import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import {
  AdminEntityCard,
  AdminField,
  AdminScreenHeader,
  AdminSectionTitle,
  AdminSwitchRow,
} from "~/components/admin/AdminControls";
import { colors, formatCurrency, radius, shadow } from "~/components/app/theme";
import {
  AppButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  SectionCard,
} from "~/components/app/ui";
import { AdminLocationPicker } from "~/components/maps/AdminLocationPicker";
import { trpc } from "~/utils/api";
import { confirmAppAction, showAppAlert } from "~/utils/dialog";

type Canteen = RouterOutputs["canteen"]["listAll"][number];
type MenuItem = RouterOutputs["menu"]["listByCanteen"][number];

const CAMPUS_LOCATION = { latitude: 23.1765, longitude: 80.0211 };
const NEW_CANTEEN = {
  name: "",
  latitude: CAMPUS_LOCATION.latitude,
  longitude: CAMPUS_LOCATION.longitude,
  radiusText: "50",
  isActive: true,
};

function validLocation(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

export default function ManageCanteensScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(NEW_CANTEEN);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuPrice, setNewMenuPrice] = useState("");
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editMenuName, setEditMenuName] = useState("");
  const [editMenuPrice, setEditMenuPrice] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const profileQuery = useQuery(trpc.auth.getMyProfile.queryOptions());
  const isAdmin = profileQuery.data?.role === "ADMIN";
  const canteensQuery = useQuery({
    ...trpc.canteen.listAll.queryOptions(),
    enabled: isAdmin,
  });
  const menuQuery = useQuery({
    ...trpc.menu.listByCanteen.queryOptions({ canteenId: selectedId ?? "" }),
    enabled: isAdmin && Boolean(selectedId),
  });

  const createCanteen = useMutation(trpc.canteen.create.mutationOptions());
  const updateCanteen = useMutation(trpc.canteen.update.mutationOptions());
  const deleteCanteen = useMutation(trpc.canteen.delete.mutationOptions());
  const createMenu = useMutation(trpc.menu.create.mutationOptions());
  const updateMenu = useMutation(trpc.menu.update.mutationOptions());
  const deleteMenu = useMutation(trpc.menu.delete.mutationOptions());

  const canteens = canteensQuery.data ?? [];
  const selectedCanteen =
    canteens.find((canteen) => canteen.id === selectedId) ?? null;

  const refreshCanteens = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.canteen.listAll.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.canteen.listActive.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.canteen.listActiveWithMenu.queryKey(),
      }),
    ]);
  }, [queryClient]);

  const refreshMenu = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.menu.listByCanteen.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.canteen.listActiveWithMenu.queryKey(),
      }),
    ]);
  }, [queryClient]);

  const beginNew = () => {
    setSelectedId(null);
    setDraft(NEW_CANTEEN);
    setEditingMenuId(null);
    setNewMenuName("");
    setNewMenuPrice("");
  };

  const selectCanteen = (canteen: Canteen) => {
    setSelectedId(canteen.id);
    setDraft({
      name: canteen.name,
      latitude: canteen.latitude,
      longitude: canteen.longitude,
      radiusText: String(canteen.radius),
      isActive: canteen.isActive,
    });
    setEditingMenuId(null);
  };

  const saveCanteen = async () => {
    if (busyKey) return;
    const name = draft.name.trim();
    const radiusMeters = Number(draft.radiusText);
    if (!name) {
      showAppAlert("Canteen name required", "Enter a name before saving.");
      return;
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      showAppAlert(
        "Invalid pickup radius",
        "Radius must be greater than 0 metres.",
      );
      return;
    }
    if (!validLocation(draft.latitude, draft.longitude)) {
      showAppAlert(
        "Invalid map location",
        "Place the canteen at a valid map coordinate.",
      );
      return;
    }

    setBusyKey("canteen-save");
    try {
      const payload = {
        name,
        latitude: draft.latitude,
        longitude: draft.longitude,
        radius: Math.round(radiusMeters),
        isActive: draft.isActive,
      };
      if (selectedId) {
        await updateCanteen.mutateAsync({ id: selectedId, ...payload });
        showAppAlert(
          "Canteen updated",
          `${name} is ready with the latest settings.`,
        );
      } else {
        const created = await createCanteen.mutateAsync(payload);
        if (created?.id) setSelectedId(created.id);
        showAppAlert(
          "Canteen created",
          `${name} is now available in admin tools.`,
        );
      }
      await refreshCanteens();
    } catch (error) {
      showAppAlert("Could not save canteen", errorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const requestDeleteCanteen = () => {
    if (!selectedId || busyKey) return;
    confirmAppAction({
      title: "Delete this canteen?",
      message:
        "This removes the canteen and its associated menu data. Historical orders remain governed by the database constraints.",
      confirmLabel: "Delete canteen",
      destructive: true,
      onConfirm: () => {
        void (async () => {
          setBusyKey("canteen-delete");
          try {
            await deleteCanteen.mutateAsync({ id: selectedId });
            await refreshCanteens();
            beginNew();
            showAppAlert("Canteen deleted");
          } catch (error) {
            showAppAlert("Could not delete canteen", errorMessage(error));
          } finally {
            setBusyKey(null);
          }
        })();
      },
    });
  };

  const addMenuItem = async () => {
    if (!selectedId || busyKey) return;
    const name = newMenuName.trim();
    const rupees = Number(newMenuPrice);
    if (!name) {
      showAppAlert("Item name required");
      return;
    }
    if (!Number.isFinite(rupees) || rupees <= 0) {
      showAppAlert("Invalid price", "Enter a price greater than ₹0.");
      return;
    }

    setBusyKey("menu-create");
    try {
      await createMenu.mutateAsync({
        canteenId: selectedId,
        name,
        price: Math.round(rupees * 100),
        isAvailable: true,
      });
      setNewMenuName("");
      setNewMenuPrice("");
      await refreshMenu();
    } catch (error) {
      showAppAlert("Could not add menu item", errorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const toggleMenuAvailability = async (item: MenuItem, value: boolean) => {
    if (busyKey) return;
    setBusyKey(`menu-toggle-${item.id}`);
    try {
      await updateMenu.mutateAsync({ id: item.id, isAvailable: value });
      await refreshMenu();
    } catch (error) {
      showAppAlert("Could not update availability", errorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const beginEditMenu = (item: MenuItem) => {
    setEditingMenuId(item.id);
    setEditMenuName(item.name);
    setEditMenuPrice((item.price / 100).toFixed(2));
  };

  const saveMenuEdit = async (item: MenuItem) => {
    if (busyKey) return;
    const name = editMenuName.trim();
    const rupees = Number(editMenuPrice);
    if (!name || !Number.isFinite(rupees) || rupees <= 0) {
      showAppAlert(
        "Check item details",
        "Use a name and a positive rupee price.",
      );
      return;
    }

    setBusyKey(`menu-edit-${item.id}`);
    try {
      await updateMenu.mutateAsync({
        id: item.id,
        name,
        price: Math.round(rupees * 100),
      });
      setEditingMenuId(null);
      await refreshMenu();
    } catch (error) {
      showAppAlert("Could not update menu item", errorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const requestDeleteMenu = (item: MenuItem) => {
    if (busyKey) return;
    confirmAppAction({
      title: `Delete ${item.name}?`,
      message: "This removes the item from the canteen menu.",
      confirmLabel: "Delete item",
      destructive: true,
      onConfirm: () => {
        void (async () => {
          setBusyKey(`menu-delete-${item.id}`);
          try {
            await deleteMenu.mutateAsync({ id: item.id });
            if (editingMenuId === item.id) setEditingMenuId(null);
            await refreshMenu();
          } catch (error) {
            showAppAlert("Could not delete menu item", errorMessage(error));
          } finally {
            setBusyKey(null);
          }
        })();
      },
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        canteensQuery.refetch(),
        selectedId ? menuQuery.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [canteensQuery, menuQuery, selectedId]);

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <LoadingState title="Checking admin access" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) return <Redirect href="/" />;

  const radiusMeters = Number(draft.radiusText);
  const mapRadius =
    Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 1;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <AdminScreenHeader
        title="Canteen manager"
        subtitle="Catalog, pickup zones & menus"
        icon="shopping-bag"
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <InlineNotice
            icon="map"
            title="Mobile admin map"
            copy="Tap the map to place the pickup marker. The shaded ring is the radius used by nearby delivery quest logic."
          />

          <SectionCard style={styles.sectionGap}>
            <AdminSectionTitle
              icon="coffee"
              title="Campus canteens"
              copy={`${canteens.length} configured · inactive locations stay editable`}
              action={
                <Pressable
                  accessibilityLabel="Add new canteen"
                  accessibilityRole="button"
                  onPress={beginNew}
                  style={({ pressed }) => [
                    styles.addIcon,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name="plus" size={19} color={colors.white} />
                </Pressable>
              }
            />

            {canteensQuery.isLoading ? (
              <LoadingState title="Loading canteens" />
            ) : canteensQuery.isError ? (
              <EmptyState
                icon="wifi-off"
                title="Canteens could not be loaded"
                copy="Pull to refresh or check the admin session."
              />
            ) : canteens.length === 0 ? (
              <EmptyState
                icon="coffee"
                title="No canteens configured"
                copy="Create the first pickup point below."
              />
            ) : (
              <View style={styles.entityList}>
                {canteens.map((canteen) => (
                  <AdminEntityCard
                    key={canteen.id}
                    icon="coffee"
                    title={canteen.name}
                    meta={`${canteen.radius} m pickup radius · ${canteen.isActive ? "Active" : "Inactive"}`}
                    active={canteen.isActive}
                    selected={selectedId === canteen.id}
                    onPress={() => selectCanteen(canteen)}
                  />
                ))}
              </View>
            )}
          </SectionCard>

          <SectionCard style={styles.sectionGap}>
            <AdminSectionTitle
              icon={selectedId ? "edit-3" : "plus-circle"}
              title={selectedId ? "Edit canteen" : "New canteen"}
              copy={
                selectedCanteen
                  ? `Editing ${selectedCanteen.name}`
                  : "Place the marker, define the pickup radius, then save."
              }
            />

            <View style={styles.formGap}>
              <AdminField
                label="Canteen name"
                value={draft.name}
                onChangeText={(name) =>
                  setDraft((current) => ({ ...current, name }))
                }
                placeholder="e.g. Night Canteen"
                autoCapitalize="words"
                editable={!busyKey}
              />
              <AdminField
                label="Pickup radius (metres)"
                value={draft.radiusText}
                onChangeText={(radiusText) =>
                  setDraft((current) => ({ ...current, radiusText }))
                }
                placeholder="50"
                keyboardType="number-pad"
                inputMode="numeric"
                editable={!busyKey}
                helper="Deliverers use this zone when discovering nearby quests."
              />
              <AdminSwitchRow
                label="Active for ordering"
                helper="Inactive canteens stay in admin history but disappear from buyer discovery."
                value={draft.isActive}
                onValueChange={(isActive) =>
                  setDraft((current) => ({ ...current, isActive }))
                }
                disabled={Boolean(busyKey)}
              />

              <AdminLocationPicker
                kind="canteen"
                latitude={draft.latitude}
                longitude={draft.longitude}
                radiusMeters={mapRadius}
                onLocationChange={(latitude, longitude) =>
                  setDraft((current) => ({ ...current, latitude, longitude }))
                }
              />

              <View style={styles.coordinateRow}>
                <View style={styles.coordinateField}>
                  <AdminField
                    label="Latitude"
                    value={draft.latitude.toFixed(6)}
                    editable={false}
                  />
                </View>
                <View style={styles.coordinateField}>
                  <AdminField
                    label="Longitude"
                    value={draft.longitude.toFixed(6)}
                    editable={false}
                  />
                </View>
              </View>

              <View style={styles.actionRow}>
                {selectedId ? (
                  <View style={styles.actionFlex}>
                    <AppButton
                      label="Delete"
                      icon="trash-2"
                      tone="danger"
                      loading={busyKey === "canteen-delete"}
                      disabled={Boolean(
                        busyKey && busyKey !== "canteen-delete",
                      )}
                      onPress={requestDeleteCanteen}
                    />
                  </View>
                ) : null}
                <View style={styles.actionFlexWide}>
                  <AppButton
                    label={selectedId ? "Save changes" : "Create canteen"}
                    icon="check"
                    loading={busyKey === "canteen-save"}
                    disabled={Boolean(busyKey && busyKey !== "canteen-save")}
                    onPress={() => void saveCanteen()}
                  />
                </View>
              </View>
            </View>
          </SectionCard>

          {selectedId ? (
            <SectionCard style={styles.sectionGap}>
              <AdminSectionTitle
                icon="list"
                title="Menu items"
                copy="Prices are stored in paise; availability changes affect buyer ordering immediately."
              />

              <View style={styles.formGap}>
                <View style={styles.menuAddCard}>
                  <Text style={styles.menuAddTitle}>Add an item</Text>
                  <AdminField
                    label="Item name"
                    value={newMenuName}
                    onChangeText={setNewMenuName}
                    placeholder="e.g. Veg Sandwich"
                    editable={!busyKey}
                  />
                  <AdminField
                    label="Price (₹)"
                    value={newMenuPrice}
                    onChangeText={setNewMenuPrice}
                    placeholder="60"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    editable={!busyKey}
                  />
                  <AppButton
                    label="Add menu item"
                    icon="plus"
                    tone="secondary"
                    loading={busyKey === "menu-create"}
                    disabled={Boolean(busyKey && busyKey !== "menu-create")}
                    onPress={() => void addMenuItem()}
                  />
                </View>

                {menuQuery.isLoading ? (
                  <LoadingState title="Loading menu" />
                ) : menuQuery.isError ? (
                  <InlineNotice
                    tone="danger"
                    icon="alert-circle"
                    title="Menu could not be loaded"
                    copy="Pull to refresh and try again."
                  />
                ) : (menuQuery.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    icon="shopping-bag"
                    title="No menu items yet"
                    copy="Add the first item above."
                  />
                ) : (
                  <View style={styles.menuList}>
                    {menuQuery.data?.map((item) => {
                      const editing = editingMenuId === item.id;
                      const itemBusy = busyKey?.includes(item.id) ?? false;
                      return (
                        <View key={item.id} style={styles.menuCard}>
                          {editing ? (
                            <View style={styles.formGapSmall}>
                              <AdminField
                                label="Item name"
                                value={editMenuName}
                                onChangeText={setEditMenuName}
                                editable={!busyKey}
                              />
                              <AdminField
                                label="Price (₹)"
                                value={editMenuPrice}
                                onChangeText={setEditMenuPrice}
                                keyboardType="decimal-pad"
                                inputMode="decimal"
                                editable={!busyKey}
                              />
                              <View style={styles.inlineActions}>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => setEditingMenuId(null)}
                                  style={({ pressed }) => [
                                    styles.smallButton,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Text style={styles.smallButtonText}>
                                    Cancel
                                  </Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={Boolean(busyKey)}
                                  onPress={() => void saveMenuEdit(item)}
                                  style={({ pressed }) => [
                                    styles.smallButtonPrimary,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Feather
                                    name="check"
                                    size={14}
                                    color={colors.white}
                                  />
                                  <Text style={styles.smallButtonPrimaryText}>
                                    {itemBusy ? "Saving…" : "Save"}
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          ) : (
                            <>
                              <View style={styles.menuTopRow}>
                                <View style={styles.menuCopy}>
                                  <Text style={styles.menuName}>
                                    {item.name}
                                  </Text>
                                  <Text style={styles.menuPrice}>
                                    {formatCurrency(item.price)}
                                  </Text>
                                </View>
                                <View style={styles.menuIconActions}>
                                  <Pressable
                                    accessibilityLabel={`Edit ${item.name}`}
                                    accessibilityRole="button"
                                    disabled={Boolean(busyKey)}
                                    onPress={() => beginEditMenu(item)}
                                    style={({ pressed }) => [
                                      styles.menuIconButton,
                                      pressed && styles.pressed,
                                    ]}
                                  >
                                    <Feather
                                      name="edit-2"
                                      size={15}
                                      color={colors.primaryStrong}
                                    />
                                  </Pressable>
                                  <Pressable
                                    accessibilityLabel={`Delete ${item.name}`}
                                    accessibilityRole="button"
                                    disabled={Boolean(busyKey)}
                                    onPress={() => requestDeleteMenu(item)}
                                    style={({ pressed }) => [
                                      styles.menuIconButtonDanger,
                                      pressed && styles.pressed,
                                    ]}
                                  >
                                    <Feather
                                      name="trash-2"
                                      size={15}
                                      color={colors.danger}
                                    />
                                  </Pressable>
                                </View>
                              </View>
                              <View style={styles.availabilityRow}>
                                <View>
                                  <Text style={styles.availabilityLabel}>
                                    Available to order
                                  </Text>
                                  <Text style={styles.availabilityHelper}>
                                    {item.isAvailable
                                      ? "Visible to buyers"
                                      : "Temporarily hidden"}
                                  </Text>
                                </View>
                                <Switch
                                  accessibilityLabel={`${item.name} availability`}
                                  disabled={Boolean(busyKey)}
                                  value={item.isAvailable}
                                  onValueChange={(value) =>
                                    void toggleMenuAvailability(item, value)
                                  }
                                  trackColor={{
                                    false: colors.borderStrong,
                                    true: colors.success,
                                  }}
                                  thumbColor={colors.white}
                                />
                              </View>
                            </>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </SectionCard>
          ) : (
            <InlineNotice
              tone="caution"
              icon="info"
              title="Save the canteen before adding menu items"
              copy="Once the canteen exists, its menu editor appears here automatically."
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionFlex: {
    flex: 0.75,
  },
  actionFlexWide: {
    flex: 1.25,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  addIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 13,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  availabilityHelper: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  availabilityLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  availabilityRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 42,
  },
  coordinateField: {
    flex: 1,
  },
  coordinateRow: {
    flexDirection: "row",
    gap: 10,
  },
  entityList: {
    gap: 9,
    marginTop: 14,
  },
  flex: {
    flex: 1,
  },
  formGap: {
    gap: 14,
    marginTop: 16,
  },
  formGapSmall: {
    gap: 10,
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  menuAddCard: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 11,
    padding: 13,
  },
  menuAddTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  menuCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 13,
    ...shadow,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
  },
  menuIconActions: {
    flexDirection: "row",
    gap: 7,
  },
  menuIconButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  menuIconButtonDanger: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  menuList: {
    gap: 9,
  },
  menuName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  menuPrice: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  menuTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  pressed: {
    opacity: 0.8,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sectionGap: {
    gap: 0,
  },
  smallButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 13,
  },
  smallButtonPrimary: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 13,
  },
  smallButtonPrimaryText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "900",
  },
  smallButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
});
