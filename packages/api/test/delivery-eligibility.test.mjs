import assert from "node:assert/strict";
import test from "node:test";

import {
  distanceMetres,
  isDeliveryQuestEligible,
} from "../src/services/delivery-eligibility.ts";

test("distanceMetres returns zero for identical coordinates", () => {
  assert.equal(distanceMetres(23.1765, 80.0211, 23.1765, 80.0211), 0);
});

test("delivery quest requires selected canteen availability", () => {
  const base = {
    availabilityEnabled: true,
    selectedCanteenIds: ["canteen-a"],
    canteenId: "canteen-a",
    latitude: 23.1765,
    longitude: 80.0211,
    canteenLatitude: 23.1765,
    canteenLongitude: 80.0211,
    pickupRadiusMetres: 50,
  };

  assert.equal(isDeliveryQuestEligible(base), true);
  assert.equal(
    isDeliveryQuestEligible({ ...base, availabilityEnabled: false }),
    false,
  );
  assert.equal(
    isDeliveryQuestEligible({ ...base, selectedCanteenIds: ["canteen-b"] }),
    false,
  );
  assert.equal(isDeliveryQuestEligible({ ...base, canteenId: null }), false);
});

test("delivery quest eligibility respects the configured pickup radius", () => {
  const canteenLatitude = 23.1765;
  const canteenLongitude = 80.0211;
  const nearLatitude = canteenLatitude + 0.0002;
  const farLatitude = canteenLatitude + 0.001;

  assert.equal(
    isDeliveryQuestEligible({
      availabilityEnabled: true,
      selectedCanteenIds: ["canteen-a"],
      canteenId: "canteen-a",
      latitude: nearLatitude,
      longitude: canteenLongitude,
      canteenLatitude,
      canteenLongitude,
      pickupRadiusMetres: 50,
    }),
    true,
  );

  assert.equal(
    isDeliveryQuestEligible({
      availabilityEnabled: true,
      selectedCanteenIds: ["canteen-a"],
      canteenId: "canteen-a",
      latitude: farLatitude,
      longitude: canteenLongitude,
      canteenLatitude,
      canteenLongitude,
      pickupRadiusMetres: 50,
    }),
    false,
  );
});
