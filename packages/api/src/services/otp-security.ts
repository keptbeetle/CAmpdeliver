export const MAX_OTP_FAILURES = 5;
export const DELIVERY_OTP_LOCK_SECONDS = 15 * 60;
export const SIGNUP_OTP_LOCK_SECONDS = 15 * 60;

export function isOtpLocked(
  lockedUntil: Date | null | undefined,
  now = new Date(),
) {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

export function nextOtpFailureState(
  failedAttempts: number,
  lockSeconds: number,
  now = new Date(),
) {
  const nextAttempts = Math.max(0, failedAttempts) + 1;
  if (nextAttempts < MAX_OTP_FAILURES) {
    return {
      failedAttempts: nextAttempts,
      lockedUntil: null as Date | null,
      locked: false,
    };
  }

  return {
    failedAttempts: 0,
    lockedUntil: new Date(now.getTime() + lockSeconds * 1000),
    locked: true,
  };
}

export function remainingLockSeconds(lockedUntil: Date, now = new Date()) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}
