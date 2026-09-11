import { Feather } from "@expo/vector-icons";
import type { LngLat, LngLatBounds } from "@maplibre/maplibre-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
} from "@maplibre/maplibre-react-native";

import type { DeliveryMapProps, MapCoordinate } from "./types";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const MARKER_MOVE_DURATION_MS = 700;
const ROUTE_REVEAL_DURATION_MS = 850;

function isUsableCoordinate(point: MapCoordinate): boolean {
  return point.latitude !== 0 || point.longitude !== 0;
}

function toLngLat(point: MapCoordinate): LngLat {
  return [point.longitude, point.latitude];
}

function boundsFor(points: MapCoordinate[]): LngLatBounds {
  const usable = points.filter(isUsableCoordinate);
  const fallback = usable[0] ?? { latitude: 23.1765, longitude: 80.0211 };

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

function interpolateCoordinate(
  from: MapCoordinate,
  to: MapCoordinate,
  progress: number,
): MapCoordinate {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress,
  };
}

function useSmoothCoordinate(target: MapCoordinate | null): MapCoordinate | null {
  const targetLatitude = target?.latitude ?? null;
  const targetLongitude = target?.longitude ?? null;
  const [displayed, setDisplayed] = useState<MapCoordinate | null>(target);
  const displayedRef = useRef<MapCoordinate | null>(target);

  useEffect(() => {
    let animationFrame = 0;

    if (targetLatitude === null || targetLongitude === null) {
      animationFrame = requestAnimationFrame(() => {
        displayedRef.current = null;
        setDisplayed(null);
      });
      return () => cancelAnimationFrame(animationFrame);
    }

    const nextTarget = {
      latitude: targetLatitude,
      longitude: targetLongitude,
    };
    const start = displayedRef.current ?? nextTarget;
    const startedAt = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startedAt;
      const linear = Math.min(1, elapsed / MARKER_MOVE_DURATION_MS);
      const eased = 1 - Math.pow(1 - linear, 3);
      const next = interpolateCoordinate(start, nextTarget, eased);
      displayedRef.current = next;
      setDisplayed(next);

      if (linear < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [targetLatitude, targetLongitude]);

  return displayed;
}

function useRouteReveal(route: MapCoordinate[]): number {
  const [progress, setProgress] = useState(route.length > 1 ? 1 : 0);
  const routeSignature = useMemo(
    () =>
      route.length > 1
        ? `${route.length}:${route[0]?.latitude}:${route[0]?.longitude}:${route.at(-1)?.latitude}:${route.at(-1)?.longitude}`
        : "empty",
    [route],
  );

  useEffect(() => {
    let animationFrame = 0;

    if (route.length < 2) {
      animationFrame = requestAnimationFrame(() => setProgress(0));
      return () => cancelAnimationFrame(animationFrame);
    }

    const startedAt = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startedAt;
      const linear = Math.min(1, elapsed / ROUTE_REVEAL_DURATION_MS);
      const eased = 1 - Math.pow(1 - linear, 3);
      setProgress(eased);
      if (linear < 1) animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [route.length, routeSignature]);

  return progress;
}

interface PinMarkerProps {
  accessibilityLabel: string;
  icon: keyof typeof Feather.glyphMap;
  tone: "buyer" | "deliverer" | "canteen" | "canteenSelected";
}

function PinMarker({ accessibilityLabel, icon, tone }: PinMarkerProps) {
  const selected = tone === "canteenSelected";
  const canteen = tone === "canteen" || selected;
  const buyer = tone === "buyer";
  const backgroundColor = buyer
    ? "#2E7D5B"
    : tone === "deliverer"
      ? "#176B87"
      : selected
        ? "#5369C7"
        : "#5D9EA0";

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.markerWrap, selected && styles.markerWrapSelected]}
    >
      <View style={[styles.markerShadow, selected && styles.markerShadowSelected]} />
      <View
        style={[
          styles.markerFace,
          { backgroundColor },
          selected && styles.markerFaceSelected,
        ]}
      >
        <View style={styles.markerHighlight} />
        <Feather
          name={icon}
          size={canteen ? (selected ? 19 : 17) : 18}
          color="#FFFFFF"
        />
      </View>
      <View style={[styles.markerTail, { backgroundColor }]} />
      <View style={styles.markerGroundShadow} />
    </View>
  );
}

