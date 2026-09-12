import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "../utils/auth";

interface DelivererLocationPayload {
  latitude: number;
  longitude: number;
}

interface UseOrderRealtimeOptions {
  onLocationUpdate?: (payload: DelivererLocationPayload) => void;
  onChatUpdate?: () => void;
  onOrderUpdate?: () => void;
}

export function useOrderRealtime(
  orderId: string,
  options?: UseOrderRealtimeOptions,
) {
  const [delivererLocation, setDelivererLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn(
          `Could not authenticate realtime order:${orderId}:`,
          error,
        );
        return;
      }
      const accessToken = data.session?.access_token;
      if (!accessToken || cancelled) return;

      await supabase.realtime.setAuth(accessToken);
      // Cleanup can run while realtime authentication is awaiting.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelled) return;

      channel = supabase
        .channel(`order:${orderId}`, { config: { private: true } })
        .on("broadcast", { event: "location_update" }, (payload) => {
          const location = payload.payload as DelivererLocationPayload;
          setDelivererLocation({
            latitude: location.latitude,
            longitude: location.longitude,
          });
          optionsRef.current?.onLocationUpdate?.(location);
        })
        .on("broadcast", { event: "chat_update" }, () => {
          optionsRef.current?.onChatUpdate?.();
        })
        .on("broadcast", { event: "order_update" }, () => {
          optionsRef.current?.onOrderUpdate?.();
        });

      channelRef.current = channel;
      channel.subscribe();
    };

    void subscribe();

    return () => {
      cancelled = true;
      const activeChannel = channel;
      if (activeChannel) void supabase.removeChannel(activeChannel);
      if (channelRef.current === activeChannel) channelRef.current = null;
    };
  }, [orderId]);

  const broadcastLocation = useCallback(
    async (location: DelivererLocationPayload) => {
      setDelivererLocation(location);

      const channel = channelRef.current;
      if (!channel) return;

      await channel.send({
        type: "broadcast",
        event: "location_update",
        payload: location,
      });
    },
    [],
  );

  const broadcastChatEvent = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel) return;

    await channel.send({
      type: "broadcast",
      event: "chat_update",
      payload: { refresh: true },
    });
  }, []);

  const broadcastOrderUpdate = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel) return;

    await channel.send({
      type: "broadcast",
      event: "order_update",
      payload: { orderId },
    });
  }, [orderId]);

  return {
    delivererLocation,
    broadcastLocation,
    broadcastChatEvent,
    broadcastOrderUpdate,
    supabase,
  };
}
