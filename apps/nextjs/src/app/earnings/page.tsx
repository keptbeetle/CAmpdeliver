"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Package,
  ReceiptIndianRupee,
  TrendingUp,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const formatCurrency = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function EarningsPage() {
  const trpc = useTRPC();
  const [requestError, setRequestError] = useState<string | null>(null);
  const earnings = useQuery(trpc.payment.earnings.queryOptions());
  const requestSettlement = useMutation(
    trpc.payment.requestSettlement.mutationOptions({
      onSuccess: () => {
        setRequestError(null);
        void earnings.refetch();
      },
      onError: (error) => setRequestError(error.message),
    }),
  );

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
          Your settlement records were not changed. Refresh when the connection
          is available.
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
          Payment upgrade pending
        </h1>
        <p className="text-sm text-zinc-400">
          The app and backend are connected. Earnings will become available
          after the payment/security database migration is applied.
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
          <h1 className="text-xl font-black text-white">
            Earnings & Settlements
          </h1>
          <p className="text-xs text-zinc-400">
            Delivery earnings and food reimbursements are tracked separately.
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
          This number is only what you earned for delivering. Food money you
          fronted is reimbursement, not profit.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric
          icon={CheckCircle2}
          label="Paid earnings"
          value={formatCurrency(data.paidEarnings)}
        />
        <Metric
          icon={ReceiptIndianRupee}
          label="Food reimbursed"
          value={formatCurrency(data.foodReimbursed)}
        />
        <Metric
          icon={ReceiptIndianRupee}
          label="Ready to request"
          value={formatCurrency(data.availableSettlementAmount)}
        />
        <Metric
          icon={Clock3}
          label="Pending amount"
          value={formatCurrency(data.pendingSettlementAmount)}
        />
        <Metric
          icon={CheckCircle2}
          label="Paid settlements"
          value={String(data.paidSettlements)}
        />
        <Metric
          icon={ReceiptIndianRupee}
          label="Paid total"
          value={formatCurrency(data.paidSettlementAmount)}
        />
        <Metric
          icon={Package}
          label="Deliveries"
          value={String(data.completedDeliveries)}
        />
      </div>

      {data.availableSettlementAmount > 0 ? (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-950/20 p-4 text-xs leading-relaxed text-purple-200">
          A completed delivery has reimbursement ready. Request it from the
          settlement card below and it will enter the admin transfer queue.
        </div>
      ) : data.pendingSettlementAmount > 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-200">
          Your reimbursement request is waiting in the manual admin settlement
          queue.
        </div>
      ) : null}

      {requestError && (
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-4 text-xs text-red-200">
          {requestError}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-black text-white">Recent settlements</h2>
          <p className="text-xs text-zinc-500">
            Created automatically after verified payment and OTP handover.
          </p>
        </div>
        {data.recent.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-sm text-zinc-400">
            No delivery settlements yet. Every student account can buy and
            deliver.
          </div>
        ) : (
          data.recent.map((settlement) => (
            <article
              key={settlement.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-white">
                    Order {settlement.orderId.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(settlement.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${settlement.status === "PAID" ? "bg-emerald-950/60 text-emerald-300" : "bg-amber-950/50 text-amber-300"}`}
                >
                  {settlement.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3 text-xs">
                <MoneyLine
                  label="Food reimbursement"
                  value={settlement.foodReimbursement}
                />
                <MoneyLine
                  label="Delivery earning"
                  value={settlement.deliveryEarning}
                />
                <MoneyLine
                  label="Settlement total"
                  value={settlement.amountDue}
                  strong
                />
              </div>
              {settlement.status === "AVAILABLE" && (
                <button
                  disabled={requestSettlement.isPending}
                  onClick={() => {
                    setRequestError(null);
                    requestSettlement.mutate({ settlementId: settlement.id });
                  }}
                  className="mt-3 w-full rounded-xl bg-purple-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {requestSettlement.isPending &&
                  requestSettlement.variables.settlementId === settlement.id
                    ? "Requesting..."
                    : "Request reimbursement"}
                </button>
              )}
              {settlement.holdReason && (
                <p className="mt-3 rounded-xl bg-amber-950/30 p-3 text-xs text-amber-200">
                  {settlement.holdReason}
                </p>
              )}
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
    <div
      className={`flex justify-between gap-4 ${strong ? "font-black text-white" : "text-zinc-400"}`}
    >
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}
