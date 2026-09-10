"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Database,
  ShoppingBag,
} from "lucide-react";

import { useTRPC } from "~/trpc/react";

export default function MyOrdersPage() {
  const trpc = useTRPC();
  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: paymentConfig } = useQuery(trpc.payment.config.queryOptions());
  const { data: orders, isLoading } = useQuery(
    trpc.order.myOrders.queryOptions(),
  );

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-28">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-white">My Orders</h1>
          <p className="text-xs text-zinc-400">
            Track current and past deliveries
          </p>
        </div>
      </div>

      {paymentConfig?.databaseReady === false && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 text-amber-100">
          <Database className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">Payment upgrade pending</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
              Existing order history remains readable, but new payment and
              delivery actions are paused until the server database migration is
              applied.
            </p>
          </div>
        </div>
      )}

      {/* Orders List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          [1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 w-full animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50"
            />
          ))
        ) : orders && orders.length > 0 ? (
          orders.map(
            (order: {
              id: string;
              canteenName: string;
              buyerId: string;
              deliveryLocationName: string;
              foodPrice: number;
              deliveryFee: number;
              status: string;
              createdAt: Date;
            }) => {
              const isBuyer = order.buyerId === profile?.id;

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}/status`}
                  className="group flex flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 transition-all hover:border-purple-500/50 hover:bg-zinc-900 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white group-hover:text-purple-300">
                          {order.canteenName}
                        </h3>
                        <span className="rounded-full border border-purple-500/30 bg-purple-950/50 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                          {isBuyer ? "Buyer" : "Deliverer"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        To: {order.deliveryLocationName}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-white">
                        ₹
                        {((order.foodPrice + order.deliveryFee) / 100).toFixed(
                          0,
                        )}
                      </p>
                      <span className="mt-1 inline-block rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-bold text-purple-400">
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-800/60 pt-2 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-purple-400 transition-transform group-hover:translate-x-0.5">
                      View Details <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            },
          )
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <ShoppingBag className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-400">
              No orders found yet.
            </p>
            <Link
              href="/"
              className="mt-4 rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-500"
            >
              Order Food Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
