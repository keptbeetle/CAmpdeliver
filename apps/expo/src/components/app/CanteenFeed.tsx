import { Image, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "~/utils/api";

const FALLBACK_THUMBNAILS = [
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
];

export function CanteenFeed() {
  const { data: canteens, isLoading } = useQuery(
    trpc.canteen.listActive.queryOptions(),
  );

  return (
    <View className="mb-6">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-xl font-black text-white">Campus Canteens</Text>
          <Text className="text-xs text-zinc-400">
            Select a canteen to explore menu & place orders
          </Text>
        </View>
        <View className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1">
          <Text className="text-xs font-bold text-purple-300">
            {canteens?.length ?? 0} Active
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View className="gap-5">
          {[1, 2, 3].map((n) => (
            <View
              key={n}
              className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <View className="aspect-video w-full rounded-2xl bg-zinc-800" />
              <View className="mt-3 h-5 w-3/4 rounded-md bg-zinc-800" />
              <View className="mt-2 h-4 w-1/2 rounded-md bg-zinc-800" />
            </View>
          ))}
        </View>
      ) : canteens && canteens.length > 0 ? (
        <View className="gap-5">
          {canteens.map((c, idx) => {
            const fallbackImg =
              FALLBACK_THUMBNAILS[idx % FALLBACK_THUMBNAILS.length];

            return (
              <Link
                key={c.id}
                href={{ pathname: "/canteen/[id]", params: { id: c.id } }}
                asChild
              >
                <Pressable className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60 active:scale-[0.99] active:border-purple-500/50 active:bg-zinc-900">
                  {/* YouTube Video-Card Thumbnail */}
                  <View className="relative aspect-video w-full bg-zinc-950">
                    <Image
                      source={{ uri: fallbackImg }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                    <View className="absolute inset-0 bg-black/20" />

                    {/* Status & Prep Time Pills */}
                    <View className="absolute top-3 right-3 flex-row items-center gap-1 rounded-full border border-emerald-500/40 bg-black/60 px-2.5 py-1 backdrop-blur-md">
                      <View className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <Text className="text-[11px] font-bold text-emerald-400">
                        Open Now
                      </Text>
                    </View>

                    <View className="absolute bottom-3 left-3 flex-row items-center gap-1 rounded-lg border border-black/40 bg-black/60 px-2.5 py-1 backdrop-blur-md">
                      <Text className="text-xs font-semibold text-white">
                        ⏱️ 15-20 mins
                      </Text>
                    </View>
                  </View>

                  {/* Video Info Block */}
                  <View className="flex-row items-start gap-3 p-4">
                    <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-950/50">
                      <Text className="text-lg font-bold text-purple-400">
                        🍔
                      </Text>
                    </View>

                    <View className="flex-1 overflow-hidden">
                      <Text
                        className="text-base font-bold text-white"
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <View className="mt-1 flex-row flex-wrap items-center gap-1">
                        <Text className="text-xs text-zinc-400">
                          📍 Campus Area
                        </Text>
                        <Text className="text-xs text-zinc-400">•</Text>
                        <Text className="text-xs font-semibold text-purple-400">
                          ₹5 Delivery
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </View>
      ) : (
        <View className="items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8">
          <Text className="mb-2 text-3xl">🍽️</Text>
          <Text className="text-sm font-semibold text-zinc-400">
            No active canteens found
          </Text>
          <Text className="mt-1 text-center text-xs text-zinc-500">
            Canteens will appear here once activated by Admin.
          </Text>
        </View>
      )}
    </View>
  );
}
