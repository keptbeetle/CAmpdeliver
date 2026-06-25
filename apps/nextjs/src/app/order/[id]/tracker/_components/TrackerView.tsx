"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useOrderRealtime } from "~/hooks/use-order-realtime";

// Fix for default Leaflet icon not showing correctly in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function TrackerView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const trpc = useTRPC();

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery(trpc.order.myOrders.queryOptions());
  
  const order = orders?.find((o) => o.id === orderId);
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation } = useOrderRealtime(orderId);

  if (isLoading || !order) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  const canteenCoords: [number, number] = [order.canteenLatitude, order.canteenLongitude];
  const deliveryCoords: [number, number] = [order.deliveryLatitude, order.deliveryLongitude];

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between bg-zinc-900 p-4 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white">Live Tracking</h1>
          <p className="text-xs text-zinc-400">Order ID: {order.id.slice(0, 8)}...</p>
        </div>
        <button
          onClick={() => router.push(`/dashboard`)}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Back
        </button>
      </div>

      <div className="flex-1">
        <MapContainer
          center={canteenCoords}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={canteenCoords}>
            <Popup>
              <b>Canteen</b><br />
              {order.canteenName}
            </Popup>
          </Marker>
          <Marker position={deliveryCoords}>
            <Popup>
              <b>Dropoff</b><br />
              {order.deliveryLocationName}
            </Popup>
          </Marker>
          
          {delivererLocation && (
            <Marker position={[delivererLocation.latitude, delivererLocation.longitude]}>
              <Popup>
                <b>Deliverer</b>
              </Popup>
            </Marker>
          )}

          <Polyline positions={[canteenCoords, deliveryCoords]} color="#a855f7" dashArray="5, 10" />
        </MapContainer>
      </div>

      <div className="absolute bottom-6 left-6 right-6 z-[1000] flex items-center justify-between rounded-xl bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-md border border-zinc-800">
        <div>
          <h2 className="text-sm font-bold text-white">Status: {order.status}</h2>
          <p className="text-xs text-zinc-400">
            {isDeliverer ? "You are delivering this order" : "Deliverer is on the way"}
          </p>
        </div>
        <button
          onClick={() => router.push(`/order/${orderId}/chat`)}
          className="rounded-xl bg-purple-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-purple-500"
        >
          Open Chat
        </button>
      </div>
    </div>
  );
}
