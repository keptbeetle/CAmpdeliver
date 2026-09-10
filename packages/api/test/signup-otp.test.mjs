import assert from "node:assert/strict";
import test from "node:test";

import {
  getFast2SmsApiKey,
  getSignupOtpHashSecret,
  hashSignupOtp,
  normalizeIndianMobile,
  sendFast2SmsOtp,
  SignupOtpConfigurationError,
  SignupOtpDeliveryError,
  signupOtpMatches,
} from "../src/services/signup-otp.ts";

test("normalizes only valid Indian mobile numbers for new signup", () => {
  assert.equal(normalizeIndianMobile("98765 43210"), "+919876543210");
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeIndianMobile("919876543210"), "+919876543210");
  assert.equal(normalizeIndianMobile("1234567890"), null);
  assert.equal(normalizeIndianMobile("+911111111111"), null);
  assert.equal(normalizeIndianMobile("5555555555"), null);
  assert.equal(normalizeIndianMobile("+14155552671"), null);
  assert.equal(normalizeIndianMobile("987654321"), null);
});

test("requires production OTP secrets but allows an isolated test hash secret", () => {
  assert.throws(
    () => getSignupOtpHashSecret({ NODE_ENV: "production" }),
    SignupOtpConfigurationError,
  );
  assert.throws(
    () =>
      getSignupOtpHashSecret({
        NODE_ENV: "development",
        PHONE_OTP_HASH_SECRET: "too-short",
      }),
    SignupOtpConfigurationError,
  );
  assert.ok(getSignupOtpHashSecret({ NODE_ENV: "test" }).length >= 32);
  assert.equal(
    getSignupOtpHashSecret({
      NODE_ENV: "production",
      PHONE_OTP_HASH_SECRET: "a".repeat(32),
    }),
    "a".repeat(32),
  );
  assert.throws(() => getFast2SmsApiKey({}), SignupOtpConfigurationError);
  assert.equal(getFast2SmsApiKey({ FAST2SMS_API_KEY: "real-key" }), "real-key");
});

test("hashes OTPs and verifies them without storing plaintext", () => {
  const secret = "s".repeat(32);
  const hash = hashSignupOtp("+919876543210", "482910", secret);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, "482910");
  assert.equal(signupOtpMatches(hash, "+919876543210", "482910", secret), true);
  assert.equal(
    signupOtpMatches(hash, "+919876543210", "482911", secret),
    false,
  );
  assert.equal(
    signupOtpMatches(hash, "+919876543210", "not-six", secret),
    false,
  );
});

test("sends Fast2SMS OTP with the normalized subscriber number", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return new Response(
      JSON.stringify({ return: true, request_id: "provider-request-1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await sendFast2SmsOtp({
    phoneNumber: "+919876543210",
    otpCode: "482910",
    apiKey: "test-api-key",
    fetchImpl,
  });

  assert.equal(result.requestId, "provider-request-1");
  assert.equal(request.url, "https://www.fast2sms.com/dev/bulkV2");
  assert.equal(request.init.headers.authorization, "test-api-key");
  assert.deepEqual(JSON.parse(request.init.body), {
    route: "otp",
    variables_values: "482910",
    numbers: "9876543210",
  });
});

test("fails closed for provider HTTP and application-level errors", async () => {
  await assert.rejects(
    sendFast2SmsOtp({
      phoneNumber: "+919876543210",
      otpCode: "482910",
      apiKey: "test-api-key",
      fetchImpl: async () =>
        new Response(JSON.stringify({ return: false, status_code: 416 }), {
          status: 200,
        }),
    }),
    SignupOtpDeliveryError,
  );

  await assert.rejects(
    sendFast2SmsOtp({
      phoneNumber: "+919876543210",
      otpCode: "482910",
      apiKey: "test-api-key",
      fetchImpl: async () =>
        new Response(JSON.stringify({ return: false }), { status: 401 }),
    }),
    SignupOtpDeliveryError,
  );
});