export function DeliveryMap({
  canteen,
  otherCanteens,
  delivery,
  deliverer,
  route,
  showUserLocation,
}: DeliveryMapProps) {
  const smoothDeliverer = useSmoothCoordinate(deliverer);
  const routeProgress = useRouteReveal(route);

  const cameraBounds = useMemo(
    () =>
      boundsFor([
        canteen,
        delivery,
        ...route,
        ...(deliverer ? [deliverer] : []),
      ]),
    [canteen, delivery, deliverer, route],
  );

  const visibleRoute = useMemo(() => {
    if (route.length < 2) return [];
    const visibleCount = Math.max(
      2,
      Math.min(route.length, Math.ceil(route.length * routeProgress)),
    );
    return route.slice(0, visibleCount);
  }, [route, routeProgress]);

  const routeData = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: "FeatureCollection",
      features:
        visibleRoute.length > 1
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: visibleRoute.map(toLngLat),
                },
              },
            ]
          : [],
    }),
    [visibleRoute],
  );

  return (
    <Map
      style={styles.map}
      mapStyle={MAP_STYLE_URL}
      androidView="texture"
      logo={false}
      compass={false}
      scaleBar={false}
      attribution
      attributionPosition={{ top: 8, right: 8 }}
      tintColor="#2E7B80"
    >
      <Camera
        initialViewState={{
          bounds: cameraBounds,
          padding: { top: 64, right: 48, bottom: 232, left: 48 },
          pitch: 12,
        }}
        minZoom={12}
        maxZoom={20}
      />

      {routeData.features.length > 0 ? (
        <GeoJSONSource id="delivery-route" data={routeData}>
          <Layer
            id="delivery-route-casing"
            type="line"
            paint={{
              "line-color": "rgba(255,255,255,0.96)",
              "line-opacity": 0.98,
              "line-width": 8,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
          <Layer
            id="delivery-route-line"
            type="line"
            paint={{
              "line-color": "#176B87",
              "line-opacity": 0.96,
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
        <Marker
          id="selected-canteen"
          lngLat={toLngLat(canteen)}
          anchor="bottom"
          offset={[0, -2]}
        >
          <PinMarker
            accessibilityLabel={`Selected canteen: ${canteen.name}`}
            icon="home"
            tone="canteenSelected"
          />
        </Marker>
      ) : null}

      {otherCanteens.filter(isUsableCoordinate).map((point) => (
        <Marker
          key={point.id}
          id={`canteen-${point.id}`}
          lngLat={toLngLat(point)}
          anchor="bottom"
          offset={[0, -2]}
        >
          <PinMarker
            accessibilityLabel={`Active canteen: ${point.name}`}
            icon="home"
            tone="canteen"
          />
        </Marker>
      ))}

      {isUsableCoordinate(delivery) ? (
        <Marker
          id="delivery-dropoff"
          lngLat={toLngLat(delivery)}
          anchor="bottom"
          offset={[0, -2]}
        >
          <PinMarker
            accessibilityLabel={`Buyer delivery location: ${delivery.name}`}
            icon="user"
            tone="buyer"
          />
        </Marker>
      ) : null}

      {smoothDeliverer && isUsableCoordinate(smoothDeliverer) ? (
        <Marker
          id="deliverer"
          lngLat={toLngLat(smoothDeliverer)}
          anchor="bottom"
          offset={[0, -2]}
        >
          <PinMarker
            accessibilityLabel="Deliverer live location"
            icon="navigation"
            tone="deliverer"
          />
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
  markerWrap: {
    width: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  markerWrapSelected: {
    width: 50,
    height: 62,
  },
  markerShadow: {
    position: "absolute",
    top: 5,
    width: 34,
    height: 38,
    borderRadius: 17,
    backgroundColor: "rgba(14, 33, 43, 0.18)",
    transform: [{ translateY: 3 }],
  },
  markerShadowSelected: {
    width: 40,
    height: 44,
    borderRadius: 20,
  },
  markerFace: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#0F2931",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 2,
  },
  markerFaceSelected: {
    width: 42,
    height: 42,
    borderRadius: 21,
    elevation: 10,
  },
  markerHighlight: {
    position: "absolute",
    top: 5,
    left: 8,
    width: 10,
    height: 5,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.28)",
    transform: [{ rotate: "-18deg" }],
  },
  markerTail: {
    width: 14,
    height: 14,
    marginTop: -8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: "rgba(255,255,255,0.96)",
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
  markerGroundShadow: {
    width: 24,
    height: 7,
    marginTop: 1,
    borderRadius: 12,
    backgroundColor: "rgba(14, 33, 43, 0.18)",
    transform: [{ scaleX: 1.2 }],
  },
});