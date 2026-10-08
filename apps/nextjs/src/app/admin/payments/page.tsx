"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Package,
  ShieldCheck,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const formatCurrency = (paise: number) => "₹" + (paise / 100).toFixed(2);

const ACTIVE = new Set([
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
  "PAYMENT_DUE",
]);

type Filter = "ALL" | "ACTIVE" | "COMPLETED" | "PROBLEMS" | "CANCELLED";

export default function AdminOrderOperationsPage() {
  const trpc = useTRPC();
  const dashboard = useQuery(trpc.payment.adminDashboard.queryOptions());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const resolveIssue = useMutation(
    trpc.payment.adminResolvePaymentIssue.mutationOptions({
      onSuccess: () => void dashboard.refetch(),
    }),
  );

  const visibleOrders = useMemo(() => {
    const source = dashboard.data?.orderOperations ?? [];
    if (filter === "ACTIVE") {
      return source.filter((order) => ACTIVE.has(order.status));
    }
    if (filter === "COMPLETED") {
      return source.filter((order) => order.status === "DELIVERED");
    }
    if (filter === "PROBLEMS") {
      return source.filter(
        (order) => order.paymentIssueAt && !order.paymentIssueResolvedAt,
      );
    }
    if (filter === "CANCELLED") {
      return source.filter((order) => order.status === "CANCELLED");
    }
    return source;
  }, [dashboard.data?.orderOperations, filter]);

  if (dashboard.isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <h1 className="text-xl font-black text-white">
          Order operations unavailable
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Check the connection and retry. No order data was changed.
        </p>
        <button
          onClick={() => void dashboard.refetch()}
          className="mt-4 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const data = dashboard.data;

  if (!data.databaseReady) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <h1 className="text-xl font-black text-white">
          Server upgrade pending
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Order operations will become available after the direct Pay on
          Delivery migration is applied.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-24">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-white">Order operations</h1>
          <p className="text-xs text-zinc-400">
            Delivery lifecycle, handover state and payment issues.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={Package}
          label="Active"
          value={data.summary.activeOrders}
        />
        <Metric
          icon={CheckCircle2}
          label="Completed"
          value={data.summary.deliveredOrders}
        />
        <Metric
          icon={AlertTriangle}
          label="Problems"
          value={data.summary.unresolvedIssues}
        />
        <Metric icon={Package} label="Total" value={data.summary.totalOrders} />
      </div>

      <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-100">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        <p>
          New orders use direct Pay on Delivery. CAmpDeliver does not hold,
          verify, refund or settle money; this dashboard is operational only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          ["ALL", "ACTIVE", "COMPLETED", "PROBLEMS", "CANCELLED"] as Filter[]
        ).map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={
              "rounded-xl px-4 py-2 text-xs font-black transition " +
              (filter === item
                ? "bg-purple-600 text-white"
                : "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800")
            }
          >
            {item.charAt(0) + item.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
          No orders in this view.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleOrders.map((order) => {
            const issueOpen = Boolean(
              order.paymentIssueAt && !order.paymentIssueResolvedAt,
            );
            const resolution = resolutions[order.id] ?? "";
            const canCompletePaid =
              order.status === "PAYMENT_DUE" &&
              Boolean(order.otpVerifiedAt) &&
              !order.paymentReceivedAt;
            const canCloseFailed =
              Boolean(order.purchasedAt) &&
              ["PURCHASED", "ON_THE_WAY", "NEAR_YOU", "PAYMENT_DUE"].includes(
                order.status,
              ) &&
              !order.paymentReceivedAt;
            return (
              <article
                key={order.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-white">
                      Order {order.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {order.canteenName} · {order.paymentModel}
                    </p>
                  </div>
                  <span
                    className={
                      "rounded-full px-2.5 py-1 text-[10px] font-black uppercase " +
                      (issueOpen
                        ? "bg-amber-950/60 text-amber-300"
                        : "bg-purple-950/60 text-purple-300")
                    }
                  >
                    {issueOpen ? "Problem" : order.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3 text-xs">
                  <Info label="Buyer" value={order.buyer.name} />
                  <Info
                    label="Buyer contact"
                    value={order.buyer.phoneNumber ?? order.buyer.email}
                  />
                  <Info
                    label="Deliverer"
                    value={
                      order.deliverer?.name ??
                      order.deliverer?.email ??
                      (order.deliverer
                        ? order.deliverer.id.slice(0, 8)
                        : "Not assigned")
                    }
                  />
                  <Info
                    label="Deliverer contact"
                    value={
                      order.deliverer?.phoneNumber ??
                      order.deliverer?.email ??
                      "—"
                    }
                  />
                  <Info label="Drop-off" value={order.deliveryLocationName} />
                  <Info
                    label="Drop-off coordinates"
                    value={
                      order.deliveryLatitude.toFixed(5) +
                      ", " +
                      order.deliveryLongitude.toFixed(5)
                    }
                  />
                  <Info
                    label="Canteen coordinates"
                    value={
                      order.canteenLatitude.toFixed(5) +
                      ", " +
                      order.canteenLongitude.toFixed(5)
                    }
                  />
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                  <p className="mb-2 font-black text-white">Items</p>
                  <div className="space-y-1.5">
                    {order.items.map((item) => (
                      <Info
                        key={item.menuItemId}
                        label={item.quantity + "× " + item.name}
                        value={formatCurrency(item.price * item.quantity)}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-black/20 p-3 text-xs">
                  <Money label="Food" value={order.foodPrice} />
                  <Money label="Delivery fee" value={order.deliveryFee} />
                  <Money label="Buyer total" value={order.totalAmount} strong />
                </div>

                <div className="mt-4 space-y-1.5 border-l-2 border-zinc-800 pl-3 text-[11px]">
                  <Info label="Created" value={formatDate(order.createdAt)} />
                  <Info label="Accepted" value={formatDate(order.acceptedAt)} />
                  <Info
                    label="Items available"
                    value={formatDate(order.itemsAvailableAt)}
                  />
                  <Info
                    label="Purchased"
                    value={formatDate(order.purchasedAt)}
                  />
                  <Info
                    label="OTP verified"
                    value={formatDate(order.otpVerifiedAt)}
                  />
                  <Info
                    label="Payment received"
                    value={formatDate(order.paymentReceivedAt)}
                  />
                  <Info
                    label="Completed"
                    value={formatDate(order.deliveredAt)}
                  />
                </div>

                {issueOpen && (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-950/20 p-3">
                    <p className="text-xs font-bold text-amber-200">
                      {order.paymentIssueReason ??
                        "Payment has not been confirmed."}
                    </p>
                    <textarea
                      value={resolution}
                      onChange={(event) =>
                        setResolutions((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                      placeholder="Admin resolution note"
                      className="mt-3 min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white outline-none focus:border-purple-500"
                    />
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        disabled={
                          resolveIssue.isPending || resolution.trim().length < 3
                        }
                        onClick={() =>
                          resolveIssue.mutate({
                            orderId: order.id,
                            resolution: resolution.trim(),
                            outcome: "NOTE_ONLY",
                          })
                        }
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-black text-zinc-200 disabled:opacity-50"
                      >
                        Save resolution note
                      </button>
                      {canCompletePaid && (
                        <button
                          disabled={
                            resolveIssue.isPending ||
                            resolution.trim().length < 3
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "Complete this order as paid? The OTP was verified; this records payment received and delivery earnings.",
                              )
                            ) {
                              resolveIssue.mutate({
                                orderId: order.id,
                                resolution: resolution.trim(),
                                outcome: "COMPLETE_PAID",
                              });
                            }
                          }}
                          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                        >
                          Resolve as paid & complete
                        </button>
                      )}
                      {canCloseFailed && (
                        <button
                          disabled={
                            resolveIssue.isPending ||
                            resolution.trim().length < 3
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "Close this order as failed? This releases both users but does not record payment or delivery earnings.",
                              )
                            ) {
                              resolveIssue.mutate({
                                orderId: order.id,
                                resolution: resolution.trim(),
                                outcome: "CLOSE_FAILED",
                              });
                            }
                          }}
                          className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                        >
                          Close order as failed
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {order.paymentIssueResolvedAt && (
                  <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs text-emerald-200">
                    Resolved:{" "}
                    {order.paymentIssueResolution ?? "Admin resolution saved."}
                  </p>
                )}

                {order.cancellationReason && (
                  <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3 text-xs text-zinc-300">
                    Cancelled: {order.cancellationReason}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <Icon className="h-4 w-4 text-purple-400" />
      <p className="mt-3 text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-zinc-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-semibold text-zinc-200">{value}</span>
    </div>
  );
}

function Money({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className={strong ? "font-bold text-white" : "text-zinc-500"}>
        {label}
      </span>
      <span
        className={
          strong ? "font-black text-emerald-300" : "font-semibold text-zinc-200"
        }
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
