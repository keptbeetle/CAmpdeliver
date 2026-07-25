import assert from "node:assert/strict";
import test from "node:test";

import {
  createOrderInputSchema,
  updateDelivererLocationInputSchema,
} from "../src/router/order-input.ts";

const validOrder = {
  canteenId: "2c0c37ee-33e0-4412-b92f-6fe632e759d2",
  items: [{ name: "Lunch", quantity: 1, price: 5000 }],
  deliveryLocationName: "Library entrance",
  deliveryLatitude: 12.9716,
  deliveryLongitude: 77.5946,
};

test("accepts a fixed delivery destination snapshot", () => {
  assert.deepEqual(createOrderInputSchema.parse(validOrder), validOrder);
});

test("rejects blank destination names and invalid coordinates", () => {
  assert.equal(
    createOrderInputSchema.safeParse({
      ...validOrder,
      deliveryLocationName: "   ",
    }).success,
    false,
  );
  assert.equal(
    createOrderInputSchema.safeParse({
      ...validOrder,
      deliveryLatitude: 91,
    }).success,
    false,
  );
});

test("deliverer location updates do not accept a buyer role", () => {
  assert.equal(
    updateDelivererLocationInputSchema.safeParse({
      orderId: validOrder.canteenId,
      latitude: validOrder.deliveryLatitude,
      longitude: validOrder.deliveryLongitude,
      role: "buyer",
    }).success,
    false,
  );
});
