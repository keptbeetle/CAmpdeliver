import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDeliveryQuestAlert,
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

test("fresh nearby presence receives the normal visible quest push", () => {
  assert.equal(
    classifyDeliveryQuestAlert({
      canteenLatitude: 23.176019,
      canteenLongitude: 80.02724,
      pickupRadiusMetres: 100,
      latitude: 23.176019,
      longitude: 80.02724,
      presenceUpdatedAt: new Date("2026-09-29T00:00:30Z"),
      presenceCutoff: new Date("2026-09-29T00:00:00Z"),
      backgroundAlertsEnabled: false,
    }),
    "VISIBLE",
  );
});

test("fresh presence outside the canteen does not wake the device", () => {
  assert.equal(
    classifyDeliveryQuestAlert({
      canteenLatitude: 23.176019,
      canteenLongitude: 80.02724,
      pickupRadiusMetres: 100,
      latitude: 23.18,
      longitude: 80.03,
      presenceUpdatedAt: new Date("2026-09-29T00:00:30Z"),
      presenceCutoff: new Date("2026-09-29T00:00:00Z"),
      backgroundAlertsEnabled: true,
    }),
    "NONE",
  );
});

test("stale or missing presence uses one background candidate check", () => {
  const canteen = {
    canteenLatitude: 23.176019,
    canteenLongitude: 80.02724,
    pickupRadiusMetres: 100,
    presenceCutoff: new Date("2026-09-29T00:00:00Z"),
    backgroundAlertsEnabled: true,
  };

  assert.equal(
    classifyDeliveryQuestAlert({
      ...canteen,
      latitude: 23.176019,
      longitude: 80.02724,
      presenceUpdatedAt: new Date("2026-09-28T23:59:59Z"),
    }),
    "BACKGROUND_CHECK",
  );

  assert.equal(
    classifyDeliveryQuestAlert({
      ...canteen,
      latitude: null,
      longitude: null,
      presenceUpdatedAt: null,
    }),
    "BACKGROUND_CHECK",
  );

  assert.equal(
    classifyDeliveryQuestAlert({
      ...canteen,
      backgroundAlertsEnabled: false,
      latitude: 23.176019,
      longitude: 80.02724,
      presenceUpdatedAt: new Date("2026-09-28T23:59:59Z"),
    }),
    "NONE",
  );
});
