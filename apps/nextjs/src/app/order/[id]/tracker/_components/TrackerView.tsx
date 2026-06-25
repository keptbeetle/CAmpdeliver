"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
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

// Helper to create high-quality colored SVG map pins
const createCustomIcon = (color: string) => {
  if (typeof window === "undefined") return undefined;
  return L.divIcon({
    className: "custom-leaflet-icon",
    html: `<div style="display: flex; justify-content: center; align-items: center; width: 32px; height: 32px;">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="${color}" stroke="#000" stroke-width="1.5" style="filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.4));">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const canteenIcon = createCustomIcon("#3b82f6"); // Blue
const dropoffIcon = createCustomIcon("#22c55e"); // Green
const delivererIcon = createCustomIcon("#a855f7"); // Purple
const buyerIcon = createCustomIcon("#ec4899"); // Pink


// Component to dynamically control map view center
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 || center[1] !== 0) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function TrackerView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const trpc = useTRPC();

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: orders, isLoading } = useQuery(trpc.order.myOrders.queryOptions());
  
  const order = orders?.find((o) => o.id === orderId);
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation, buyerLocation, broadcastLocation } = useOrderRealtime(orderId);
  const [myWebLocation, setMyWebLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);

  // Set initial map center to canteen coordinates if they are valid
  useEffect(() => {
    if (order) {
      const canteenLat = order.canteenLatitude;
      const canteenLng = order.canteenLongitude;
      if (canteenLat !== 0 || canteenLng !== 0) {
        setMapCenter([canteenLat, canteenLng]);
      }
    }
  }, [order]);

  // Watch user location and broadcast in real-time
  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator) || !orderId) return;

    const role = isDeliverer ? "deliverer" : "buyer";

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMyWebLocation([latitude, longitude] as [number, number]);

        // If map center is pointing to [0, 0], center on the user's location
        setMapCenter((prevCenter) => {
          if (prevCenter[0] === 0 && prevCenter[1] === 0) {
            return [latitude, longitude] as [number, number];
          }
          return prevCenter;
        });

        void broadcastLocation({
          latitude,
          longitude,
          role,
        });
      },
      (error) => {
        console.error("Error getting geolocation:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isDeliverer, orderId, broadcastLocation]);

  const handleLocateMe = () => {
    if (myWebLocation) {
      setMapCenter(myWebLocation);
    } else if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude] as [number, number]);
          setMyWebLocation([latitude, longitude] as [number, number]);
        },
        () => {
          alert("Could not retrieve your location. Ensure location services are enabled and permissions are granted.");
        }
      );
    }
  };

  if (isLoading || !order) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  const canteenCoords: [number, number] = [order.canteenLatitude, order.canteenLongitude];
  const deliveryCoords: [number, number] = [order.deliveryLatitude, order.deliveryLongitude];

  const polylinePositions: [number, number][] = [];
  
  const startLoc = delivererLocation 
    ? ([delivererLocation.latitude, delivererLocation.longitude] as [number, number])
    : (canteenCoords[0] !== 0 || canteenCoords[1] !== 0 ? canteenCoords : null);

  const endLoc = buyerLocation
    ? ([buyerLocation.latitude, buyerLocation.longitude] as [number, number])
    : (deliveryCoords[0] !== 0 || deliveryCoords[1] !== 0 ? deliveryCoords : null);

  if (startLoc) polylinePositions.push(startLoc);
  if (endLoc) polylinePositions.push(endLoc);

  // Determine fallback center if mapCenter is uninitialized
  const displayCenter: [number, number] = mapCenter[0] !== 0 || mapCenter[1] !== 0 
    ? mapCenter 
    : (canteenCoords[0] !== 0 || canteenCoords[1] !== 0 ? canteenCoords : [30.0, 70.0] as [number, number]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between bg-zinc-900 p-4 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white">Live Tracking</h1>
          <p className="text-xs text-zinc-400">Order ID: {order.id.slice(0, 8)}...</p>
        </div>
        <button
          onClick={() => router.push(`/`)}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Back
        </button>
      </div>

      <div className="relative flex-1">
        <MapContainer
          center={displayCenter}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">Carto</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapController center={displayCenter} />

          {canteenCoords[0] !== 0 && canteenCoords[1] !== 0 && (
            <Marker position={canteenCoords} icon={canteenIcon}>
              <Popup>
                <b>Canteen</b><br />
                {order.canteenName}
              </Popup>
            </Marker>
          )}

          {deliveryCoords[0] !== 0 && deliveryCoords[1] !== 0 && (
            <Marker position={deliveryCoords} icon={dropoffIcon}>
              <Popup>
                <b>Dropoff</b><br />
                {order.deliveryLocationName}
              </Popup>
            </Marker>
          )}
          
          {delivererLocation && (
            <Marker position={[delivererLocation.latitude, delivererLocation.longitude]} icon={delivererIcon}>
              <Popup>
                <b>Deliverer</b> {isDeliverer && "(You)"}
              </Popup>
            </Marker>
          )}

          {buyerLocation && (
            <Marker position={[buyerLocation.latitude, buyerLocation.longitude]} icon={buyerIcon}>
              <Popup>
                <b>Buyer / Customer</b> {!isDeliverer && "(You)"}
              </Popup>
            </Marker>
          )}

          {polylinePositions.length === 2 && (
            <Polyline positions={polylinePositions} color="#a855f7" dashArray="5, 10" />
          )}
        </MapContainer>

        <button
          onClick={handleLocateMe}
          className="absolute top-4 right-4 z-[1000] rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 text-white hover:bg-zinc-800 shadow-md transition-colors flex items-center gap-2 text-xs font-semibold"
        >
          <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Locate Me
        </button>
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
