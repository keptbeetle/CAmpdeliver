import assert from "node:assert/strict";
import test from "node:test";

import {
  expiresFromNow,
  getPaymentConfig,
  normalizeTransactionReference,
} from "../src/services/payment-config.ts";

const CONFIG_KEYS = [
  "CAMPDELIVER_UPI_ID",
  "CAMPDELIVER_UPI_PAYEE_NAME",
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

test("uses safe pilot defaults and keeps UPI optional", () => {
  withCleanPaymentEnv(() => {
    const config = getPaymentConfig();
    assert.equal(config.deliveryFeePaise, 500);
    assert.equal(config.platformFeePaise, 300);
    assert.equal(config.upiId, null);
    assert.equal(config.upiPayeeName, "CAmpDeliver");
    assert.deepEqual(config.ttls, {
      broadcasted: 600,
      accepted: 300,
      paymentSelection: 300,
      paymentVerification: 900,
      paidAwaitingPurchase: 600,
    });
  });
});

test("reads configured fees, UPI identity, and positive TTLs", () => {
  withCleanPaymentEnv(() => {
    process.env.CAMPDELIVER_UPI_ID = "campdeliver@upi";
    process.env.CAMPDELIVER_UPI_PAYEE_NAME = "Campus Deliver";
    process.env.DELIVERY_FEE_PAISE = "700";
    process.env.PLATFORM_FEE_PAISE = "300";
    process.env.ORDER_BROADCAST_TTL_SECONDS = "120";

    const config = getPaymentConfig();
    assert.equal(config.upiId, "campdeliver@upi");
    assert.equal(config.upiPayeeName, "Campus Deliver");
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

test("normalizes transaction references consistently", () => {
  assert.equal(normalizeTransactionReference("  utr 12 ab 34  "), "UTR12AB34");
});

test("computes server deadlines from the supplied clock", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");
  assert.equal(
    expiresFromNow(90, now).toISOString(),
    "2026-09-10T00:01:30.000Z",
  );
});
