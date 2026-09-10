"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  KeyRound,
  Map,
  MessageSquare,
  Navigation,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const formatCurrency = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

const ACTIVE_STATUSES = [
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
];

const STEP_INDEX: Record<string, number> = {
  BROADCASTED: 0,
  ACCEPTED: 1,
  ITEM_AVAILABLE: 2,
  PREPARING: 2,
  PURCHASED: 3,
  ON_THE_WAY: 4,
  NEAR_YOU: 4,
  DELIVERED: 5,
  COMPLETED: 5,
};

const STEPS = [
  "Broadcast",
  "Accepted",
  "Available",
  "Purchased",
  "On route",
  "Delivered",
];

export default function OrderStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [utrInput, setUtrInput] = useState("");

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: paymentConfig } = useQuery(trpc.payment.config.queryOptions());
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 3000,
  });
  const order = useMemo(
    () => orders?.find((candidate) => candidate.id === id),
    [id, orders],
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.payment.earnings.queryKey(),
      }),
    ]);
  };

  const mutationOptions = {
    onSuccess: () => void refresh(),
    onError: (error: { message: string }) => setErrorMsg(error.message),
  };
  const cancelBuyer = useMutation(
    trpc.order.cancelOrder.mutationOptions(mutationOptions),
  );
  const availability = useMutation(
    trpc.order.confirmAvailability.mutationOptions(mutationOptions),
  );
  const cancelDeliverer = useMutation(
    trpc.order.rejectOrder.mutationOptions(mutationOptions),
  );
  const purchase = useMutation(
    trpc.order.markPurchased.mutationOptions(mutationOptions),
  );
  const statusMutation = useMutation(
    trpc.order.updateOrderStatus.mutationOptions(mutationOptions),
  );
  const verifyDelivery = useMutation(
    trpc.order.verifyDelivery.mutationOptions(mutationOptions),
  );
  const chooseMethod = useMutation(
    trpc.payment.chooseMethod.mutationOptions(mutationOptions),
  );
  const submitReference = useMutation(
    trpc.payment.submitReference.mutationOptions({
      ...mutationOptions,
      onSuccess: () => {
        setUtrInput("");
        void refresh();
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !order || !profile) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-black text-white">Order unavailable</h1>
        <p className="text-sm text-zinc-400">
          {isError
            ? "The latest order state could not be loaded."
            : "This order is not in your buyer or deliverer history."}
        </p>
        {isError && (
          <button
            onClick={() => void refetch()}
            className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const isBuyer = order.buyerId === profile.id;
  const isDeliverer = order.delivererId === profile.id;
  const payment = order.payment;
  const paymentStatus = payment?.status ?? "NOT_STARTED";
  const paymentMethod = payment?.method ?? null;
  const total =
    payment?.expectedAmount ??
    order.foodPrice + order.deliveryFee + order.platformFee;
  const receivingUpiId = payment?.destinationUpiId ?? null;
  const receivingPayeeName = payment?.destinationUpiPayeeName ?? "CAmpDeliver";
  const paymentDatabaseReady = paymentConfig?.databaseReady === true;
  const terminal = !ACTIVE_STATUSES.includes(order.status);
  const currentStep = STEP_INDEX[order.status] ?? 0;
  const busy =
    cancelBuyer.isPending ||
    availability.isPending ||
    cancelDeliverer.isPending ||
    purchase.isPending ||
    statusMutation.isPending ||
    verifyDelivery.isPending ||
    chooseMethod.isPending ||
    submitReference.isPending;

  const openUpi = () => {
    if (!receivingUpiId) {
      setErrorMsg("The pilot UPI account is not configured yet.");
      return;
    }
    const query = new URLSearchParams({
      pa: receivingUpiId,
      pn: receivingPayeeName,
      am: (total / 100).toFixed(2),
      cu: "INR",
      tn: `CAmpDeliver ${order.id.slice(0, 8).toUpperCase()}`,
    });
    window.location.href = `upi://pay?${query.toString()}`;
  };

  const podPaymentDue =
    paymentMethod === "PAY_AT_DELIVERY" && order.status === "NEAR_YOU";
  const buyerCanSubmit =
    isBuyer &&
    paymentMethod !== null &&
    ["AWAITING_PAYMENT", "REJECTED"].includes(paymentStatus) &&
    (paymentMethod === "ADVANCE" || podPaymentDue);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 pb-28 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black text-white">
            Order {order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="truncate text-xs text-zinc-400">{order.canteenName}</p>
        </div>
        <span className="rounded-full border border-purple-500/30 bg-purple-950/40 px-3 py-1 text-xs font-bold text-purple-300">
          {isDeliverer ? "Deliverer" : "Buyer"}
        </span>
      </div>

      <section className="rounded-3xl border border-purple-500/25 bg-zinc-900/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-wider text-purple-400 uppercase">
              Fulfilment state
            </p>
            <h2
              data-testid="order-status"
              className="mt-1 text-lg font-black text-white"
            >
              {order.status}
            </h2>
          </div>
          {order.stateExpiresAt && !terminal && (
            <p className="text-xs text-zinc-500">
              Deadline {new Date(order.stateExpiresAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="mt-5 grid grid-cols-6 gap-1">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div
                className={`h-2.5 w-2.5 rounded-full ${index <= currentStep ? "bg-purple-500" : "bg-zinc-700"}`}
              />
              <span
                className={`text-[9px] font-bold ${index <= currentStep ? "text-zinc-300" : "text-zinc-600"}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {order.delivererId && !terminal && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/order/${order.id}/tracker`}
            className="flex items-center justify-center gap-2 rounded-2xl border border-purple-500/30 bg-purple-950/30 p-3 text-xs font-bold text-purple-300"
          >
            <Map className="h-4 w-4" /> Live map
          </Link>
          <Link
            href={`/order/${order.id}/chat`}
            className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-3 text-xs font-bold text-indigo-300"
          >
            <MessageSquare className="h-4 w-4" /> Order chat
          </Link>
        </div>
      )}

      {paymentConfig?.databaseReady === false && (
        <Notice warning>
          This order is available in read-only compatibility mode. The app is
          connected, but payment and delivery actions are paused until the
          server database migration is applied.
        </Notice>
      )}

      {paymentDatabaseReady && (
        <section className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-[10px] font-black tracking-wider text-purple-400 uppercase">
                Payment
              </p>
              <h2 className="text-base font-black text-white">
                {paymentStatus.replaceAll("_", " ")}
              </h2>
            </div>
          </div>
          <Info label="Buyer total" value={formatCurrency(total)} />
          {paymentMethod && (
            <Info
              label="Method"
              value={
                paymentMethod === "ADVANCE"
                  ? "Advance payment"
                  : "Pay at Delivery"
              }
            />
          )}

          {isBuyer &&
            order.status === "ITEM_AVAILABLE" &&
            paymentMethod === null &&
            ["AWAITING_SELECTION", "REJECTED"].includes(paymentStatus) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    chooseMethod.mutate({
                      orderId: order.id,
                      method: "ADVANCE",
                    })
                  }
                  className="rounded-xl bg-purple-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  Pay Now — Advance
                </button>
                {order.delivererAllowsPayAtDelivery ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      chooseMethod.mutate({
                        orderId: order.id,
                        method: "PAY_AT_DELIVERY",
                      })
                    }
                    className="rounded-xl border border-indigo-500/40 bg-indigo-950/40 px-4 py-3 text-xs font-black text-indigo-200 disabled:opacity-50"
                  >
                    Pay at Delivery
                  </button>
                ) : (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-500">
                    This deliverer accepts advance payment only.
                  </p>
                )}
              </div>
            )}

          {isBuyer &&
            paymentMethod === "PAY_AT_DELIVERY" &&
            paymentStatus === "AWAITING_PAYMENT" &&
            !podPaymentDue && (
              <Notice>
                Payment happens at handover. The deliverer is voluntarily
                fronting the canteen cost. When they reach you, pay digitally to
                CAmpDeliver and wait for admin verification before sharing the
                OTP.
              </Notice>
            )}

          {buyerCanSubmit && (
            <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/20 bg-purple-950/20 p-4">
              {paymentStatus === "REJECTED" && (
                <Notice warning>
                  {payment?.rejectionReason ??
                    "The submitted reference was rejected. Check it and resubmit the correct transaction."}
                </Notice>
              )}
              <div className="text-center">
                <p className="text-[10px] font-bold text-zinc-500 uppercase">
                  Pay exact amount to
                </p>
                <p className="mt-1 text-base font-black text-white select-all">
                  {receivingUpiId ?? "UPI not configured"}
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-400">
                  {formatCurrency(total)}
                </p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Reference CD-{order.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <button
                disabled={!receivingUpiId || busy}
                onClick={openUpi}
                className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/40 px-4 py-2.5 text-xs font-bold text-purple-300 disabled:opacity-50"
              >
                <ExternalLink className="h-4 w-4" /> Open UPI app
              </button>
              <input
                value={utrInput}
                onChange={(event) => setUtrInput(event.target.value)}
                placeholder="UPI transaction reference / UTR"
                maxLength={80}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-500"
              />
              <button
                disabled={busy || utrInput.trim().length < 5}
                onClick={() =>
                  submitReference.mutate({
                    orderId: order.id,
                    utrNumber: utrInput.trim(),
                  })
                }
                className="rounded-xl bg-purple-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                Submit for admin verification
              </button>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                A UPI app success screen is not proof. The backend marks payment
                Paid only after an admin matches your UTR with the actual bank
                credit.
              </p>
            </div>
          )}

          {paymentStatus === "PENDING_VERIFICATION" && (
            <Notice>
              Payment reference submitted. It is not secured until an admin
              verifies the actual bank credit.
            </Notice>
          )}
          {paymentStatus === "PAID" && (
            <Notice success>
              CAmpDeliver has verified the incoming payment.
            </Notice>
          )}
          {paymentStatus === "REFUND_REQUIRED" && (
            <Notice warning>
              The verified payment is in the admin refund queue because the
              order ended before purchase.
            </Notice>
          )}
          {paymentStatus === "REFUNDED" && (
            <Notice success>
              The admin has recorded the outgoing refund transfer.
            </Notice>
          )}
        </section>
      )}

      {paymentDatabaseReady && isBuyer && order.status === "BROADCASTED" && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Buyer cancellation is available only while this order is still being
            broadcast.
          </p>
          <button
            disabled={busy}
            onClick={() => cancelBuyer.mutate({ orderId: order.id })}
            className="w-full rounded-xl border border-red-500/30 bg-red-950/30 py-3 text-xs font-black text-red-300 disabled:opacity-50"
          >
            Cancel broadcast
          </button>
        </section>
      )}

      {paymentDatabaseReady && isDeliverer && !terminal && (
        <section className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-[10px] font-black tracking-wider text-purple-400 uppercase">
            Deliverer controls
          </p>
          {order.status === "ACCEPTED" && (
            <>
              <Notice>
                Check the canteen first. Confirm only after you know the
                requested items can be fulfilled.
              </Notice>
              <button
                disabled={busy}
                onClick={() => availability.mutate({ orderId: order.id })}
                className="rounded-xl bg-emerald-600 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                Items are available
              </button>
              <CancelDelivererButton
                busy={busy}
                mode="unavailable"
                onCancel={() => cancelDeliverer.mutate({ orderId: order.id })}
              />
            </>
          )}
          {order.status === "ITEM_AVAILABLE" && (
            <>
              {paymentMethod === null ? (
                <Notice>
                  Waiting for the buyer to choose an allowed payment method.
                </Notice>
              ) : paymentMethod === "ADVANCE" && paymentStatus !== "PAID" ? (
                <Notice warning>
                  Do not spend at the canteen yet. Advance payment must be
                  verified first.
                </Notice>
              ) : paymentMethod === "PAY_AT_DELIVERY" ? (
                <Notice warning>
                  You offered Pay at Delivery, so you may front the canteen cost
                  until handover. Buyer payment still must be verified before
                  OTP completion.
                </Notice>
              ) : (
                <Notice success>
                  Advance payment is verified. You may now pay the canteen.
                </Notice>
              )}
              <button
                disabled={
                  busy ||
                  paymentMethod === null ||
                  (paymentMethod === "ADVANCE" && paymentStatus !== "PAID")
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "Only confirm after you actually paid the canteen or placed the order. Normal cancellation ends after this step. Continue?",
                    )
                  ) {
                    purchase.mutate({ orderId: order.id });
                  }
                }}
                className="rounded-xl bg-purple-600 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                I paid the canteen / Order placed
              </button>
              {paymentStatus === "PAID" ? (
                <CancelDelivererButton
                  busy={busy}
                  mode="refund"
                  onCancel={() => cancelDeliverer.mutate({ orderId: order.id })}
                />
              ) : (
                <Notice>
                  After item availability is confirmed, cancellation is
                  server-managed while payment is pending. If either side
                  disappears, the backend TTL ends the order automatically.
                  Manual deliverer cancellation becomes available only after
                  CAmpDeliver verifies advance payment and before purchase.
                </Notice>
              )}
            </>
          )}
          {order.status === "PURCHASED" && (
            <>
              <Notice success>
                Purchase confirmed. The irreversible boundary has passed;
                continue to the buyer.
              </Notice>
              <button
                disabled={busy}
                onClick={() =>
                  statusMutation.mutate({
                    orderId: order.id,
                    status: "ON_THE_WAY",
                  })
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                <Navigation className="h-4 w-4" /> Start delivery
              </button>
            </>
          )}
          {order.status === "ON_THE_WAY" && (
            <button
              disabled={busy}
              onClick={() =>
                statusMutation.mutate({ orderId: order.id, status: "NEAR_YOU" })
              }
              className="rounded-xl bg-purple-600 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              Mark Near You
            </button>
          )}
          {order.status === "NEAR_YOU" &&
            (paymentStatus === "PAID" ? (
              <div className="flex flex-col gap-2">
                <Notice success>
                  Payment is verified. Ask for the OTP only while physically
                  handing over the order.
                </Notice>
                <div className="flex gap-2">
                  <input
                    value={otpInput}
                    onChange={(event) =>
                      setOtpInput(
                        event.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="0000"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-center text-lg font-black tracking-widest text-white"
                  />
                  <button
                    disabled={busy || otpInput.length !== 4}
                    onClick={() =>
                      verifyDelivery.mutate({
                        orderId: order.id,
                        otp: otpInput,
                      })
                    }
                    className="rounded-xl bg-emerald-600 px-5 text-xs font-black text-white disabled:opacity-50"
                  >
                    Verify OTP
                  </button>
                </div>
              </div>
            ) : (
              <Notice warning>
                Do not hand over the order yet. Buyer payment must be verified
                before OTP completion.
              </Notice>
            ))}
        </section>
      )}

      {isBuyer &&
        order.otp &&
        paymentStatus === "PAID" &&
        order.status === "NEAR_YOU" && (
          <section className="rounded-3xl border border-purple-500/30 bg-purple-950/30 p-5 text-center">
            <KeyRound className="mx-auto h-5 w-5 text-purple-300" />
            <p className="mt-2 text-[10px] font-black tracking-widest text-purple-300 uppercase">
              Handover code
            </p>
            <p
              data-testid="delivery-otp"
              className="mt-2 text-4xl font-black tracking-[0.25em] text-white"
            >
              {order.otp}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Share only when the food is physically handed to you. This code
              completes the order and creates the deliverer's settlement.
            </p>
          </section>
        )}

      {order.status === "CANCELLED" && (
        <Notice warning>
          {paymentStatus === "REFUND_REQUIRED"
            ? "Order cancelled. The verified buyer payment now requires an admin refund."
            : paymentStatus === "PENDING_VERIFICATION"
              ? "Order cancelled while a submitted UTR is still being reconciled. If money arrived, admin verification will move it to the refund queue."
              : (order.cancellationReason ??
                "Order cancelled before purchase.")}
        </Notice>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-200">
          <XCircle className="h-4 w-4 shrink-0" /> {errorMsg}
        </div>
      )}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 text-xs">
        <h2 className="mb-3 font-black text-white">Order details</h2>
        <Info label="Drop-off" value={order.deliveryLocationName} />
        <Info label="Food" value={formatCurrency(order.foodPrice)} />
        <Info
          label="Delivery earning"
          value={formatCurrency(order.deliveryFee)}
        />
        <Info label="Platform fee" value={formatCurrency(order.platformFee)} />
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <Info label="Buyer total" value={formatCurrency(total)} strong />
        </div>
      </section>
    </div>
  );
}

function Info({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-1 ${strong ? "font-black text-white" : "text-zinc-400"}`}
    >
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Notice({
  children,
  warning = false,
  success = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
  success?: boolean;
}) {
  const style = success
    ? "border-emerald-500/25 bg-emerald-950/25 text-emerald-200"
    : warning
      ? "border-amber-500/25 bg-amber-950/25 text-amber-200"
      : "border-purple-500/20 bg-purple-950/20 text-zinc-300";
  const Icon = success ? CheckCircle2 : warning ? Clock3 : ShieldCheck;
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${style}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function CancelDelivererButton({
  busy,
  mode,
  onCancel,
}: {
  busy: boolean;
  mode: "unavailable" | "refund";
  onCancel: () => void;
}) {
  const unavailable = mode === "unavailable";
  return (
    <button
      disabled={busy}
      onClick={() => {
        if (
          window.confirm(
            unavailable
              ? "Mark these items unavailable? This ends the order before the buyer pays."
              : "Cancel after secured payment? The full buyer payment will be queued for admin refund because you have not purchased the order yet.",
          )
        ) {
          onCancel();
        }
      }}
      className="rounded-xl border border-red-500/30 bg-red-950/20 py-3 text-xs font-black text-red-300 disabled:opacity-50"
    >
      {unavailable ? "Items unavailable" : "Cancel & queue refund"}
    </button>
  );
}
