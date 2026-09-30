import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pushProjectId(): string | null {
  const easConfig: unknown = Constants.easConfig;
  if (isRecord(easConfig) && typeof easConfig.projectId === "string") {
    return easConfig.projectId;
  }

  const expoConfig: unknown = Constants.expoConfig;
  if (!isRecord(expoConfig) || !isRecord(expoConfig.extra)) return null;
  const eas = expoConfig.extra.eas;
  return isRecord(eas) && typeof eas.projectId === "string"
    ? eas.projectId
    : null;
}

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Order updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2E7B80",
  });
}

export async function getAuthorizedExpoPushToken(): Promise<string | null> {
  await ensureAndroidNotificationChannel();
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== Notifications.PermissionStatus.GRANTED)
    return null;

  const projectId = pushProjectId();
  if (!projectId) {
    console.warn("Push token registration skipped: missing EAS project ID.");
    return null;
  }

  const tokenResponse: unknown = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  return isRecord(tokenResponse) && typeof tokenResponse.data === "string"
    ? tokenResponse.data
    : null;
}
