export const colors = {
  bg: "#F4F8F8",
  bgElevated: "#F9FBFB",
  panel: "#FFFFFF",
  panelStrong: "#EAF2F2",
  surfaceTint: "#E1F1F0",
  border: "#D5E1E2",
  borderStrong: "#B8CCCE",
  text: "#163134",
  muted: "#60777A",
  faint: "#8A9C9E",
  primary: "#2E7B80",
  primaryStrong: "#205F64",
  primarySoft: "#DDF0EF",
  accent: "#6879C8",
  accentSoft: "#E9ECFA",
  success: "#2E7D5B",
  successSoft: "#E4F4EB",
  warning: "#A96B22",
  warningSoft: "#FFF1DD",
  danger: "#8A613A",
  dangerSoft: "#F7EBDD",
  white: "#FFFFFF",
  overlay: "rgba(22, 49, 52, 0.42)",
  shadow: "#17373A",

  // Compatibility aliases for older components while the app uses semantic tones.
  purple: "#2E7B80",
  purpleDark: "#DDF0EF",
  indigo: "#6879C8",
  emerald: "#2E7D5B",
  amber: "#A96B22",
  red: "#8A613A",
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
      borderColor: "#E4CCB5",
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
