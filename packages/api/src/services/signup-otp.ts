import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const SIGNUP_OTP_EXPIRY_SECONDS = 5 * 60;
export const SIGNUP_OTP_RESEND_SECONDS = 60;
export const SIGNUP_OTP_RATE_WINDOW_SECONDS = 15 * 60;
export const SIGNUP_OTP_MAX_SENDS_PER_WINDOW = 3;

const FAST2SMS_OTP_URL = "https://www.fast2sms.com/dev/bulkV2";
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;
const OTP_PATTERN = /^\d{6}$/;

type Environment = Record<string, string | undefined>;

export class SignupOtpConfigurationError extends Error {
  constructor(message = "Signup phone verification is not configured.") {
    super(message);
    this.name = "SignupOtpConfigurationError";
  }
}

export class SignupOtpDeliveryError extends Error {
  constructor(message = "The verification SMS could not be sent.") {
    super(message);
    this.name = "SignupOtpDeliveryError";
  }
}

export function normalizeIndianMobile(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const subscriber =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : null;

  if (!subscriber || !INDIAN_MOBILE_PATTERN.test(subscriber)) return null;
  return `+91${subscriber}`;
}

export function getSignupOtpHashSecret(env: Environment = process.env) {
  const secret = env.PHONE_OTP_HASH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;

  if (env.NODE_ENV === "test") {
    return "campdeliver-test-only-signup-otp-secret-32chars";
  }

  throw new SignupOtpConfigurationError();
}

export function getFast2SmsApiKey(env: Environment = process.env) {
  const key = env.FAST2SMS_API_KEY?.trim();
  if (!key || /^your-/i.test(key)) throw new SignupOtpConfigurationError();
  return key;
}

export function generateSignupOtp() {
  return randomInt(100000, 1_000_000).toString();
}

export function hashSignupOtp(
  phoneNumber: string,
  otpCode: string,
  secret = getSignupOtpHashSecret(),
) {
  return createHmac("sha256", secret)
    .update(`${phoneNumber}:${otpCode}`)
    .digest("hex");
}

export function signupOtpMatches(
  storedHash: string,
  phoneNumber: string,
  otpCode: string,
  secret = getSignupOtpHashSecret(),
) {
  if (!OTP_PATTERN.test(otpCode)) return false;
  const candidate = hashSignupOtp(phoneNumber, otpCode, secret);
  const stored = Buffer.from(storedHash, "utf8");
  const attempted = Buffer.from(candidate, "utf8");
  return (
    stored.length === attempted.length && timingSafeEqual(stored, attempted)
  );
}

interface Fast2SmsResponse {
  return?: boolean;
  request_id?: string;
  status_code?: number;
}

function isFast2SmsSuccess(payload: unknown): payload is Fast2SmsResponse {
  if (!payload || typeof payload !== "object") return false;
  const response = payload as Fast2SmsResponse;
  if (response.return === false) return false;
  if (typeof response.status_code === "number" && response.status_code >= 400) {
    return false;
  }
  return response.return === true || Boolean(response.request_id?.trim());
}

export async function sendFast2SmsOtp({
  phoneNumber,
  otpCode,
  apiKey = getFast2SmsApiKey(),
  fetchImpl = fetch,
}: {
  phoneNumber: string;
  otpCode: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}) {
  const normalizedPhone = normalizeIndianMobile(phoneNumber);
  if (!normalizedPhone || !OTP_PATTERN.test(otpCode)) {
    throw new SignupOtpDeliveryError();
  }

  let response: Response;
  try {
    response = await fetchImpl(FAST2SMS_OTP_URL, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "otp",
        variables_values: otpCode,
        numbers: normalizedPhone.slice(3),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SignupOtpDeliveryError();
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new SignupOtpDeliveryError();
  }

  if (!response.ok || !isFast2SmsSuccess(payload)) {
    throw new SignupOtpDeliveryError();
  }

  return {
    requestId:
      typeof payload.request_id === "string" ? payload.request_id : null,
  };
}
