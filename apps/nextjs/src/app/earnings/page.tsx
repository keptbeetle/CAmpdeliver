"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const formatCurrency = (paise: number) => "₹" + (paise / 100).toFixed(2);

export default function EarningsPage() {
  const trpc = useTRPC();
  const earnings = useQuery(trpc.payment.earnings.queryOptions());

  if (earnings.isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (earnings.isError || !earnings.data) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 text-center">
        <h1 className="text-xl font-black text-white">Earnings unavailable</h1>
        <p className="text-sm text-zinc-400">
          Your completed order history is safe. Refresh when the connection is
          available.
        </p>
        <button
          onClick={() => void earnings.refetch()}
          className="self-center rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!earnings.data.databaseReady) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 text-center">
        <h1 className="text-xl font-black text-white">
          Server upgrade pending
        </h1>
        <p className="text-sm text-zinc-400">
          Earnings will become available after the direct Pay on Delivery
          database migration is applied.
        </p>
        <button
          onClick={() => void earnings.refetch()}
          className="self-center rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Check again
        </button>
      </div>
    );
  }

  const data = earnings.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-28 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-white">Earnings</h1>
          <p className="text-xs text-zinc-400">
            Completed deliveries and the delivery fees you earned.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-purple-950/80 to-zinc-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wider text-purple-300 uppercase">
              Lifetime delivery earnings
            </p>
            <p className="mt-2 text-4xl font-black text-white">
              {formatCurrency(data.lifetimeEarnings)}
            </p>
          </div>
          <div className="rounded-2xl bg-purple-500/15 p-3 text-purple-300">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-4 max-w-xl text-xs leading-relaxed text-zinc-400">
          Only delivery fees from completed orders count as earnings. Food money
          is recovered directly from the buyer and is not profit.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Metric
          icon={Package}
          label="Completed deliveries"
          value={String(data.completedDeliveries)}
        />
        <Metric
          icon={CheckCircle2}
          label="Delivery fees earned"
          value={formatCurrency(data.lifetimeEarnings)}
        />
      </div>

      <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-100">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        <p className="leading-relaxed">
          You are paid directly at handover. You pay the canteen yourself and
          collect the food cost plus your delivery fee directly from the buyer
          after OTP verification.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-black text-white">
            Completed deliveries
          </h2>
          <p className="text-xs text-zinc-500">
            Recent direct Pay on Delivery orders.
          </p>
        </div>

        {data.completedDirectDeliveries.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-sm text-zinc-400">
            No delivery earnings yet.
          </div>
        ) : (
          data.completedDirectDeliveries.slice(0, 20).map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-white">
                    Order {order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {order.canteenName}
                    {order.paymentReceivedAt
                      ? " · " +
                        new Date(order.paymentReceivedAt).toLocaleDateString()
                      : ""}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-950/60 px-2.5 py-1 text-xs font-black text-emerald-300">
                  +{formatCurrency(order.deliveryFee)}
                </span>
              </div>

              <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3 text-xs">
                <MoneyLine label="Paid at canteen" value={order.foodPrice} />
                <MoneyLine
                  label="Collected from buyer"
                  value={order.totalAmount}
                />
                <MoneyLine
                  label="Your earning"
                  value={order.deliveryFee}
                  strong
                />
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <Icon className="h-4 w-4 text-purple-400" />
      <p className="mt-3 text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-zinc-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function MoneyLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-bold text-white" : "text-zinc-400"}>
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
