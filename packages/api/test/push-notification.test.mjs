import assert from "node:assert/strict";
import test from "node:test";

import {
  isExpoPushToken,
  sendExpoPushNotifications,
} from "../src/services/push-notification.ts";

test("isExpoPushToken correctly validates push tokens", () => {
  assert.equal(
    isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"),
    true,
  );
  assert.equal(
    isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]"),
    true,
  );
  assert.equal(
    isExpoPushToken("12345678901234567890123456789012"), // 32-char valid format
    true,
  );
  assert.equal(isExpoPushToken(""), false);
  assert.equal(isExpoPushToken("invalid_short_token"), false);
  assert.equal(isExpoPushToken(null), false);
  assert.equal(isExpoPushToken(undefined), false);
});

test("sendExpoPushNotifications returns empty array for empty inputs", async () => {
  const result1 = await sendExpoPushNotifications([]);
  assert.deepEqual(result1, []);

  const result2 = await sendExpoPushNotifications([
    {
      to: "",
      title: "Test",
      body: "Test body",
    },
  ]);
  assert.deepEqual(result2, []);
});
