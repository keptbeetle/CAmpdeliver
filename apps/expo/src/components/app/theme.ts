export const colors = {
  bg: "#F4F9FF",
  bgElevated: "#F8FBFF",
  panel: "#FFFFFF",
  panelStrong: "#EAF3FF",
  surfaceTint: "#E2F0FF",
  border: "#D5E4F2",
  borderStrong: "#B8D0E6",
  text: "#14324A",
  muted: "#5F778C",
  faint: "#879AAD",
  primary: "#2F78C4",
  primaryStrong: "#174E82",
  primarySoft: "#E3F0FD",
  accent: "#245B8F",
  accentSoft: "#E8F1FA",
  success: "#2D7D54",
  successSoft: "#E6F5EC",
  caution: "#A87912",
  cautionSoft: "#FFF8D8",
  warning: "#C86D16",
  warningSoft: "#FFF0DF",
  danger: "#C43B46",
  dangerSoft: "#FDE9EC",
  white: "#FFFFFF",
  overlay: "rgba(20, 50, 74, 0.42)",
  shadow: "#173A59",

  // Compatibility aliases for older components while the app uses semantic tones.
  purple: "#2F78C4",
  purpleDark: "#E3F0FD",
  indigo: "#245B8F",
  emerald: "#2D7D54",
  amber: "#C86D16",
  red: "#C43B46",
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const shadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 7 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
} as const;

export function formatCurrency(paise = 0) {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function shortId(id?: string) {
  return id ? id.slice(0, 8).toUpperCase() : "ORDER";
}

export const ACTIVE_ORDER_STATUSES = [
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
];

export const statusLabels: Record<string, string> = {
  BROADCASTED: "Finding a deliverer",
  ACCEPTED: "Deliverer accepted",
  ITEM_AVAILABLE: "Items available",
  PURCHASED: "Purchased at canteen",
  ON_THE_WAY: "On the way",
  NEAR_YOU: "Near you",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Needs admin review",
  PREPARING: "Legacy preparing",
  COMPLETED: "Legacy completed",
};

export const statusProgress: Record<string, number> = {
  BROADCASTED: 12,
  ACCEPTED: 26,
  ITEM_AVAILABLE: 42,
  PURCHASED: 60,
  ON_THE_WAY: 78,
  NEAR_YOU: 92,
  DELIVERED: 100,
  CANCELLED: 100,
  FAILED: 100,
  PREPARING: 50,
  COMPLETED: 100,
};

export function statusTone(status: string) {
  if (["DELIVERED", "COMPLETED"].includes(status)) {
    return {
      backgroundColor: colors.successSoft,
      borderColor: "#B7DEC8",
      color: colors.success,
    };
  }
  if (status === "CANCELLED") {
    return {
      backgroundColor: colors.dangerSoft,
      borderColor: "#E9A8AF",
      color: colors.danger,
    };
  }
  if (["ON_THE_WAY", "NEAR_YOU"].includes(status)) {
    return {
      backgroundColor: colors.accentSoft,
      borderColor: "#CFD5F2",
      color: colors.accent,
    };
  }
  return {
    backgroundColor: colors.primarySoft,
    borderColor: "#BFDEDC",
    color: colors.primaryStrong,
  };
}
