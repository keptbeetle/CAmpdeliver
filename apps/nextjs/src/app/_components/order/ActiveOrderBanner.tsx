"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Navigation, X } from "lucide-react";

import { useTRPC } from "~/trpc/react";

const ACTIVE_STATUSES = [
  "BROADCASTED",
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
];

const STATUS_PROGRESS: Record<string, number> = {
  BROADCASTED: 15,
  ACCEPTED: 30,
  ITEM_AVAILABLE: 48,
  PURCHASED: 65,
  ON_THE_WAY: 82,
  NEAR_YOU: 95,
};

const STATUS_LABELS: Record<string, string> = {
  BROADCASTED: "Finding a deliverer",
  ACCEPTED: "Deliverer checking items",
  ITEM_AVAILABLE: "Payment step",
  PURCHASED: "Canteen purchase confirmed",
  ON_THE_WAY: "On the way",
  NEAR_YOU: "Deliverer is nearby",
};

let globalIsHidden = false;
const listeners = new Set<() => void>();

function setGlobalIsHidden(val: boolean) {
  globalIsHidden = val;
  listeners.forEach((l) => l());
}

function useGlobalIsHidden() {
  const [hidden, setHidden] = useState(globalIsHidden);
  useEffect(() => {
    const listener = () => setHidden(globalIsHidden);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return [hidden, setGlobalIsHidden] as const;
}

export function ActiveOrderBanner() {
  const trpc = useTRPC();
  const pathname = usePathname();
  const [isHidden, setIsHidden] = useGlobalIsHidden();

  useEffect(() => {
    if (pathname === "/") {
      setGlobalIsHidden(false);
    }
  }, [pathname]);

  const { data: orders } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    refetchInterval: 5000,
  });

  const activeOrder = orders?.find((o: { status: string }) =>
    ACTIVE_STATUSES.includes(o.status),
  );

  if (!activeOrder || isHidden) return null;

  const progress = STATUS_PROGRESS[activeOrder.status] ?? 25;
  const statusLabel = STATUS_LABELS[activeOrder.status] ?? activeOrder.status;

  return (
    <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4">
      <div className="relative">
        <Link
          href={`/orders/${activeOrder.id}/status`}
          className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-purple-500/40 bg-zinc-900/95 p-3.5 shadow-2xl backdrop-blur-xl transition-all hover:border-purple-500 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/30 text-purple-400">
                <Navigation className="h-4 w-4 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-bold text-white group-hover:text-purple-300">
                  {activeOrder.canteenName}
                </p>
                <p className="text-[11px] font-semibold text-purple-400">
                  {statusLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-zinc-400 group-hover:text-white">
              <span>Track</span>
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* Dynamic Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </Link>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsHidden(true);
          }}
          className="absolute -top-2.5 -right-2.5 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 shadow-xl hover:bg-zinc-700 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
