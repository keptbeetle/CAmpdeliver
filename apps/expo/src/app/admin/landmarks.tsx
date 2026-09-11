import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { colors } from "~/components/app/theme";
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

type Landmark = RouterOutputs["landmark"]["listAll"][number];

const CAMPUS_LOCATION = { latitude: 23.1765, longitude: 80.0211 };
const NEW_LANDMARK = {
  name: "",
  latitude: CAMPUS_LOCATION.latitude,
  longitude: CAMPUS_LOCATION.longitude,
  radiusText: "150",
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

export default function ManageLandmarksScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(NEW_LANDMARK);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const profileQuery = useQuery(trpc.auth.getMyProfile.queryOptions());
  const isAdmin = profileQuery.data?.role === "ADMIN";
  const landmarksQuery = useQuery({
    ...trpc.landmark.listAll.queryOptions(),
    enabled: isAdmin,
  });

  const createLandmark = useMutation(trpc.landmark.create.mutationOptions());
  const updateLandmark = useMutation(trpc.landmark.update.mutationOptions());
  const deleteLandmark = useMutation(trpc.landmark.delete.mutationOptions());

  const landmarks = landmarksQuery.data ?? [];
  const selectedLandmark =
    landmarks.find((landmark) => landmark.id === selectedId) ?? null;

  const refreshLandmarks = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.landmark.listAll.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.landmark.list.queryKey(),
      }),
    ]);
  }, [queryClient]);

  const beginNew = () => {
    setSelectedId(null);
    setDraft(NEW_LANDMARK);
  };

  const selectLandmark = (landmark: Landmark) => {
    setSelectedId(landmark.id);
    setDraft({
      name: landmark.name,
      latitude: landmark.latitude,
      longitude: landmark.longitude,
      radiusText: String(landmark.radius),
      isActive: landmark.isActive,
    });
  };

  const saveLandmark = async () => {
    if (busyKey) return;
    const name = draft.name.trim();
    const radiusMeters = Number(draft.radiusText);
    if (!name) {
      showAppAlert("Landmark name required", "Enter a name before saving.");
      return;
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      showAppAlert(
        "Invalid delivery radius",
        "Radius must be greater than 0 metres.",
      );
      return;
    }
    if (!validLocation(draft.latitude, draft.longitude)) {
      showAppAlert(
        "Invalid map location",
        "Place the landmark at a valid map coordinate.",
      );
      return;
    }

    setBusyKey("landmark-save");
    try {
      const payload = {
        name,
        latitude: draft.latitude,
        longitude: draft.longitude,
        radius: Math.round(radiusMeters),
        isActive: draft.isActive,
      };
      if (selectedId) {
        await updateLandmark.mutateAsync({ id: selectedId, ...payload });
        showAppAlert(
          "Landmark updated",
          `${name} now uses the latest delivery zone.`,
        );
      } else {
        await createLandmark.mutateAsync(payload);
        showAppAlert(
          "Landmark created",
          `${name} is now part of campus delivery zones.`,
        );
        beginNew();
      }
      await refreshLandmarks();
    } catch (error) {
      showAppAlert("Could not save landmark", errorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const requestDeleteLandmark = () => {
    if (!selectedId || busyKey) return;
    confirmAppAction({
      title: "Delete this landmark?",
      message:
        "This removes the saved campus marker. Existing order snapshots are not rewritten.",
      confirmLabel: "Delete landmark",
      destructive: true,
      onConfirm: () => {
        void (async () => {
          setBusyKey("landmark-delete");
          try {
            await deleteLandmark.mutateAsync(selectedId);
            await refreshLandmarks();
            beginNew();
            showAppAlert("Landmark deleted");
          } catch (error) {
            showAppAlert("Could not delete landmark", errorMessage(error));
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
      await landmarksQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [landmarksQuery]);

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
        title="Landmark manager"
        subtitle="Hostels, blocks & delivery zones"
        icon="map-pin"
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
            icon="crosshair"
            title="Place delivery zones on campus"
            copy="Tap the Android map to move the marker. The shaded ring previews the radius used when matching delivery locations to nearby landmarks."
          />

          <SectionCard>
            <AdminSectionTitle
              icon="map-pin"
              title="Saved landmarks"
              copy={`${landmarks.length} configured · inactive zones remain editable`}
              action={
                <Pressable
                  accessibilityLabel="Add new landmark"
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

            {landmarksQuery.isLoading ? (
              <View style={styles.stateGap}>
                <LoadingState title="Loading landmarks" />
              </View>
            ) : landmarksQuery.isError ? (
              <View style={styles.stateGap}>
                <EmptyState
                  icon="wifi-off"
                  title="Landmarks could not be loaded"
                  copy="Pull to refresh or check the admin session."
                />
              </View>
            ) : landmarks.length === 0 ? (
              <View style={styles.stateGap}>
                <EmptyState
                  icon="map-pin"
                  title="No landmarks configured"
                  copy="Create the first hostel or campus block below."
                />
              </View>
            ) : (
              <View style={styles.entityList}>
                {landmarks.map((landmark) => (
                  <AdminEntityCard
                    key={landmark.id}
                    icon="map-pin"
                    title={landmark.name}
                    meta={`${landmark.radius} m delivery radius · ${landmark.isActive ? "Active" : "Inactive"}`}
                    active={landmark.isActive}
                    selected={selectedId === landmark.id}
                    onPress={() => selectLandmark(landmark)}
                  />
                ))}
              </View>
            )}
          </SectionCard>

          <SectionCard>
            <AdminSectionTitle
              icon={selectedId ? "edit-3" : "plus-circle"}
              title={selectedId ? "Edit landmark" : "New landmark"}
              copy={
                selectedLandmark
                  ? `Editing ${selectedLandmark.name}`
                  : "Place the marker and define how large this delivery zone should be."
              }
            />

            <View style={styles.formGap}>
              <AdminField
                label="Landmark name"
                value={draft.name}
                onChangeText={(name) =>
                  setDraft((current) => ({ ...current, name }))
                }
                placeholder="e.g. Hostel 3"
                autoCapitalize="words"
                editable={!busyKey}
              />
              <AdminField
                label="Delivery radius (metres)"
                value={draft.radiusText}
                onChangeText={(radiusText) =>
                  setDraft((current) => ({ ...current, radiusText }))
                }
                placeholder="150"
                keyboardType="number-pad"
                inputMode="numeric"
                editable={!busyKey}
                helper="Used to label checkout locations and surface the nearest campus landmark."
              />
              <AdminSwitchRow
                label="Active landmark"
                helper="Inactive landmarks stay stored but are excluded from checkout matching."
                value={draft.isActive}
                onValueChange={(isActive) =>
                  setDraft((current) => ({ ...current, isActive }))
                }
                disabled={Boolean(busyKey)}
              />

              <AdminLocationPicker
                kind="landmark"
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
                      loading={busyKey === "landmark-delete"}
                      disabled={Boolean(
                        busyKey && busyKey !== "landmark-delete",
                      )}
                      onPress={requestDeleteLandmark}
                    />
                  </View>
                ) : null}
                <View style={styles.actionFlexWide}>
                  <AppButton
                    label={selectedId ? "Save changes" : "Create landmark"}
                    icon="check"
                    loading={busyKey === "landmark-save"}
                    disabled={Boolean(busyKey && busyKey !== "landmark-save")}
                    onPress={() => void saveLandmark()}
                  />
                </View>
              </View>
            </View>
          </SectionCard>
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
  pressed: {
    opacity: 0.8,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  stateGap: {
    marginTop: 14,
  },
});
