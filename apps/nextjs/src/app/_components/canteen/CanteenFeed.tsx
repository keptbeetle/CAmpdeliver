"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, Sparkles, Utensils } from "lucide-react";

import { useTRPC } from "~/trpc/react";

const HERO_BANNERS = [
  {
    id: "b1",
    title: "Campus Express Delivery 🚀",
    subtitle: "Hot food delivered to your hostel room in under 20 mins",
    badge: "Fastest",
    gradient: "from-purple-900/90 via-indigo-900/80 to-purple-950",
  },
  {
    id: "b2",
    title: "Earn ₹ by Delivering Quests 🚴",
    subtitle: "Pick up food for peers on your way back and earn payouts",
    badge: "Side Quest",
    gradient: "from-emerald-900/90 via-teal-900/80 to-zinc-950",
  },
  {
    id: "b3",
    title: "Late Night Cravings 🌙",
    subtitle: "Night canteen orders open till 2 AM across campus hostels",
    badge: "Night Shift",
    gradient: "from-amber-900/90 via-orange-950/80 to-zinc-950",
  },
];

// Fallback high quality campus food cover images
const FALLBACK_THUMBNAILS = [
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
];

export function CanteenFeed() {
  const trpc = useTRPC();
  const { data: canteens, isLoading } = useQuery(
    trpc.canteen.listActive.queryOptions(),
  );

  return (
    <div className="flex flex-col gap-6 px-4 py-4 sm:px-6">
      {/* Hero Banner Carousel */}
      <div className="flex w-full gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
        {HERO_BANNERS.map((banner) => (
          <div
            key={banner.id}
            className={`relative flex min-w-[260px] max-w-[340px] flex-1 snap-start flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${banner.gradient} p-5 shadow-xl`}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase backdrop-blur-md">
                {banner.badge}
              </span>
              <Sparkles className="h-4 w-4 text-purple-300 animate-pulse" />
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-black tracking-tight text-white">
                {banner.title}
              </h3>
              <p className="mt-1 text-xs text-zinc-300">{banner.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Canteen List Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Campus Canteens</h2>
          <p className="text-xs text-zinc-400">
            Select a canteen to explore menu & place orders
          </p>
        </div>
        <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300">
          {canteens?.length ?? 0} Active
        </span>
      </div>

      {/* YouTube-Style Grid Feed */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="w-full pt-[56.25%] rounded-2xl bg-zinc-800" />
              <div className="mt-3 h-5 w-3/4 rounded-md bg-zinc-800" />
              <div className="mt-2 h-4 w-1/2 rounded-md bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : canteens && canteens.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {canteens.map((canteen: { id: string; name: string }, idx: number) => {
            const fallbackImg =
              FALLBACK_THUMBNAILS[idx % FALLBACK_THUMBNAILS.length];

            return (
              <Link
                key={canteen.id}
                href={`/canteen/${canteen.id}`}
                className="group relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60 transition-all hover:border-purple-500/50 hover:bg-zinc-900 hover:shadow-xl hover:shadow-purple-950/20 active:scale-[0.99]"
              >
                {/* YouTube Video-Card Thumbnail */}
                <div className="relative w-full pt-[56.25%] overflow-hidden bg-zinc-950">
                  <img
                    src={fallbackImg}
                    alt={canteen.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />

                  {/* Status & Prep Time Pills */}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-950/80 px-2.5 py-1 text-[11px] font-bold text-emerald-400 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Open Now
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-lg border border-black/40 bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
                      <Clock className="h-3.5 w-3.5 text-purple-400" />
                      15 - 20 mins
                    </span>
                  </div>
                </div>

                {/* Video Info Block */}
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-950/50 text-purple-400 font-bold">
                    <Utensils className="h-5 w-5" />
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <h3 className="truncate text-base font-bold text-white group-hover:text-purple-300">
                      {canteen.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1 truncate text-zinc-400">
                        <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                        Campus Landmark Area
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-purple-400">
                        ₹5 Delivery
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <Utensils className="h-10 w-10 text-zinc-600 mb-2" />
          <p className="text-sm font-semibold text-zinc-400">
            No active canteens found
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Canteens will appear here once activated by Admin.
          </p>
        </div>
      )}
    </div>
  );
}
