import assert from "node:assert/strict";
import test from "node:test";

import { getPaymentConfig } from "../src/services/payment-config.ts";
import {
  canAdminCompleteDirectOrder,
  canAdminFailDirectOrder,
  canBuyerCancelOrder,
  canConfirmCanteenPurchase,
  canConfirmPaymentReceived,
  canDelivererCancelOrder,
  canReportDirectOrderIssue,
  canRevealHandoverOtp,
  canVerifyDeliveryOtp,
  directPaymentConfirmationDisposition,
  directPaymentTotal,
} from "../src/services/payment-policy.ts";

const DIRECT_PAY_ON_DELIVERY_MODEL = "DIRECT_PAY_ON_DELIVERY";

test("direct payment total calculation", () => {
  assert.equal(directPaymentTotal(15000, 500), 15500);
  assert.equal(directPaymentTotal(0, 500), 500);
  assert.throws(() => directPaymentTotal(-10, 500), /nonnegative/);
  assert.throws(() => directPaymentTotal(100, -50), /nonnegative/);
});

test("platform fee is strictly zero in direct pay-on-delivery config", () => {
  const config = getPaymentConfig();
  assert.equal(config.platformFeePaise, 0);
  assert.equal(config.deliveryFeePaise, 500);
});

test("canteen purchase does not require advance verification or pilot upi destination", () => {
  // In DIRECT_PAY_ON_DELIVERY model, deliverer buys food from their own money
  assert.equal(
    canConfirmCanteenPurchase({
      paymentModel: DIRECT_PAY_ON_DELIVERY_MODEL,
      method: null,
      paymentStatus: null,
      delivererAllowsPayAtDelivery: false,
    }),
    true,
  );
  // Without method or paymentStatus, default should also be direct POD (true)
  assert.equal(
    canConfirmCanteenPurchase({
      delivererAllowsPayAtDelivery: false,
    }),
    true,
  );
});

test("handover OTP gating: revealed when deliverer is NEAR_YOU or in PAYMENT_DUE", () => {
  assert.equal(
    canRevealHandoverOtp("ACCEPTED", null, DIRECT_PAY_ON_DELIVERY_MODEL),
    false,
  );
  assert.equal(
    canRevealHandoverOtp("ITEM_AVAILABLE", null, DIRECT_PAY_ON_DELIVERY_MODEL),
    false,
  );
  assert.equal(
    canRevealHandoverOtp("PURCHASED", null, DIRECT_PAY_ON_DELIVERY_MODEL),
    false,
  );
  assert.equal(
    canRevealHandoverOtp("ON_THE_WAY", null, DIRECT_PAY_ON_DELIVERY_MODEL),
    false,
  );
  assert.equal(
    canRevealHandoverOtp("NEAR_YOU", null, DIRECT_PAY_ON_DELIVERY_MODEL),
    true,
  );
  assert.equal(
    canRevealHandoverOtp("PAYMENT_DUE", null, DIRECT_PAY_ON_DELIVERY_MODEL),
    true,
  );
});

test("delivery OTP verification gating: allowed only at NEAR_YOU", () => {
  assert.equal(canVerifyDeliveryOtp("NEAR_YOU"), true);
  assert.equal(canVerifyDeliveryOtp("ON_THE_WAY"), false);
  assert.equal(canVerifyDeliveryOtp("PURCHASED"), false);
  assert.equal(canVerifyDeliveryOtp("ITEM_AVAILABLE"), false);
  assert.equal(canVerifyDeliveryOtp("PAYMENT_DUE"), false);
});

test("payment confirmation gating: rejected before OTP verification, allowed in PAYMENT_DUE with otpVerifiedAt", () => {
  // Before OTP verification (e.g. NEAR_YOU, otpVerifiedAt is null)
  assert.equal(
    canConfirmPaymentReceived({
      status: "NEAR_YOU",
      otpVerifiedAt: null,
    }),
    false,
  );
  // Status changed but otpVerifiedAt missing
  assert.equal(
    canConfirmPaymentReceived({
      status: "PAYMENT_DUE",
      otpVerifiedAt: null,
    }),
    false,
  );
  // Status is PAYMENT_DUE with otpVerifiedAt set
  const verifiedAt = new Date();
  assert.equal(
    canConfirmPaymentReceived({
      status: "PAYMENT_DUE",
      otpVerifiedAt: verifiedAt,
    }),
    true,
  );
  // Already delivered
  assert.equal(
    canConfirmPaymentReceived({
      status: "DELIVERED",
      otpVerifiedAt: verifiedAt,
    }),
    false,
  );
});

