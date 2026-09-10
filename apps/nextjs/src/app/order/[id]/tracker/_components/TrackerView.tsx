"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { useTRPC } from "~/trpc/react";

// Fix for default Leaflet icon not showing correctly in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
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

function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Helper to fetch actual road-routing directions between two coordinates via OSRM
async function fetchRoute(
  start: [number, number],
  end: [number, number],
): Promise<{ coordinates: [number, number][]; distance: number }> {
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`,
    );
    interface OSRMResponse {
      code: string;
      routes?: {
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
    }
    const data = (await res.json()) as OSRMResponse;
    const fallbackDist = getHaversineDistance(lat1, lon1, lat2, lon2);
    if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
      const coords = data.routes[0].geometry.coordinates;
      const distance = data.routes[0].distance ?? fallbackDist;
      // OSRM returns coordinates as [lng, lat], convert to [lat, lng] for Leaflet
      return {
        coordinates: coords.map(([lng, lat]) => [lat, lng]),
        distance,
      };
    }
  } catch (error) {
    console.error("OSRM routing error:", error);
  }
  const fallbackDist = getHaversineDistance(lat1, lon1, lat2, lon2);
  return {
    coordinates: [start, end],
    distance: fallbackDist,
  };
}

export default function TrackerView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: paymentConfig } = useQuery(trpc.payment.config.queryOptions());
  const { data: orders, isLoading } = useQuery({
    ...trpc.order.myOrders.queryOptions(),
    // Realtime is the fast path, but tracking must remain correct when a private
    // channel is temporarily unavailable or still authorizing.
    refetchInterval: 5_000,
  });

  const order = orders?.find((o) => o.id === orderId);
  const paymentDatabaseReady = paymentConfig?.databaseReady === true;
  const isDeliverer = order?.delivererId === profile?.id;

  const { delivererLocation } = useOrderRealtime(
    paymentDatabaseReady ? orderId : "",
    {
      onOrderUpdate: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.order.myOrders.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.auth.getMyProfile.queryKey(),
        });
      },
    },
  );
  const [myWebLocation, setMyWebLocation] = useState<[number, number] | null>(
    null,
  );
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>(
    [],
  );
  const [distance, setDistance] = useState<number | null>(null);

  const canteenCoords: [number, number] | null = order
    ? [order.canteenLatitude, order.canteenLongitude]
    : null;
  const deliveryCoords: [number, number] | null = order
    ? [order.deliveryLatitude, order.deliveryLongitude]
    : null;

  const startLoc: [number, number] | null = delivererLocation
    ? [delivererLocation.latitude, delivererLocation.longitude]
    : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      order?.delivererLatitude && order?.delivererLongitude
      ? [order.delivererLatitude, order.delivererLongitude]
      : canteenCoords && (canteenCoords[0] !== 0 || canteenCoords[1] !== 0)
        ? canteenCoords
        : null;

  const endLoc: [number, number] | null =
    deliveryCoords && (deliveryCoords[0] !== 0 || deliveryCoords[1] !== 0)
      ? deliveryCoords
      : null;

  // Set initial map center to canteen coordinates if they are valid

  useEffect(() => {
    if (order) {
      const canteenLat = order.canteenLatitude;
      const canteenLng = order.canteenLongitude;
      if (canteenLat !== 0 || canteenLng !== 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMapCenter([canteenLat, canteenLng]);
      }
    }
  }, [order]);

  useEffect(() => {
    if (
      !isDeliverer ||
      typeof window === "undefined" ||
      !("geolocation" in navigator)
    ) {
      return;
    }

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
      },
      (error) => {
        console.error("Error getting geolocation:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isDeliverer]);

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
          alert(
            "Could not retrieve your location. Ensure location services are enabled and permissions are granted.",
          );
        },
      );
    }
  };

  const sLat = startLoc?.[0];
  const sLng = startLoc?.[1];
  const eLat = endLoc?.[0];
  const eLng = endLoc?.[1];

  // Fetch actual street path when coordinates update

  useEffect(() => {
    if (
      sLat === undefined ||
      sLng === undefined ||
      eLat === undefined ||
      eLng === undefined
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRouteCoordinates([]);

      setDistance(null);
      return;
    }

    let isMounted = true;

    void fetchRoute([sLat, sLng], [eLat, eLng]).then(
      ({ coordinates, distance }) => {
        if (isMounted) {
          setRouteCoordinates(coordinates);
          setDistance(distance);
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, [sLat, sLng, eLat, eLng]);

  if (isLoading || !order) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  // Determine fallback center if mapCenter is uninitialized
  const displayCenter: [number, number] =
    mapCenter[0] !== 0 || mapCenter[1] !== 0
      ? mapCenter
      : canteenCoords && (canteenCoords[0] !== 0 || canteenCoords[1] !== 0)
        ? canteenCoords
        : ([30.0, 70.0] as [number, number]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between bg-zinc-900 p-4 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white">Live Tracking</h1>
          <p className="text-xs text-zinc-400">
            Order ID: {order.id.slice(0, 8)}...
          </p>
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

          {canteenCoords &&
            canteenCoords[0] !== 0 &&
            canteenCoords[1] !== 0 && (
              <Marker position={canteenCoords} icon={canteenIcon}>
                <Popup>
                  <b>Canteen</b>
                  <br />
                  {order.canteenName}
                </Popup>
              </Marker>
            )}

          {deliveryCoords &&
            deliveryCoords[0] !== 0 &&
            deliveryCoords[1] !== 0 && (
              <Marker position={deliveryCoords} icon={dropoffIcon}>
                <Popup>
                  <b>Dropoff</b>
                  <br />
                  {order.deliveryLocationName}
                </Popup>
              </Marker>
            )}

          {startLoc && (
            <Marker position={startLoc} icon={delivererIcon}>
              <Popup>
                <b>Deliverer</b> {isDeliverer && "(You)"}
              </Popup>
            </Marker>
          )}

          {routeCoordinates.length > 0 && (
            <Polyline
              positions={routeCoordinates}
              color="#a855f7"
              weight={5}
              opacity={0.7}
            />
          )}
        </MapContainer>

        {isDeliverer && (
          <button
            onClick={handleLocateMe}
            className="absolute top-4 right-4 z-[1000] flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-zinc-800"
          >
            <svg
              className="h-4 w-4 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Locate Me
          </button>
        )}
      </div>

      <div className="absolute right-6 bottom-6 left-6 z-[1000] flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                Status: {order.status}
              </h2>
              {distance !== null && (
                <span
                  data-testid="tracking-distance"
                  className="inline-flex items-center rounded-md bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400 ring-1 ring-purple-500/20 ring-inset"
                >
                  {formatDistance(distance)} away
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {isDeliverer
                ? "You are delivering this order"
                : order.status === "ITEM_AVAILABLE"
                  ? "Items are available; payment is the next step"
                  : order.status === "PURCHASED"
                    ? "Canteen purchase confirmed"
                    : order.status === "ON_THE_WAY"
                      ? "Deliverer is on the way"
                      : order.status === "NEAR_YOU"
                        ? "Deliverer is near you"
                        : order.status === "DELIVERED" ||
                            order.status === "COMPLETED"
                          ? "Order delivered"
                          : "Waiting for deliverer"}
            </p>
          </div>
          <button
            onClick={() => router.push(`/order/${orderId}/chat`)}
            className="rounded-xl bg-purple-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-purple-500"
          >
            Open Chat
          </button>
        </div>

        {paymentConfig?.databaseReady === false && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">
            Read-only compatibility mode: live payment and delivery updates are
            paused until the server database upgrade completes.
          </div>
        )}

        {/* OTP Display for Buyer */}
        {paymentDatabaseReady &&
          !isDeliverer &&
          order.otp &&
          order.payment?.status === "PAID" &&
          ["PURCHASED", "ON_THE_WAY", "NEAR_YOU"].includes(order.status) && (
            <div className="mt-2 flex flex-col items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-4">
              <span className="mb-1 text-xs font-bold tracking-widest text-zinc-400 uppercase">
                Your Delivery OTP
              </span>
              <span
                data-testid="delivery-otp"
                className="text-3xl font-black tracking-[0.2em] text-white"
              >
                {order.otp}
              </span>
              <span className="mt-2 text-center text-xs text-zinc-500">
                Share this code with your deliverer to receive your order.
              </span>
            </div>
          )}
      </div>
    </div>
  );
}
