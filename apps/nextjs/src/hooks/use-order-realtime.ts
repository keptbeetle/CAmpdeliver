import { useEffect, useState } from "react";

import { supabaseClient } from "~/auth/client";

interface LocationPayload {
  latitude: number;
  longitude: number;
}

export function useOrderRealtime(orderId: string) {
  const [delivererLocation, setDelivererLocation] = useState<LocationPayload | null>(null);

  useEffect(() => {
    if (!orderId) return;

    // Create a realtime channel for this specific order
    const channel = supabaseClient
      .channel(`order:${orderId}`)
      .on("broadcast", { event: "location_update" }, (payload) => {
        // payload.payload contains the actual data sent
        setDelivererLocation(payload.payload as LocationPayload);
      })
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [orderId]);

  const broadcastLocation = async (location: LocationPayload) => {
    const channel = supabaseClient.channel(`order:${orderId}`);
    // Ensure we are subscribed before broadcasting
    if (channel.state !== "joined") {
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
      });
    }
    
    await channel.send({
      type: "broadcast",
      event: "location_update",
      payload: location,
    });
  };

  const broadcastChatEvent = async () => {
    const channel = supabaseClient.channel(`order:${orderId}`);
    if (channel.state !== "joined") {
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
      });
    }

    await channel.send({
      type: "broadcast",
      event: "chat_update",
      payload: { refresh: true },
    });
  };

  return { delivererLocation, broadcastLocation, broadcastChatEvent, supabaseClient };
}
