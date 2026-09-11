import type { LngLat } from "@maplibre/maplibre-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
} from "@maplibre/maplibre-react-native";

import { colors, radius, shadow } from "~/components/app/theme";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const EARTH_RADIUS_METERS = 6_371_000;
const RADIUS_SEGMENTS = 64;

export interface AdminLocationPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  kind: "canteen" | "landmark";
  onLocationChange: (latitude: number, longitude: number) => void;
}

function radiusPolygon(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const coordinates: [number, number][] = [];
  const latitudeRadians = (latitude * Math.PI) / 180;
  const cosLatitude = Math.max(Math.abs(Math.cos(latitudeRadians)), 0.00001);

  for (let index = 0; index <= RADIUS_SEGMENTS; index += 1) {
    const angle = (index / RADIUS_SEGMENTS) * Math.PI * 2;
    const northMeters = Math.cos(angle) * radiusMeters;
    const eastMeters = Math.sin(angle) * radiusMeters;
    const latitudeOffset =
      (northMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
    const longitudeOffset =
      (eastMeters / (EARTH_RADIUS_METERS * cosLatitude)) * (180 / Math.PI);

    coordinates.push([longitude + longitudeOffset, latitude + latitudeOffset]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      },
    ],
  };
}

function PickerPin({ kind }: { kind: AdminLocationPickerProps["kind"] }) {
  const canteen = kind === "canteen";
  const backgroundColor = canteen ? colors.primary : colors.accent;

  return (
    <View
      accessible
      accessibilityLabel={
        canteen ? "Canteen map marker" : "Landmark map marker"
      }
      style={styles.markerWrap}
    >
      <View style={styles.markerShadow} />
      <View style={[styles.markerFace, { backgroundColor }]}>
        <View style={styles.markerHighlight} />
        <Feather
          name={canteen ? "coffee" : "map-pin"}
          size={18}
          color={colors.white}
        />
      </View>
      <View style={[styles.markerTail, { backgroundColor }]} />
      <View style={styles.markerGroundShadow} />
    </View>
  );
}

export function AdminLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  kind,
  onLocationChange,
}: AdminLocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const coordinate = useMemo<LngLat>(
    () => [longitude, latitude],
    [latitude, longitude],
  );
  const geofence = useMemo(
    () =>
      radiusPolygon(
        latitude,
        longitude,
        Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 1,
      ),
    [latitude, longitude, radiusMeters],
  );

  const locateDevice = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Location permission needed",
          "Allow location access to place this marker at your current position. You can still tap the map manually.",
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      onLocationChange(position.coords.latitude, position.coords.longitude);
    } catch (error) {
      Alert.alert(
        "Could not read location",
        error instanceof Error
          ? error.message
          : "Place the marker manually by tapping the map.",
      );
    } finally {
      setLocating(false);
    }
  };

  const toneColor = kind === "canteen" ? colors.primary : colors.accent;

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        androidView="texture"
        logo={false}
        compass
        scaleBar={false}
        attribution
        attributionPosition={{ top: 8, right: 8 }}
        tintColor={colors.primary}
        onPress={(event) => {
          const [nextLongitude, nextLatitude] = event.nativeEvent.lngLat;
          onLocationChange(nextLatitude, nextLongitude);
        }}
      >
        <Camera
          center={coordinate}
          zoom={16.5}
          duration={420}
          easing="ease"
          minZoom={12}
          maxZoom={20}
        />

        <GeoJSONSource id="admin-geofence" data={geofence}>
          <Layer
            id="admin-geofence-fill"
            type="fill"
            paint={{
              "fill-color": toneColor,
              "fill-opacity": 0.13,
            }}
          />
          <Layer
            id="admin-geofence-outline"
            type="line"
            paint={{
              "line-color": toneColor,
              "line-opacity": 0.82,
              "line-width": 2,
              "line-dasharray": [2, 2],
            }}
          />
        </GeoJSONSource>

        <Marker
          id="admin-location-marker"
          lngLat={coordinate}
          anchor="bottom"
          offset={[0, -2]}
        >
          <PickerPin kind={kind} />
        </Marker>
      </Map>

      <View pointerEvents="none" style={styles.hintPill}>
        <Feather name="crosshair" size={14} color={colors.primaryStrong} />
        <Text style={styles.hintText}>Tap anywhere to place marker</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Use current device location"
        disabled={locating}
        onPress={() => void locateDevice()}
        style={({ pressed }) => [
          styles.locationButton,
          pressed && styles.pressed,
          locating && styles.disabled,
        ]}
      >
        {locating ? (
          <ActivityIndicator color={colors.primaryStrong} size="small" />
        ) : (
          <Feather name="navigation" size={15} color={colors.primaryStrong} />
        )}
        <Text style={styles.locationButtonText}>
          {locating ? "Locating…" : "Use my location"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panelStrong,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 320,
    overflow: "hidden",
    position: "relative",
    ...shadow,
  },
  disabled: {
    opacity: 0.6,
  },
  hintPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    left: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    position: "absolute",
    top: 10,
  },
  hintText: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  locationButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: 12,
    flexDirection: "row",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 13,
    position: "absolute",
    right: 12,
    ...shadow,
  },
  locationButtonText: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  map: {
    flex: 1,
  },
  markerFace: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.96)",
    borderRadius: 20,
    borderWidth: 3,
    elevation: 8,
    height: 40,
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    width: 40,
    zIndex: 2,
  },
  markerGroundShadow: {
    backgroundColor: "rgba(20,50,74,0.2)",
    borderRadius: 12,
    height: 7,
    marginTop: 1,
    transform: [{ scaleX: 1.2 }],
    width: 24,
  },
  markerHighlight: {
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 5,
    height: 5,
    left: 8,
    position: "absolute",
    top: 5,
    transform: [{ rotate: "-18deg" }],
    width: 10,
  },
  markerShadow: {
    backgroundColor: "rgba(20,50,74,0.2)",
    borderRadius: 19,
    height: 42,
    position: "absolute",
    top: 4,
    transform: [{ translateY: 3 }],
    width: 38,
  },
  markerTail: {
    borderBottomWidth: 2,
    borderColor: "rgba(255,255,255,0.96)",
    borderRightWidth: 2,
    height: 14,
    marginTop: -8,
    transform: [{ rotate: "45deg" }],
    width: 14,
    zIndex: 1,
  },
  markerWrap: {
    alignItems: "center",
    height: 60,
    justifyContent: "flex-start",
    width: 48,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
