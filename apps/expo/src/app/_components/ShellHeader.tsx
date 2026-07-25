import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "~/utils/auth";
import { trpc } from "~/utils/api";
import { colors, formatCurrency } from "./theme";

type ShellHeaderProps = {
  title?: string;
  subtitle?: string;
};

export function ShellHeader({ title = "CAmpDeliver", subtitle }: ShellHeaderProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: profile } = useQuery({
    ...trpc.auth.getMyProfile.queryOptions(),
    retry: false,
  });

  const initial = profile?.name?.[0]?.toUpperCase() ?? "C";
  const isAdmin = profile?.role === "ADMIN";

  const closeAndGo = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    router.replace("/auth" as never);
  };

  return (
    <>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>CA</Text>
          </View>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.actions}>
          {profile ? (
            <View style={styles.walletPill}>
              <Feather name="credit-card" size={13} color={colors.purple} />
              <Text style={styles.walletText}>
                {formatCurrency(profile.walletBalance)}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(true)}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerKicker}>Navigation</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.iconButton}>
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
                  {profile?.hostelName ?? profile?.email ?? "CAmpDeliver"}
                </Text>
              </View>
            </View>

            <View style={styles.linkGroup}>
              <DrawerLink icon="user" label="My Profile" onPress={() => Alert.alert("Profile", "Profile editing is coming to the mobile app.")} />
              <DrawerLink icon="settings" label="Settings" onPress={() => Alert.alert("Settings", "Settings are coming to the mobile app.")} />
              <DrawerLink icon="clock" label="Past Order History" onPress={() => closeAndGo("/orders")} />
            </View>

            {isAdmin ? (
              <View style={styles.adminGroup}>
                <Text style={styles.adminTitle}>Admin Section</Text>
                <DrawerLink icon="shopping-bag" label="Manage Canteens" accent onPress={() => closeAndGo("/admin/canteens")} />
                <DrawerLink icon="map-pin" label="Manage Landmarks" accent onPress={() => closeAndGo("/admin/landmarks")} />
              </View>
            ) : null}

            <View style={styles.drawerFooter}>
              <Pressable onPress={signOut} style={styles.signOutButton}>
                <Feather name="log-out" size={16} color="#fecaca" />
                <Text style={styles.signOutText}>Sign Out</Text>
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
  onPress,
  accent,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerLink,
        accent && styles.drawerLinkAccent,
        pressed && styles.pressed,
      ]}
    >
      <Feather name={icon} size={17} color={accent ? colors.amber : colors.muted} />
      <Text style={[styles.drawerLinkText, accent && styles.drawerLinkTextAccent]}>
        {label}
      </Text>
      <Feather name="chevron-right" size={16} color={colors.faint} />
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
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    marginTop: 18,
    paddingTop: 18,
  },
  adminTitle: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  avatarButton: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: {
    color: colors.text,
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
  drawer: {
    backgroundColor: colors.bg,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    height: "100%",
    padding: 20,
    width: "82%",
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
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  drawerLink: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  drawerLinkAccent: {
    backgroundColor: "#271d10",
    borderColor: "#5a3d12",
  },
  drawerLinkText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  drawerLinkTextAccent: {
    color: "#fde68a",
  },
  header: {
    alignItems: "center",
    backgroundColor: "rgba(9,9,11,0.96)",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  linkGroup: {
    gap: 9,
    marginTop: 18,
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  logoText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  modalRoot: {
    backgroundColor: "rgba(0,0,0,0.68)",
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  pressed: {
    opacity: 0.72,
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.purpleDark,
    borderRadius: 20,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  profileAvatarText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    padding: 14,
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
    backgroundColor: "#2a1114",
    borderColor: "#5f1d25",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 13,
  },
  signOutText: {
    color: "#fecaca",
    fontSize: 14,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  walletPill: {
    alignItems: "center",
    backgroundColor: "#22163b",
    borderColor: "#4a2a78",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  walletText: {
    color: "#ddd6fe",
    fontSize: 11,
    fontWeight: "800",
  },
});