test("payment confirmation disposition is idempotent", () => {
  const verifiedAt = new Date();
  const paymentReceivedAt = new Date();

  // Fresh confirmation
  assert.equal(
    directPaymentConfirmationDisposition({
      status: "PAYMENT_DUE",
      otpVerifiedAt: verifiedAt,
      paymentReceivedAt: null,
    }),
    "CONFIRM",
  );

  // Duplicate / already delivered confirmation
  assert.equal(
    directPaymentConfirmationDisposition({
      status: "DELIVERED",
      otpVerifiedAt: verifiedAt,
      paymentReceivedAt,
    }),
    "ALREADY_COMPLETED",
  );

  // Invalid attempts (e.g. before OTP)
  assert.equal(
    directPaymentConfirmationDisposition({
      status: "NEAR_YOU",
      otpVerifiedAt: null,
      paymentReceivedAt: null,
    }),
    "INVALID",
  );
});

test("buyer cancellation: allowed before purchase, strictly blocked after purchase", () => {
  // Pre-purchase
  assert.equal(
    canBuyerCancelOrder({ status: "BROADCASTED", purchasedAt: null }),
    true,
  );
  assert.equal(
    canBuyerCancelOrder({ status: "ACCEPTED", purchasedAt: null }),
    true,
  );
  assert.equal(
    canBuyerCancelOrder({ status: "ITEM_AVAILABLE", purchasedAt: null }),
    true,
  );

  // Post-purchase (even if status appears early or late)
  const purchasedAt = new Date();
  assert.equal(
    canBuyerCancelOrder({ status: "PURCHASED", purchasedAt }),
    false,
  );
  assert.equal(
    canBuyerCancelOrder({ status: "ON_THE_WAY", purchasedAt }),
    false,
  );
  assert.equal(canBuyerCancelOrder({ status: "NEAR_YOU", purchasedAt }), false);
  assert.equal(
    canBuyerCancelOrder({ status: "PAYMENT_DUE", purchasedAt }),
    false,
  );
  assert.equal(
    canBuyerCancelOrder({ status: "ITEM_AVAILABLE", purchasedAt }),
    false,
  );
});

test("deliverer cancellation: allowed before purchase, strictly blocked after purchase", () => {
  // Pre-purchase
  assert.equal(
    canDelivererCancelOrder({ status: "ACCEPTED", purchasedAt: null }),
    true,
  );
  assert.equal(
    canDelivererCancelOrder({ status: "ITEM_AVAILABLE", purchasedAt: null }),
    true,
  );
  assert.equal(
    canDelivererCancelOrder({ status: "BROADCASTED", purchasedAt: null }),
    false, // deliverer not assigned yet
  );

  // Post-purchase
  const purchasedAt = new Date();
  assert.equal(
    canDelivererCancelOrder({ status: "PURCHASED", purchasedAt }),
    false,
  );
  assert.equal(
    canDelivererCancelOrder({ status: "ON_THE_WAY", purchasedAt }),
    false,
  );
  assert.equal(
    canDelivererCancelOrder({ status: "NEAR_YOU", purchasedAt }),
    false,
  );
  assert.equal(
    canDelivererCancelOrder({ status: "PAYMENT_DUE", purchasedAt }),
    false,
  );
});

test("post-purchase direct order issues can be reported without leaving users deadlocked", () => {
  const purchasedAt = new Date();
  for (const status of ["PURCHASED", "ON_THE_WAY", "NEAR_YOU", "PAYMENT_DUE"]) {
    assert.equal(
      canReportDirectOrderIssue({
        status,
        purchasedAt,
        paymentReceivedAt: null,
      }),
      true,
      status,
    );
  }
  assert.equal(
    canReportDirectOrderIssue({
      status: "ITEM_AVAILABLE",
      purchasedAt: null,
      paymentReceivedAt: null,
    }),
    false,
  );
  assert.equal(
    canReportDirectOrderIssue({
      status: "DELIVERED",
      purchasedAt,
      paymentReceivedAt: new Date(),
    }),
    false,
  );
  assert.equal(
    canReportDirectOrderIssue({
      status: "FAILED",
      purchasedAt,
      paymentReceivedAt: null,
    }),
    false,
  );
});

