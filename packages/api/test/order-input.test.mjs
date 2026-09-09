import assert from "node:assert/strict";
import test from "node:test";

import {
  createOrderInputSchema,
  updateDelivererLocationInputSchema,
} from "../src/router/order-input.ts";

const menuItemId = "f8e257fc-448c-43e8-a0f9-ccce5fd66adc";
const canteenId = "2c0c37ee-33e0-4412-b92f-6fe632e759d2";
const validOrder = {
  canteenId,
  items: [{ menuItemId, quantity: 1 }],
  deliveryLocationName: "Library entrance",
  deliveryLatitude: 12.9716,
  deliveryLongitude: 77.5946,
};

test("accepts menu-item identifiers with a fixed delivery destination", () => {
  assert.deepEqual(createOrderInputSchema.parse(validOrder), validOrder);
});

test("rejects client supplied menu names or prices", () => {
  assert.equal(
    createOrderInputSchema.safeParse({
      ...validOrder,
      items: [
        {
          menuItemId,
          quantity: 1,
          name: "Tampered item",
          price: 1,
        },
      ],
    }).success,
    false,
  );
});

test("rejects invalid quantities, blank destinations, and invalid coordinates", () => {
  assert.equal(
    createOrderInputSchema.safeParse({
      ...validOrder,
      items: [{ menuItemId, quantity: 0 }],
    }).success,
    false,
  );
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

test("deliverer location updates do not accept a caller-controlled role", () => {
  assert.equal(
    updateDelivererLocationInputSchema.safeParse({
      orderId: canteenId,
      latitude: validOrder.deliveryLatitude,
      longitude: validOrder.deliveryLongitude,
      role: "buyer",
    }).success,
    false,
  );
});
