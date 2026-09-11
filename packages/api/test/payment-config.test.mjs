import assert from "node:assert/strict";
import test from "node:test";

import {
  expiresFromNow,
  getPaymentConfig,
  isValidTransactionReference,
  isValidUpiId,
  maskTransactionReference,
  normalizeTransactionReference,
  normalizeUpiId,
  normalizeUpiPayeeName,
} from "../src/services/payment-config.ts";

const CONFIG_KEYS = [
  "DELIVERY_FEE_PAISE",
  "PLATFORM_FEE_PAISE",
  "ORDER_BROADCAST_TTL_SECONDS",
  "ORDER_ACCEPTED_TTL_SECONDS",
  "ORDER_PAYMENT_SELECTION_TTL_SECONDS",
  "ORDER_PAYMENT_VERIFICATION_TTL_SECONDS",
  "ORDER_PAID_PURCHASE_TTL_SECONDS",
];

function withCleanPaymentEnv(callback) {
  const previous = new Map(CONFIG_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CONFIG_KEYS) delete process.env[key];
  try {
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("uses safe pilot fee and TTL defaults", () => {
  withCleanPaymentEnv(() => {
    const config = getPaymentConfig();
    assert.equal(config.deliveryFeePaise, 500);
    assert.equal(config.platformFeePaise, 300);
    assert.deepEqual(config.ttls, {
      broadcasted: 600,
      accepted: 300,
      paymentSelection: 300,
      paymentVerification: 900,
      paidAwaitingPurchase: 600,
    });
  });
});

test("reads configured fees and positive TTLs", () => {
  withCleanPaymentEnv(() => {
    process.env.DELIVERY_FEE_PAISE = "700";
    process.env.PLATFORM_FEE_PAISE = "300";
    process.env.ORDER_BROADCAST_TTL_SECONDS = "120";

    const config = getPaymentConfig();
    assert.equal(config.deliveryFeePaise, 700);
    assert.equal(config.platformFeePaise, 300);
    assert.equal(config.ttls.broadcasted, 120);
  });
});

test("invalid fee or TTL configuration falls back instead of weakening invariants", () => {
  withCleanPaymentEnv(() => {
    process.env.DELIVERY_FEE_PAISE = "-1";
    process.env.PLATFORM_FEE_PAISE = "not-a-number";
    process.env.ORDER_ACCEPTED_TTL_SECONDS = "0";

    const config = getPaymentConfig();
    assert.equal(config.deliveryFeePaise, 500);
    assert.equal(config.platformFeePaise, 300);
    assert.equal(config.ttls.accepted, 300);
  });
});

test("normalizes and validates UPI destinations", () => {
  assert.equal(
    normalizeUpiId("  Campus.Payments@YBL  "),
    "campus.payments@ybl",
  );
  assert.equal(
    normalizeUpiPayeeName("  CAmpDeliver   Campus  "),
    "CAmpDeliver Campus",
  );
  assert.equal(isValidUpiId("campus.payments@ybl"), true);
  assert.equal(isValidUpiId("student_123@okaxis"), true);
  assert.equal(isValidUpiId("missing-handle"), false);
  assert.equal(isValidUpiId("@ybl"), false);
  assert.equal(isValidUpiId("name@"), false);
  assert.equal(isValidUpiId("name with space@ybl"), false);
});

test("normalizes and validates transaction references consistently", () => {
  assert.equal(normalizeTransactionReference("  utr 12 ab 34  "), "UTR12AB34");
  assert.equal(isValidTransactionReference("123456789012"), true);
  assert.equal(isValidTransactionReference("upi-abcd/1234"), true);
  assert.equal(isValidTransactionReference("abc<script>"), false);
  assert.equal(isValidTransactionReference("abc\n123"), true);
  assert.equal(maskTransactionReference("  utr 12 ab 34  "), "****AB34");
  assert.equal(maskTransactionReference(null), null);
});

test("computes server deadlines from the supplied clock", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");
  assert.equal(
    expiresFromNow(90, now).toISOString(),
    "2026-09-10T00:01:30.000Z",
  );
});
