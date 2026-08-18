export const colors = {
  bg: "#09090b",
  panel: "#15151a",
  panelStrong: "#1d1d24",
  border: "#27272f",
  text: "#f8fafc",
  muted: "#a1a1aa",
  faint: "#71717a",
  purple: "#8b5cf6",
  purpleDark: "#4c1d95",
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

export function formatCurrency(paise = 0) {
  return `INR ${(paise / 100).toFixed(0)}`;
}

export function shortId(id?: string) {
  return id ? id.slice(0, 8).toUpperCase() : "ORDER";
}

export const ACTIVE_ORDER_STATUSES = [
  "BROADCASTED",
  "ACCEPTED",
  "PREPARING",
  "ON_THE_WAY",
  "NEAR_YOU",
];

export const statusLabels: Record<string, string> = {
  BROADCASTED: "Finding a deliverer",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  ON_THE_WAY: "Out for delivery",
  NEAR_YOU: "Almost there",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const statusProgress: Record<string, number> = {
  BROADCASTED: 20,
  ACCEPTED: 40,
  PREPARING: 62,
  ON_THE_WAY: 82,
  NEAR_YOU: 95,
  DELIVERED: 100,
  COMPLETED: 100,
  CANCELLED: 100,
};
