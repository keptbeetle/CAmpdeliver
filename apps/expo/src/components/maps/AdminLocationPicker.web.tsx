import { StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { colors, radius } from "~/components/app/theme";

export interface AdminLocationPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  kind: "canteen" | "landmark";
  onLocationChange: (latitude: number, longitude: number) => void;
}

export function AdminLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  kind,
  onLocationChange,
}: AdminLocationPickerProps) {
  const updateLatitude = (value: string) => {
    if (!value.trim()) return;
    const parsedLatitude = Number(value);
    if (
      Number.isFinite(parsedLatitude) &&
      parsedLatitude >= -90 &&
      parsedLatitude <= 90
    ) {
      onLocationChange(parsedLatitude, longitude);
    }
  };

  const updateLongitude = (value: string) => {
    if (!value.trim()) return;
    const parsedLongitude = Number(value);
    if (
      Number.isFinite(parsedLongitude) &&
      parsedLongitude >= -180 &&
      parsedLongitude <= 180
    ) {
      onLocationChange(latitude, parsedLongitude);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Feather
          name={kind === "canteen" ? "coffee" : "map-pin"}
          size={22}
          color={colors.primary}
        />
      </View>
      <Text style={styles.title}>Map placement is optimized for Android</Text>
      <Text style={styles.copy}>
        Enter coordinates here when using the Expo web client. The native
        Android app provides tap-to-place mapping and a {radiusMeters} m radius
        preview.
      </Text>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Latitude</Text>
          <TextInput
            value={String(latitude)}
            onChangeText={updateLatitude}
            inputMode="decimal"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Longitude</Text>
          <TextInput
            value={String(longitude)}
            onChangeText={updateLongitude}
            inputMode="decimal"
            style={styles.input}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  copy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 560,
    textAlign: "center",
  },
  field: {
    flex: 1,
    gap: 6,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    maxWidth: 560,
    width: "100%",
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
});
