import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import { ensureAndroidNotificationChannel } from "~/platform/push-registration";

const QUEST_NOTIFICATION_TASK = "CAMPDELIVER_QUEST_NOTIFICATION_TASK_V1";
const DEDUPE_KEY = "campdeliver.quest-notifications.v1";
const DEDUPE_RETENTION_MS = 2 * 60 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 10_000;
const LAST_KNOWN_MAX_AGE_MS = 30_000;
const LAST_KNOWN_REQUIRED_ACCURACY_METRES = 50;

interface QuestCandidate {
  type: "NEW_QUEST_CANDIDATE";
  orderId: string;
  canteenId: string;
  canteenName: string;
  canteenLatitude: number;
  canteenLongitude: number;
  pickupRadiusMetres: number;
  deliveryFeePaise: number;
  expiresAtMs: number;
  url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCandidate(
  payload: Notifications.NotificationTaskPayload,
): QuestCandidate | null {
  if ("actionIdentifier" in payload) return null;

  const dataString = payload.data.dataString;
  if (typeof dataString !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataString);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.type !== "NEW_QUEST_CANDIDATE") return null;

  const canteenLatitude = finiteNumber(parsed.canteenLatitude);
  const canteenLongitude = finiteNumber(parsed.canteenLongitude);
  const pickupRadiusMetres = finiteNumber(parsed.pickupRadiusMetres);
  const deliveryFeePaise = finiteNumber(parsed.deliveryFeePaise);
  const expiresAtMs = finiteNumber(parsed.expiresAtMs);
  if (
    typeof parsed.orderId !== "string" ||
    typeof parsed.canteenId !== "string" ||
    typeof parsed.canteenName !== "string" ||
    typeof parsed.url !== "string" ||
    canteenLatitude === null ||
    canteenLongitude === null ||
    pickupRadiusMetres === null ||
    deliveryFeePaise === null ||
    expiresAtMs === null
  ) {
    return null;
  }

  return {
    type: "NEW_QUEST_CANDIDATE",
    orderId: parsed.orderId,
    canteenId: parsed.canteenId,
    canteenName: parsed.canteenName,
    canteenLatitude,
    canteenLongitude,
    pickupRadiusMetres,
    deliveryFeePaise,
    expiresAtMs,
    url: parsed.url,
  };
}

function distanceMetres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMetres = 6_371_000;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMetres * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getCurrentLocation() {
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METRES,
  });
  if (lastKnown) return lastKnown;

  const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {};
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timeoutRef.id = setTimeout(
          () => reject(new Error("Background quest location timed out")),
          LOCATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutRef.id !== undefined) clearTimeout(timeoutRef.id);
  }
}

async function wasAlreadyNotified(orderId: string) {
  const raw = await SecureStore.getItemAsync(DEDUPE_KEY);
  if (!raw) return false;
  try {
    const entries = JSON.parse(raw) as Record<string, number>;
    const notifiedAt = entries[orderId];
    return (
      typeof notifiedAt === "number" &&
      Date.now() - notifiedAt < DEDUPE_RETENTION_MS
    );
  } catch {
    return false;
  }
}

async function rememberNotification(orderId: string) {
  const now = Date.now();
  let entries: Record<string, number> = {};
  const raw = await SecureStore.getItemAsync(DEDUPE_KEY);
  if (raw) {
    try {
      entries = JSON.parse(raw) as Record<string, number>;
    } catch {
      entries = {};
    }
  }

  const retained = Object.fromEntries(
    Object.entries(entries).filter(
      ([, timestamp]) =>
        typeof timestamp === "number" && now - timestamp < DEDUPE_RETENTION_MS,
    ),
  );
  retained[orderId] = now;
  await SecureStore.setItemAsync(DEDUPE_KEY, JSON.stringify(retained));
}

if (
  Platform.OS === "android" &&
  !TaskManager.isTaskDefined(QUEST_NOTIFICATION_TASK)
) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    QUEST_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error || Platform.OS !== "android") return;

      const candidate = parseCandidate(data);
      if (!candidate || Date.now() >= candidate.expiresAtMs) return;

      const notificationPermission = await Notifications.getPermissionsAsync();
      if (
        notificationPermission.status !== Notifications.PermissionStatus.GRANTED
      ) {
        return;
      }
      const backgroundLocation = await Location.getBackgroundPermissionsAsync();
      if (backgroundLocation.status !== Location.PermissionStatus.GRANTED)
        return;
      if (await wasAlreadyNotified(candidate.orderId)) return;

      try {
        const location = await getCurrentLocation();
        const distance = distanceMetres(
          location.coords.latitude,
          location.coords.longitude,
          candidate.canteenLatitude,
          candidate.canteenLongitude,
        );
        if (distance > candidate.pickupRadiusMetres) return;

        await ensureAndroidNotificationChannel();
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "New delivery quest",
            body: `Pickup at ${candidate.canteenName}. Earn \u20b9${(
              candidate.deliveryFeePaise / 100
            ).toFixed(2)}.`,
            data: {
              orderId: candidate.orderId,
              canteenId: candidate.canteenId,
              type: "NEW_QUEST",
              url: candidate.url,
            },
            sound: "default",
          },
          trigger: { channelId: "default" },
        });
        await rememberNotification(candidate.orderId);
      } catch (taskError) {
        console.warn("Background quest alert check failed:", taskError);
      }
    },
  );
}

export async function ensureQuestNotificationTaskRegistered() {
  if (Platform.OS !== "android") return;
  await Notifications.registerTaskAsync(QUEST_NOTIFICATION_TASK);
}

if (Platform.OS === "android") {
  void ensureQuestNotificationTaskRegistered().catch((error: unknown) =>
    console.warn(
      "Could not register background quest notification task:",
      error,
    ),
  );
}