test("admin direct-order outcomes preserve the OTP payment boundary", () => {
  const purchasedAt = new Date();
  const verifiedAt = new Date();

  assert.equal(
    canAdminCompleteDirectOrder({
      status: "PAYMENT_DUE",
      otpVerifiedAt: verifiedAt,
      paymentReceivedAt: null,
    }),
    true,
  );
  assert.equal(
    canAdminCompleteDirectOrder({
      status: "NEAR_YOU",
      otpVerifiedAt: null,
      paymentReceivedAt: null,
    }),
    false,
  );

  for (const status of ["PURCHASED", "ON_THE_WAY", "NEAR_YOU", "PAYMENT_DUE"]) {
    assert.equal(
      canAdminFailDirectOrder({
        status,
        purchasedAt,
        paymentReceivedAt: null,
      }),
      true,
      status,
    );
  }
  assert.equal(
    canAdminFailDirectOrder({
      status: "DELIVERED",
      purchasedAt,
      paymentReceivedAt: new Date(),
    }),
    false,
  );
});

test("direct earnings calculation sums only deliveryFee of completed direct orders", () => {
  const directOrders = [
    {
      id: "ord-1",
      paymentModel: "DIRECT_PAY_ON_DELIVERY",
      status: "DELIVERED",
      foodPrice: 12000,
      deliveryFee: 500,
    },
    {
      id: "ord-2",
      paymentModel: "DIRECT_PAY_ON_DELIVERY",
      status: "DELIVERED",
      foodPrice: 25000,
      deliveryFee: 600,
    },
    {
      id: "ord-3",
      paymentModel: "DIRECT_PAY_ON_DELIVERY",
      status: "PAYMENT_DUE", // Not delivered yet!
      foodPrice: 8000,
      deliveryFee: 500,
    },
  ];

  const deliveredDirectOrders = directOrders.filter(
    (o) =>
      o.paymentModel === "DIRECT_PAY_ON_DELIVERY" && o.status === "DELIVERED",
  );
  const directEarnings = deliveredDirectOrders.reduce(
    (acc, o) => acc + o.deliveryFee,
    0,
  );

  assert.equal(deliveredDirectOrders.length, 2);
  assert.equal(directEarnings, 1100);
});

test("legacy compatibility: legacy payments logic unchanged when paymentModel is LEGACY", () => {
  assert.equal(
    canConfirmCanteenPurchase({
      paymentModel: "LEGACY",
      method: "ADVANCE",
      paymentStatus: "PENDING_VERIFICATION",
      delivererAllowsPayAtDelivery: false,
    }),
    false,
  );
  assert.equal(
    canConfirmCanteenPurchase({
      paymentModel: "LEGACY",
      method: "ADVANCE",
      paymentStatus: "PAID",
      delivererAllowsPayAtDelivery: false,
    }),
    true,
  );
  assert.equal(
    canConfirmCanteenPurchase({
      paymentModel: "LEGACY",
      method: "PAY_AT_DELIVERY",
      paymentStatus: "AWAITING_PAYMENT",
      delivererAllowsPayAtDelivery: true,
    }),
    true,
  );
  assert.equal(
    canConfirmCanteenPurchase({
      paymentModel: "LEGACY",
      method: "PAY_AT_DELIVERY",
      paymentStatus: "AWAITING_PAYMENT",
      delivererAllowsPayAtDelivery: false,
    }),
    false,
  );

  assert.equal(canRevealHandoverOtp("ON_THE_WAY", "PAID", "LEGACY"), false);
  assert.equal(
    canRevealHandoverOtp("NEAR_YOU", "PENDING_VERIFICATION", "LEGACY"),
    false,
  );
  assert.equal(canRevealHandoverOtp("NEAR_YOU", "PAID", "LEGACY"), true);
});
