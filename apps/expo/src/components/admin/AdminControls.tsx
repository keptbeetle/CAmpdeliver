import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { colors, radius } from "~/components/app/theme";

export function AdminScreenHeader({
  title,
  subtitle,
  icon,
  onBack,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Feather name="arrow-left" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.headerSubtitle}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.adminBadge}>
        <Feather name={icon} size={13} color={colors.primaryStrong} />
        <Text style={styles.adminBadgeText}>ADMIN</Text>
      </View>
    </View>
  );
}

export function AdminField({
  label,
  helper,
  ...props
}: TextInputProps & { label: string; helper?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        selectionColor={colors.primary}
        {...props}
        style={[
          styles.input,
          props.editable === false && styles.inputReadonly,
          props.style,
        ]}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

export function AdminSwitchRow({
  label,
  helper,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  helper: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Text style={styles.switchHelper}>{helper}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export function AdminSectionTitle({
  icon,
  title,
  copy,
  action,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  copy?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Feather name={icon} size={17} color={colors.primaryStrong} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {copy ? <Text style={styles.sectionSubtitle}>{copy}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function AdminEntityCard({
  icon,
  title,
  meta,
  active,
  selected,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  meta: string;
  active: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.entityCard,
        selected && styles.entityCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.entityIcon, selected && styles.entityIconSelected]}>
        <Feather
          name={icon}
          size={17}
          color={selected ? colors.white : colors.primaryStrong}
        />
      </View>
      <View style={styles.entityCopy}>
        <Text numberOfLines={1} style={styles.entityTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.entityMeta}>
          {meta}
        </Text>
      </View>
      <View
        style={[
          styles.statusDot,
          { backgroundColor: active ? colors.success : colors.faint },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  adminBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  adminBadgeText: {
    color: colors.primaryStrong,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  entityCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  entityCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  entityCopy: {
    flex: 1,
    minWidth: 0,
  },
  entityIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  entityIconSelected: {
    backgroundColor: colors.primary,
  },
  entityMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  entityTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  field: {
    gap: 6,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
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
  helper: {
    color: colors.faint,
    fontSize: 10,
    lineHeight: 15,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 13,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  inputReadonly: {
    backgroundColor: colors.bgElevated,
    color: colors.muted,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.82,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  statusDot: {
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  switchCopy: {
    flex: 1,
    paddingRight: 14,
  },
  switchHelper: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  switchRow: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 68,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
});
