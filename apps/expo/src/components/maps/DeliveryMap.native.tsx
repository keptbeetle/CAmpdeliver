import type {
  LngLat,
  LngLatBounds,
  StyleSpecification,
} from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  RasterSource,
  UserLocation,
} from "@maplibre/maplibre-react-native";

import type { DeliveryMapProps, MapCoordinate } from "./types";

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#09090b" },
    },
  ],
};

const CARTO_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];

interface MarkerDotProps {
  accessibilityLabel: string;
  color: string;
}

function MarkerDot({ accessibilityLabel, color }: MarkerDotProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.markerOuter}
    >
      <View style={[styles.markerInner, { backgroundColor: color }]} />
    </View>
  );
}

function isUsableCoordinate(point: MapCoordinate): boolean {
  return point.latitude !== 0 && point.longitude !== 0;
}

function toLngLat(point: MapCoordinate): LngLat {
  return [point.longitude, point.latitude];
}

function boundsFor(points: MapCoordinate[]): LngLatBounds {
  const usable = points.filter(isUsableCoordinate);
  const fallback = usable[0] ?? { latitude: 30, longitude: 70 };

  let west = fallback.longitude;
  let east = fallback.longitude;
  let south = fallback.latitude;
  let north = fallback.latitude;

  for (const point of usable) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }

  const minimumSpan = 0.004;
  if (east - west < minimumSpan) {
    const expansion = (minimumSpan - (east - west)) / 2;
    west -= expansion;
    east += expansion;
  }
  if (north - south < minimumSpan) {
    const expansion = (minimumSpan - (north - south)) / 2;
    south -= expansion;
    north += expansion;
  }

  return [west, south, east, north];
}

export function DeliveryMap({
  canteen,
  otherCanteens,
  delivery,
  deliverer,
  route,
  showUserLocation,
}: DeliveryMapProps) {
  const cameraBounds = useMemo(
    () =>
      boundsFor([
        canteen,
        delivery,
        ...otherCanteens,
        ...route,
        ...(deliverer ? [deliverer] : []),
      ]),
    [canteen, delivery, deliverer, otherCanteens, route],
  );

  const routeData = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: "FeatureCollection",
      features:
        route.length > 1
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: route.map(toLngLat),
                },
              },
            ]
          : [],
    }),
    [route],
  );

  return (
    <Map
      style={styles.map}
      mapStyle={BASE_STYLE}
      androidView="texture"
      logo={false}
      compass={false}
      scaleBar={false}
      attribution
      attributionPosition={{ top: 8, right: 8 }}
      tintColor="#c4b5fd"
    >
      <Camera
        initialViewState={{
          bounds: cameraBounds,
          padding: { top: 56, right: 48, bottom: 220, left: 48 },
        }}
      />

      <RasterSource
        id="carto-dark"
        tiles={CARTO_TILES}
        minzoom={0}
        maxzoom={19}
        tileSize={256}
        attribution="© OpenStreetMap contributors © CARTO"
      >
        <Layer id="carto-dark-layer" type="raster" />
      </RasterSource>

      {routeData.features.length > 0 ? (
        <GeoJSONSource id="delivery-route" data={routeData}>
          <Layer
            id="delivery-route-line"
            type="line"
            paint={{
              "line-color": "#a855f7",
              "line-opacity": 0.85,
              "line-width": 5,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </GeoJSONSource>
      ) : null}

      {isUsableCoordinate(canteen) ? (
        <Marker id="selected-canteen" lngLat={toLngLat(canteen)}>
          <MarkerDot
            accessibilityLabel={`Selected canteen: ${canteen.name}`}
            color="#3b82f6"
          />
        </Marker>
      ) : null}

      {otherCanteens.map((point) => (
        <Marker
          key={point.id}
          id={`canteen-${point.id}`}
          lngLat={toLngLat(point)}
        >
          <MarkerDot
            accessibilityLabel={`Active canteen: ${point.name}`}
            color="#14b8a6"
          />
        </Marker>
      ))}

      {isUsableCoordinate(delivery) ? (
        <Marker id="delivery-dropoff" lngLat={toLngLat(delivery)}>
          <MarkerDot
            accessibilityLabel={`Delivery location: ${delivery.name}`}
            color="#22c55e"
          />
        </Marker>
      ) : null}

      {deliverer ? (
        <Marker id="deliverer" lngLat={toLngLat(deliverer)}>
          <MarkerDot accessibilityLabel="Deliverer" color="#a855f7" />
        </Marker>
      ) : null}

      {showUserLocation ? (
        <UserLocation animated accuracy heading minDisplacement={2} />
      ) : null}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  markerOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(9, 9, 11, 0.85)",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  markerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
