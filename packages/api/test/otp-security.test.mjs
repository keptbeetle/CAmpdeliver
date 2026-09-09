import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIVERY_OTP_LOCK_SECONDS,
  isOtpLocked,
  MAX_OTP_FAILURES,
  nextOtpFailureState,
  remainingLockSeconds,
} from "../src/services/otp-security.ts";

test("OTP failures lock only after the configured maximum", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");
  let attempts = 0;

  for (let index = 1; index < MAX_OTP_FAILURES; index += 1) {
    const state = nextOtpFailureState(attempts, DELIVERY_OTP_LOCK_SECONDS, now);
    assert.equal(state.locked, false);
    assert.equal(state.lockedUntil, null);
    assert.equal(state.failedAttempts, index);
    attempts = state.failedAttempts;
  }

  const locked = nextOtpFailureState(attempts, DELIVERY_OTP_LOCK_SECONDS, now);
  assert.equal(locked.locked, true);
  assert.equal(locked.failedAttempts, 0);
  assert.equal(locked.lockedUntil?.toISOString(), "2026-09-10T00:15:00.000Z");
});

test("OTP lock detection and countdown use the supplied clock", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");
  const lockedUntil = new Date("2026-09-10T00:00:30.100Z");

  assert.equal(isOtpLocked(lockedUntil, now), true);
  assert.equal(remainingLockSeconds(lockedUntil, now), 31);
  assert.equal(isOtpLocked(new Date("2026-09-09T23:59:59.000Z"), now), false);
  assert.equal(isOtpLocked(null, now), false);
});

test("negative historical counters cannot weaken the failure threshold", () => {
  const state = nextOtpFailureState(-100, DELIVERY_OTP_LOCK_SECONDS);
  assert.equal(state.failedAttempts, 1);
  assert.equal(state.locked, false);
});
