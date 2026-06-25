import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../utils/auth";

interface LocationPayload {
  latitude: number;
  longitude: number;
  role: "deliverer" | "buyer";
}

export function useOrderRealtime(orderId: string) {
  const [delivererLocation, setDelivererLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [buyerLocation, setBuyerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!orderId) return;

    // Create a realtime channel for this specific order
    const channel = supabase
      .channel(`order:${orderId}`)
      .on("broadcast", { event: "location_update" }, (payload) => {
        const data = payload.payload as LocationPayload;
        if (data.role === "deliverer") {
          setDelivererLocation({ latitude: data.latitude, longitude: data.longitude });
        } else {
          setBuyerLocation({ latitude: data.latitude, longitude: data.longitude });
        }
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

  return { delivererLocation, buyerLocation, broadcastLocation, broadcastChatEvent, supabase };
}
