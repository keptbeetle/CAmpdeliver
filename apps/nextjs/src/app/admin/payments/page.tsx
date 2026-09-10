"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

const formatCurrency = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function AdminPaymentsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [holdReasons, setHoldReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery(
    trpc.auth.getMyProfile.queryOptions(),
  );
  const isAdmin = profile?.role === "ADMIN";
  const dashboard = useQuery({
    ...trpc.payment.adminDashboard.queryOptions(),
    enabled: isAdmin,
    refetchInterval: isAdmin ? 10000 : false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.payment.adminDashboard.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.payment.earnings.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.order.myOrders.queryKey(),
      }),
    ]);
  };

  const run = async (
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ) => {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    try {
      await operation();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Admin action failed.",
      );
    } finally {
      setBusy(null);
    }
  };

  const verify = useMutation(
    trpc.payment.adminConfirmPayment.mutationOptions(),
  );
  const reject = useMutation(trpc.payment.adminRejectPayment.mutationOptions());
  const refund = useMutation(
    trpc.payment.adminCompleteRefund.mutationOptions(),
  );
  const settle = useMutation(
    trpc.payment.adminMarkSettlementPaid.mutationOptions(),
  );
  const holdSettlement = useMutation(
    trpc.payment.adminHoldSettlement.mutationOptions(),
  );

  if (profileLoading) {
    return <Loading text="Checking admin access…" />;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
        <ShieldAlert className="h-8 w-8 text-amber-400" />
        <h1 className="text-xl font-black text-white">Admin access required</h1>
        <p className="text-sm text-zinc-400">
          Payment verification, refunds and settlements are restricted to ADMIN
          accounts.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Return home
        </Link>
      </div>
    );
  }

  if (dashboard.isLoading) return <Loading text="Loading finance queues…" />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-black text-white">
          Finance queues unavailable
        </h1>
        <button
          onClick={() => void dashboard.refetch()}
          className="self-center rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!dashboard.data.databaseReady) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-black text-white">
          Payment database upgrade pending
        </h1>
        <p className="text-sm text-zinc-400">
          The admin backend is online. Payment verification, refunds and
          settlements will become available after the security migration is
          applied.
        </p>
        <button
          onClick={() => void dashboard.refetch()}
          className="self-center rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Check again
        </button>
      </div>
    );
  }

  const data = dashboard.data;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 pb-28 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-white">
            Payments & Settlements
          </h1>
          <p className="text-xs text-zinc-400">
            Manual pilot reconciliation center
          </p>
        </div>
        <button
          onClick={() => void dashboard.refetch()}
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-300"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-100">
        Bank/UPI history is the source of truth. Confirm incoming money only
        after the amount and submitted UTR match the actual CAmpDeliver credit.
        The app never treats a screenshot or client callback as proof.
      </div>

      {message && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-200">
          {message}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Verify"
          value={String(data.summary.pendingPaymentVerifications)}
        />
        <Metric label="Refunds" value={String(data.summary.refundsRequired)} />
        <Metric
          label="Settle"
          value={String(data.summary.pendingSettlements)}
        />
        <Metric
          label="Pending payout"
          value={formatCurrency(data.summary.pendingSettlementAmount)}
        />
      </section>

      <Queue
        title="Payments to verify"
        empty={data.paymentVerifications.length === 0}
      >
        {data.paymentVerifications.map((payment) => {
          const key = `verify:${payment.id}`;
          const reason = reasons[payment.id] ?? "";
          return (
            <Card key={payment.id}>
              <CardHeader
                title={`Order ${payment.orderId.slice(0, 8).toUpperCase()}`}
                amount={formatCurrency(payment.expectedAmount)}
                subtitle={payment.order.canteenName}
              />
              <Info
                label="Buyer"
                value={payment.order.buyer?.name ?? "Unknown"}
              />
              <Info
                label="Method"
                value={
                  payment.method === "PAY_AT_DELIVERY"
                    ? "Pay at Delivery"
                    : "Advance"
                }
              />
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-[10px] font-black text-zinc-500 uppercase">
                  Submitted UPI / UTR
                </p>
                <p className="mt-1 text-sm font-black text-white select-all">
                  {payment.submittedUtr ?? "Missing"}
                </p>
              </div>
              {["CANCELLED", "FAILED"].includes(payment.order.status) && (
                <p className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-xs text-amber-200">
                  Order already ended. If the UTR is a real credit, Verify moves
                  it directly to the refund queue.
                </p>
              )}
              <button
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    key,
                    () => verify.mutateAsync({ orderId: payment.orderId }),
                    "Payment verified.",
                  )
                }
                className="rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50"
              >
                {busy === key ? "Verifying…" : "Verify bank credit"}
              </button>
              <input
                value={reason}
                onChange={(event) =>
                  setReasons((current) => ({
                    ...current,
                    [payment.id]: event.target.value,
                  }))
                }
                placeholder="Reason if rejecting reference"
                maxLength={300}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs text-white"
              />
              <button
                disabled={busy !== null || reason.trim().length < 3}
                onClick={() =>
                  void run(
                    `reject:${payment.id}`,
                    () =>
                      reject.mutateAsync({
                        orderId: payment.orderId,
                        reason: reason.trim(),
                      }),
                    "Reference rejected.",
                  )
                }
                className="rounded-xl border border-red-500/30 bg-red-950/20 py-2.5 text-xs font-black text-red-300 disabled:opacity-50"
              >
                Reject reference
              </button>
            </Card>
          );
        })}
      </Queue>

      <Queue title="Refunds required" empty={data.refunds.length === 0}>
        {data.refunds.map((payment) => {
          const key = `refund:${payment.id}`;
          const reference = refs[key] ?? "";
          return (
            <Card key={payment.id}>
              <CardHeader
                title={`Refund ${payment.orderId.slice(0, 8).toUpperCase()}`}
                amount={formatCurrency(payment.expectedAmount)}
                subtitle={payment.order.buyer?.name ?? "Buyer"}
              />
              <Info label="Canteen" value={payment.order.canteenName} />
              <Info
                label="Incoming UTR"
                value={payment.submittedUtr ?? "Verified"}
              />
              <p className="text-xs leading-relaxed text-amber-200">
                Send the exact refund manually first, then record the outgoing
                transfer reference.
              </p>
              <input
                value={reference}
                onChange={(event) =>
                  setRefs((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                placeholder="Outgoing refund UTR / reference"
                maxLength={80}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs text-white"
              />
              <button
                disabled={busy !== null || reference.trim().length < 5}
                onClick={() =>
                  void run(
                    key,
                    () =>
                      refund.mutateAsync({
                        orderId: payment.orderId,
                        refundReference: reference.trim(),
                      }),
                    "Refund recorded.",
                  )
                }
                className="rounded-xl bg-purple-600 py-2.5 text-xs font-black text-white disabled:opacity-50"
              >
                {busy === key ? "Saving…" : "Mark refund sent"}
              </button>
            </Card>
          );
        })}
      </Queue>

      <Queue
        title="Deliverer settlements"
        empty={data.settlements.length === 0}
      >
        {data.settlements.map((settlement) => {
          const key = `settlement:${settlement.id}`;
          const reference = refs[key] ?? "";
          const holdReason = holdReasons[settlement.id] ?? "";
          return (
            <Card key={settlement.id}>
              <CardHeader
                title={`Settlement ${settlement.orderId.slice(0, 8).toUpperCase()}`}
                amount={formatCurrency(settlement.amountDue)}
                subtitle={settlement.deliverer?.name ?? "Deliverer"}
              />
              <Info
                label="Food reimbursement"
                value={formatCurrency(settlement.foodReimbursement)}
              />
              <Info
                label="Delivery earning"
                value={formatCurrency(settlement.deliveryEarning)}
              />
              {settlement.status !== "PENDING" && (
                <p className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-xs text-amber-200">
                  {settlement.holdReason ??
                    `Settlement is ${settlement.status.toLowerCase().replace("_", " ")}. Review it before sending funds.`}
                </p>
              )}
              <input
                value={holdReason}
                onChange={(event) =>
                  setHoldReasons((current) => ({
                    ...current,
                    [settlement.id]: event.target.value,
                  }))
                }
                placeholder={
                  settlement.status === "ON_HOLD"
                    ? "Update hold reason"
                    : "Reason to put settlement on hold"
                }
                maxLength={300}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs text-white"
              />
              <button
                disabled={busy !== null || holdReason.trim().length < 3}
                onClick={() =>
                  void run(
                    `hold:${settlement.id}`,
                    () =>
                      holdSettlement.mutateAsync({
                        settlementId: settlement.id,
                        reason: holdReason.trim(),
                      }),
                    "Settlement placed on hold.",
                  )
                }
                className="rounded-xl border border-amber-500/30 bg-amber-950/20 py-2.5 text-xs font-black text-amber-300 disabled:opacity-50"
              >
                {busy === `hold:${settlement.id}`
                  ? "Saving hold…"
                  : settlement.status === "ON_HOLD"
                    ? "Update hold reason"
                    : "Put settlement on hold"}
              </button>
              <input
                value={reference}
                onChange={(event) =>
                  setRefs((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                placeholder="Outgoing payout UTR / reference"
                maxLength={80}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs text-white"
              />
              <button
                disabled={busy !== null || reference.trim().length < 5}
                onClick={() =>
                  void run(
                    key,
                    () =>
                      settle.mutateAsync({
                        settlementId: settlement.id,
                        payoutReference: reference.trim(),
                      }),
                    "Settlement recorded.",
                  )
                }
                className="rounded-xl bg-purple-600 py-2.5 text-xs font-black text-white disabled:opacity-50"
              >
                {busy === key ? "Saving…" : "Mark settlement paid"}
              </button>
            </Card>
          );
        })}
      </Queue>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-400">
        Recorded platform fees on paid deliveries:{" "}
        <strong className="text-white">
          {formatCurrency(data.summary.platformFeesEarned)}
        </strong>
      </div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      <p className="text-xs text-zinc-400">{text}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-zinc-500 uppercase">
        {label}
      </p>
    </div>
  );
}
function Queue({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-purple-400" />
        <h2 className="text-lg font-black text-white">{title}</h2>
      </div>
      {empty ? (
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Nothing waiting
          in this queue.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{children}</div>
      )}
    </section>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      {children}
    </article>
  );
}
function CardHeader({
  title,
  subtitle,
  amount,
}: {
  title: string;
  subtitle: string;
  amount: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      </div>
      <p className="text-sm font-black text-emerald-400">{amount}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-bold text-zinc-200 select-all">
        {value}
      </span>
    </div>
  );
}
