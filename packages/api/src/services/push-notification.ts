export interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?:
      | "DeviceNotRegistered"
      | "InvalidCredentials"
      | "MessageTooBig"
      | "MessageRateExceeded"
      | "MismatchSenderId";
  };
}

export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") ||
      token.startsWith("ExpoPushToken["))
  );
}

/**
 * Sends push notifications to mobile devices via Expo's Push API.
 * Gracefully handles invalid tokens and network errors without throwing.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) {
    return [];
  }

  // Filter and normalize messages with valid tokens
  const validMessages: ExpoPushMessage[] = [];
  for (const msg of messages) {
    if (Array.isArray(msg.to)) {
      const validTokens = msg.to.filter(isExpoPushToken);
      if (validTokens.length > 0) {
        validMessages.push({
          ...msg,
          to: validTokens,
          sound: msg.sound ?? "default",
          priority: msg.priority ?? "high",
          channelId: msg.channelId ?? "default",
        });
      }
    } else if (isExpoPushToken(msg.to)) {
      validMessages.push({
        ...msg,
        sound: msg.sound ?? "default",
        priority: msg.priority ?? "high",
        channelId: msg.channelId ?? "default",
      });
    }
  }

  if (validMessages.length === 0) {
    console.log("[PushNotification] No valid push tokens found to send.");
    return [];
  }

  const results: ExpoPushTicket[] = [];
  const chunkSize = 100;

  for (let i = 0; i < validMessages.length; i += chunkSize) {
    const chunk = validMessages.slice(i, i + chunkSize);

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[PushNotification] HTTP error ${response.status}: ${errorText}`,
        );
        continue;
      }

      const json = (await response.json()) as {
        data?: ExpoPushTicket[];
        errors?: unknown[];
      };

      if (json.data && Array.isArray(json.data)) {
        results.push(...json.data);
        console.log(
          `[PushNotification] Successfully sent ${json.data.length} push notification(s).`,
        );
      }
    } catch (error) {
      console.error(
        "[PushNotification] Failed to send push notification chunk:",
        error,
      );
    }
  }

  return results;
}
