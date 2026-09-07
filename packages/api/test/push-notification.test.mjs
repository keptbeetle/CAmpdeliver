import assert from "node:assert/strict";
import test from "node:test";

import {
  isExpoPushToken,
  sendExpoPushNotifications,
} from "../src/services/push-notification.ts";

test("accepts Expo tokens and rejects raw Firebase tokens", () => {
  assert.equal(isExpoPushToken("ExpoPushToken[device-token]"), true);
  assert.equal(isExpoPushToken("ExponentPushToken[device-token]"), true);
  assert.equal(isExpoPushToken("raw-firebase-device-token"), false);
  assert.equal(isExpoPushToken("not-a-token"), false);
});

test("hands valid notifications to the Expo push endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({ data: [{ status: "ok", id: "ticket-id" }] }),
      { status: 200 },
    );
  };

  try {
    const tickets = await sendExpoPushNotifications([
      {
        to: "ExpoPushToken[device-token]",
        title: "Order update",
        body: "Your order is on the way.",
      },
      {
        to: "raw-firebase-device-token",
        title: "Ignored",
        body: "This must not be sent through Expo.",
      },
    ]);

    assert.equal(request.url, "https://exp.host/--/api/v2/push/send");
    const [message] = JSON.parse(request.options.body);
    assert.deepEqual(message, {
      to: "ExpoPushToken[device-token]",
      title: "Order update",
      body: "Your order is on the way.",
      sound: "default",
      priority: "high",
      channelId: "default",
    });
    assert.deepEqual(tickets, [{ status: "ok", id: "ticket-id" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
