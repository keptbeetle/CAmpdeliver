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

    const channel = supabase
      .channel(`order:${orderId}`)
      .on("broadcast", { event: "location_update" }, (payload) => {
        const data = payload.payload as DelivererLocationPayload;
        setDelivererLocation({
          latitude: data.latitude,
          longitude: data.longitude,
        });
        optionsRef.current?.onLocationUpdate?.(data);
      })
      .on("broadcast", { event: "chat_update" }, () => {
        optionsRef.current?.onChatUpdate?.();
      })
      .on("broadcast", { event: "order_update" }, () => {
        optionsRef.current?.onOrderUpdate?.();
      });

    channel.subscribe((status) => {
      console.log(`Channel order:${orderId} status:`, status);
    });

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
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
