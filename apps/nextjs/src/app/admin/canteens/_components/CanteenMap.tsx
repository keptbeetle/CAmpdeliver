"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMapEvents, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icon issue with Next.js/Webpack
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface CanteenMapProps {
  latitude: number;
  longitude: number;
  radius: number;
  onLocationChange: (lat: number, lng: number) => void;
}

function LocationMarker({
  latitude,
  longitude,
  radius,
  onLocationChange,
}: CanteenMapProps) {
  const map = useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    map.flyTo([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);

  return (
    <>
      <Marker position={[latitude, longitude]} />
      <Circle center={[latitude, longitude]} radius={radius} pathOptions={{ color: 'purple', fillColor: 'purple', fillOpacity: 0.2 }} />
    </>
  );
}

export default function CanteenMap({
  latitude,
  longitude,
  radius,
  onLocationChange,
}: CanteenMapProps) {
  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-white/10 relative z-0">
      <MapContainer
        center={[latitude, longitude]}
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <LocationMarker
          latitude={latitude}
          longitude={longitude}
          radius={radius}
          onLocationChange={onLocationChange}
        />
      </MapContainer>
    </div>
  );
}
