"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Map,
  MessageSquare,
  Navigation,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const formatCurrency = (paise: number) => "₹" + (paise / 100).toFixed(2);

const ACTIVE_STATUSES = [
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
  "PAYMENT_DUE",
];

const STEP_INDEX: Record<string, number> = {
  BROADCASTED: 0,
  ACCEPTED: 1,
  ITEM_AVAILABLE: 2,
  PREPARING: 2,
  PURCHASED: 3,
  ON_THE_WAY: 4,
  NEAR_YOU: 4,
  PAYMENT_DUE: 5,
  DELIVERED: 6,
  COMPLETED: 6,
};

const STEPS = [
  "Broadcast",
  "Accepted",
  "Available",
  "Purchased",
  "On route",
  "Payment due",
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
  const [issueReasonInput, setIssueReasonInput] = useState("");

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
    onSuccess: () => {
      setErrorMsg(null);
      void refresh();
    },
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
  const confirmPaymentReceived = useMutation(
    trpc.order.confirmPaymentReceived.mutationOptions(mutationOptions),
  );
  const reportPaymentIssue = useMutation(
    trpc.order.reportPaymentIssue.mutationOptions({
      ...mutationOptions,
      onSuccess: () => {
        setIssueReasonInput("");
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
  const isDirectPod = order.paymentModel === "DIRECT_PAY_ON_DELIVERY";
  const databaseReady = paymentConfig?.databaseReady === true;
  const total = isDirectPod
    ? order.foodPrice + order.deliveryFee
    : order.foodPrice + order.deliveryFee + order.platformFee;
  const terminal = !ACTIVE_STATUSES.includes(order.status);
  const currentStep = STEP_INDEX[order.status] ?? 0;
  const canCancelBeforePurchase =
    isDirectPod &&
    order.purchasedAt === null &&
    ["BROADCASTED", "ACCEPTED", "ITEM_AVAILABLE"].includes(order.status);
  const canReportPostPurchaseIssue =
    databaseReady &&
    isDirectPod &&
    (isBuyer || isDeliverer) &&
    order.purchasedAt !== null &&
    ["PURCHASED", "ON_THE_WAY", "NEAR_YOU", "PAYMENT_DUE"].includes(
      order.status,
    ) &&
    order.paymentReceivedAt === null &&
    (!order.paymentIssueAt || Boolean(order.paymentIssueResolvedAt));

  const busy =
    cancelBuyer.isPending ||
    availability.isPending ||
    cancelDeliverer.isPending ||
    purchase.isPending ||
    statusMutation.isPending ||
    verifyDelivery.isPending ||
    confirmPaymentReceived.isPending ||
    reportPaymentIssue.isPending;

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
              {order.status === "PAYMENT_DUE"
                ? "PAYMENT DUE AT DELIVERY"
                : order.status.replaceAll("_", " ")}
            </h2>
          </div>
          {order.stateExpiresAt && !terminal && (
            <p className="text-xs text-zinc-500">
              Deadline {new Date(order.stateExpiresAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        {isDirectPod && !terminal && (
          <div className="mt-5 grid grid-cols-7 gap-1">
            {STEPS.map((label, index) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div
                  className={
                    "h-2.5 w-2.5 rounded-full " +
                    (index <= currentStep ? "bg-purple-500" : "bg-zinc-700")
                  }
                />
                <span
                  className={
                    "text-[9px] font-bold " +
                    (index <= currentStep ? "text-zinc-300" : "text-zinc-600")
                  }
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isDirectPod && (
        <Notice>
          Legacy financial history is read-only in the current app. Existing
          records remain visible, but historical financial actions are disabled.
        </Notice>
      )}

      {!databaseReady && (
        <Notice warning>
          Delivery actions are paused until the direct Pay on Delivery database
          migration is available on the backend.
        </Notice>
      )}

      {order.delivererId && !terminal && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={"/order/" + order.id + "/tracker"}
            className="flex items-center justify-center gap-2 rounded-2xl border border-purple-500/30 bg-purple-950/30 p-3 text-xs font-bold text-purple-300"
          >
            <Map className="h-4 w-4" /> Live map
          </Link>
          <Link
            href={"/order/" + order.id + "/chat"}
            className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-3 text-xs font-bold text-indigo-300"
          >
            <MessageSquare className="h-4 w-4" /> Order chat
          </Link>
        </div>
      )}

      {isDirectPod && (
        <section className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-[10px] font-black tracking-wider text-purple-400 uppercase">
                Payment model
              </p>
              <h2 className="text-base font-black text-white">
                Direct Pay on Delivery
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
            <div>
              <span className="text-[10px] text-zinc-400">Food at canteen</span>
              <p className="font-bold text-zinc-200">
                {formatCurrency(order.foodPrice)}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400">
                Delivery earning
              </span>
              <p className="font-bold text-emerald-400">
                {formatCurrency(order.deliveryFee)}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400">
                Buyer pays deliverer
              </span>
              <p className="font-black text-purple-400">
                {formatCurrency(total)}
              </p>
            </div>
          </div>

          {order.status === "PAYMENT_DUE" ? (
            <Notice warning>
              {isDeliverer
                ? "OTP verified. Collect " +
                  formatCurrency(total) +
                  " directly from the buyer, then confirm receipt."
                : "OTP verified. Pay " +
                  formatCurrency(total) +
                  " directly to your deliverer. CAmpDeliver does not receive or verify this payment."}
            </Notice>
          ) : order.status === "DELIVERED" ? (
            <Notice success>
              Direct payment was confirmed. The deliverer earned{" "}
              {formatCurrency(order.deliveryFee)}.
            </Notice>
          ) : (
            <Notice>
              No payment is needed in the app. The deliverer pays the canteen
              first; buyer payment becomes due only after OTP verification.
            </Notice>
          )}

          {order.paymentIssueAt && (
            <Notice
              warning={!order.paymentIssueResolvedAt}
              success={Boolean(order.paymentIssueResolvedAt)}
            >
              <div className="flex flex-col gap-1">
                <p className="font-bold">
                  {order.paymentIssueResolvedAt
                    ? "Payment issue reviewed"
                    : "Payment issue reported"}
                </p>
                <p className="text-xs">
                  {order.paymentIssueResolvedAt
                    ? (order.paymentIssueResolution ??
                      "An administrator reviewed this issue.")
                    : (order.paymentIssueReason ??
                      "An administrator needs to review this handover.")}
                </p>
              </div>
            </Notice>
          )}
        </section>
      )}

      {databaseReady && isDirectPod && isBuyer && canCancelBeforePurchase && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            You can cancel until the deliverer confirms they paid the canteen.
            After purchase, exceptional problems require admin review.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm("Cancel this order before canteen purchase?")
              ) {
                cancelBuyer.mutate({ orderId: order.id });
              }
            }}
            className="w-full rounded-xl border border-red-500/30 bg-red-950/30 py-3 text-xs font-black text-red-300 hover:bg-red-950/50 disabled:opacity-50"
          >
            Cancel order
          </button>
        </section>
      )}

      {canReportPostPurchaseIssue && (
        <section className="flex flex-col gap-3 rounded-3xl border border-amber-500/20 bg-amber-950/20 p-5">
          <Notice warning>
            {order.status === "PAYMENT_DUE"
              ? "Problem with payment or handover? Report it for admin review."
              : "Problem after the canteen purchase? Report the delivery or handover issue for admin review. This is the exception path after the deliverer has spent real money."}
          </Notice>
          <textarea
            value={issueReasonInput}
            onChange={(event) => setIssueReasonInput(event.target.value)}
            placeholder="Describe the delivery, handover, or payment problem"
            rows={3}
            maxLength={300}
            className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-white"
          />
          <button
            disabled={busy || issueReasonInput.trim().length < 3}
            onClick={() =>
              reportPaymentIssue.mutate({
                orderId: order.id,
                reason: issueReasonInput.trim(),
              })
            }
            className="rounded-xl bg-amber-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
          >
            Report handover issue
          </button>
        </section>
      )}

      {databaseReady && isDirectPod && isDeliverer && !terminal && (
        <section className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-[10px] font-black tracking-wider text-purple-400 uppercase">
            Deliverer controls
          </p>

          {order.status === "ACCEPTED" && (
            <>
              <Notice>
                Check the canteen first. Confirm only after the requested items
                can be fulfilled.
              </Notice>
              <button
                disabled={busy}
                onClick={() => availability.mutate({ orderId: order.id })}
                className="rounded-xl bg-emerald-600 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                Items are available
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "End this delivery before purchase because the items cannot be fulfilled?",
                    )
                  ) {
                    cancelDeliverer.mutate({ orderId: order.id });
                  }
                }}
                className="rounded-xl border border-red-500/30 bg-red-950/20 py-3 text-xs font-black text-red-300 disabled:opacity-50"
              >
                Items unavailable
              </button>
            </>
          )}

          {order.status === "ITEM_AVAILABLE" && (
            <>
              <Notice warning>
                Pay {formatCurrency(order.foodPrice)} at the canteen from your
                own money. At handover you will collect {formatCurrency(total)}{" "}
                from the buyer and keep {formatCurrency(order.deliveryFee)} as
                your earning.
              </Notice>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Confirm you paid " +
                        formatCurrency(order.foodPrice) +
                        " at the canteen? Normal cancellation ends after this step.",
                    )
                  ) {
                    purchase.mutate({ orderId: order.id });
                  }
                }}
                className="rounded-xl bg-purple-600 py-3 text-xs font-black text-white shadow-lg shadow-purple-600/30 hover:bg-purple-500 disabled:opacity-50"
              >
                I paid the canteen / Confirm purchase
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm("End this delivery before canteen purchase?")
                  ) {
                    cancelDeliverer.mutate({ orderId: order.id });
                  }
                }}
                className="rounded-xl border border-red-500/30 bg-red-950/20 py-3 text-xs font-black text-red-300 disabled:opacity-50"
              >
                End delivery before purchase
              </button>
            </>
          )}

          {order.status === "PURCHASED" && (
            <>
              <Notice success>
                Purchase confirmed. Normal cancellation is now disabled;
                continue to the fixed delivery location.
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
                statusMutation.mutate({
                  orderId: order.id,
                  status: "NEAR_YOU",
                })
              }
              className="rounded-xl bg-purple-600 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              Mark near you
            </button>
          )}

          {order.status === "NEAR_YOU" && (
            <div className="flex flex-col gap-2">
              <Notice success>
                Ask the buyer for their 4-digit handover code while physically
                handing over the food. Payment becomes due only after OTP
                verification.
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
          )}

          {order.status === "PAYMENT_DUE" && (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Confirm you received " +
                        formatCurrency(total) +
                        " directly from the buyer?",
                    )
                  ) {
                    confirmPaymentReceived.mutate({
                      orderId: order.id,
                    });
                  }
                }}
                className="rounded-xl bg-emerald-600 py-3.5 text-xs font-black text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 disabled:opacity-50"
              >
                Payment received · {formatCurrency(total)}
              </button>
            </>
          )}
        </section>
      )}

      {isBuyer && isDirectPod && order.otp && order.status === "NEAR_YOU" && (
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
            Share this code only while physically receiving the food. After OTP
            verification, pay {formatCurrency(total)} directly to your
            deliverer.
          </p>
        </section>
      )}

      {order.status === "CANCELLED" && (
        <Notice warning>
          {order.cancellationReason ?? "Order cancelled before purchase."}
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
        <Info label="Food price" value={formatCurrency(order.foodPrice)} />
        <Info label="Delivery fee" value={formatCurrency(order.deliveryFee)} />
        <Info label="Platform fee" value={formatCurrency(order.platformFee)} />
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <Info
            label={isDirectPod ? "Pay on Delivery total" : "Historical total"}
            value={formatCurrency(total)}
            strong
          />
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
      className={
        "flex items-center justify-between gap-4 py-1 " +
        (strong ? "font-black text-white" : "text-zinc-400")
      }
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
  const Icon = success ? CheckCircle2 : warning ? AlertTriangle : ShieldCheck;
  return (
    <div
      className={
        "flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed " +
        style
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
