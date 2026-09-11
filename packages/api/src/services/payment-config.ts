const DEFAULT_DELIVERY_FEE_PAISE = 500;
const DEFAULT_PLATFORM_FEE_PAISE = 300;

const DEFAULT_TTLS_SECONDS = {
  broadcasted: 10 * 60,
  accepted: 5 * 60,
  paymentSelection: 5 * 60,
  paymentVerification: 15 * 60,
  paidAwaitingPurchase: 10 * 60,
} as const;

const UPI_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/i;
const TRANSACTION_REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{4,79}$/;

function readNonNegativeInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveInt(name: string, fallback: number) {
  const value = readNonNegativeInt(name, fallback);
  return value > 0 ? value : fallback;
}

export function getPaymentConfig() {
  return {
    deliveryFeePaise: readNonNegativeInt(
      "DELIVERY_FEE_PAISE",
      DEFAULT_DELIVERY_FEE_PAISE,
    ),
    platformFeePaise: readNonNegativeInt(
      "PLATFORM_FEE_PAISE",
      DEFAULT_PLATFORM_FEE_PAISE,
    ),
    ttls: {
      broadcasted: readPositiveInt(
        "ORDER_BROADCAST_TTL_SECONDS",
        DEFAULT_TTLS_SECONDS.broadcasted,
      ),
      accepted: readPositiveInt(
        "ORDER_ACCEPTED_TTL_SECONDS",
        DEFAULT_TTLS_SECONDS.accepted,
      ),
      paymentSelection: readPositiveInt(
        "ORDER_PAYMENT_SELECTION_TTL_SECONDS",
        DEFAULT_TTLS_SECONDS.paymentSelection,
      ),
      paymentVerification: readPositiveInt(
        "ORDER_PAYMENT_VERIFICATION_TTL_SECONDS",
        DEFAULT_TTLS_SECONDS.paymentVerification,
      ),
      paidAwaitingPurchase: readPositiveInt(
        "ORDER_PAID_PURCHASE_TTL_SECONDS",
        DEFAULT_TTLS_SECONDS.paidAwaitingPurchase,
      ),
    },
  };
}

export function normalizeUpiId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUpiId(value: string) {
  const normalized = normalizeUpiId(value);
  return normalized.length <= 100 && UPI_ID_PATTERN.test(normalized);
}

export function normalizeUpiPayeeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function expiresFromNow(seconds: number, now = new Date()) {
  return new Date(now.getTime() + seconds * 1000);
}

export function normalizeTransactionReference(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function isValidTransactionReference(value: string) {
  return TRANSACTION_REFERENCE_PATTERN.test(
    normalizeTransactionReference(value),
  );
}

export function maskTransactionReference(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeTransactionReference(value);
  if (normalized.length <= 4) return "****";
  return `****${normalized.slice(-4)}`;
}
