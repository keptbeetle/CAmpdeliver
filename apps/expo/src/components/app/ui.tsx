import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { colors, radius, shadow, statusLabels, statusTone } from "./theme";

export function MotionView({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(delay)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

export function LoadingState({
  title = "Loading",
  copy,
}: {
  title?: string;
  copy?: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.stateCard}>
      <View style={styles.stateIcon}>
        <ActivityIndicator color={colors.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {copy ? <Text style={styles.stateCopy}>{copy}</Text> : null}
    </Animated.View>
  );
}

export function EmptyState({
  icon,
  title,
  copy,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  copy: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <MotionView style={styles.stateCard}>
      <View style={styles.stateIcon}>
        <Feather name={icon} color={colors.primary} size={22} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateCopy}>{copy}</Text>
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} compact />
      ) : null}
    </MotionView>
  );
}

export function InlineNotice({
  icon = "info",
  title,
  copy,
  tone = "info",
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  copy?: string;
  tone?: "info" | "success" | "warning";
}) {
  const toneStyle =
    tone === "success"
      ? styles.noticeSuccess
      : tone === "warning"
        ? styles.noticeWarning
        : styles.noticeInfo;
  const iconColor =
    tone === "success"
      ? colors.success
      : tone === "warning"
        ? colors.warning
        : colors.primary;

  return (
    <View style={[styles.notice, toneStyle]}>
      <Feather name={icon} color={iconColor} size={17} />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        {copy ? <Text style={styles.noticeText}>{copy}</Text> : null}
      </View>
    </View>
  );
}

export function SectionCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.sectionCard, style]}>{children}</View>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text style={[styles.statusText, { color: tone.color }]}>
        {statusLabels[status] ?? status}
      </Text>
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  tone = "primary",
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "quiet" | "warning";
  compact?: boolean;
  testID?: string;
}) {
  const inactive = disabled || loading;
  const toneStyle =
    tone === "secondary"
      ? styles.buttonSecondary
      : tone === "quiet"
        ? styles.buttonQuiet
        : tone === "warning"
          ? styles.buttonWarning
          : styles.buttonPrimary;
  const textStyle =
    tone === "primary" ? styles.buttonTextPrimary : styles.buttonTextSecondary;
  const iconColor = tone === "primary" ? colors.white : colors.primaryStrong;

  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        toneStyle,
        compact && styles.buttonCompact,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : icon ? (
        <Feather name={icon} color={iconColor} size={17} />
      ) : null}
      <Text style={[styles.buttonText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

export function SkeletonBlock({
  height,
  width = "100%",
  radiusValue = radius.md,
}: {
  height: number;
  width?: number | `${number}%`;
  radiusValue?: number;
}) {
  return (
    <View
      style={[styles.skeleton, { height, width, borderRadius: radiusValue }]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  buttonCompact: {
    alignSelf: "center",
    minHeight: 42,
    paddingHorizontal: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  buttonQuiet: {
    backgroundColor: "transparent",
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonSecondary: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  buttonTextPrimary: {
    color: colors.white,
  },
  buttonTextSecondary: {
    color: colors.primaryStrong,
  },
  buttonWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: "#E8CFAD",
    borderWidth: 1,
  },
  notice: {
    alignItems: "flex-start",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeInfo: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
  },
  noticeSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: "#B7DEC8",
  },
  noticeText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  noticeWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: "#E8CFAD",
  },
  sectionCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    ...shadow,
  },
  skeleton: {
    backgroundColor: colors.panelStrong,
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 190,
    padding: 26,
    ...shadow,
  },
  stateCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
    marginTop: 6,
    maxWidth: 320,
    textAlign: "center",
  },
  stateIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
    textAlign: "center",
  },
  statusBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
