import { useEffect, useState, useRef, useCallback } from "react";

import { supabaseClient } from "~/auth/client";

interface LocationPayload {
  latitude: number;
  longitude: number;
  role: "deliverer" | "buyer";
}

interface UseOrderRealtimeOptions {
  onLocationUpdate?: (payload: LocationPayload) => void;
  onChatUpdate?: () => void;
  onOrderUpdate?: () => void;
}

export function useOrderRealtime(orderId: string, options?: UseOrderRealtimeOptions) {
  const [delivererLocation, setDelivererLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [buyerLocation, setBuyerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
  
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!orderId) return;

    // Create a realtime channel for this specific order
    const channel = supabaseClient
      .channel(`order:${orderId}`)
      .on("broadcast", { event: "location_update" }, (payload) => {
        const data = payload.payload as LocationPayload;
        if (data.role === "deliverer") {
          setDelivererLocation({ latitude: data.latitude, longitude: data.longitude });
        } else {
          setBuyerLocation({ latitude: data.latitude, longitude: data.longitude });
        }
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
      void supabaseClient.removeChannel(channel);
      channelRef.current = null;
    };
  }, [orderId]);

  const broadcastLocation = useCallback(async (location: { latitude: number; longitude: number; role: "deliverer" | "buyer" }) => {
    // Optimistically update local state immediately
    if (location.role === "deliverer") {
      setDelivererLocation({ latitude: location.latitude, longitude: location.longitude });
    } else {
      setBuyerLocation({ latitude: location.latitude, longitude: location.longitude });
    }

    const channel = channelRef.current;
    if (!channel) return;
    
    await channel.send({
      type: "broadcast",
      event: "location_update",
      payload: location,
    });
  }, []);

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
    buyerLocation, 
    broadcastLocation, 
    broadcastChatEvent, 
    broadcastOrderUpdate,
    supabaseClient 
  };
}
