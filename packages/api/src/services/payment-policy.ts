import type {
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
  method,
  paymentStatus,
  delivererAllowsPayAtDelivery,
}: {
  method: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  delivererAllowsPayAtDelivery: boolean;
}) {
  if (method === "ADVANCE") return paymentStatus === "PAID";
  if (method === "PAY_AT_DELIVERY") return delivererAllowsPayAtDelivery;
  return false;
}

export function canRevealHandoverOtp(
  orderStatus: OrderStatus,
  paymentStatus: PaymentStatus | null,
) {
  return orderStatus === "NEAR_YOU" && paymentStatus === "PAID";
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
