import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { supabase } from "~/utils/auth";
import { colors, formatCurrency, radius, shadow } from "./theme";

interface ShellHeaderProps {
  title?: string;
  subtitle?: string;
}

export function ShellHeader({
  title = "CAmpDeliver",
  subtitle,
}: ShellHeaderProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    retry: false,
  });
  const { mutateAsync: clearPushToken } = useMutation(
    trpc.auth.clearPushToken.mutationOptions(),
  );

  const initial = profile?.name[0]?.toUpperCase() ?? "C";
  const isAdmin = profile?.role === "ADMIN";

  const closeAndGo = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  const performSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await clearPushToken().catch((error: unknown) =>
        console.warn("Unable to unregister push notifications:", error),
      );
      await supabase.auth.signOut();
      setOpen(false);
      router.replace("/auth" as never);
    } finally {
      setSigningOut(false);
    }
  };

  const requestSignOut = () => {
    Alert.alert(
      "Sign out of CAmpDeliver?",
      "You can sign back in with your phone number and password.",
      [
        { text: "Stay signed in", style: "cancel" },
        { text: "Sign out", onPress: () => void performSignOut() },
      ],
    );
  };

  return (
    <>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Feather name="navigation" size={16} color={colors.white} />
          </View>
          <View style={styles.titleWrap}>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          {profile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open wallet"
              onPress={() => router.push("/wallet" as never)}
              style={({ pressed }) => [
                styles.walletPill,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="credit-card" size={13} color={colors.primary} />
              <Text style={styles.walletText}>
                {formatCurrency(profile.walletBalance)}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account menu"
            onPress={() => setOpen(true)}
            style={({ pressed }) => [
              styles.avatarButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close account menu"
            style={styles.backdrop}
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.drawer,
              {
                paddingTop: Math.max(20, insets.top + 12),
                paddingBottom: Math.max(20, insets.bottom + 12),
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerKicker}>Account</Text>
                <Text style={styles.drawerTitle}>Campus dashboard</Text>
              </View>
              <Pressable
                accessibilityLabel="Close account menu"
                onPress={() => setOpen(false)}
                style={styles.iconButton}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{initial}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text numberOfLines={1} style={styles.profileName}>
                  {profile?.name ?? "Campus Student"}
                </Text>
                <Text numberOfLines={1} style={styles.profileMeta}>
                  {profile?.hostelName ?? "CAmpDeliver member"}
                </Text>
              </View>
            </View>

            <Text style={styles.groupLabel}>Quick navigation</Text>
            <View style={styles.linkGroup}>
              <DrawerLink
                icon="package"
                label="Orders"
                helper="Current and completed deliveries"
                onPress={() => closeAndGo("/history_tab")}
              />
              <DrawerLink
                icon="navigation"
                label="Quests"
                helper="Nearby delivery requests"
                onPress={() => closeAndGo("/quests")}
              />
              <DrawerLink
                icon="credit-card"
                label="Wallet"
                helper="Balance and test top-ups"
                onPress={() => closeAndGo("/wallet")}
              />
            </View>

            {isAdmin ? (
              <View style={styles.adminGroup}>
                <Text style={styles.groupLabel}>Administration</Text>
                <DrawerLink
                  icon="shopping-bag"
                  label="Canteens"
                  helper="Catalog and availability"
                  onPress={() => closeAndGo("/admin/canteens")}
                />
                <DrawerLink
                  icon="map-pin"
                  label="Landmarks"
                  helper="Campus delivery zones"
                  onPress={() => closeAndGo("/admin/landmarks")}
                />
              </View>
            ) : null}

            <View style={styles.drawerFooter}>
              <Pressable
                accessibilityRole="button"
                disabled={signingOut}
                onPress={requestSignOut}
                style={({ pressed }) => [
                  styles.signOutButton,
                  pressed && styles.pressed,
                  signingOut && styles.disabled,
                ]}
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.danger} size="small" />
                ) : (
                  <Feather name="log-out" size={16} color={colors.danger} />
                )}
                <Text style={styles.signOutText}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DrawerLink({
  icon,
  label,
  helper,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  helper: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.drawerLink, pressed && styles.pressed]}
    >
      <View style={styles.drawerLinkIcon}>
        <Feather name={icon} size={17} color={colors.primary} />
      </View>
      <View style={styles.drawerLinkCopy}>
        <Text style={styles.drawerLinkText}>{label}</Text>
        <Text numberOfLines={1} style={styles.drawerLinkHelper}>
          {helper}
        </Text>
      </View>
      <Feather name="chevron-right" size={17} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  adminGroup: {
    gap: 8,
    marginTop: 20,
  },
  avatarButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: {
    color: colors.primaryStrong,
    fontWeight: "900",
  },
  backdrop: {
    flex: 1,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 10,
  },
  disabled: {
    opacity: 0.55,
  },
  drawer: {
    backgroundColor: colors.bgElevated,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    height: "100%",
    paddingHorizontal: 18,
    width: "86%",
  },
  drawerFooter: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: "auto",
    paddingTop: 16,
  },
  drawerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  drawerKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  drawerLink: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 12,
  },
  drawerLinkCopy: {
    flex: 1,
  },
  drawerLinkHelper: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  drawerLinkIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  drawerLinkText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 2,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    backgroundColor: "rgba(244,248,248,0.98)",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  linkGroup: {
    gap: 8,
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  modalRoot: {
    backgroundColor: colors.overlay,
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  profileAvatarText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900",
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    padding: 14,
    ...shadow,
  },
  profileCopy: {
    flex: 1,
  },
  profileMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  profileName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  signOutButton: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: "#E4CCB5",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  titleWrap: {
    flexShrink: 1,
  },
  walletPill: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  walletText: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "800",
  },
});
