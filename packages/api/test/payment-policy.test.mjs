import assert from "node:assert/strict";
import test from "node:test";

import {
  canConfirmCanteenPurchase,
  canRevealHandoverOtp,
  canSubmitPaymentReference,
  delivererPrePurchaseCancellationMode,
  prePurchaseCancellationDisposition,
  settlementRequestDisposition,
} from "../src/services/payment-policy.ts";

test("advance payment references are accepted only before canteen purchase", () => {
  assert.equal(canSubmitPaymentReference("ADVANCE", "ITEM_AVAILABLE"), true);
  assert.equal(canSubmitPaymentReference("ADVANCE", "PURCHASED"), false);
  assert.equal(canSubmitPaymentReference("ADVANCE", "NEAR_YOU"), false);
});

test("Pay at Delivery references are accepted only at handover", () => {
  assert.equal(
    canSubmitPaymentReference("PAY_AT_DELIVERY", "PURCHASED"),
    false,
  );
  assert.equal(
    canSubmitPaymentReference("PAY_AT_DELIVERY", "ON_THE_WAY"),
    false,
  );
  assert.equal(canSubmitPaymentReference("PAY_AT_DELIVERY", "NEAR_YOU"), true);
});

test("advance purchase requires verified money while Pay at Delivery requires deliverer consent", () => {
  assert.equal(
    canConfirmCanteenPurchase({
      method: "ADVANCE",
      paymentStatus: "PENDING_VERIFICATION",
      delivererAllowsPayAtDelivery: false,
    }),
    false,
  );
  assert.equal(
    canConfirmCanteenPurchase({
      method: "ADVANCE",
      paymentStatus: "PAID",
      delivererAllowsPayAtDelivery: false,
    }),
    true,
  );
  assert.equal(
    canConfirmCanteenPurchase({
      method: "PAY_AT_DELIVERY",
      paymentStatus: "AWAITING_PAYMENT",
      delivererAllowsPayAtDelivery: true,
    }),
    true,
  );
  assert.equal(
    canConfirmCanteenPurchase({
      method: "PAY_AT_DELIVERY",
      paymentStatus: "AWAITING_PAYMENT",
      delivererAllowsPayAtDelivery: false,
    }),
    false,
  );
});

test("handover OTP is revealed only when payment is verified and the deliverer is near", () => {
  assert.equal(canRevealHandoverOtp("ON_THE_WAY", "PAID"), false);
  assert.equal(canRevealHandoverOtp("NEAR_YOU", "PENDING_VERIFICATION"), false);
  assert.equal(canRevealHandoverOtp("NEAR_YOU", "PAID"), true);
});

test("settlement enters the admin queue only after the deliverer requests it", () => {
  assert.equal(settlementRequestDisposition("AVAILABLE"), "REQUEST");
  assert.equal(settlementRequestDisposition("PENDING"), "ALREADY_REQUESTED");
  assert.equal(settlementRequestDisposition("ON_HOLD"), "ALREADY_REQUESTED");
  assert.equal(settlementRequestDisposition("FAILED"), "ALREADY_REQUESTED");
  assert.equal(settlementRequestDisposition("PAID"), "ALREADY_PAID");
});

test("deliverer cancellation matches the pilot rules", () => {
  assert.equal(
    delivererPrePurchaseCancellationMode("ACCEPTED", "NOT_STARTED"),
    "ITEMS_UNAVAILABLE",
  );
  assert.equal(
    delivererPrePurchaseCancellationMode("ITEM_AVAILABLE", "AWAITING_PAYMENT"),
    null,
  );
  assert.equal(
    delivererPrePurchaseCancellationMode(
      "ITEM_AVAILABLE",
      "PENDING_VERIFICATION",
    ),
    null,
  );
  assert.equal(
    delivererPrePurchaseCancellationMode("ITEM_AVAILABLE", "PAID"),
    "SECURED_PAYMENT_REFUND",
  );
  assert.equal(delivererPrePurchaseCancellationMode("PURCHASED", "PAID"), null);
});

test("pre-purchase cancellation preserves reconciliation and queues real paid money for refund", () => {
  assert.equal(
    prePurchaseCancellationDisposition("PENDING_VERIFICATION"),
    "PRESERVE_PENDING_VERIFICATION",
  );
  assert.equal(prePurchaseCancellationDisposition("PAID"), "REFUND_REQUIRED");
  assert.equal(
    prePurchaseCancellationDisposition("AWAITING_PAYMENT"),
    "REJECTED",
  );
  assert.equal(prePurchaseCancellationDisposition("REFUNDED"), "UNCHANGED");
});
