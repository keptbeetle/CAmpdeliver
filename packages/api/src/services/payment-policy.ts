import type {
  OrderPaymentModel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SettlementStatus,
} from "@acme/db/schema";

export function canSubmitPaymentReference(
  method: PaymentMethod,
  orderStatus: OrderStatus,
) {
  return method === "ADVANCE"
    ? orderStatus === "ITEM_AVAILABLE"
    : orderStatus === "NEAR_YOU";
}

export function canConfirmCanteenPurchase({
  paymentModel,
  method = null,
  paymentStatus = null,
  delivererAllowsPayAtDelivery = false,
}: {
  paymentModel?: OrderPaymentModel;
  method?: PaymentMethod | null;
  paymentStatus?: PaymentStatus | null;
  delivererAllowsPayAtDelivery?: boolean;
}) {
  const model =
    paymentModel ??
    (method !== null || paymentStatus !== null
      ? "LEGACY"
      : "DIRECT_PAY_ON_DELIVERY");
  if (model === "DIRECT_PAY_ON_DELIVERY") {
    // Deliverer fronts the canteen cost from their own money.
    // No buyer payment verification or method selection is required.
    return true;
  }
  if (method === "ADVANCE") return paymentStatus === "PAID";
  if (method === "PAY_AT_DELIVERY") return delivererAllowsPayAtDelivery;
  return false;
}

export function canRevealHandoverOtp(
  orderStatus: OrderStatus,
  paymentStatus: PaymentStatus | null = null,
  paymentModel?: OrderPaymentModel,
) {
  const model =
    paymentModel ??
    (paymentStatus !== null ? "LEGACY" : "DIRECT_PAY_ON_DELIVERY");
  if (model === "DIRECT_PAY_ON_DELIVERY") {
    return orderStatus === "NEAR_YOU" || orderStatus === "PAYMENT_DUE";
  }
  return orderStatus === "NEAR_YOU" && paymentStatus === "PAID";
}

export function canBuyerCancelOrder({
  status,
  purchasedAt,
}: {
  status: OrderStatus;
  purchasedAt: Date | null;
}) {
  if (purchasedAt !== null) return false;
  return (
    status === "BROADCASTED" ||
    status === "ACCEPTED" ||
    status === "ITEM_AVAILABLE"
  );
}

export function canDelivererCancelOrder({
  status,
  purchasedAt,
}: {
  status: OrderStatus;
  purchasedAt: Date | null;
}) {
  if (purchasedAt !== null) return false;
  return status === "ACCEPTED" || status === "ITEM_AVAILABLE";
}

export function canVerifyDeliveryOtp(orderStatus: OrderStatus) {
  return orderStatus === "NEAR_YOU";
}

export function canConfirmPaymentReceived({
  status,
  otpVerifiedAt,
}: {
  status: OrderStatus;
  otpVerifiedAt: Date | null;
}) {
  return status === "PAYMENT_DUE" && otpVerifiedAt !== null;
}

export function directPaymentTotal(foodPrice: number, deliveryFee: number) {
  if (!Number.isInteger(foodPrice) || foodPrice < 0) {
    throw new Error("foodPrice must be a nonnegative integer");
  }
  if (!Number.isInteger(deliveryFee) || deliveryFee < 0) {
    throw new Error("deliveryFee must be a nonnegative integer");
  }
  return foodPrice + deliveryFee;
}

export type DirectPaymentConfirmationDisposition =
  | "CONFIRM"
  | "ALREADY_COMPLETED"
  | "INVALID";

export function directPaymentConfirmationDisposition({
  status,
  otpVerifiedAt,
  paymentReceivedAt,
}: {
  status: OrderStatus;
  otpVerifiedAt: Date | null;
  paymentReceivedAt: Date | null;
}): DirectPaymentConfirmationDisposition {
  if (status === "DELIVERED" && paymentReceivedAt) {
    return "ALREADY_COMPLETED";
  }
  if (status === "PAYMENT_DUE" && otpVerifiedAt && !paymentReceivedAt) {
    return "CONFIRM";
  }
  return "INVALID";
}

const DIRECT_POST_PURCHASE_STATUSES: OrderStatus[] = [
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
  "PAYMENT_DUE",
];

export function canReportDirectOrderIssue({
  status,
  purchasedAt,
  paymentReceivedAt,
}: {
  status: OrderStatus;
  purchasedAt: Date | null;
  paymentReceivedAt: Date | null;
}) {
  return (
    purchasedAt !== null &&
    DIRECT_POST_PURCHASE_STATUSES.includes(status) &&
    paymentReceivedAt === null
  );
}

export function canAdminCompleteDirectOrder({
  status,
  otpVerifiedAt,
  paymentReceivedAt,
}: {
  status: OrderStatus;
  otpVerifiedAt: Date | null;
  paymentReceivedAt: Date | null;
}) {
  return (
    status === "PAYMENT_DUE" &&
    otpVerifiedAt !== null &&
    paymentReceivedAt === null
  );
}

export function canAdminFailDirectOrder({
  status,
  purchasedAt,
  paymentReceivedAt,
}: {
  status: OrderStatus;
  purchasedAt: Date | null;
  paymentReceivedAt: Date | null;
}) {
  return (
    purchasedAt !== null &&
    DIRECT_POST_PURCHASE_STATUSES.includes(status) &&
    paymentReceivedAt === null
  );
}

export type DelivererPrePurchaseCancellationMode =
  | "ITEMS_UNAVAILABLE"
  | "SECURED_PAYMENT_REFUND";

export function delivererPrePurchaseCancellationMode(
  orderStatus: OrderStatus,
  paymentStatus: PaymentStatus | null,
): DelivererPrePurchaseCancellationMode | null {
  if (orderStatus === "ACCEPTED") return "ITEMS_UNAVAILABLE";
  if (orderStatus === "ITEM_AVAILABLE" && paymentStatus === "PAID") {
    return "SECURED_PAYMENT_REFUND";
  }
  return null;
}

export type SettlementRequestDisposition =
  | "REQUEST"
  | "ALREADY_REQUESTED"
  | "ALREADY_PAID";

export function settlementRequestDisposition(
  status: SettlementStatus,
): SettlementRequestDisposition {
  if (status === "AVAILABLE") return "REQUEST";
  if (status === "PAID") return "ALREADY_PAID";
  return "ALREADY_REQUESTED";
}

export type PrePurchasePaymentDisposition =
  | "REFUND_REQUIRED"
  | "PRESERVE_PENDING_VERIFICATION"
  | "REJECTED"
  | "UNCHANGED";

export function prePurchaseCancellationDisposition(
  paymentStatus: PaymentStatus | null,
): PrePurchasePaymentDisposition {
  if (paymentStatus === "PAID") return "REFUND_REQUIRED";
  if (paymentStatus === "PENDING_VERIFICATION") {
    return "PRESERVE_PENDING_VERIFICATION";
  }
  if (paymentStatus === "REFUND_REQUIRED" || paymentStatus === "REFUNDED") {
    return "UNCHANGED";
  }
  return "REJECTED";
}
