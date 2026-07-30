import type { LatLngExpression } from "leaflet";
import { useEffect } from "react";
import { View } from "react-native";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import type { DeliveryMapProps, MapCoordinate } from "./types";

const point = ({ latitude, longitude }: MapCoordinate): LatLngExpression => [
  latitude,
  longitude,
];

function Recenter({ coordinate }: { coordinate: MapCoordinate }) {
  const map = useMap();
  useEffect(() => {
    if (coordinate.latitude !== 0 || coordinate.longitude !== 0) {
      map.setView(point(coordinate), map.getZoom());
    }
  }, [coordinate, map]);
  return null;
}

export function DeliveryMap({
  canteen,
  otherCanteens,
  delivery,
  deliverer,
  route,
}: DeliveryMapProps) {
  const center = deliverer ?? canteen;
  return (
    <View style={{ flex: 1, minHeight: 420 }}>
      <MapContainer
        center={point(center)}
        zoom={16}
        style={{ height: "100%", minHeight: 420, width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Recenter coordinate={center} />
        {canteen.latitude !== 0 && canteen.longitude !== 0 ? (
          <CircleMarker
            center={point(canteen)}
            radius={9}
            pathOptions={{ color: "#3b82f6" }}
          >
            <Popup>{canteen.name}</Popup>
          </CircleMarker>
        ) : null}
        {otherCanteens.map((item) => (
          <CircleMarker
            key={item.id}
            center={point(item)}
            radius={7}
            pathOptions={{ color: "#14b8a6" }}
          >
            <Popup>{item.name}</Popup>
          </CircleMarker>
        ))}
        {delivery.latitude !== 0 && delivery.longitude !== 0 ? (
          <CircleMarker
            center={point(delivery)}
            radius={9}
            pathOptions={{ color: "#22c55e" }}
          >
            <Popup>{delivery.name}</Popup>
          </CircleMarker>
        ) : null}
        {deliverer ? (
          <CircleMarker
            center={point(deliverer)}
            radius={9}
            pathOptions={{ color: "#a855f7" }}
          >
            <Popup>Deliverer</Popup>
          </CircleMarker>
        ) : null}
        {route.length > 0 ? (
          <Polyline
            positions={route.map(point)}
            pathOptions={{ color: "#a855f7", opacity: 0.85, weight: 5 }}
          />
        ) : null}
      </MapContainer>
    </View>
  );
}
